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
  greeting,
  fmtDate,
  daysChip,
  KIND_LABEL,
  KIND_PATH,
  type Kind,
} from "@/components/HomeKit";
import { Hero } from "@/components/HeroKit";

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

type Property = { id: string; name: string };

const TABLE: Record<Kind, string> = { issue: "issues", inspection: "inspections", project: "projects" };

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
      return (data ?? []) as Property[];
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

  const next = attention[0] ?? review[0] ?? fresh[0] ?? null;
  const nextChip = next
    ? next.akut && !isOverdue(next)
      ? { text: "Akut", cls: "hk-chip-bad" }
      : next.doneAt
        ? { text: "Granska", cls: "hk-chip-warn" }
        : next.status.daysLeft != null
          ? daysChip(next.status.daysLeft)
          : { text: "Ny", cls: "hk-chip-muted" }
    : null;

  const perProperty = properties.map((p) => ({ p, level: levelOf(all.filter((e) => e.propertyId === p.id)) }));
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
              <Hero
                hello={greeting()}
                headline={headline}
                bad={attention.length > 0}
                sub={sub || "Allt är avstämt för tillfället."}
                loading={loading}
                next={
                  next
                    ? {
                        to: `/${KIND_PATH[next.kind]}/${next.id}`,
                        label: "Nästa upp",
                        title: next.title,
                        sub: `${KIND_LABEL[next.kind]} · ${propName(next.propertyId)}`,
                        chip: nextChip,
                      }
                    : null
                }
                emptyNext="Inget väntar. Bra jobbat. 👍"
                tiles={[
                  { label: "Kräver åtgärd", n: attention.length, tone: attention.length > 0 ? "bad" : undefined, anchor: "panel-attention" },
                  { label: "Att granska", n: review.length, tone: review.length > 0 ? "warn" : undefined, anchor: "panel-review" },
                  { label: "Nya felanmälningar", n: fresh.length, to: "/issues" },
                  { label: "Kontroller, 60 dagar", n: upcoming60.length, to: "/inspections" },
                  { label: "Avklarat, 30 dagar", n: resolved.length, tone: "good", wide: true, to: "/loggbok" },
                ]}
                chips={perProperty.map(({ p, level }) => ({ id: p.id, name: p.name, level }))}
                selected={sel}
                onSelect={(id) => setSel((c) => (c === id ? null : id))}
              />

              {selName && (
                <div className="hk-filter" style={{ marginTop: 14 }}>
                  <span>Visar bara {selName}.</span>
                  <button type="button" onClick={() => setSel(null)}>
                    Visa alla
                  </button>
                </div>
              )}

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

              <h2 className="hk-h2">Det här väntar på dig</h2>
              <div className="hk-cols">
                <div id="panel-attention" style={{ minWidth: 0, scrollMarginTop: 16 }}>
                  <Panel title="Kräver åtgärd" to="/issues">
                    {attention.length === 0 && <div className="hk-empty">Inget är försenat eller akut. 👍</div>}
                    {attention.slice(0, 7).map((e) => {
                      const chip = e.akut && !isOverdue(e) ? { text: "Akut", cls: "hk-chip-bad" } : daysChip(e.status.daysLeft);
                      return (
                        <Row key={keyOf(e)} to={`/${KIND_PATH[e.kind]}/${e.id}`} title={e.title} sub={`${KIND_LABEL[e.kind]} · ${propName(e.propertyId)}`} right={<span className={`hk-chip ${chip.cls}`}>{chip.text}</span>} />
                      );
                    })}
                  </Panel>
                </div>

                <div id="panel-review" style={{ minWidth: 0, scrollMarginTop: 16 }}>
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
                </div>

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
