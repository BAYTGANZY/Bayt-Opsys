import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { CONTACT_TYPES, CONTACT_TYPE_LABEL } from "@/lib/contact-tokens";

export const Route = createFileRoute("/_authenticated/contacts/new")({
  head: () => ({ meta: [{ title: "Ny kontakt — BAYT" }] }),
  component: NewContactPage,
});

const C = {
  bg: "#FFFFFF",
  card: "#ffffff",
  border: "#E5E7EB",
  primary: "#3D8A30",
  secondary: "#6B7280",
  text: "#1a1a1a",
  error: "#DC2626",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 500,
  color: C.secondary,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 12px",
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  fontSize: 14,
  color: C.text,
  background: C.card,
  outline: "none",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  height: "auto",
  minHeight: 100,
  padding: 12,
  resize: "vertical",
  fontFamily: "inherit",
};

function NewContactPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user } = useAuth();

  const [propertyId, setPropertyId] = useState("");
  const [fullName, setFullName] = useState("");
  const [contactType, setContactType] = useState("");
  const [subType, setSubType] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
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
    if (!fullName.trim() || !contactType || !user) {
      setError("Namn och typ krävs");
      return;
    }
    setSaving(true);
    try {
      const { error: insertErr } = await supabase.from("contacts").insert({
        property_id: propertyId || null,
        full_name: fullName.trim(),
        contact_type: contactType,
        sub_type: subType.trim() || null,
        company: company.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        notes: notes.trim() || null,
        created_by: user.id,
      });
      if (insertErr) throw insertErr;
      toast.success("Sparat!", { style: { background: "#3D8A30", color: "#fff" } });
      navigate({ to: "/contacts" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara");
      setSaving(false);
    }
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: isMobile ? 16 : 32 }}>
      <Link
        to="/contacts"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.secondary, textDecoration: "none", fontSize: 14, marginBottom: 16 }}
      >
        <ArrowLeft size={18} /> Tillbaka
      </Link>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: "0 0 24px" }}>Ny kontakt</h1>

      <form
        onSubmit={onSubmit}
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: 24,
          maxWidth: 720,
          display: "grid",
          gap: 16,
        }}
      >
        <div>
          <label style={labelStyle}>Fastighet</label>
          <select style={inputStyle} value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
            <option value="">Ingen (global kontakt)</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Namn *</label>
          <input style={inputStyle} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        <div>
          <label style={labelStyle}>Typ *</label>
          <select style={inputStyle} value={contactType} onChange={(e) => setContactType(e.target.value)} required>
            <option value="">Välj typ</option>
            {CONTACT_TYPES.map((t) => (
              <option key={t} value={t}>{CONTACT_TYPE_LABEL[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Undertyp</label>
          <input style={inputStyle} value={subType} onChange={(e) => setSubType(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Företag</label>
          <input style={inputStyle} value={company} onChange={(e) => setCompany(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Telefon</label>
          <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>E-post</label>
          <input type="email" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Anteckningar</label>
          <textarea style={textareaStyle} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {error && <div style={{ color: C.error, fontSize: 14 }}>{error}</div>}

        <button
          type="submit"
          disabled={saving}
          style={{
            height: 44,
            background: C.primary,
            color: "#ffffff",
            border: "none",
            borderRadius: 6,
            padding: "0 20px",
            fontSize: 15,
            fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "Sparar…" : "Spara kontakt"}
        </button>
      </form>
    </div>
  );
}
