import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useScopedProperties } from "@/hooks/useVisibleProperties";
import { ForvaltningLinks } from "@/components/ForvaltningLinks";

export const Route = createFileRoute("/_authenticated/ekonomisk-forvaltning")({
  head: () => ({ meta: [{ title: "Ekonomisk förvaltning — BAYT" }] }),
  component: EkonomiskForvaltningPage,
});

const INK = "#0D2B1E";
const MUTED = "#6B7280";
const LINE = "#E3E7E2";

/** Föreningsväljare + länkkorten för vald förening. Korten hör till en förening var, så det finns
 *  inga gemensamma kort — samma väljarmönster som /ekonomi-oversikt. */
function EkonomiskForvaltningPage() {
  const { profile } = useAuth();
  const role = profile?.role;
  const allowed = role === "admin" || role === "styrelse";

  const { properties, isLoading } = useScopedProperties<{ id: string; name: string }>("id, name");
  const [propertyId, setPropertyId] = useState("");

  useEffect(() => {
    if (properties.length === 0) return;
    if (!propertyId || !properties.some((p) => p.id === propertyId)) setPropertyId(properties[0].id);
  }, [properties, propertyId]);

  if (!profile) return null;
  if (!allowed) return <p style={{ padding: 24, color: MUTED }}>Den här sidan är bara för styrelse och administratörer.</p>;

  const property = properties.find((p) => p.id === propertyId);

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "24px 16px 64px", fontFamily: "Inter, sans-serif", color: INK }}>
      <h1 style={{ fontFamily: "Outfit, Inter, sans-serif", fontSize: 34, fontWeight: 600, margin: 0 }}>Ekonomisk förvaltning</h1>
      <div style={{ height: 8 }} />

      {properties.length > 1 && (
        <select
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          style={{ height: 44, borderRadius: 10, border: `1px solid ${LINE}`, padding: "0 12px", fontSize: 16, fontFamily: "inherit", margin: "10px 0 20px", maxWidth: "100%" }}
        >
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}

      {isLoading ? (
        <p style={{ color: MUTED }}>Hämtar …</p>
      ) : !property ? (
        <p style={{ color: MUTED }}>Ingen förening är kopplad till ditt konto.</p>
      ) : (
        // key: ny förening → nollställ formulär och redigering.
        <ForvaltningLinks key={property.id} propertyId={property.id} />
      )}
    </div>
  );
}
