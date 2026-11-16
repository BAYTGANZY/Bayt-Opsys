import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { LOGO_ON_DARK } from "@/lib/logo";
import { normalizeApartmentNumber, normalizeTrappa, TRAPPA_PLACEHOLDER } from "@/lib/apartment-tokens";

/**
 * Publik kölista för parkering — ingen inloggning. Länkas från föreningens hemsida:
 *   /parkering-ko?forening=<fastighetens id>   (föreningen är då förvald)
 *   /parkering-ko?token=<token>                (följ eller lämna kön, länken kommer i mejlet)
 * Allt skrivs av edge-funktionen submit-parkering (service role); sidan läser bara
 * `public_properties`, precis som /felanmalan och /ansok-andrahand.
 */
export const Route = createFileRoute("/parkering-ko")({
  ssr: false,
  head: () => ({ meta: [{ title: "Parkeringskö — BAYT" }] }),
  component: ParkeringKoPage,
});

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

const KINDS = [
  { key: "parkering", label: "Parkeringsplats" },
  { key: "garage", label: "Garageplats" },
];

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
const textareaStyle: React.CSSProperties = { ...inputStyle, height: "auto", minHeight: 80, padding: 12, resize: "vertical" };
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

function ParkeringKoPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const token = params.get("token") ?? "";
  return token ? <Status token={token} /> : <NyAnmalan presetProperty={params.get("forening") ?? ""} />;
}

