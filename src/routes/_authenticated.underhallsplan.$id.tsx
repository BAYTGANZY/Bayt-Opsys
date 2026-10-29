import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { COLORS } from "@/components/property-tabs";
import { MaintenancePlanView } from "@/components/MaintenancePlan";
import { MaintenanceImport } from "@/components/MaintenanceImport";

export const Route = createFileRoute("/_authenticated/underhallsplan/$id")({
  head: () => ({ meta: [{ title: "Underhållsplan — BAYT" }] }),
  component: UnderhallsplanPage,
});

type Prop = { id: string; name: string; address: string | null };

function UnderhallsplanPage() {
  const { id } = Route.useParams();
  const isMobile = useIsMobile();
  const { profile } = useAuth();
  const isContractor = profile?.role === "entreprenor";
  const isAdmin = profile?.role === "admin";

  const { data: property } = useQuery({
    queryKey: ["mp-property", id, isContractor],
    enabled: !!profile,
    queryFn: async (): Promise<Prop | null> => {
      if (isContractor) {
        // Entreprenören ser inte fastighetsraden själv, planlistan hämtas via en funktion.
        const { data } = await supabase.rpc("my_maintenance_plans");
        const row = ((data ?? []) as Array<{ property_id: string; name: string; address: string | null }>).find((r) => r.property_id === id);
        return row ? { id, name: row.name, address: row.address } : null;
      }
      const { data } = await supabase.from("properties").select("id, name, address").eq("id", id).maybeSingle();
      return (data as Prop | null) ?? null;
    },
  });

  return (
    <div style={{ padding: isMobile ? 16 : 32, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Inter, system-ui, sans-serif" }}>
      <Link
        to={"/underhallsplan" as never}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: COLORS.secondary, textDecoration: "none", width: "fit-content" }}
      >
        <ArrowLeft size={16} /> Tillbaka till underhållsplaner
      </Link>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: COLORS.text, margin: 0, fontFamily: "Outfit, Inter, system-ui, sans-serif" }}>
            Underhållsplan
          </h1>
          <div style={{ fontSize: 13, color: COLORS.secondary, marginTop: 4 }}>
            {property?.name ?? "…"}
            {property?.address ? ` · ${property.address}` : ""}
          </div>
        </div>
        {isAdmin && <MaintenanceImport propertyId={id} />}
      </div>
      <MaintenancePlanView propertyId={id} propertyName={property?.name} />
    </div>
  );
}
