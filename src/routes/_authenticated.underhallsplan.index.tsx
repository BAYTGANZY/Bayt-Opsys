import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useIsMobile } from "@/hooks/use-mobile";
import { useScopedProperties } from "@/hooks/useVisibleProperties";
import { COLORS } from "@/components/property-tabs";

export const Route = createFileRoute("/_authenticated/underhallsplan/")({
  head: () => ({ meta: [{ title: "Underhållsplan — BAYT" }] }),
  component: UnderhallsplanOversikt,
});

type PropertyRow = { id: string; name: string; address: string | null; image_url: string | null };

function UnderhallsplanOversikt() {
  const isMobile = useIsMobile();
  const { properties, allowedIds, isLoading } = useScopedProperties<PropertyRow>("id, name, address, image_url");
  const plansQ = useQuery({
    queryKey: ["mplans-all"],
    queryFn: async () => {
      const { data } = await supabase.from("maintenance_plans").select("property_id");
      return new Set(((data ?? []) as Array<{ property_id: string }>).map((r) => r.property_id));
    },
  });
  const visible = allowedIds === null ? properties : properties.filter((p) => allowedIds.has(p.id));

  return (
    <div style={{ padding: isMobile ? 16 : 32, display: "flex", flexDirection: "column", gap: 20 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: COLORS.text, margin: 0, fontFamily: "Outfit, Inter, system-ui, sans-serif" }}>
        Underhållsplan
      </h1>
      {isLoading ? (
        <div style={{ color: COLORS.secondary }}>Laddar…</div>
      ) : visible.length === 0 ? (
        <div style={{ padding: 48, textAlign: "center", color: COLORS.secondary }}>Inga fastigheter</div>
      ) : (
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {visible.map((p) => {
            const has = plansQ.data?.has(p.id);
            return (
              <Link
                key={p.id}
                to={`/underhallsplan/${p.id}` as never}
                style={{
                  display: "block", textDecoration: "none", color: COLORS.text, background: "#fff",
                  border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 18,
                }}
              >
                <div style={{ fontFamily: "Outfit, Inter, system-ui, sans-serif", fontSize: 18, fontWeight: 600 }}>{p.name}</div>
                {p.address && <div style={{ fontSize: 13, color: COLORS.secondary, marginTop: 2 }}>{p.address}</div>}
                <div style={{ marginTop: 12, fontSize: 12, fontWeight: 600, color: has ? "#2E6B24" : COLORS.secondary }}>
                  {has ? "Underhållsplan finns" : "Ingen plan ännu"}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
