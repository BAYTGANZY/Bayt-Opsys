import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useIsMobile } from "@/hooks/use-mobile";
import { COLORS } from "@/components/property-tabs";
import { MaintenancePlanView } from "@/components/MaintenancePlan";

export const Route = createFileRoute("/_authenticated/underhallsplan/$id")({
  head: () => ({ meta: [{ title: "Underhållsplan — BAYT" }] }),
  component: UnderhallsplanPage,
});

function UnderhallsplanPage() {
  const { id } = Route.useParams();
  const isMobile = useIsMobile();
  const { data: property } = useQuery({
    queryKey: ["mp-property", id],
    queryFn: async () => {
      const { data } = await supabase.from("properties").select("id, name, address").eq("id", id).maybeSingle();
      return data as { id: string; name: string; address: string | null } | null;
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
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: COLORS.text, margin: 0, fontFamily: "Outfit, Inter, system-ui, sans-serif" }}>
          Underhållsplan
        </h1>
        <div style={{ fontSize: 13, color: COLORS.secondary, marginTop: 4 }}>
          {property?.name ?? "…"}
          {property?.address ? ` · ${property.address}` : ""}
        </div>
      </div>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: isMobile ? 16 : 24 }}>
        <MaintenancePlanView propertyId={id} />
      </div>
    </div>
  );
}
