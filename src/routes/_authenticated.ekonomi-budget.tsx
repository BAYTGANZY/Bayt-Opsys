import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useScopedProperties } from "@/hooks/useVisibleProperties";
import { EkonomiBudgetView } from "@/components/EkonomiBudgetView";
import { EkonomiOversiktImport } from "@/components/EkonomiOversiktImport";

export const Route = createFileRoute("/_authenticated/ekonomi-budget")({
  head: () => ({ meta: [{ title: "Budgetuppföljning — BAYT" }] }),
  component: EkonomiBudgetPage,
});

const INK = "#0D2B1E";
const MUTED = "#6B7280";
const LINE = "#E3E7E2";

function EkonomiBudgetPage() {
  const { profile } = useAuth();
  const role = profile?.role;
  const isAdmin = role === "admin";
  // Admin och styrelse. Ingen annan roll får se föreningens ekonomi.
  const allowed = isAdmin || role === "styrelse";

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
      <h1 style={{ fontFamily: "Outfit, Inter, sans-serif", fontSize: 34, fontWeight: 600, margin: 0 }}>Budgetuppföljning</h1>
      <p style={{ color: MUTED, fontSize: 17, lineHeight: 1.55, margin: "6px 0 18px" }}>
        Så ligger föreningens kostnader och intäkter till hittills i år, jämfört med budgeten.
      </p>

      {properties.length > 1 && (
        <select
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          style={{ height: 44, borderRadius: 10, border: `1px solid ${LINE}`, padding: "0 12px", fontSize: 16, fontFamily: "inherit", marginBottom: 20, maxWidth: "100%" }}
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
        // key: ny förening → nollställ vilken post som är öppen.
        <EkonomiBudgetView key={property.id} propertyId={property.id} />
      )}

      {isAdmin && property && (
        <details style={{ marginTop: 36 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 16, color: MUTED }}>Admin: läs in rapport och budget</summary>
          <div style={{ marginTop: 12 }}>
            <EkonomiOversiktImport propertyId={property.id} propertyName={property.name} />
          </div>
        </details>
      )}
    </div>
  );
}
