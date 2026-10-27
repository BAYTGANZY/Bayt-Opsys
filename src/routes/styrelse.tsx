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

export const Route = createFileRoute("/styrelse")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Översikt — BAYT" }] }),
  component: StyrelsePage,
});

type Lifecycle = "vilande" | "oppet" | "avslutat";
type Level = "ok" | "warn" | "bad";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row_ = Record<string, any>;

type Property = { id: string; name: string; address: string | null };

type Entry = {
  kind: Kind;
  id: string;
  title: string;
  propertyId: string | null;
  lifecycle: Lifecycle;
  status: DerivedStatus;
  akut: boolean;
  updatedAt: string | null;
  endDate: string | null;
};

const TABLE: Record<Kind, string> = { issue: "issues", inspection: "inspections", project: "projects" };
const LEVEL_LABEL: Record<Level, string> = { ok: "Under kontroll", warn: "Uppmärksamhet", bad: "Åtgärd krävs" };

const NAV: Array<{ to: string; label: string }> = [
  { to: "/dag-rapport", label: "Dag Rapport" },
  { to: "/fastigheter", label: "Fastigheter" },
  { to: "/issues", label: "Felanmälningar" },
  { to: "/inspections", label: "Besiktningar" },
  { to: "/projects", label: "Projekt" },
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
      updatedAt: (row.updated_at as string | null) ?? (row.created_at as string | null) ?? null,
      endDate: (row.end_date as string | null) ?? null,
    };
  });
}