// --------------------------------------------------------------------------- ställ dig i kö
function NyAnmalan({ presetProperty }: { presetProperty: string }) {
  const [propertyId, setPropertyId] = useState(presetProperty);
  const [kind, setKind] = useState("parkering");
  const [apartmentNumber, setApartmentNumber] = useState("");
  const [trappa, setTrappa] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleReg, setVehicleReg] = useState("");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ reference: string; token: string; position: number | null; already: boolean } | null>(null);

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!propertyId) return setError("Välj förening.");
    if (!apartmentNumber) return setError("Ange ditt lägenhetsnummer (siffror).");
    if (!trappa) return setError("Ange din trappa (siffror).");
    if (!name.trim()) return setError("Ange ditt namn.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError("Ange en giltig e-postadress.");
    if (!consent) return setError("Du behöver godkänna hanteringen av uppgifterna.");
    setSaving(true);
    try {
      const { data, error: err } = await supabase.functions.invoke("submit-parkering", {
        body: { action: "submit", property_id: propertyId, kind, apartment_number: apartmentNumber, trappa, name, email, phone, vehicle_reg: vehicleReg, note, website },
      });
      if (err) throw err;
      if (!data?.success) throw new Error(data?.error ?? "Något gick fel.");
      setDone({ reference: String(data.reference ?? ""), token: String(data.token ?? ""), position: data.position ?? null, already: data.already === true });
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
          <h1 style={{ ...h2Style, fontSize: 22 }}>{done.already ? "Du står redan i kön" : "Du står nu i kön"}</h1>
          {done.position != null && (
            <div style={{ background: C.accentBg, border: `1px solid ${C.accentBorder}`, borderRadius: 10, padding: "14px 10px" }}>
              <div style={{ fontSize: 13, color: C.secondary, textTransform: "uppercase", letterSpacing: "0.08em" }}>Din plats i kön</div>
              <div style={{ fontFamily: "Outfit, sans-serif", fontSize: 44, fontWeight: 700, color: "#0D2B1E" }}>{done.position}</div>
            </div>
          )}
          <div style={{ fontSize: 15, color: C.secondary, lineHeight: 1.6 }}>
            Referens <strong>{done.reference}</strong>. Vi har mejlat en bekräftelse till dig. Styrelsen hör av sig när en plats blir ledig.
          </div>
          {done.token && (
            <a href={`/parkering-ko?token=${done.token}`} style={{ ...btnStyle(), display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", padding: "0 22px" }}>
              Följ min plats
            </a>
          )}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={submit} style={cardStyle} noValidate>
        <h1 style={{ ...h2Style, fontSize: 22 }}>Ställ dig i kö för parkering</h1>
        <p style={{ margin: 0, fontSize: 14.5, color: C.secondary, lineHeight: 1.55 }}>
          Fyll i dina uppgifter så hamnar du i kön. Den som ställer sig först står först. Du får en bekräftelse på e-post och kan själv följa din plats eller lämna kön.
        </p>

        <Field label="Förening">
          {preset ? (
            <div style={{ ...inputStyle, display: "flex", alignItems: "center", background: "#F9FAFB" }}>{preset.name}</div>
          ) : (
            <select style={inputStyle} value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              <option value="">Välj förening …</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Jag vill ha">
          <select style={inputStyle} value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => (
              <option key={k.key} value={k.key}>{k.label}</option>
            ))}
          </select>
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14 }}>
          <Field label="Lägenhetsnummer">
            <input style={inputStyle} inputMode="numeric" placeholder="T.ex. 1203" value={apartmentNumber} onChange={(e) => setApartmentNumber(normalizeApartmentNumber(e.target.value))} />
          </Field>
          <Field label="Trappa">
            <input style={inputStyle} inputMode="numeric" placeholder={TRAPPA_PLACEHOLDER} value={trappa} onChange={(e) => setTrappa(normalizeTrappa(e.target.value))} />
          </Field>
        </div>

        <Field label="Namn">
          <input style={inputStyle} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
          <Field label="E-post">
            <input style={inputStyle} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Telefon (valfritt)">
            <input style={inputStyle} type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </div>
        <Field label="Registreringsnummer (valfritt)">
          <input style={inputStyle} placeholder="ABC 123" value={vehicleReg} onChange={(e) => setVehicleReg(e.target.value)} />
        </Field>
        <Field label="Meddelande till styrelsen (valfritt)">
          <textarea style={textareaStyle} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        {/* Honeypot: dolt för människor, botar fyller i det. */}
        <div style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }} aria-hidden="true">
          <label>
            Webbplats
            <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </label>
        </div>

        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: C.text, lineHeight: 1.5 }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18 }} />
          <span>Jag godkänner att uppgifterna hanteras av styrelsen och BAYT för att administrera parkeringskön, och att jag får svar via e-post.</span>
        </label>

        {error && <div style={{ color: C.error, fontSize: 14.5, lineHeight: 1.5 }}>{error}</div>}
        <button type="submit" style={btnStyle(saving)} disabled={saving}>
          {saving ? "Sparar …" : "Ställ mig i kön"}
        </button>
      </form>
    </Shell>
  );
}

// --------------------------------------------------------------------------- följ eller lämna kön
type StatusData = {
  reference: string;
  status: "vantar" | "erbjuden" | "tilldelad" | "struken";
  kind: string;
  position: number | null;
  spot_label: string | null;
  queued_at: string;
  property_name: string;
  apartment_number: string;
  trappa: string | null;
  name: string;
};

const STATUS_TEXT: Record<StatusData["status"], string> = {
  vantar: "Du står i kö",
  erbjuden: "Du har fått ett erbjudande",
  tilldelad: "Du har fått en plats",
  struken: "Du har lämnat kön",
};

