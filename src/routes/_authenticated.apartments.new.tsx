import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  APARTMENT_STATUSES,
  APARTMENT_STATUS_LABEL,
  DUPLICATE_APARTMENT_MESSAGE,
  isDuplicateApartmentError,
  normalizeApartmentNumber,
  normalizeTrappa,
  TRAPPA_PLACEHOLDER,
} from "@/lib/apartment-tokens";

export const Route = createFileRoute("/_authenticated/apartments/new")({
  head: () => ({ meta: [{ title: "Ny lägenhet — BAYT" }] }),
  component: NewApartmentPage,
});

const C = {
  bg: "#FFFFFF", card: "#ffffff", border: "#E5E7EB",
  primary: "#3D8A30", secondary: "#6B7280", text: "#1a1a1a", error: "#DC2626",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 500, color: C.secondary,
  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: "100%", maxWidth: "100%", minWidth: 0, height: 40, padding: "0 12px",
  border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 14,
  color: C.text, background: C.card, outline: "none", boxSizing: "border-box",
};
const textareaStyle: React.CSSProperties = {
  ...inputStyle, height: "auto", minHeight: 100, padding: 12,
  resize: "vertical", fontFamily: "inherit",
};

function NewApartmentPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user } = useAuth();

  const [propertyId, setPropertyId] = useState("");
  const [apartmentNumber, setApartmentNumber] = useState("");
  const [trappa, setTrappa] = useState("");
  const [floor, setFloor] = useState("");
  const [areaSqm, setAreaSqm] = useState("");
  const [status, setStatus] = useState("ledig");
  const [tenantName, setTenantName] = useState("");
  const [tenantPhone, setTenantPhone] = useState("");
  const [tenantEmail, setTenantEmail] = useState("");
  const [moveInDate, setMoveInDate] = useState("");
  const [moveOutDate, setMoveOutDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: properties = [] } = useQuery({
    queryKey: ["properties-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Trappa is part of the apartment's identity, not a description — an
    // apartment saved without it can never be matched by /felanmalan.
    if (!propertyId || !apartmentNumber.trim() || !trappa.trim() || !user) {
      setError("Fastighet, lägenhetsnummer och trappa krävs");
      return;
    }
    setSaving(true);
    try {
      const { data, error: insErr } = await supabase.from("apartments").insert({
        property_id: propertyId,
        apartment_number: normalizeApartmentNumber(apartmentNumber),
        trappa: normalizeTrappa(trappa),
        floor: floor ? parseInt(floor, 10) : null,
        area_sqm: areaSqm ? parseFloat(areaSqm) : null,
        status,
        tenant_name: tenantName.trim() || null,
        tenant_phone: tenantPhone.trim() || null,
        tenant_email: tenantEmail.trim() || null,
        move_in_date: moveInDate || null,
        move_out_date: moveOutDate || null,
        notes: notes.trim() || null,
        created_by: user.id,
      }).select("id").single();
      if (insErr) throw insErr;
      toast.success("Sparat!", { style: { background: "#3D8A30", color: "#fff" } });
      navigate({ to: "/apartments/$id", params: { id: data!.id } });
    } catch (err) {
      setError(
        isDuplicateApartmentError(err)
          ? DUPLICATE_APARTMENT_MESSAGE
          : err instanceof Error ? err.message : "Kunde inte spara",
      );
      setSaving(false);
    }
  }

  const sectionTitle: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, color: C.text, margin: 0,
    paddingBottom: 8, borderBottom: `1px solid ${C.border}`,
    textTransform: "uppercase", letterSpacing: "0.06em",
  };
  const fieldGrid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
    gap: 16,
    minWidth: 0,
  };

  return (
    <div style={{ padding: isMobile ? 16 : 32, maxWidth: 880, margin: "0 auto" }}>
      {/* Header */}
      <Link to="/apartments" style={{
        display: "inline-flex", alignItems: "center", gap: 6, color: C.secondary,
        textDecoration: "none", fontSize: 13, marginBottom: 12,
      }}>
        <ArrowLeft size={16} /> Tillbaka till lägenheter
      </Link>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>
          Ny lägenhet
        </h1>
        <p style={{ fontSize: 14, color: C.secondary, margin: 0 }}>
          Fyll i uppgifterna nedan. Fält markerade med * är obligatoriska.
        </p>
      </div>

      <form onSubmit={onSubmit} style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        padding: isMobile ? 20 : 28, display: "grid", gap: 28, minWidth: 0, boxSizing: "border-box",
      }}>
        {/* Section: Allmänt */}
        <section style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <h2 style={sectionTitle}>Allmänt</h2>
          <div style={fieldGrid}>
            <div style={{ minWidth: 0 }}>
              <label style={labelStyle}>Fastighet *</label>
              <select style={inputStyle} value={propertyId} onChange={(e) => setPropertyId(e.target.value)} required>
                <option value="">Välj fastighet</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ minWidth: 0 }}>
              <label style={labelStyle}>Lägenhetsnummer *</label>
              <input
                style={inputStyle}
                inputMode="numeric"
                pattern="[0-9]*"
                value={apartmentNumber}
                onChange={(e) => setApartmentNumber(normalizeApartmentNumber(e.target.value))}
                placeholder="1102"
                required
              />
            </div>
            <div style={{ minWidth: 0 }}>
              <label style={labelStyle}>Trappa *</label>
              <input
                style={inputStyle}
                value={trappa}
                onChange={(e) => setTrappa(normalizeTrappa(e.target.value))}
                placeholder={TRAPPA_PLACEHOLDER}
                required
              />
            </div>
          </div>
          <div style={fieldGrid}>
            <div style={{ minWidth: 0 }}>
              <label style={labelStyle}>Våning</label>
              <input type="number" style={inputStyle} value={floor} onChange={(e) => setFloor(e.target.value)} />
            </div>
            <div style={{ minWidth: 0 }}>
              <label style={labelStyle}>Yta (m²)</label>
              <input type="number" step="0.1" style={inputStyle} value={areaSqm} onChange={(e) => setAreaSqm(e.target.value)} />
            </div>
          </div>
          <div style={{ maxWidth: isMobile ? "100%" : "calc(50% - 8px)", minWidth: 0 }}>
            <label style={labelStyle}>Status</label>
            <select style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
              {APARTMENT_STATUSES.map((s) => (
                <option key={s} value={s}>{APARTMENT_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
        </section>

        {/* Section: Hyresgäst */}
        <section style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <h2 style={sectionTitle}>Hyresgäst</h2>
          <div style={{ minWidth: 0 }}>
            <label style={labelStyle}>Namn</label>
            <input style={inputStyle} value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
          </div>
          <div style={fieldGrid}>
            <div style={{ minWidth: 0 }}>
              <label style={labelStyle}>Telefon</label>
              <input style={inputStyle} value={tenantPhone} onChange={(e) => setTenantPhone(e.target.value)} />
            </div>
            <div style={{ minWidth: 0 }}>
              <label style={labelStyle}>E-post</label>
              <input type="email" style={inputStyle} value={tenantEmail} onChange={(e) => setTenantEmail(e.target.value)} />
            </div>
          </div>
          <div style={fieldGrid}>
            <div style={{ minWidth: 0 }}>
              <label style={labelStyle}>Inflytt</label>
              <input type="date" style={inputStyle} value={moveInDate} onChange={(e) => setMoveInDate(e.target.value)} />
            </div>
            <div style={{ minWidth: 0 }}>
              <label style={labelStyle}>Utflytt</label>
              <input type="date" style={inputStyle} value={moveOutDate} onChange={(e) => setMoveOutDate(e.target.value)} />
            </div>
          </div>
        </section>

        {/* Section: Anteckningar */}
        <section style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <h2 style={sectionTitle}>Anteckningar</h2>
          <div style={{ minWidth: 0 }}>
            <label style={labelStyle}>Övrig information</label>
            <textarea style={textareaStyle} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </section>

        {error && (
          <div style={{
            color: C.error, fontSize: 13, padding: "10px 12px",
            background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6,
          }}>{error}</div>
        )}

        {/* Footer actions */}
        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 12,
          paddingTop: 16, borderTop: `1px solid ${C.border}`,
          flexDirection: isMobile ? "column-reverse" : "row",
        }}>
          <Link to="/apartments" style={{
            height: 42, padding: "0 20px", display: "inline-flex", alignItems: "center",
            justifyContent: "center", borderRadius: 6, border: `1px solid ${C.border}`,
            background: "#fff", color: C.text, fontSize: 14, fontWeight: 500,
            textDecoration: "none",
          }}>
            Avbryt
          </Link>
          <button type="submit" disabled={saving} style={{
            height: 42, background: C.primary, color: "#ffffff", border: "none",
            borderRadius: 6, padding: "0 22px", fontSize: 14, fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1,
          }}>
            {saving ? "Sparar…" : "Spara lägenhet"}
          </button>
        </div>
      </form>
    </div>
  );
}
