import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
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
  const { profile } = useAuth();
  const isContractor = profile?.role === "entreprenor";
  const { properties, allowedIds, isLoading } = useScopedProperties<PropertyRow>("id, name, address, image_url");

  const plansQ = useQuery({
    queryKey: ["mplans-all", isContractor],
    enabled: !!profile,
    queryFn: async () => {
      const { data } = await supabase.from("maintenance_plans").select("property_id");
      return new Set(((data ?? []) as Array<{ property_id: string }>).map((r) => r.property_id));
    },
  });

  const myQ = useQuery({
    queryKey: ["my-mplans"],
    enabled: isContractor,
    queryFn: async () => {
      const { data } = await supabase.rpc("my_maintenance_plans");
      return ((data ?? []) as Array<{ property_id: string; name: string; address: string | null }>).map(
        (r): PropertyRow => ({ id: r.property_id, name: r.name, address: r.address, image_url: null }),
      );
    },
  });

  const visible: PropertyRow[] = isContractor
    ? myQ.data ?? []
    : allowedIds === null
      ? properties
      : properties.filter((p) => allowedIds.has(p.id));
  const loading = isContractor ? myQ.isLoading : isLoading;

  return (
    <div style={{ padding: isMobile ? 16 : 32, display: "flex", flexDirection: "column", gap: 20 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: COLORS.text, margin: 0, fontFamily: "Outfit, Inter, system-ui, sans-serif" }}>
        Underhållsplan
      </h1>
      {loading ? (
        <div style={{ color: COLORS.secondary }}>Laddar…</div>
      ) : visible.length === 0 ? (
        <div style={{ padding: 48, textAlign: "center", color: COLORS.secondary }}>
          {isContractor ? "Du har inte fått åtkomst till någon underhållsplan." : "Inga fastigheter"}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {visible.map((p) => {
            const has = isContractor || plansQ.data?.has(p.id);
            return (
              <Link
                key={p.id}
                to={`/underhallsplan/${p.id}` as never}
                style={{
                  display: "block", textDecoration: "none", color: "#e6efd8", borderRadius: 16, padding: 20,
                  background: "radial-gradient(ellipse at 20% 0%, #21503f 0%, #0f2a21 60%, #0b1d17 100%)", border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div style={{ fontFamily: "Outfit, Inter, system-ui, sans-serif", fontSize: 20, fontWeight: 700, color: "#fff" }}>{p.name}</div>
                {p.address && <div style={{ fontSize: 13, color: "#9fb79f", marginTop: 2 }}>{p.address}</div>}
                <div style={{ marginTop: 14, fontSize: 12, fontWeight: 700, color: has ? "#8be07a" : "#9fb79f" }}>
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
