import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { formatSwedishLongDate } from "@/components/PropertyTimeline";
import {
  LogSelectCheckbox, LogSelectionBar, useLogSelection,
  type LogTable, type LogTarget,
} from "@/components/LogSelection";
import {
  LoggbokFilterBar, loggbokEmptyText, useLoggbokFilter, type SourceOption,
} from "@/components/LoggbokFilterBar";
import { inspectionTypeLabel } from "@/lib/inspection-tokens";
import { actionKindOf } from "@/lib/logbook";

const C = {
  card: "#ffffff", border: "#E5E7EB", secondary: "#6B7280", text: "#1a1a1a",
  accent: "#0D2B1E",
};

/**
 * Every log event in the system, across every building, in one list.
 *
 * Same merge as the per-fastighet loggbok (PropertyLoggbokWithComments) —
 * loggboksposter plus the besiktningar and projekt the feed derives events
 * from — but unscoped, so an admin can clear history in bulk without walking
 * into each building. Rows carry the building name because that is the only
 * thing distinguishing two otherwise identical entries here.
 *
 * Not role-gated in the query: RLS already limits what each role can read, and
 * the delete toolbar renders for admin only.
 */

type Kind = "log" | "inspection" | "project";

type Row = {
  key: string;
  kind: Kind;
  id: string;
  date: string;
  title: string;
  propertyId: string | null;
  propertyName: string;
  actionKind: string;
  actorId: string | null;
  actorName: string | null;
};

const KIND_TABLE: Record<Kind, LogTable> = {
  log: "logbook_entries",
  inspection: "inspections",
  project: "projects",
};

const KIND_LABEL: Record<Kind, string> = {
  log: "Loggbok",
  inspection: "Besiktning",
  project: "Projekt",
};

const KIND_COLOR: Record<Kind, string> = {
  log: "#9CA3AF",
  inspection: "#3D8A30",
  project: "#E07B35",
};

const FILTERS: readonly SourceOption[] = [
  { key: "alla", label: "Alla" },
  { key: "log", label: "Loggbok" },
  { key: "inspection", label: "Besiktningar" },
  { key: "project", label: "Projekt" },
];

function target(r: Row): LogTarget {
  return { table: KIND_TABLE[r.kind], id: r.id };
}

/**
 * Actor names come from a separate `profiles` read keyed on the collected
 * `created_by`s, not a `profiles:created_by(full_name)` embed. An embed needs a
 * declared FK on all three tables, and a missing one 400s the entire query
 * instead of just losing a name — the same reasoning as the lägenhetslabel in
 * useMyArenden. A non-admin can only read some profiles anyway (chat.sql's
 * profiles_select_for_chat), so the unresolved ones fall back to "Okänd".
 */
async function resolveActorNames(ids: Array<string | null>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => !!v))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", unique);
  for (const p of (data ?? []) as Array<{ id: string; full_name: string | null }>) {
    if (p.full_name) out.set(p.id, p.full_name);
  }
  return out;
}