function useKind(kind: Kind, enabled: boolean) {
  return useQuery({
    queryKey: ["sv-items", kind],
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
  if (active.some((e) => e.kind === "inspection" && e.status.daysLeft != null && e.status.daysLeft <= 30)) return "warn";
  return "ok";
}

function StyrelsePage() {
  const { role, name } = useHomeUser();
  const allowed = role === "styrelse" || role === "admin";
  const [sel, setSel] = useState<string | null>(null);

  const propsQ = useQuery({
    queryKey: ["sv-properties"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id, name, address").order("name");
      if (error) throw error;
      return (data ?? []) as Property[];
    },
  });
  const issuesQ = useKind("issue", allowed);
  const inspectionsQ = useKind("inspection", allowed);
  const projectsQ = useKind("project", allowed);

  const properties = propsQ.data ?? [];
  const propMap = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties]);
  const propName = (id: string | null) => (id ? propMap.get(id)?.name ?? "—" : "—");
  const loading = propsQ.isLoading || issuesQ.isLoading || inspectionsQ.isLoading || projectsQ.isLoading;

  const all = useMemo(
    () =>
      [...(issuesQ.data ?? []), ...(inspectionsQ.data ?? []), ...(projectsQ.data ?? [])].filter(
        (e) => e.propertyId && propMap.has(e.propertyId),
      ),
    [issuesQ.data, inspectionsQ.data, projectsQ.data, propMap],
  );
  const scoped = useMemo(() => (sel ? all.filter((e) => e.propertyId === sel) : all), [all, sel]);
  const active = scoped.filter(isActive);

  const needsAttention = active
    .filter((e) => isOverdue(e) || e.akut)
    .sort((a, b) => (a.status.daysLeft ?? 9999) - (b.status.daysLeft ?? 9999));
  const overdueCount = active.filter(isOverdue).length;
  const upcoming = active
    .filter((e) => e.kind === "inspection" && e.status.dueDate)
    .sort((a, b) => (a.status.dueDate ?? "").localeCompare(b.status.dueDate ?? ""));
  const upcoming90 = upcoming.filter((e) => e.status.daysLeft != null && e.status.daysLeft >= 0 && e.status.daysLeft <= 90);
  const projects = active.filter((e) => e.kind === "project");
  const openIssues = active.filter((e) => e.kind === "issue");
  const cutoff = Date.now() - 30 * 86400000;
  const resolved = scoped
    .filter((e) => e.lifecycle === "avslutat" && e.updatedAt && new Date(e.updatedAt).getTime() >= cutoff)
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));

  const selectedProp = sel ? propMap.get(sel) ?? null : null;
  const firstName = role === "styrelse" ? name?.trim().split(/\s+/)[0] ?? "" : "";

  const headline =
    needsAttention.length > 0
      ? `${needsAttention.length} ${needsAttention.length === 1 ? "sak kräver" : "saker kräver"} din uppmärksamhet.`
      : "Allt är under kontroll.";
  const sub = [
    selectedProp ? selectedProp.name : `${properties.length} ${properties.length === 1 ? "fastighet" : "fastigheter"}`,
    `${openIssues.length} ${openIssues.length === 1 ? "öppen felanmälan" : "öppna felanmälningar"}`,
    `${projects.length} pågående projekt`,
    upcoming90.length > 0 ? `${upcoming90.length} ${upcoming90.length === 1 ? "kontroll" : "kontroller"} de närmaste 90 dagarna` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const nextItem = needsAttention[0] ?? upcoming[0] ?? null;
  const nextChip = nextItem
    ? nextItem.akut && !isOverdue(nextItem)
      ? { text: "Akut", cls: "hk-chip-bad" }
      : daysChip(nextItem.status.daysLeft)
    : null;

  const perProperty = properties.map((p) => ({ p, level: levelOf(all.filter((e) => e.propertyId === p.id)) }));
  const entriesOf = (p: Property) => all.filter((e) => e.propertyId === p.id && isActive(e));

  return (
    <>
      <style>{HOME_STYLES}</style>
      <div className="hk-page">
        <div className="hk-wrap">
          <TopBar role={role} name={name} items={NAV} roleLabel={role === "admin" ? "Förhandsvisning" : "Styrelse"} />

          {role === undefined && <div className="hk-empty">Laddar…</div>}
          {role !== undefined && !allowed && (
            <div className="hk-empty">
              Den här sidan är till för styrelse och fastighetsägare.{" "}
              <Link to={"/start" as never} className="hk-link">
                Till startsidan
              </Link>
            </div>
          )}

          {allowed && !loading && properties.length === 0 && (
            <div className="hk-empty">Inga fastigheter är kopplade till ditt konto ännu. Kontakta förvaltaren.</div>
          )}

          {allowed && properties.length > 0 && (
            <>
              <Hero
                hello={`${greeting()}${firstName ? `, ${firstName}` : ""}`}
                headline={headline}
                bad={needsAttention.length > 0}
                sub={sub}
                loading={loading}
                next={
                  nextItem
                    ? {
                        to: `/${KIND_PATH[nextItem.kind]}/${nextItem.id}`,
                        label: needsAttention.length > 0 ? "Kräver uppmärksamhet" : "Nästa kontroll",
                        title: nextItem.title,
                        sub: `${KIND_LABEL[nextItem.kind]} · ${propName(nextItem.propertyId)}`,
                        chip: nextChip,
                      }
                    : null
                }
                emptyNext="Inget kräver åtgärd just nu. 👍"
                tiles={[
                  { label: "Fastigheter", n: selectedProp ? 1 : properties.length, to: "/fastigheter" },
                  { label: "Öppna felanmälningar", n: openIssues.length, tone: overdueCount > 0 ? "bad" : undefined, to: "/issues" },
                  { label: "Pågående projekt", n: projects.length, to: "/projects" },
                  { label: "Kontroller, 90 dagar", n: upcoming90.length, to: "/inspections" },
                  { label: "Avklarat, 30 dagar", n: resolved.length, tone: "good", wide: true, anchor: "panel-avklarat" },
                ]}
                chips={perProperty.map(({ p, level }) => ({ id: p.id, name: p.name, level }))}
                selected={sel}
                onSelect={(id) => setSel((c) => (c === id ? null : id))}
              />

              {selectedProp && (
                <div className="hk-filter" style={{ marginTop: 14 }}>
                  <span>Visar bara {selectedProp.name}.</span>
                  <button type="button" onClick={() => setSel(null)}>
                    Visa alla fastigheter
                  </button>
                </div>
              )}

              <h2 className="hk-h2">Läget just nu</h2>
              <div className="hk-cols">
                <Panel title="Kräver uppmärksamhet" to="/issues">
                  {needsAttention.length === 0 && <div className="hk-empty">Inget är försenat eller akut. 👍</div>}
                  {needsAttention.slice(0, 8).map((e) => {
                    const chip = e.akut && !isOverdue(e) ? { text: "Akut", cls: "hk-chip-bad" } : daysChip(e.status.daysLeft);
                    return (
                      <Row
                        key={keyOf(e)}
                        to={`/${KIND_PATH[e.kind]}/${e.id}`}
                        title={e.title}
                        sub={`${KIND_LABEL[e.kind]} · ${propName(e.propertyId)}`}
                        right={<span className={`hk-chip ${chip.cls}`}>{chip.text}</span>}
                      />
                    );
                  })}
                </Panel>

                <Panel title="Kommande kontroller" to="/inspections">
                  {upcoming.length === 0 && <div className="hk-empty">Inga kontroller är planerade.</div>}
                  {upcoming.slice(0, 8).map((e) => {
                    const chip = daysChip(e.status.daysLeft);
                    return (
                      <Row
                        key={keyOf(e)}
                        to={`/${KIND_PATH[e.kind]}/${e.id}`}
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

                <Panel title="Pågående projekt" to="/projects">
                  {projects.length === 0 && <div className="hk-empty">Inga projekt pågår just nu.</div>}
                  {projects.slice(0, 8).map((e) => (
                    <Row
                      key={keyOf(e)}
                      to={`/${KIND_PATH[e.kind]}/${e.id}`}
                      title={e.title}
                      sub={propName(e.propertyId)}
                      right={
                        e.endDate ? (
                          <span className="hk-row-sub" style={{ margin: 0 }}>
                            Klart {fmtDate(e.endDate)}
                          </span>
                        ) : (
                          <span className="hk-chip hk-chip-muted">Ingen tidplan</span>
                        )
                      }
                    />
                  ))}
                </Panel>

                <div id="panel-avklarat" style={{ minWidth: 0, scrollMarginTop: 16 }}>
                  <Panel title="Avklarat senaste 30 dagarna">
                    {resolved.length === 0 && <div className="hk-empty">Inget avslutat den senaste månaden.</div>}
                    {resolved.slice(0, 8).map((e) => (
                      <Row
                        key={keyOf(e)}
                        to={`/${KIND_PATH[e.kind]}/${e.id}`}
                        title={e.title}
                        sub={`${KIND_LABEL[e.kind]} · ${propName(e.propertyId)}`}
                        right={
                          <>
                            <span className="hk-chip hk-chip-ok">Avslutad</span>
                            <span className="hk-row-sub" style={{ margin: 0 }}>
                              {fmtDate(e.updatedAt)}
                            </span>
                          </>
                        }
                      />
                    ))}
                  </Panel>
                </div>
              </div>

              <h2 className="hk-h2">Fastigheter</h2>
              <div className="hk-props">
                {perProperty.map(({ p, level }) => {
                  const list = entriesOf(p);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="hk-prop"
                      aria-pressed={sel === p.id}
                      onClick={() => {
                        setSel((c) => (c === p.id ? null : p.id));
                        try {
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        } catch {
                          /* ignoreras */
                        }
                      }}
                    >
                      <div className="hk-prop-top">
                        <div className="hk-prop-name">{p.name}</div>
                        <span className={`hk-badge ${level}`}>{LEVEL_LABEL[level]}</span>
                      </div>
                      {p.address && <div className="hk-row-sub">{p.address}</div>}
                      <div className="hk-prop-stats">
                        <span>{list.filter((e) => e.kind !== "project").length} aktiva ärenden</span>
                        <span>{list.filter((e) => e.kind === "project").length} projekt</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <p className="hk-note">
                Siffrorna hämtas direkt ur portalen. "Avklarat" räknar ärenden som avslutats eller senast ändrats de
                senaste 30 dagarna.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
