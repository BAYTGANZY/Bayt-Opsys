import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/_authenticated/properties/new")({
  head: () => ({ meta: [{ title: "Lägg till fastighet — BAYT" }] }),
  component: NewPropertyPage,
});

// BAYT hanterar för närvarande max den här mängden fastigheter. Kontrolleras
// både vid sidladdning (visar spärren istället för formuläret) och direkt
// innan insert (skyddar mot att två flikar skapar #10 och #11 samtidigt).
const MAX_PROPERTIES = 10;

async function countProperties(): Promise<number> {
  const { count, error } = await supabase
    .from("properties")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 500,
  color: "#6B7280",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 12px",
  border: "1px solid #E5E7EB",
  borderRadius: 6,
  fontSize: 14,
  color: "#1a1a1a",
  outline: "none",
  background: "#ffffff",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 80,
  padding: 12,
  border: "1px solid #E5E7EB",
  borderRadius: 6,
  fontSize: 14,
  color: "#1a1a1a",
  outline: "none",
  background: "#ffffff",
  resize: "vertical",
  boxSizing: "border-box",
  fontFamily: "Inter, system-ui, sans-serif",
};

function NewPropertyPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [designation, setDesignation] = useState("");
  const [unitCount, setUnitCount] = useState("");
  const [description, setDescription] = useState("");

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [checkingLimit, setCheckingLimit] = useState(true);

  useEffect(() => {
    let cancelled = false;
    countProperties()
      .then((count) => {
        if (!cancelled) setLimitReached(count >= MAX_PROPERTIES);
      })
      .finally(() => {
        if (!cancelled) setCheckingLimit(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Namn är obligatoriskt");
      return;
    }
    if (!user) {
      setError("Du måste vara inloggad");
      return;
    }

    setSaving(true);
    const currentCount = await countProperties().catch(() => null);
    if (currentCount !== null && currentCount >= MAX_PROPERTIES) {
      setSaving(false);
      setLimitReached(true);
      return;
    }
    const { data: inserted, error: insertError } = await supabase.from("properties").insert({
      name: name.trim(),
      address: address.trim() || null,
      designation: designation.trim() || null,
      unit_count: unitCount ? parseInt(unitCount, 10) : null,
      description: description.trim() || null,
      notes: null,
      created_by: user.id,
    }).select("id").single();
    setSaving(false);

    if (insertError || !inserted) {
      setError(insertError?.message ?? "Kunde inte spara");
      return;
    }

    toast.success("Sparat!", { style: { background: "#3D8A30", color: "#fff" } });
    navigate({ to: "/properties/$id", params: { id: inserted.id as string } });
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        fontFamily: "Inter, system-ui, sans-serif",
        maxWidth: 640,
        padding: isMobile ? 16 : 32,
      }}
    >
      <div>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "#1a1a1a",
            margin: "0 0 4px",
          }}
        >
          Lägg till fastighet
        </h1>
        <Link
          to="/fastigheter"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "#6B7280",
            textDecoration: "none",
            width: "fit-content",
          }}
        >
          <ArrowLeft size={16} />
          Tillbaka till fastigheter
        </Link>
      </div>

      {limitReached && (
        <div
          style={{
            background: "#FEF2F2",
            border: "1px solid #FCA5A5",
            borderRadius: 8,
            padding: 16,
            color: "#991B1B",
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Fastighetsgränsen är nådd</div>
          BAYT hanterar för närvarande max {MAX_PROPERTIES} fastigheter, och den gränsen är
          redan nådd. Kontakta oss om ni behöver lägga till fler.
        </div>
      )}

      {!limitReached && !checkingLimit && (
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div>
          <label style={labelStyle}>Namn *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="T.ex. Brf Solglimten"
            style={inputStyle}
            required
          />
        </div>

        <div>
          <label style={labelStyle}>Adress</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="T.ex. Storgatan 1, 123 45 Stockholm"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Beteckning</label>
          <input
            type="text"
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            placeholder="T.ex. BRF Solglimten 1"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Antal lägenheter</label>
          <input
            type="number"
            min={0}
            value={unitCount}
            onChange={(e) => setUnitCount(e.target.value)}
            placeholder="0"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Beskrivning</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Beskriv fastigheten…"
            style={textareaStyle}
            rows={3}
          />
        </div>




        {error && (
          <div style={{ color: "#DC2626", fontSize: 13 }}>{error}</div>
        )}

        <button
          type="submit"
          disabled={saving}
          style={{
            width: "100%",
            height: 44,
            background: "#3D8A30",
            color: "#ffffff",
            borderRadius: 6,
            border: "none",
            fontSize: 15,
            fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "Sparar…" : "Spara fastighet"}
        </button>
      </form>
      )}
    </div>
  );
}