async function loadAll(): Promise<Row[]> {
  const [props, logs, insp, projs] = await Promise.all([
    supabase.from("properties").select("id, name"),
    supabase
      .from("logbook_entries")
      .select("id, content, entry_date, created_at, event_type, created_by, property_id")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("inspections")
      .select("id, inspection_type, last_completed_date, created_by, property_id")
      .not("last_completed_date", "is", null),
    supabase.from("projects").select("id, title, start_date, end_date, created_by, property_id"),
  ]);

  const nameOf = new Map<string, string>();
  for (const p of (props.data ?? []) as Array<{ id: string; name: string | null }>) {
    nameOf.set(p.id, p.name ?? "Okänd fastighet");
  }
  const name = (id: string | null) => (id ? nameOf.get(id) ?? "Okänd fastighet" : "Ingen fastighet");

  const actorName = await resolveActorNames([
    ...((logs.data ?? []) as any[]).map((r) => r.created_by),
    ...((insp.data ?? []) as any[]).map((r) => r.created_by),
    ...((projs.data ?? []) as any[]).map((r) => r.created_by),
  ]);
  const actor = (id: string | null) => ({
    actorId: id ?? null,
    actorName: id ? actorName.get(id) ?? null : null,
  });

  const rows: Row[] = [];

  for (const r of (logs.data ?? []) as any[]) {
    const when = r.created_at ?? r.entry_date;
    if (!when) continue;
    const text = String(r.content ?? "").trim();
    rows.push({
      key: `l-${r.id}`, kind: "log", id: r.id, date: when,
      title: text.length > 120 ? `${text.slice(0, 120)}…` : text || "Loggbokspost",
      propertyId: r.property_id, propertyName: name(r.property_id),
      actionKind: actionKindOf(r.event_type, r.content), ...actor(r.created_by),
    });
  }
  for (const r of (insp.data ?? []) as any[]) {
    if (!r.last_completed_date) continue;
    rows.push({
      key: `i-${r.id}`, kind: "inspection", id: r.id, date: r.last_completed_date,
      title: `${inspectionTypeLabel(r.inspection_type)} besiktigad`,
      propertyId: r.property_id, propertyName: name(r.property_id),
      // The row only exists when last_completed_date is set, so the åtgärd it
      // stands for is always "besiktning utförd".
      actionKind: "besiktning_utford", ...actor(r.created_by),
    });
  }
  for (const r of (projs.data ?? []) as any[]) {
    const d = r.end_date ?? r.start_date;
    if (!d) continue;
    rows.push({
      key: `p-${r.id}`, kind: "project", id: r.id, date: d,
      title: r.title ?? "Projekt",
      propertyId: r.property_id, propertyName: name(r.property_id),
      actionKind: "projekt", ...actor(r.created_by),
    });
  }

  rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  return rows;
}

export function AllBuildingsLoggbok() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["all-buildings-loggbok"],
    queryFn: loadAll,
  });

  const { rows: filtered, filters } = useLoggbokFilter(rows, (r) => ({
    source: r.kind,
    actionKind: r.actionKind,
    actorId: r.actorId,
    actorName: r.actorName,
    date: r.date,
    text: `${r.title} ${r.propertyName}`,
  }));

  // Selection tracks the filtered rows, so "Välj alla" means "everything I can
  // currently see" — never rows hidden behind a chip or the search box.
  const selection = useLogSelection(filtered.map(target));

  const years = useMemo(() => {
    const out: { year: number; items: Row[] }[] = [];
    for (const r of filtered) {
      const y = new Date(r.date).getFullYear();
      const last = out[out.length - 1];
      if (last && last.year === y) last.items.push(r);
      else out.push({ year: y, items: [r] });
    }
    return out;
  }, [filtered]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <LoggbokFilterBar filters={filters} sources={FILTERS} />

      <LogSelectionBar
        selection={selection}
        invalidateKeys={[
          ["all-buildings-loggbok"],
          ["property-timeline"],
          ["property-loggbok-comments"],
          ["logbook"],
          ["section-overview-stats", "logbook"],
          ["inspections"], ["projects"], ["oppna-arenden"],
        ]}
      />

      {isLoading ? (
        <div style={{ color: C.secondary }}>Laddar…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: "48px 16px", textAlign: "center", color: C.secondary, fontSize: 14 }}>
          {loggbokEmptyText(filters.active, "Ingen aktivitet")}
        </div>
      ) : (
        years.map((g) => (
          <div key={g.year}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 10 }}>{g.year}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {g.items.map((r) => (
                <div
                  key={r.key}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    border: `1px solid ${C.border}`, borderRadius: 8,
                    padding: 12, background: C.card,
                  }}
                >
                  <LogSelectCheckbox selection={selection} target={target(r)} style={{ marginTop: 3 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: KIND_COLOR[r.kind], letterSpacing: "0.04em" }}>
                        {KIND_LABEL[r.kind]}
                      </span>
                      <span style={{ fontSize: 12, color: C.secondary }}>{r.propertyName}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginTop: 2, whiteSpace: "pre-wrap" }}>
                      {r.title}
                    </div>
                    <div style={{ fontSize: 12, color: C.secondary, marginTop: 2 }}>
                      {formatSwedishLongDate(r.date)}
                      {r.actorId ? ` · ${r.actorName ?? "Okänd"}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
