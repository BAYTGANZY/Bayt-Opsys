import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { COLORS } from "@/components/property-tabs";
import { EkonomiAvgift } from "@/components/EkonomiAvgift";

export const Route = createFileRoute("/_authenticated/ekonomi")({
  head: () => ({ meta: [{ title: "Ekonomi & Avgift — BAYT" }] }),
  component: EkonomiPage,
});

const STYLES = `
  .fp-btn { height: 40px; padding: 0 16px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; background: #fff; color: #0D2B1E; border: 1px solid #E3E7E2; }
  .fp-btn:hover { border-color: #3D8A30; }
  .fp-btn.fp-primary { background: #3D8A30; border-color: #3D8A30; color: #fff; }
  .fp-btn.fp-danger { color: #B91C1C; border-color: #F1C0C0; }
  .fp-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .fp-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 22px; align-items: center; }
  .fp-label { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #6B7280; margin-bottom: 6px; display: block; }
  .fp-input, .fp-textarea { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px; font-size: 15px; font-family: inherit; background: #fff; color: #0D2B1E; border: 1px solid #E3E7E2; }
  .fp-input { height: 42px; padding-top: 0; padding-bottom: 0; }
  .fp-textarea { resize: vertical; line-height: 1.5; }
`;

function EkonomiPage() {
  const isMobile = useIsMobile();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [propertyId, setPropertyId] = useState<string>(() => {
    try {
      return window.localStorage.getItem("bayt.presentation.property") ?? "";
    } catch {
      return "";
    }
  });

  const propsQ = useQuery({
    queryKey: ["ekonomi-properties"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
  const properties = propsQ.data ?? [];
  const propertyName = properties.find((p) => p.id === propertyId)?.name ?? "";

  useEffect(() => {
    if (properties.length === 0) return;
    if (!propertyId || !properties.some((p) => p.id === propertyId)) setPropertyId(properties[0].id);
  }, [propertyId, properties]);

  useEffect(() => {
    if (!propertyId) return;
    try {
      window.localStorage.setItem("bayt.presentation.property", propertyId);
    } catch {
      /* ignoreras */
    }
  }, [propertyId]);

  if (profile && !isAdmin) {
    return <div style={{ padding: 32, color: COLORS.secondary }}>Du har inte behörighet till den här sidan.</div>;
  }

  return (
    <div style={{ padding: isMobile ? 16 : 32, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Inter, system-ui, sans-serif" }}>
      <style>{STYLES}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: COLORS.text, margin: 0, fontFamily: "Outfit, Inter, system-ui, sans-serif" }}>
          Ekonomi & Avgift
        </h1>
        <select
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          aria-label="Fastighet"
          style={{ height: 40, padding: "0 12px", borderRadius: 8, border: "1px solid #E3E7E2", fontSize: 14, background: "#fff", maxWidth: 320 }}
        >
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {propertyId && <EkonomiAvgift key={propertyId} propertyId={propertyId} propertyName={propertyName} />}
    </div>
  );
}
