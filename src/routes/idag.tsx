import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  deriveIssueStatus,
  deriveInspectionStatus,
  deriveProjectStatus,
  derivePriority,
  LIFECYCLE_OF,
  type DerivedStatus,
} from "@/lib/issue-tokens";
import { inspectionTypeLabel } from "@/lib/inspection-tokens";
import {
  HOME_STYLES,
  TopBar,
  Panel,
  Row,
  useHomeUser,
  homeSketch,
  greeting,
  fmtDate,
  daysChip,
  KIND_LABEL,
  KIND_PATH,
  type Kind,
} from "@/components/HomeKit";

export const Route = createFileRoute("/idag")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Idag — BAYT" }] }),
  component: IdagPage,
});

type Lifecycle = "vilande" | "oppet" | "avslutat";
type Level = "ok" | "warn" | "bad";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row_ = Record<string, any>;

type Entry = {
  kind: Kind;
  id: string;
  title: string;
  propertyId: string | null;
  lifecycle: Lifecycle;
  status: DerivedStatus;
  akut: boolean;
  isNew: boolean;
  doneAt: string | null;
  updatedAt: string | null;
};

const TABLE: Record<Kind, string> = { issue: "issues", inspection: "inspections", project: "projects" };
const LEVEL_LABEL: Record<Level, string> = { ok: "Under kontroll", warn: "Uppmärksamhet", bad: "Åtgärd krävs" };

const NAV = [
  { to: "/dag-rapport", label: "Dag Rapport" },
  { to: "/fastigheter", label: "Fastigheter" },
  { to: "/issues", label: "Felanmälningar" },
  { to: "/inspections", label: "Besiktningar" },
  { to: "/projects", label: "Projekt" },
  { to: "/entreprenorer", label: "Entreprenörer" },
  { to: "/teknik", label: "Teknik" },
  { to: "/fastighetspresentation", label: "Presentation" },
  { to: "/loggbok", label: "Loggbok" },
  { to: "/chatt", label: "Chatt" },
  { to: "/installningar", label: "Inställningar" },
];

function lifecycleFor(kind: Kind, row: Row_): Lifecycle {
  const map = LIFECYCLE_OF as Record<string, Lifecycle>;
  if (kind === "issue") return map[String(row.status ?? "")] ?? "vilande";
  if (row.arende_status) return map[String(row.arende_status)] ?? "vilande";
  const legacy = String(row.status ?? "");
  if (kind === "inspection") return legacy === "klar" ? "avslutat" : "oppet";
  return legacy === "klar" || legacy === "avbruten" ? "avslutat" : "oppet";
}

function toEntries(kind: Kind, rows: Row_[]): Entry[] {
  return rows.map((row) => {
    let status: DerivedStatus;
    let title: string;
    let akut = false;
    if (kind === "issue") {
      const prio = derivePriority(row.deadline || null, { from: row.created_at });
      akut = prio.key === "akut";
      status = deriveIssueStatus({ status: row.status, priority: prio.key, created_at: row.created_at, deadline: row.deadline || null });
      title = row.title || "Felanmälan";
    } else if (kind === "inspection") {
      status = deriveInspectionStatus({
        status: row.status ?? null,
        arende_status: row.arende_status ?? null,
        next_due_date: row.next_due_date ?? null,
        last_completed_date: row.last_completed_date ?? null,
        interval_months: row.interval_months ?? null,
      });
      title = inspectionTypeLabel(row.inspection_type);
    } else {
      status = deriveProjectStatus({
        status: row.status ?? null,
        arende_status: row.arende_status ?? null,
        start_date: row.start_date ?? null,
        end_date: row.end_date ?? null,
      });
      title = row.title || "Projekt";
    }
    return {
      kind,
      id: row.id as string,
      title,
      propertyId: (row.property_id as string | null) ?? null,
      lifecycle: lifecycleFor(kind, row),
      status,
      akut,
      isNew: !row.viewed_at,
      doneAt: (row.contractor_done_at as string | null) ?? null,
      updatedAt: (row.updated_at as string | null) ?? (row.created_at as string | null) ?? null,
    };
  });
}

function useKind(kind: Kind, enabled: boolean) {
  return useQuery({
    queryKey: ["idag-items", kind],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from(TABLE[kind]).select("*");
      if (error) throw error;
      return toEntries(kind, (data ?? []) as Row_[]);
    },
  });
}

const isActive = (e: Entry) => e.lifecycle !== "avslutat";
const isOverdue = (e: Entry) => isActive(e) && e.status.daysLeft != null && e.status.daysLeft < 0;
const keyOf = (e: Entry) => `${e.kind}-${e.id}`;

function levelOf(entries: Entry[]): Level {
  const active = entries.filter(isActive);
  if (active.some((e) => isOverdue(e) || e.akut)) return "bad";
  if (active.some((e) => e.doneAt || (e.kind === "inspection" && e.status.daysLeft != null && e.status.daysLeft <= 30))) return "warn";
  return "ok";
}