function Status({ token }: { token: string }) {
  const [data, setData] = useState<StatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const load = async () => {
    try {
      const { data: d, error: err } = await supabase.functions.invoke("submit-parkering", { body: { action: "lookup", token } });
      if (err) throw err;
      if (!d?.success) throw new Error(d?.error ?? "Länken är ogiltig.");
      setData(d as StatusData);
    } catch (err) {
      setError(await errorMessage(err, "Länken är ogiltig eller har upphört."));
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const respond = async (answer: "accept" | "decline") => {
    setBusy(true);
    setError(null);
    try {
      const { data: d, error: err } = await supabase.functions.invoke("submit-parkering", { body: { action: "respond", token, answer } });
      if (err) throw err;
      if (!d?.success) throw new Error(d?.error ?? "Något gick fel.");
      await load();
    } catch (err) {
      setError(await errorMessage(err, "Något gick fel. Försök igen."));
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data: d, error: err } = await supabase.functions.invoke("submit-parkering", { body: { action: "leave", token } });
      if (err) throw err;
      if (!d?.success) throw new Error(d?.error ?? "Något gick fel.");
      setConfirmLeave(false);
      await load();
    } catch (err) {
      setError(await errorMessage(err, "Något gick fel. Försök igen."));
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <Shell>
        <div style={{ ...cardStyle, textAlign: "center" }}>{error ? <span style={{ color: C.error }}>{error}</span> : "Hämtar …"}</div>
      </Shell>
    );
  }
  const kindLabel = KINDS.find((k) => k.key === data.kind)?.label ?? "Parkering";
  const active = data.status === "vantar" || data.status === "erbjuden";
  return (
    <Shell>
      <div style={cardStyle}>
        <h1 style={{ ...h2Style, fontSize: 22 }}>{STATUS_TEXT[data.status]}</h1>
        {active && data.position != null && (
          <div style={{ background: C.accentBg, border: `1px solid ${C.accentBorder}`, borderRadius: 10, padding: "14px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 13, color: C.secondary, textTransform: "uppercase", letterSpacing: "0.08em" }}>Din plats i kön</div>
            <div style={{ fontFamily: "Outfit, sans-serif", fontSize: 44, fontWeight: 700, color: "#0D2B1E" }}>{data.position}</div>
          </div>
        )}
        {(data.status === "erbjuden" || data.status === "tilldelad") && data.spot_label && (
          <div style={{ fontSize: 15, color: C.text }}>Plats: <strong>{data.spot_label}</strong></div>
        )}
        {data.status === "erbjuden" && (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontSize: 14.5, color: C.secondary, lineHeight: 1.55 }}>Styrelsen har erbjudit dig en plats. Tackar du nej står du kvar i kön på din plats.</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" onClick={() => respond("accept")} disabled={busy} style={{ ...btnStyle(busy), height: 44, flex: "1 1 140px" }}>Tacka ja</button>
              <button type="button" onClick={() => respond("decline")} disabled={busy} style={{ height: 44, flex: "1 1 140px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", color: C.text, fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Tacka nej</button>
            </div>
          </div>
        )}
        <div style={{ display: "grid", gap: 6, fontSize: 14.5, color: C.secondary }}>
          <div>Förening: <strong style={{ color: C.text }}>{data.property_name}</strong></div>
          <div>Typ: <strong style={{ color: C.text }}>{kindLabel}</strong></div>
          <div>Lägenhet: <strong style={{ color: C.text }}>{data.apartment_number}{data.trappa ? `, trappa ${data.trappa}` : ""}</strong></div>
          <div>Referens: <strong style={{ color: C.text }}>{data.reference}</strong></div>
          <div>Anmäld: <strong style={{ color: C.text }}>{new Date(data.queued_at).toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" })}</strong></div>
        </div>
        {error && <div style={{ color: C.error, fontSize: 14.5 }}>{error}</div>}
        {active && !confirmLeave && (
          <button type="button" onClick={() => setConfirmLeave(true)} style={{ height: 44, borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", color: C.text, fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Lämna kön
          </button>
        )}
        {active && confirmLeave && (
          <div style={{ display: "grid", gap: 10, background: "#FFF7E6", border: "1px solid #F1D9A0", borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 14.5, color: "#7A4B00", lineHeight: 1.5 }}>Är du säker? Du förlorar din plats i kön och kan inte få den tillbaka.</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" onClick={leave} disabled={busy} style={{ ...btnStyle(busy), height: 42, background: "#B42318", flex: "1 1 140px" }}>
                {busy ? "Lämnar …" : "Ja, lämna kön"}
              </button>
              <button type="button" onClick={() => setConfirmLeave(false)} disabled={busy} style={{ height: 42, flex: "1 1 140px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 15 }}>
                Tillbaka
              </button>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
