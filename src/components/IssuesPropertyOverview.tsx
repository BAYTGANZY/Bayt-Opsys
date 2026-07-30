import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, Building02Icon } from "@hugeicons/core-free-icons";
import { supabase } from "@/lib/supabase";
import { useIsMobile } from "@/hooks/use-mobile";
import { useScopedProperties } from "@/hooks/useVisibleProperties";
import { useMyArendeScope } from "@/hooks/useMyContactId";
import { PropertyCard, type PropertyCardBadge } from "@/components/PropertyCard";
import { PRIORITY_LABEL } from "@/lib/issue-tokens";

type Property = { id: string; name: string; address: string | null; image_url: string | null };

const PROPERTY_COLUMNS = "id, name, address, image_url";

/** `filterContactId` (useMyArendeScope): an entreprenör's badge counts their own
 *  öppna felanmälningar, not the building's. */
async function loadOpenIssueBadges(filterContactId: string | null): Promise<Record<string, PropertyCardBadge>> {
  let q = supabase
    .from("issues")
    .select("property_id, priority")
    .in("status", ["pagande", "oppet", "vantar"]);
  if (filterContactId) q = q.eq("assigned_contact_id", filterContactId);
  const { data, error } = await q;
  if (error) throw error;

  const badges: Record<string, PropertyCardBadge> = {};
  for (const r of (data ?? []) as Array<{ property_id: string | null; priority: string | null }>) {
    if (!r.property_id) continue;
    const b = (badges[r.property_id] ??= { count: 0, priority: null });
    b.count += 1;
    if (r.priority && (!b.priority || PRIORITY_LABEL.indexOf(r.priority as never) > PRIORITY_LABEL.indexOf(b.priority as never))) {
      b.priority = r.priority as PropertyCardBadge["priority"];
    }
  }
  return badges;
}

const C = { text: "#1a1a1a", secondary: "#6B7280" };

export function IssuesPropertyOverview() {
  const isMobile = useIsMobile();
  const [q, setQ] = useState("");
  const { properties, allowedIds, isLoading: pLoading } = useScopedProperties<Property>(PROPERTY_COLUMNS);
  const { filterContactId, ready } = useMyArendeScope();
  const { data: badges = {}, isLoading: bLoading } = useQuery({
    queryKey: ["issues-open-badges", filterContactId],
    enabled: ready,
    queryFn: () => loadOpenIssueBadges(filterContactId),
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const visible = allowedIds === null ? properties : properties.filter((p) => allowedIds.has(p.id));
    if (!s) return visible;
    return visible.filter((p) => p.name.toLowerCase().includes(s) || (p.address ?? "").toLowerCase().includes(s));
  }, [properties, q, allowedIds]);

  const loading = pLoading || bLoading;

  return (
    <div style={{ padding: isMobile ? 16 : 32, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 700, color: C.text, margin: 0, fontFamily: "Outfit, Inter, system-ui, sans-serif" }}>
          Felanmälningar
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
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {filtered.map((p) => (
            <PropertyCard key={p.id} property={p} linkTo="/properties/$id/issues" badge={badges[p.id]} />
          ))}
        </div>
      )}
    </div>
  );
}
