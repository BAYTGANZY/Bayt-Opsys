import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FilterChips, FilterRow } from "@/components/ListFilterBar";
import {
  COLORS,
  usePropertyIssues,
  usePropertyInspections,
  usePropertyProjects,
  isClosedIssue,
  isClosedInspection,
  isClosedProject,
} from "@/components/property-tabs";
import {
  deriveIssueStatus,
  deriveInspectionStatus,
  deriveProjectStatus,
  type ArendeForStatus,
} from "@/lib/issue-tokens";
import { DerivedStatusBadge } from "@/components/DerivedStatusBadge";

export const Route = createFileRoute("/_authenticated/properties/$id/avslutat")({
  component: AvslutatRoute,
});

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 8px",
  fontSize: 12,
  fontWeight: 500,
  color: COLORS.secondary,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  borderBottom: `1px solid ${COLORS.border}`,
};

const td: React.CSSProperties = {
  padding: "14px 8px",
  color: COLORS.text,
  borderBottom: `1px solid ${COLORS.border}`,
  fontSize: 14,
};

function formatSwedishDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit" });
}

/** Archive order: most recently created first. No sort controls here — the
 *  page is a record, not a worklist. That still holds: the one control on this
 *  page (below) narrows *which* rows the record contains, it does not reorder
 *  them. */
function byNewest(rows: any[]): any[] {
  return [...rows].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
}

/**
 * Ett avbrutet projekt är lika färdigt som ett avslutat — därför ligger båda
 * här (isClosedProject slår ihop dem). Men "vi blev klara" och "vi lade ner
 * det" är inte samma sak när man läser arkivet i efterhand, och den skillnaden
 * fanns tidigare ingenstans i gränssnittet.
 *
 * Bara projekt har det här valet. På felanmälningar och besiktningar är
 * statuskolumnen meningslös på den här sidan — varenda rad är avslutad per
 * definition — och ett filter med ett enda utfall är inget val.
 */
const PROJECT_ARCHIVE_OPTIONS = [
  { value: "avslutat", label: "Avslutade" },
  { value: "avbrutet", label: "Avbrutna" },
];

const projectArchiveKind = (r: any) => (r.status === "avbruten" ? "avbrutet" : "avslutat");

function Section({
  title,
  isLoading,
  count,
  emptyLabel,
  controls,
  children,
}: {
  title: string;
  isLoading: boolean;
  count: number;
  emptyLabel: string;
  /** Renderas under rubriken oavsett om sektionen har rader — annars försvinner
   *  kontrollen som filtrerade bort dem och valet går inte att ångra. */
  controls?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: COLORS.text, fontFamily: "Outfit, Inter, system-ui, sans-serif" }}>
        {title}
      </h3>
      {controls}
      {isLoading ? (
        <div style={{ color: COLORS.secondary, fontSize: 14 }}>Laddar…</div>
      ) : count === 0 ? (
        <div style={{ color: COLORS.secondary, fontSize: 14 }}>Inga {emptyLabel}</div>
      ) : (
        <div style={{ overflowX: "auto" }}>{children}</div>
      )}
    </div>
  );
}

/**
 * Avslutade ärenden för en fastighet. The active section lists filter these
 * rows out; this page is where they live instead. Same queries as the tabs
 * (usePropertyIssues & co — entreprenör scoping included), split by the shared
 * isClosed* predicates, so an ärende always appears in exactly one of the two
 * views. Rows open the ordinary detail pages via the fastighet route.
 */
