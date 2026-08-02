import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { StatusDot, OpenAgeDot } from "./StatusDot";

type SectionKey = "apartments" | "issues" | "inspections" | "projects" | "documents" | "logbook";

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "apartments", label: "Lägenheter" },
  { key: "issues", label: "Felanmälan" },
  { key: "inspections", label: "Besiktningar" },
  { key: "projects", label: "Projekt" },
  { key: "documents", label: "Dokument" },
  { key: "logbook", label: "Loggbok" },
];

const DOT_SECTIONS = new Set<SectionKey>(["issues", "inspections", "projects"]);

type UrgencyRow = { unviewedCount: number; deadline: string | null };
type UrgencyMap = Partial<Record<SectionKey, UrgencyRow>>;

async function loadUrgency(propertyId: string): Promise<UrgencyMap> {
  // Closed errands must never keep a dot alive — "unviewed" alone is not enough,
  // since an errand can be avslutad (e.g. from Dag Rapport) without ever being opened.
  const [issues, inspections, projects] = await Promise.all([
    supabase
      .from("issues")
      .select("deadline, viewed_at")
      .eq("property_id", propertyId)
      .is("viewed_at", null)
      .not("status", "in", "(klar,fakturerad,stangd,avslutat)"),
    supabase
      .from("inspections")
      .select("next_due_date, viewed_at")
      .eq("property_id", propertyId)
      .is("viewed_at", null)
      .or("arende_status.is.null,arende_status.neq.avslutat")
      .or("status.is.null,status.neq.klar"),
    supabase
      .from("projects")
      .select("end_date, viewed_at")
      .eq("property_id", propertyId)
      .is("viewed_at", null)
      .or("arende_status.is.null,arende_status.neq.avslutat")
      .or("status.is.null,and(status.neq.klar,status.neq.avbruten)"),
  ]);

  function reduce<T>(rows: T[] | null, pick: (r: T) => string | null): UrgencyRow {
    const arr = rows ?? [];
    let earliest: string | null = null;
    for (const r of arr) {
      const d = pick(r);
      if (d && (!earliest || d < earliest)) earliest = d;
    }
    return { unviewedCount: arr.length, deadline: earliest };
  }

  return {
    issues: reduce(issues.data as Array<{ deadline: string | null }> | null, (r) => r.deadline ?? null),
    inspections: reduce(inspections.data as Array<{ next_due_date: string | null }> | null, (r) => r.next_due_date ?? null),
    projects: reduce(projects.data as Array<{ end_date: string | null }> | null, (r) => r.end_date ?? null),
  };
}

type OpenAgeRow = { count: number; oldestOpenedAt: string | null };
type OpenAgeMap = Partial<Record<SectionKey, OpenAgeRow>>;

/**
 * Öppna ärenden overview only: dot reflects how long each section's oldest
 * still-open ärende has been open (vilande → oppet), not its deadline.
 * "Opened at" comes from audit_events' 'opened' lifecycle row (the trigger in
 * audit-events-triggers.sql); ärenden opened before that trigger existed have
 * no such row, so created_at is the fallback — an approximation, not exact.
 */
async function loadOpenAge(propertyId: string): Promise<OpenAgeMap> {
  const [issues, inspections, projects] = await Promise.all([
    supabase.from("issues").select("id, created_at").eq("property_id", propertyId).in("status", ["pagande", "oppet", "vantar"]),
    supabase.from("inspections").select("id, created_at").eq("property_id", propertyId).eq("arende_status", "oppet"),
    supabase.from("projects").select("id, created_at").eq("property_id", propertyId).eq("arende_status", "oppet"),
  ]);

  type Row = { id: string; created_at: string };
  const issueRows = (issues.data ?? []) as Row[];
  const inspectionRows = (inspections.data ?? []) as Row[];
  const projectRows = (projects.data ?? []) as Row[];
  const allIds = [...issueRows, ...inspectionRows, ...projectRows].map((r) => r.id);

  const openedAtById = new Map<string, string>();
  if (allIds.length > 0) {
    const { data } = await supabase
      .from("audit_events")
      .select("entity_id, created_at")
      .in("entity_id", allIds)
      .eq("action", "opened")
      .order("created_at", { ascending: false });
    // Most recent 'opened' row per id wins — that's when the CURRENT open
    // period started.
    for (const r of (data ?? []) as { entity_id: string; created_at: string }[]) {
      if (!openedAtById.has(r.entity_id)) openedAtById.set(r.entity_id, r.created_at);
    }
  }

  function reduce(rows: Row[]): OpenAgeRow {
    let oldest: string | null = null;
    for (const r of rows) {
      const openedAt = openedAtById.get(r.id) ?? r.created_at;
      if (!oldest || openedAt < oldest) oldest = openedAt;
    }
    return { count: rows.length, oldestOpenedAt: oldest };
  }

  return { issues: reduce(issueRows), inspections: reduce(inspectionRows), projects: reduce(projectRows) };
}

export function PropertySectionButtons({
  propertyId,
  sections,
  onlyOppet = false,
}: {
  propertyId: string;
  /** Restrict which section buttons render; defaults to all six. */
  sections?: SectionKey[];
  /** When true, dots/counts reflect only the "oppet" lifecycle stage (not vilande). */
  onlyOppet?: boolean;
}) {
  const { data: urgency } = useQuery({
    queryKey: ["property-urgency", propertyId],
    queryFn: () => loadUrgency(propertyId),
    staleTime: 30_000,
    enabled: !onlyOppet,
  });
  const { data: openAge } = useQuery({
    queryKey: ["property-open-age", propertyId],
    queryFn: () => loadOpenAge(propertyId),
    staleTime: 30_000,
    enabled: onlyOppet,
  });

  const visibleSections = sections ? SECTIONS.filter((s) => sections.includes(s.key)) : SECTIONS;

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#fff" }}>
      {visibleSections.map((s, i) => {
        const u = urgency?.[s.key];
        const age = openAge?.[s.key];
        const isLast = i === visibleSections.length - 1;
        return (
          <Link
            key={s.key}
            to={`/properties/${propertyId}/${s.key}` as never}
            search={onlyOppet ? ({ from: "oppna-arenden", filter: "oppna" } as never) : undefined}
            style={{
              position: "relative",
              flex: 1,
              minHeight: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 14px",
              color: "#1a1a1a",
              textDecoration: "none",
              fontSize: 15,
              fontWeight: 500,
              fontFamily: "Outfit, Inter, system-ui, sans-serif",
              borderBottom: isLast ? "none" : "1px solid #EBEDEB",
              transition: "background 0.15s, color 0.15s",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "#F0F7EE";
              (e.currentTarget as HTMLElement).style.color = "#0D2B1E";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "#1a1a1a";
            }}
          >
            <span>{s.label}</span>
            {DOT_SECTIONS.has(s.key) && (onlyOppet
              ? age && age.count > 0 && (
                  <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" }}>
                    <OpenAgeDot openedAt={age.oldestOpenedAt} />
                  </span>
                )
              : u && (
                  <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" }}>
                    <StatusDot deadline={u.deadline} unviewedCount={u.unviewedCount} />
                  </span>
                ))}
          </Link>
        );
      })}
    </div>
  );
}