function IdagPage() {
  const { role, name } = useHomeUser();
  const allowed = role === "admin";
  const [sel, setSel] = useState<string | null>(null);

  const propsQ = useQuery({
    queryKey: ["idag-properties"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
  const issuesQ = useKind("issue", allowed);
  const inspectionsQ = useKind("inspection", allowed);
  const projectsQ = useKind("project", allowed);

  const properties = propsQ.data ?? [];
  const propName = (id: string | null) => properties.find((p) => p.id === id)?.name ?? "—";
  const loading = propsQ.isLoading || issuesQ.isLoading || inspectionsQ.isLoading || projectsQ.isLoading;

  const all = useMemo(
    () => [...(issuesQ.data ?? []), ...(inspectionsQ.data ?? []), ...(projectsQ.data ?? [])],
    [issuesQ.data, inspectionsQ.data, projectsQ.data],
  );
  const scoped = useMemo(() => (sel ? all.filter((e) => e.propertyId === sel) : all), [all, sel]);
  const active = scoped.filter(isActive);

  const attention = active
    .filter((e) => isOverdue(e) || e.akut)
    .sort((a, b) => (a.status.daysLeft ?? 9999) - (b.status.daysLeft ?? 9999));
  const review = active.filter((e) => e.doneAt).sort((a, b) => (a.doneAt ?? "").localeCompare(b.doneAt ?? ""));
  const fresh = active.filter((e) => e.kind === "issue" && e.isNew);
  const upcoming = active
    .filter((e) => e.kind === "inspection" && e.status.dueDate)
    .sort((a, b) => (a.status.dueDate ?? "").localeCompare(b.status.dueDate ?? ""));
  const upcoming60 = upcoming.filter((e) => e.status.daysLeft != null && e.status.daysLeft >= 0 && e.status.daysLeft <= 60);
  const cutoff = Date.now() - 30 * 86400000;
  const resolved = scoped.filter((e) => e.lifecycle === "avslutat" && e.updatedAt && new Date(e.updatedAt).getTime() >= cutoff);

  const waiting = new Set([...attention, ...review, ...fresh].map(keyOf)).size;
  const headline = waiting === 0 ? "Inget väntar på dig." : `${waiting} ${waiting === 1 ? "sak väntar" : "saker väntar"} på dig.`;
  const sub = [
    attention.length > 0 ? `${attention.length} kräver åtgärd` : null,
    review.length > 0 ? `${review.length} att granska` : null,
    fresh.length > 0 ? `${fresh.length} nya felanmälningar` : null,
    upcoming60.length > 0 ? `${upcoming60.length} kontroller de närmaste 60 dagarna` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const perProperty = properties.map((p) => {
    const entries = all.filter((e) => e.propertyId === p.id);
    const act = entries.filter(isActive);
    return { p, level: levelOf(entries), count: act.filter((e) => e.kind !== "project").length, projects: act.filter((e) => e.kind === "project").length };
  });

  const selName = sel ? propName(sel) : null;

  return (
    <>
      <style>{HOME_STYLES}</style>
      <div className="hk-page">
        <div className="hk-wrap">
          <TopBar role={role} name={name} items={NAV} roleLabel="BAYT" />

          {role === undefined && <div className="hk-empty">Laddar…</div>}
          {role !== undefined && !allowed && (
            <div className="hk-empty">
              Den här sidan är till för BAYT:s personal.{" "}
              <Link to={"/start" as never} className="hk-link">
                Till startsidan
              </Link>
            </div>
          )}

          {allowed && (
            <>
              <section className="hk-hero">
                <HeroBell />                <div className="hk-hero-body">
                  <p className="hk-hello">{greeting()}</p>
                  <h1 className={`hk-headline${attention.length > 0 ? " bad" : ""}`}>{loading ? "Hämtar läget…" : headline}</h1>
                  <p className="hk-sub">{loading ? "" : sub || "Allt är avstämt för tillfället."}</p>
                </div>
              </section>

              <div className="hk-actions">
                <Link to={"/issues/new" as never} className="hk-action primary">
                  + Ny felanmälan
                </Link>
                <Link to={"/dag-rapport" as never} className="hk-action">
                  Dag Rapport
                </Link>
                <Link to={"/teknik" as never} className="hk-action">
                  Teknik
                </Link>
                <Link to={"/fastighetspresentation" as never} className="hk-action">
                  Presentation
                </Link>
                <Link to={"/entreprenorer" as never} className="hk-action">
                  Entreprenörer
                </Link>
              </div>

              <div className="hk-kpis">
                <div className={`hk-kpi${attention.length > 0 ? " bad" : ""}`}>
                  <div className="hk-kpi-label">Kräver åtgärd</div>
                  <div className="hk-kpi-n">{attention.length}</div>
                  <div className="hk-kpi-sub">Försenade eller akuta</div>
                </div>
                <div className={`hk-kpi${review.length > 0 ? " warn" : ""}`}>
                  <div className="hk-kpi-label">Att granska</div>
                  <div className="hk-kpi-n">{review.length}</div>
                  <div className="hk-kpi-sub">Entreprenör anger klart</div>
                </div>
                <div className="hk-kpi">
                  <div className="hk-kpi-label">Nya felanmälningar</div>
                  <div className="hk-kpi-n">{fresh.length}</div>
                  <div className="hk-kpi-sub">Inte öppnade än</div>
                </div>
                <div className="hk-kpi">
                  <div className="hk-kpi-label">Kommande kontroller</div>
                  <div className="hk-kpi-n">{upcoming60.length}</div>
                  <div className="hk-kpi-sub">Inom 60 dagar</div>
                </div>
                <div className="hk-kpi good">
                  <div className="hk-kpi-label">Avklarat</div>
                  <div className="hk-kpi-n">{resolved.length}</div>
                  <div className="hk-kpi-sub">Senaste 30 dagarna</div>
                </div>
              </div>

              <h2 className="hk-h2">Fastigheter</h2>
              {selName && (
                <div className="hk-filter">
                  <span>Visar bara {selName}.</span>
                  <button type="button" onClick={() => setSel(null)}>
                    Visa alla
                  </button>
                </div>
              )}
              <div className="hk-props">
                {perProperty.map(({ p, level, count, projects }) => (
                  <button key={p.id} type="button" className="hk-prop" aria-pressed={sel === p.id} onClick={() => setSel((c) => (c === p.id ? null : p.id))}>
                    <div className="hk-prop-top">
                      <div className="hk-prop-name">{p.name}</div>
                      <span className={`hk-badge ${level}`}>{LEVEL_LABEL[level]}</span>
                    </div>
                    <div className="hk-prop-stats">
                      <span>{count} aktiva ärenden</span>
                      <span>{projects} projekt</span>
                    </div>
                  </button>
                ))}
              </div>

              <h2 className="hk-h2">Det här väntar på dig</h2>
              <div className="hk-cols">
                <Panel title="Kräver åtgärd" to="/issues">
                  {attention.length === 0 && <div className="hk-empty">Inget är försenat eller akut. 👍</div>}
                  {attention.slice(0, 7).map((e) => {
                    const chip = e.akut && !isOverdue(e) ? { text: "Akut", cls: "hk-chip-bad" } : daysChip(e.status.daysLeft);
                    return (
                      <Row key={keyOf(e)} to={`/${KIND_PATH[e.kind]}/${e.id}`} title={e.title} sub={`${KIND_LABEL[e.kind]} · ${propName(e.propertyId)}`} right={<span className={`hk-chip ${chip.cls}`}>{chip.text}</span>} />
                    );
                  })}
                </Panel>

                <Panel title="Att granska — entreprenören är klar">
                  {review.length === 0 && <div className="hk-empty">Ingen väntar på ditt godkännande.</div>}
                  {review.slice(0, 7).map((e) => (
                    <Row
                      key={keyOf(e)}
                      to={`/${KIND_PATH[e.kind]}/${e.id}`}
                      title={e.title}
                      sub={`${KIND_LABEL[e.kind]} · ${propName(e.propertyId)}`}
                      right={
                        <>
                          <span className="hk-chip hk-chip-warn">Granska</span>
                          <span className="hk-row-sub" style={{ margin: 0 }}>
                            Klart {fmtDate(e.doneAt)}
                          </span>
                        </>
                      }
                    />
                  ))}
                </Panel>

                <Panel title="Nya felanmälningar" to="/issues">
                  {fresh.length === 0 && <div className="hk-empty">Alla felanmälningar är öppnade.</div>}
                  {fresh.slice(0, 7).map((e) => (
                    <Row key={keyOf(e)} to={`/issues/${e.id}`} title={e.title} sub={propName(e.propertyId)} right={<span className="hk-chip hk-chip-muted">Ny</span>} />
                  ))}
                </Panel>

                <Panel title="Kommande kontroller" to="/inspections">
                  {upcoming.length === 0 && <div className="hk-empty">Inga kontroller är planerade.</div>}
                  {upcoming.slice(0, 7).map((e) => {
                    const chip = daysChip(e.status.daysLeft);
                    return (
                      <Row
                        key={keyOf(e)}
                        to={`/inspections/${e.id}`}
                        title={e.title}
                        sub={propName(e.propertyId)}
                        right={
                          <>
                            <span className="hk-row-sub" style={{ margin: 0 }}>
                              {fmtDate(e.status.dueDate)}
                            </span>
                            <span className={`hk-chip ${chip.cls}`}>{chip.text}</span>
                          </>
                        }
                      />
                    );
                  })}
                </Panel>
              </div>

              <p className="hk-note">
                Siffrorna hämtas direkt ur portalen. "Att granska" visar ärenden där en entreprenör har tryckt på
                "Meddela att uppdraget är slutfört" och som ni inte har avslutat än.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