function AvslutatRoute() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const issuesQ = usePropertyIssues(id);
  const inspectionsQ = usePropertyInspections(id);
  const projectsQ = usePropertyProjects(id);

  const issues = useMemo(
    () => byNewest(((issuesQ.data ?? []) as any[]).filter(isClosedIssue)),
    [issuesQ.data],
  );
  const inspections = useMemo(
    () => byNewest(((inspectionsQ.data ?? []) as any[]).filter(isClosedInspection)),
    [inspectionsQ.data],
  );
  const [projectKind, setProjectKind] = useState<string | null>(null);

  const closedProjects = useMemo(
    () => byNewest(((projectsQ.data ?? []) as any[]).filter(isClosedProject)),
    [projectsQ.data],
  );
  // Bara de utfall som faktiskt finns i arkivet — en fastighet utan avbrutna
  // projekt ska inte erbjudas ett val som garanterat ger en tom lista.
  const projectKindOptions = useMemo(() => {
    const present = new Set<string>(closedProjects.map(projectArchiveKind));
    if (projectKind) present.add(projectKind);
    return PROJECT_ARCHIVE_OPTIONS.filter((o) => present.has(o.value));
  }, [closedProjects, projectKind]);
  const projects = useMemo(
    () => (projectKind ? closedProjects.filter((r) => projectArchiveKind(r) === projectKind) : closedProjects),
    [closedProjects, projectKind],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: COLORS.text, fontFamily: "Outfit, Inter, system-ui, sans-serif" }}>
          Avslutade ärenden
        </h2>
        <div style={{ fontSize: 13, color: COLORS.secondary, marginTop: 4 }}>
          Avslutade felanmälningar och besiktningar samt avslutade eller avbrutna projekt i fastigheten.
        </div>
      </div>

      <Section title="Felanmälningar" isLoading={issuesQ.isLoading} count={issues.length} emptyLabel="avslutade felanmälningar">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={th}>Titel</th><th style={th}>Status</th><th style={th}>Skapad</th></tr></thead>
          <tbody>
            {issues.map((r: any) => (
              <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => navigate({ to: "/properties/$id/issues/$issueId", params: { id, issueId: r.id } })}>
                <td style={{ ...td, fontWeight: 600 }}>{r.title}</td>
                <td style={td}><DerivedStatusBadge status={deriveIssueStatus(r as ArendeForStatus)} /></td>
                <td style={{ ...td, color: COLORS.secondary }}>{formatSwedishDate(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Besiktningar" isLoading={inspectionsQ.isLoading} count={inspections.length} emptyLabel="avslutade besiktningar">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={th}>Typ</th><th style={th}>Besiktningsman</th><th style={th}>Senast utförd</th><th style={th}>Status</th></tr></thead>
          <tbody>
            {inspections.map((r: any) => (
              <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => navigate({ to: "/properties/$id/inspections/$inspectionId", params: { id, inspectionId: r.id } })}>
                <td style={{ ...td, fontWeight: 600 }}>{r.inspection_type ?? "—"}</td>
                <td style={td}>{r.inspector ?? "—"}</td>
                <td style={{ ...td, color: COLORS.secondary }}>{formatSwedishDate(r.last_completed_date)}</td>
                <td style={td}><DerivedStatusBadge status={deriveInspectionStatus(r)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section
        title="Projekt"
        isLoading={projectsQ.isLoading}
        count={projects.length}
        emptyLabel={projectKind ? "projekt för det här valet" : "avslutade eller avbrutna projekt"}
        controls={
          projectKindOptions.length > 1 ? (
            <FilterRow>
              <FilterChips
                options={projectKindOptions}
                value={projectKind}
                onChange={setProjectKind}
                ariaLabel="Filtrera arkiverade projekt på utfall"
                allLabel="Alla"
              />
            </FilterRow>
          ) : null
        }
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={th}>Titel</th><th style={th}>Status</th><th style={th}>Start</th><th style={th}>Slut</th></tr></thead>
          <tbody>
            {projects.map((r: any) => (
              <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => navigate({ to: "/properties/$id/projects/$projectId", params: { id, projectId: r.id } })}>
                <td style={{ ...td, fontWeight: 600 }}>{r.title}</td>
                <td style={td}><DerivedStatusBadge status={deriveProjectStatus(r)} /></td>
                <td style={{ ...td, color: COLORS.secondary }}>{formatSwedishDate(r.start_date)}</td>
                <td style={{ ...td, color: COLORS.secondary }}>{formatSwedishDate(r.end_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
