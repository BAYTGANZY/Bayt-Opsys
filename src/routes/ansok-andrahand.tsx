import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { FileDropzone } from "@/components/FileDropzone";
import { LOGO_ON_DARK } from "@/lib/logo";
import { normalizeApartmentNumber, normalizeTrappa, TRAPPA_PLACEHOLDER } from "@/lib/apartment-tokens";

/**
 * Publik ansökan om andrahandsuthyrning — ingen inloggning. Länkas från föreningens hemsida:
 *   /ansok-andrahand?forening=<fastighetens id>   (föreningen är då förvald)
 *   /ansok-andrahand?token=<token>                (komplettering, länken kommer i mejlet)
 * Allt skrivs av edge-funktionen submit-andrahand (service role); sidan läser bara
 * `public_properties`, precis som /felanmalan.
 */
export const Route = createFileRoute("/ansok-andrahand")({
  ssr: false,
  head: () => ({ meta: [{ title: "Ansök om andrahandsuthyrning — BAYT" }] }),
  component: AnsokAndrahandPage,
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

const REASONS = ["Provsamboende", "Arbete eller studier på annan ort", "Sjukdom eller vård", "Tillfälligt boende", "Annat"];
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx";
const MAX_FILES = 8;
const MAX_TOTAL = 20 * 1024 * 1024;

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
const textareaStyle: React.CSSProperties = { ...inputStyle, height: "auto", minHeight: 96, padding: 12, resize: "vertical" };
const cardStyle: React.CSSProperties = { background: C.card, borderRadius: 12, padding: 24, width: "100%", boxSizing: "border-box", display: "grid", gap: 16, minWidth: 0, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" };
const h2Style: React.CSSProperties = { fontFamily: "Outfit, sans-serif", fontSize: 18, fontWeight: 600, color: C.text, margin: 0 };
const btnStyle = (disabled?: boolean): React.CSSProperties => ({ height: 48, borderRadius: 8, border: "none", background: C.primary, color: "#fff", fontSize: 16, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1, fontFamily: "inherit" });

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" }) : "";

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

function Done({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Shell>
      <div style={{ ...cardStyle, textAlign: "center", padding: "36px 28px" }}>
        <h1 style={{ ...h2Style, fontSize: 22 }}>{title}</h1>
        <div style={{ fontSize: 15, color: C.secondary, lineHeight: 1.6 }}>{children}</div>
      </div>
    </Shell>
  );
}

function useFiles() {
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const add = (picked: File[]) => {
    const next = [...files, ...picked];
    if (next.length > MAX_FILES) return setFileError(`Du kan bifoga högst ${MAX_FILES} filer.`);
    if (next.reduce((s, f) => s + f.size, 0) > MAX_TOTAL) return setFileError("Filerna är för stora tillsammans (högst 20 MB).");
    setFileError(null);
    setFiles(next);
  };
  const remove = (i: number) => {
    setFileError(null);
    setFiles(files.filter((_, idx) => idx !== i));
  };
  const payload = () => Promise.all(files.map(async (f) => ({ name: f.name, type: f.type, base64: await fileToBase64(f) })));
  return { files, add, remove, fileError, payload };
}

function AnsokAndrahandPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const token = params.get("token") ?? "";
  return token ? <Komplettera token={token} /> : <NyAnsokan presetProperty={params.get("forening") ?? ""} />;
}

// --------------------------------------------------------------------------- ny ansökan
function NyAnsokan({ presetProperty }: { presetProperty: string }) {
  const [propertyId, setPropertyId] = useState(presetProperty);
  const [apartmentNumber, setApartmentNumber] = useState("");
  const [trappa, setTrappa] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [tenantContact, setTenantContact] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [reasonText, setReasonText] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const f = useFiles();
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!propertyId) return setError("Välj förening.");
    if (!normalizeApartmentNumber(apartmentNumber)) return setError("Ange lägenhetsnummer med siffror.");
    if (!normalizeTrappa(trappa)) return setError("Ange trappa med siffror.");
    if (!name.trim()) return setError("Ange ditt namn.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError("Ange en giltig e-postadress.");
    if (!tenantName.trim()) return setError("Ange vem som ska hyra lägenheten.");
    if (!start || !end) return setError("Ange start- och slutdatum.");
    if (end < start) return setError("Slutdatum kan inte ligga före startdatum.");
    if (!consent) return setError("Du behöver godkänna hanteringen av uppgifterna.");
    setSaving(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("submit-andrahand", {
        body: {
          action: "submit", website, property_id: propertyId,
          apartment_number: normalizeApartmentNumber(apartmentNumber), trappa: normalizeTrappa(trappa),
          applicant_name: name.trim(), applicant_email: email.trim(), applicant_phone: phone.trim(),
          tenant_name: tenantName.trim(), tenant_contact: tenantContact.trim(),
          start_date: start, end_date: end, reason, reason_text: reasonText.trim(), files: await f.payload(),
        },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setDone({ reference: String(data?.reference ?? "") });
    } catch (err) {
      setError(await errorMessage(err, "Något gick fel. Försök igen eller kontakta styrelsen."));
      setSaving(false);
    }
  }

  if (done) {
    return (
      <Done title="Tack, din ansökan är skickad">
        <p style={{ margin: "0 0 10px" }}>Vi har skickat den till styrelsen och ett bekräftelsemejl till {email.trim()}. Du får svar via e-post när styrelsen har beslutat.</p>
        {done.reference && (
          <p style={{ margin: 0 }}>
            Ärendenummer: <strong style={{ color: C.text }}>{done.reference}</strong>
          </p>
        )}
      </Done>
    );
  }

  return (
    <Shell>
      <div style={{ textAlign: "center", color: "#fff" }}>
        <h1 style={{ fontFamily: "Outfit, sans-serif", fontSize: "clamp(24px, 6vw, 30px)", fontWeight: 700, margin: 0 }}>Ansök om andrahandsuthyrning</h1>
        <p style={{ margin: "8px auto 0", maxWidth: 480, fontSize: 15, lineHeight: 1.55, color: "#c9d8c3" }}>
          {preset ? preset.name + ". " : ""}Styrelsen behöver ge sitt samtycke innan du hyr ut din bostadsrätt i andra hand. Fyll i uppgifterna så får du svar via e-post.
        </p>
      </div>
      <form onSubmit={submit} style={{ ...cardStyle, gap: 18 }} noValidate>
        <h2 style={h2Style}>Lägenheten</h2>
        {!preset && (
          <Field label="Förening">
            <select style={inputStyle} value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              <option value="">Välj förening</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
          <Field label="Lägenhetsnummer" hint="Siffror, till exempel 1203">
            <input style={inputStyle} inputMode="numeric" value={apartmentNumber} onChange={(e) => setApartmentNumber(normalizeApartmentNumber(e.target.value))} />
          </Field>
          <Field label="Trappa" hint="Siffror">
            <input style={inputStyle} inputMode="numeric" placeholder={TRAPPA_PLACEHOLDER} value={trappa} onChange={(e) => setTrappa(normalizeTrappa(e.target.value))} />
          </Field>
        </div>

        <h2 style={{ ...h2Style, marginTop: 6 }}>Du som äger lägenheten</h2>
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

        <h2 style={{ ...h2Style, marginTop: 6 }}>Uthyrningen</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
          <Field label="Hyresgäst (namn)">
            <input style={inputStyle} value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
          </Field>
          <Field label="Hyresgästens kontakt (valfritt)">
            <input style={inputStyle} placeholder="Telefon eller e-post" value={tenantContact} onChange={(e) => setTenantContact(e.target.value)} />
          </Field>
          <Field label="Från och med">
            <input style={inputStyle} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Till och med">
            <input style={inputStyle} type="date" min={start || undefined} value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <Field label="Skäl till uthyrningen">
          <select style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Förklara gärna närmare (valfritt)">
          <textarea style={textareaStyle} value={reasonText} onChange={(e) => setReasonText(e.target.value)} />
        </Field>

        <h2 style={{ ...h2Style, marginTop: 6 }}>Underlag</h2>
        <p style={{ margin: 0, fontSize: 14, color: C.secondary, lineHeight: 1.55 }}>
          Bifoga det som styrker skälet, till exempel intyg från arbetsgivare eller skola, eller ett utkast till hyresavtal. PDF, bild eller Word, högst {MAX_FILES} filer och 20 MB.
        </p>
        <FileDropzone files={f.files} onAdd={f.add} onRemove={f.remove} accept={ACCEPT} label="Lägg till filer" />
        {f.fileError && <div style={{ color: C.error, fontSize: 14 }}>{f.fileError}</div>}

        {/* Honeypot: dolt för människor, botar fyller i det. */}
        <div style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }} aria-hidden="true">
          <label>
            Webbplats
            <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </label>
        </div>

        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: C.text, lineHeight: 1.5 }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18 }} />
          <span>Jag godkänner att uppgifterna hanteras av styrelsen och BAYT för att handlägga ansökan, och att jag får svar via e-post.</span>
        </label>

        {error && <div style={{ color: C.error, fontSize: 14.5, lineHeight: 1.5 }}>{error}</div>}
        <button type="submit" style={btnStyle(saving)} disabled={saving}>
          {saving ? "Skickar …" : "Skicka ansökan"}
        </button>
      </form>
    </Shell>
  );
}

