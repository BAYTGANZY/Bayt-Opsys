import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useIsMobile } from "@/hooks/use-mobile";
import { OversiktDashboard } from "@/components/OversiktDashboard";

export const Route = createFileRoute("/_authenticated/fastigheter/$id/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — BAYT" }] }),
  component: BuildingDashboardPage,
});

const C = { secondary: "#6B7280", text: "#1a1a1a" };

function BuildingDashboardPage() {
  const { id } = Route.useParams();
  const isMobile = useIsMobile();

  const { data: property } = useQuery({
    queryKey: ["property-settings", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, address")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; name: string; address: string | null } | null;
    },
  });

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div
        style={{
          padding: isMobile ? "16px 16px 0" : "24px 32px 0",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <Link
          to="/fastigheter/$id"
          params={{ id }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: C.secondary,
            textDecoration: "none",
            width: "fit-content",
          }}
        >
          <ArrowLeft size={16} /> Tillbaka
        </Link>
        <div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: C.text,
              fontFamily: "Outfit, Inter, system-ui, sans-serif",
            }}
          >
            {property?.name ?? "…"}
          </div>
          {property?.address && (
            <div style={{ fontSize: 12, color: C.secondary, marginTop: 2 }}>{property.address}</div>
          )}
        </div>
      </div>
      <OversiktDashboard propertyId={id} />
    </div>
  );
}
