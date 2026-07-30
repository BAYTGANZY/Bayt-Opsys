import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Building02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { PropertySectionButtons } from "@/components/PropertySectionButtons";
import { SortFilterControls, NEXT_SORT_MODE, type SortMode } from "@/components/SortFilterControls";
import { PropertyCard } from "@/components/PropertyCard";
import { useScopedProperties } from "@/hooks/useVisibleProperties";


type Property = {
  id: string;
  name: string;
  address: string | null;
  designation: string | null;
  unit_count: number | null;
  image_url: string | null;
  created_at: string | null;
  created_by: string | null;
};

const PROPERTY_COLUMNS =
  "id, name, address, designation, unit_count, image_url, created_at, created_by";


export const Route = createFileRoute("/_authenticated/fastigheter/")({
  head: () => ({ meta: [{ title: "Fastigheter — BAYT" }] }),
  component: PropertiesPage,
});

const C = { border: "#E5E7EB", secondary: "#6B7280", text: "#1a1a1a", dark: "#0D2B1E", green: "#5CB84A" };

function PropertiesPage() {
  const isMobile = useIsMobile();
  const { user, profile } = useAuth();
  const isStyrelse = profile?.role === "styrelse";
  const canCreate = profile?.role === "admin";
  const { properties, allowedIds, isLoading } = useScopedProperties<Property>(PROPERTY_COLUMNS);
  const [mode, setMode] = useState<SortMode>("newest");

  const visibleProperties = useMemo(
    () => (allowedIds === null ? properties : properties.filter((p) => allowedIds.has(p.id))),
    [properties, allowedIds],
  );

  const sorted = useMemo(() => {
    const list = [...visibleProperties];
    if (mode === "mine") {
      const mine = list.filter((p) => p.created_by && user?.id && p.created_by === user.id);
      mine.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
      return mine;
    }
    list.sort((a, b) => {
      const av = a.created_at ?? "";
      const bv = b.created_at ?? "";
      return mode === "newest" ? bv.localeCompare(av) : av.localeCompare(bv);
    });
    return list;
  }, [visibleProperties, mode, user?.id]);

  const cycle = () => setMode((m) => NEXT_SORT_MODE[m]);

  const grid = (
    isLoading ? (
      <div style={{ padding: 24, color: C.secondary }}>Laddar…</div>
    ) : sorted.length === 0 ? (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "40px 0", color: C.secondary, fontSize: 14 }}>
        <HugeiconsIcon icon={Building02Icon} size={28} />
        <span>{mode === "mine" ? "Du har inte lagt till några fastigheter än" : "Inga fastigheter hittades"}</span>
      </div>
    ) : (
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(420px, 1fr))" }}>
        {sorted.map((p) => (
          <PropertyCard
            key={p.id}
            property={p}
            linkTo="/fastigheter/$id/installningar"
            rightSlot={<PropertySectionButtons propertyId={p.id} />}
          />
        ))}
      </div>
    )
  );

  if (isMobile) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 10, flexWrap: "nowrap", overflowX: "auto" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, fontFamily: "Outfit, Inter, system-ui, sans-serif", whiteSpace: "nowrap", flexShrink: 0 }}>Fastigheter</h1>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <SortFilterControls mode={mode} onCycle={cycle} compact />
            {canCreate && (
              <Link to="/properties/new" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: C.green, color: "#fff", borderRadius: 999, textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
                + Ny
              </Link>
            )}
          </div>
        </div>
        {grid}
      </div>
    );
  }

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: C.text, margin: 0, fontFamily: "Outfit, Inter, system-ui, sans-serif" }}>
          Fastigheter
        </h1>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
          <SortFilterControls mode={mode} onCycle={cycle} />
          {canCreate && (
            <Link
              to="/properties/new"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 20px",
                background: C.green,
                color: "#fff",
                borderRadius: 999,
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "Outfit, Inter, system-ui, sans-serif",
              }}
            >
              + Ny fastighet
            </Link>
          )}
        </div>
      </div>
      {grid}
    </div>
  );
}
