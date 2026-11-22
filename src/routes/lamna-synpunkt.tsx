import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { LOGO_ON_DARK } from "@/lib/logo";
import { normalizeApartmentNumber, normalizeTrappa, TRAPPA_PLACEHOLDER } from "@/lib/apartment-tokens";

/**
 * Publik sida för synpunkter, frågor och klagomål från medlemmar — ingen inloggning.
 * Länkas från föreningens hemsida:
 *   /lamna-synpunkt?forening=<fastighetens id>   (föreningen är då förvald; finns bara en förening väljs den själv)
 * Allt skrivs av edge-funktionen submit-synpunkt (service role); sidan läser bara `public_properties`,
 * precis som /parkering-ko och /tvattstuga-kod. Styrelsen läser i plattformen under /synpunkter.
 */
export const Route = createFileRoute("/lamna-synpunkt")({
  ssr: false,
  head: () => ({ meta: [{ title: "Lämna synpunkter — BAYT" }] }),
  component: LamnaSynpunktPage,
});

// Texterna på sidan. Allmänna: allt boende vill kommentera.
const PAGE_TITLE = "Lämna synpunkter och idéer";
const PAGE_INTRO =
  "Har du en synpunkt, en idé, en fråga eller ett klagomål? Skriv det här, om avgiftshöjningen eller något annat som rör föreningen. Styrelsen läser alla meddelanden. Du får ett bekräftelsemejl när vi har tagit emot ditt meddelande.";
const PAGE_NOTE = "Vi tar emot synpunkter skriftligt här, så att inget går förlorat. Du behöver inte ringa.";

type Category = "synpunkt" | "ide" | "fraga" | "klagomal";
const CATEGORIES: Array<{ key: Category; label: string }> = [
  { key: "synpunkt", label: "Synpunkt" },
  { key: "ide", label: "Idé" },
  { key: "fraga", label: "Fråga" },
  { key: "klagomal", label: "Klagomål" },
];
const MAX_MESSAGE = 5000;

const C = {
  border: "#E5E7EB",
  primary: "#3D8A30",
  secondary: "#6B7280",
  text: "#1a1a1a",
  error: "#DC2626",
  card: "#ffffff",
  accentBg: "#F3F9F1",
  accentBorder: "#CFE7C6",
};

const shellStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "radial-gradient(ellipse at top, #15332c 0%, #0e1f1a 70%)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: 16,
  fontFamily: "Inter, system-ui, sans-serif",
};
const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 500, color: C.secondary, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 };
const inputStyle: React.CSSProperties = { width: "100%", maxWidth: "100%", minWidth: 0, height: 44, padding: "0 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 16, color: C.text, background: C.card, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
const cardStyle: React.CSSProperties = { background: C.card, borderRadius: 12, padding: 24, width: "100%", boxSizing: "border-box", display: "grid", gap: 16, minWidth: 0, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" };
const h2Style: React.CSSProperties = { fontFamily: "Outfit, sans-serif", fontSize: 18, fontWeight: 600, color: C.text, margin: 0 };
const btnStyle = (disabled?: boolean): React.CSSProperties => ({ height: 48, borderRadius: 8, border: "none", background: C.primary, color: "#fff", fontSize: 16, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1, fontFamily: "inherit" });

/** Funktionen svarar med svenska felmeddelanden; invoke() gömmer dem bakom ett generiskt fel. */
async function errorMessage(err: unknown, fallback: string): Promise<string> {
  try {
    const ctx = (err as { context?: Response })?.context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.json();
      if (body?.error) return String(body.error);
    }
  } catch {
    /* faller tillbaka */
  }
  return fallback;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={shellStyle}>
      <div style={{ width: "min(600px, 100%)", display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 0", gap: 20, minWidth: 0 }}>
        <img src={LOGO_ON_DARK} alt="BAYT" style={{ height: "clamp(40px, 10vw, 56px)", width: "auto" }} />
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 12.5, color: C.secondary, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function LamnaSynpunktPage() {
  const presetProperty = useMemo(() => new URLSearchParams(window.location.search).get("forening") ?? "", []);
  const [propertyId, setPropertyId] = useState(presetProperty);
  const [category, setCategory] = useState<Category>("synpunkt");
  const [apartmentNumber, setApartmentNumber] = useState("");
  const [trappa, setTrappa] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ reference: string } | null>(null);

  const { data: properties = [] } = useQuery({
    queryKey: ["public-properties-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("public_properties").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
  const preset = properties.find((p) => p.id === presetProperty);
  useEffect(() => {
    if (presetProperty && properties.length > 0 && !preset) setPropertyId("");
  }, [presetProperty, properties, preset]);
  // Bara en förening finns: välj den åt personen så att adressen fungerar utan ?forening=.
  const only = properties.length === 1 ? properties[0] : null;
  useEffect(() => {
    if (!propertyId && only) setPropertyId(only.id);
  }, [propertyId, only]);
  const fixed = preset ?? only;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!propertyId) return setError("Välj förening.");
    if (!name.trim()) return setError("Ange ditt namn.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError("Ange en giltig e-postadress.");
    if (!apartmentNumber) return setError("Ange ditt lägenhetsnummer (siffror).");
    if (!trappa) return setError("Ange din trappa (siffror).");
    if (message.trim().length < 5) return setError("Skriv ditt meddelande.");
    if (!consent) return setError("Du behöver godkänna att uppgifterna sparas.");
    setSaving(true);
    try {
      const { data, error: err } = await supabase.functions.invoke("submit-synpunkt", {
        body: { property_id: propertyId, category, apartment_number: apartmentNumber, trappa, name, email, message, website },
      });
      if (err) throw err;
      if (!data?.success) throw new Error(data?.error ?? "Något gick fel.");
      setDone({ reference: String(data.reference ?? "") });
    } catch (err) {
      setError(await errorMessage(err, "Något gick fel. Försök igen om en stund."));
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <Shell>
        <div style={{ ...cardStyle, textAlign: "center", padding: "36px 28px" }}>
          <h1 style={{ ...h2Style, fontSize: 22 }}>Tack, vi har tagit emot ditt meddelande</h1>
          <div style={{ background: C.accentBg, border: `1px solid ${C.accentBorder}`, borderRadius: 10, padding: "14px 16px", fontSize: 15, lineHeight: 1.6, color: C.text }}>
            {done.reference && <>Referens <strong>{done.reference}</strong>. </>}
            Styrelsen läser alla meddelanden. Du får ett bekräftelsemejl på e-post, titta även i skräpposten. Du behöver inte göra något mer.
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={submit} style={cardStyle} noValidate>
        <h1 style={{ ...h2Style, fontSize: 22 }}>{PAGE_TITLE}</h1>
        <p style={{ margin: 0, fontSize: 14.5, color: C.secondary, lineHeight: 1.6 }}>{PAGE_INTRO}</p>

        {fixed ? (
          <div style={{ fontSize: 13.5, color: C.secondary }}>Förening: <strong style={{ color: C.text }}>{fixed.name}</strong></div>
        ) : (
          <Field label="Förening">
            <select style={inputStyle} value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              <option value="">Välj förening …</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Gäller">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {CATEGORIES.map((c) => {
              const on = category === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  aria-pressed={on}
                  style={{ height: 40, padding: "0 16px", borderRadius: 999, border: `1px solid ${on ? C.primary : C.border}`, background: on ? C.accentBg : C.card, color: on ? C.primary : C.text, fontWeight: 600, fontSize: 14.5, cursor: "pointer", fontFamily: "inherit" }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Ditt meddelande" hint={`${message.length} av ${MAX_MESSAGE} tecken`}>
          <textarea
            style={{ ...inputStyle, height: "auto", minHeight: 160, padding: 12, resize: "vertical", lineHeight: 1.5 }}
            maxLength={MAX_MESSAGE}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Skriv här. Beskriv gärna vad du undrar över eller är orolig för."
          />
        </Field>

        <Field label="Namn">
          <input style={inputStyle} autoComplete="name" placeholder="För- och efternamn" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="E-post" hint="Bekräftelsen skickas hit, och styrelsen kan svara hit.">
          <input style={inputStyle} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14 }}>
          <Field label="Lägenhetsnummer">
            <input style={inputStyle} inputMode="numeric" placeholder="T.ex. 1001" value={apartmentNumber} onChange={(e) => setApartmentNumber(normalizeApartmentNumber(e.target.value))} />
          </Field>
          <Field label="Trappa">
            <input style={inputStyle} inputMode="numeric" placeholder={TRAPPA_PLACEHOLDER} value={trappa} onChange={(e) => setTrappa(normalizeTrappa(e.target.value))} />
          </Field>
        </div>

        {/* Honeypot: dolt för människor, botar fyller i det. */}
        <div style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }} aria-hidden="true">
          <label>
            Webbplats
            <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </label>
        </div>

        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: C.text, lineHeight: 1.5 }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18 }} />
          <span>Jag godkänner att styrelsen och BAYT sparar mina uppgifter för att hantera mitt meddelande.</span>
        </label>

        {error && <div style={{ color: C.error, fontSize: 14.5, lineHeight: 1.5 }}>{error}</div>}
        <button type="submit" style={btnStyle(saving)} disabled={saving}>
          {saving ? "Skickar …" : "Skicka"}
        </button>
        <div style={{ fontSize: 12.5, color: C.secondary, lineHeight: 1.55 }}>{PAGE_NOTE}</div>
      </form>
    </Shell>
  );
}
