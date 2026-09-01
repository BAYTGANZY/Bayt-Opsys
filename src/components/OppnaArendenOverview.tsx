import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, Building02Icon } from "@hugeicons/core-free-icons";
import { supabase } from "@/lib/supabase";
import { useIsMobile } from "@/hooks/use-mobile";
import { useScopedProperties } from "@/hooks/useVisibleProperties";
import { useMyArendeScope } from "@/hooks/useMyContactId";
import { PropertyCard } from "@/components/PropertyCard";
import { PropertySectionButtons } from "@/components/PropertySectionButtons";
import { StatusDot } from "@/components/StatusDot";

type Property = { id: string; name: string; address: string | null; image_url: string | null };

type CombinedStat = { count: number; unviewedCount: number; earliestDeadline: string | null };

const PROPERTY_COLUMNS = "id, name, address, image_url";

// Combines only genuinely "oppet" errands (issues + inspections + projects) per
// building — vilande (not-yet-opened) and avslutade errands are excluded.
async function loadCombinedOppnaStats(filterContactIds: string[] | null): Promise<Record<string, CombinedStat>> {
  // Same scope rule as everywhere else: an entreprenör counts only their own.
  // Plain <T> on purpose: an F-bounded constraint (T extends { eq(...): T })
  // makes tsc recursively instantiate supabase's builder generics and die with
  // TS2589. The cast is runtime-identical — eq() returns the same builder.
  const scoped = <T,>(builder: T): T =>
    filterContactIds
      ? ((builder as { in(col: string, val: string[]): unknown }).in("assigned_contact_id", filterContactIds) as T)
      : builder;
  const [issues, inspections, projects] = await Promise.all([
    scoped(supabase.from("issues").select("property_id, deadline, viewed_at").in("status", ["pagande", "oppet", "vantar"])),
    scoped(supabase.from("inspections").select("property_id, next_due_date, viewed_at").eq("arende_status", "oppet")),
    scoped(supabase.from("projects").select("property_id, end_date, viewed_at").eq("arende_status", "oppet")),
  ]);

  const stats: Record<string, CombinedStat> = {};
  const bump = (id: string) => (stats[id] ??= { count: 0, unviewedCount: 0, earliestDeadline: null });

  function apply<T extends { property_id: string | null; viewed_at: string | null }>(
    rows: T[] | null,
    pickDeadline: (r: T) => string | null,
  ) {
    for (const r of rows ?? []) {
      if (!r.property_id) continue;
      const s = bump(r.property_id);
      s.count += 1;
      if (!r.viewed_at) {
        s.unviewedCount += 1;
        const d = pickDeadline(r);
        if (d && (!s.earliestDeadline || d < s.earliestDeadline)) s.earliestDeadline = d;
      }
    }
  }

  apply(issues.data as Array<{ property_id: string | null; deadline: string | null; viewed_at: string | null }> | null, (r) => r.deadline);
  apply(inspections.data as Array<{ property_id: string | null; next_due_date: string | null; viewed_at: string | null }> | null, (r) => r.next_due_date);
  apply(projects.data as Array<{ property_id: string | null; end_date: string | null; viewed_at: string | null }> | null, (r) => r.end_date);

  return stats;
}

const C = { text: "#1a1a1a", secondary: "#6B7280" };

export function OppnaArendenOverview() {
  const isMobile = useIsMobile();
  const [q, setQ] = useState("");
  const { properties, allowedIds, isLoading: pLoading } = useScopedProperties<Property>(PROPERTY_COLUMNS);
  const { filterContactIds, ready } = useMyArendeScope();
  const { data: stats = {}, isLoading: sLoading } = useQuery({
    queryKey: ["oppna-arenden-combined-stats", filterContactIds],
    enabled: ready,
    queryFn: () => loadCombinedOppnaStats(filterContactIds),
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const visible = allowedIds === null ? properties : properties.filter((p) => allowedIds.has(p.id));
    if (!s) return visible;
    return visible.filter((p) => p.name.toLowerCase().includes(s) || (p.address ?? "").toLowerCase().includes(s));
  }, [properties, q, allowedIds]);

  const loading = pLoading || sLoading;

  return (
    <div style={{ padding: isMobile ? 16 : 32, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 700, color: C.text, margin: 0, fontFamily: "Outfit, Inter, system-ui, sans-serif" }}>
          Öppna ärenden
        </h1>
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8,
            border: "1px solid #E5E7EB", borderRadius: 999, padding: "0 14px",
            height: 36, background: "#fff", color: "#6B7280", minWidth: isMobile ? "100%" : 240,
          }}
        >
          <HugeiconsIcon icon={Search01Icon} size={14} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Sök fastighet…"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13, minWidth: 0, color: "#1a1a1a" }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ color: C.secondary }}>Laddar…</div>
      ) : filtered.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "40px 0", color: C.secondary, fontSize: 14 }}>
          <HugeiconsIcon icon={Building02Icon} size={28} />
          <span>Inga fastigheter hittades</span>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(420px, 1fr))" }}>
          {filtered.map((p) => {
            const stat = stats[p.id];
            return (
              <PropertyCard
                key={p.id}
                property={p}
                linkTo="/properties/$id/issues"
                linkSearch={{ from: "oppna-arenden" }}
                rightSlot={<PropertySectionButtons propertyId={p.id} sections={["issues", "inspections", "projects"]} onlyOppet />}
                cornerBadge={
                  stat && stat.count > 0 ? (
                    <div
                      style={{
                        position: "absolute", top: 12, right: 12,
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "5px 12px", borderRadius: 999,
                        background: "rgba(13,43,30,0.88)", fontSize: 12, fontWeight: 700, color: "#fff", whiteSpace: "nowrap",
                      }}
                    >
                      <StatusDot deadline={stat.earliestDeadline} unviewedCount={stat.unviewedCount || stat.count} size={8} />
                      {stat.count} öppna
                    </div>
                  ) : null
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