// --------------------------------------------------------------------------- komplettering
type Lookup = { reference: string; status: string; note: string | null; property_name: string; apartment_number: string; trappa: string | null; applicant_name: string; start_date: string; end_date: string };

function Komplettera({ token }: { token: string }) {
  const [info, setInfo] = useState<Lookup | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const f = useFiles();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data, error: fnError } = await supabase.functions.invoke("submit-andrahand", { body: { action: "lookup", token } });
      if (!alive) return;
      if (fnError) return setLoadError(await errorMessage(fnError, "Länken är ogiltig eller har gått ut."));
      if (data?.error) return setLoadError(String(data.error));
      setInfo(data as Lookup);
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!message.trim() && f.files.length === 0) return setError("Skriv en kommentar eller bifoga minst en fil.");
    setSaving(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("submit-andrahand", {
        body: { action: "supplement", token, message: message.trim(), files: await f.payload() },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setDone(true);
    } catch (err) {
      setError(await errorMessage(err, "Något gick fel. Försök igen eller kontakta styrelsen."));
      setSaving(false);
    }
  }

  if (done) return <Done title="Tack, kompletteringen är skickad">Styrelsen har fått den och återkommer med beslut via e-post.</Done>;
  if (loadError) return <Done title="Det gick inte att öppna länken">{loadError}</Done>;
  if (!info) return <Done title="Hämtar ansökan …">Ett ögonblick.</Done>;
  if (info.status !== "komplettering") {
    return (
      <Done title="Ingen komplettering behövs just nu">
        Ansökan {info.reference} {info.status === "godkand" ? "är godkänd" : info.status === "nekad" ? "har besvarats" : "väntar på styrelsens beslut"}.
      </Done>
    );
  }

  return (
    <Shell>
      <div style={{ textAlign: "center", color: "#fff" }}>
        <h1 style={{ fontFamily: "Outfit, sans-serif", fontSize: "clamp(24px, 6vw, 30px)", fontWeight: 700, margin: 0 }}>Komplettera din ansökan</h1>
        <p style={{ margin: "8px auto 0", maxWidth: 480, fontSize: 15, lineHeight: 1.55, color: "#c9d8c3" }}>
          {info.property_name}, lägenhet {info.apartment_number}
          {info.trappa ? `, trappa ${info.trappa}` : ""} · {info.reference}
        </p>
      </div>
      <form onSubmit={submit} style={{ ...cardStyle, gap: 18 }} noValidate>
        <div style={{ background: C.accentBg, border: `1px solid ${C.accentBorder}`, borderRadius: 8, padding: "12px 14px" }}>
          <div style={{ ...labelStyle, marginBottom: 4 }}>Det här behöver kompletteras</div>
          <div style={{ fontSize: 15, color: C.text, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{info.note}</div>
        </div>
        <div style={{ fontSize: 13.5, color: C.secondary }}>
          Period: {fmt(info.start_date)} – {fmt(info.end_date)}
        </div>
        <Field label="Din kommentar">
          <textarea style={textareaStyle} value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
        <FileDropzone files={f.files} onAdd={f.add} onRemove={f.remove} accept={ACCEPT} label="Lägg till filer" />
        {f.fileError && <div style={{ color: C.error, fontSize: 14 }}>{f.fileError}</div>}
        {error && <div style={{ color: C.error, fontSize: 14.5, lineHeight: 1.5 }}>{error}</div>}
        <button type="submit" style={btnStyle(saving)} disabled={saving}>
          {saving ? "Skickar …" : "Skicka komplettering"}
        </button>
      </form>
    </Shell>
  );
}
