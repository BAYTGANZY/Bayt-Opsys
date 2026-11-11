import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { EkonomiOversiktView } from "@/components/EkonomiOversiktView";
import { EkonomiOversiktImport } from "@/components/EkonomiOversiktImport";
import { EkonomiBudgetView } from "@/components/EkonomiBudgetView";
import { ForvaltningLinks } from "@/components/ForvaltningLinks";

export const Route = createFileRoute("/_authenticated/properties/$id/ekonomi")({
  head: () => ({ meta: [{ title: "Ekonomi — BAYT" }] }),
  component: PropertyEkonomiRoute,
});

const INK = "#0D2B1E";
const MUTED = "#6B7280";
const LINE = "#E3E7E2";
const GREEN = "#3D8A30";

type Tab = "oversikt" | "budget" | "forvaltning";

/** Föreningens ekonomi på fastighetens egen sida: översikten och förvaltningens länkkort.
 *  Bara admin och styrelse — rutten nekas för entreprenör av canAccess, och sidan kollar rollen själv. */
function PropertyEkonomiRoute() {
  const { id } = Route.useParams();
  const { profile } = useAuth();
  const role = profile?.role;
  const isAdmin = role === "admin";
  const allowed = isAdmin || role === "styrelse";
  const [tab, setTab] = useState<Tab>("oversikt");

  const { data: property } = useQuery({
    queryKey: ["property-name", id],
    enabled: allowed,
    queryFn: async () => {
      const { data } = await supabase.from("properties").select("id, name").eq("id", id).maybeSingle();
      return data as { id: string; name: string } | null;
    },
  });

  if (!profile) return null;
  if (!allowed) return <p style={{ padding: 24, color: MUTED }}>Den här sidan är bara för styrelse och administratörer.</p>;

  const tabBtn = (key: Tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      style={{
        height: 40,
        padding: "0 18px",
        borderRadius: 10,
        border: `1px solid ${tab === key ? GREEN : LINE}`,
        background: tab === key ? "#F0F7EE" : "#fff",
        color: INK,
        fontWeight: 600,
        fontSize: 15,
        fontFamily: "inherit",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "8px 16px 64px", fontFamily: "Inter, sans-serif", color: INK }}>
      <div style={{ display: "flex", gap: 10, margin: "12px 0 22px", flexWrap: "wrap" }}>
        {tabBtn("oversikt", "Översikt")}
        {tabBtn("budget", "Budget")}
        {tabBtn("forvaltning", "Förvaltning")}
      </div>

      {tab === "oversikt" ? (
        <>
          <EkonomiOversiktView key={id} propertyId={id} />
          {isAdmin && property && (
            <details style={{ marginTop: 36 }}>
              <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 16, color: MUTED }}>Admin: uppdatera siffrorna</summary>
              <div style={{ marginTop: 12 }}>
                <EkonomiOversiktImport propertyId={property.id} propertyName={property.name} />
              </div>
            </details>
          )}
        </>
      ) : tab === "budget" ? (
        <EkonomiBudgetView key={id} propertyId={id} />
      ) : (
        <ForvaltningLinks key={id} propertyId={id} />
      )}
    </div>
  );
}
