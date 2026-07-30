import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { COLORS } from "@/components/property-tabs";

export type TimelineEvent = { id: string; kind: "inspection" | "project" | "log"; date: string; title: string };

export function formatSwedishLongDate(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" });
}

/** Merged, newest-first activity feed for a property: completed inspections,
 *  projects, and logbook entries. `id` is a stable per-kind key (e.g. "i-<uuid>")
 *  used both for the settings-page timeline and the commentable Loggbok page. */
export function useMergedPropertyTimeline(propertyId: string) {
  return useQuery<TimelineEvent[]>({
    queryKey: ["property-timeline", propertyId],
    queryFn: async () => {
      const [insp, projs, logs] = await Promise.all([
        supabase.from("inspections").select("id, inspection_type, last_completed_date").eq("property_id", propertyId).not("last_completed_date", "is", null),
        supabase.from("projects").select("id, title, start_date, end_date").eq("property_id", propertyId),
        supabase.from("logbook_entries").select("id, content, created_at").eq("property_id", propertyId).order("created_at", { ascending: false }).limit(50),
      ]);
      const merged: TimelineEvent[] = [];
      for (const r of insp.data ?? []) {
        if (!r.last_completed_date) continue;
        merged.push({ id: `i-${r.id}`, kind: "inspection", date: r.last_completed_date, title: `${r.inspection_type ?? "Besiktning"} besiktigad` });
      }
      for (const r of projs.data ?? []) {
        const d = r.end_date ?? r.start_date;
        if (!d) continue;
        merged.push({ id: `p-${r.id}`, kind: "project", date: d, title: r.title ?? "Projekt" });
      }
      for (const r of logs.data ?? []) {
        if (!r.created_at) continue;
        const text = (r.content ?? "").toString().trim();
        merged.push({ id: `l-${r.id}`, kind: "log", date: r.created_at, title: text.length > 60 ? `${text.slice(0, 60)}…` : text || "Loggbokspost" });
      }
      merged.sort((a, b) => (a.date < b.date ? 1 : -1));
      return merged;
    },
  });
}

function groupByYear(events: TimelineEvent[]) {
  const groups: { year: number; items: TimelineEvent[] }[] = [];
  for (const ev of events) {
    const y = new Date(ev.date).getFullYear();
    const g = groups[groups.length - 1];
    if (g && g.year === y) g.items.push(ev); else groups.push({ year: y, items: [ev] });
  }
  return groups;
}

/** Read-only timeline card — used on the fastighet settings page. No comments. */
export function PropertyTimeline({ propertyId }: { propertyId: string }) {
  const { data: events = [] } = useMergedPropertyTimeline(propertyId);
  if (events.length === 0) return null;
  const groups = groupByYear(events);

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.04)", padding: 24 }}>
      <h2 style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.secondary, margin: "0 0 20px" }}>Tidslinje</h2>
      <div style={{ position: "relative", paddingLeft: 24 }}>
        <div aria-hidden style={{ position: "absolute", left: 7, top: 6, bottom: 6, borderLeft: `2px dotted ${COLORS.border}` }} />
        {groups.map((g) => (
          <div key={g.year} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, marginBottom: 12, marginLeft: -4 }}>{g.year}</div>
            {g.items.map((ev) => (
              <div key={ev.id} style={{ position: "relative", padding: "6px 0 14px" }}>
                <span aria-hidden style={{ position: "absolute", left: -22, top: 10, width: 12, height: 12, borderRadius: "50%", background: COLORS.accent, border: `2px solid ${COLORS.card}`, boxShadow: `0 0 0 1px ${COLORS.accent}` }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>{ev.title}</div>
                <div style={{ fontSize: 12, color: COLORS.secondary, marginTop: 2 }}>{formatSwedishLongDate(ev.date)}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
