import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ISSUE_CATEGORIES } from "@/lib/issue-tokens";
import { FileDropzone } from "@/components/FileDropzone";
import { normalizeApartmentNumber, normalizeTrappa, TRAPPA_PLACEHOLDER } from "@/lib/apartment-tokens";

// Fuzzy address matching: lets the resident type their home address and narrows
// the Fastighet dropdown to the closest-sounding building(s) instead of listing
// every property BAYT manages — showing the full portfolio to an anonymous
// survey filler would leak the company's real estate projects.
function normalizeAddress(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

// Dice coefficient over character bigrams — tolerates typos/partial addresses
// without needing a full fuzzy-search library for a handful of properties.
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const ba = bigrams(a);
  const bb = bigrams(b);
  if (ba.length === 0 || bb.length === 0) return a === b ? 1 : 0;
  const counts = new Map<string, number>();
  for (const bg of ba) counts.set(bg, (counts.get(bg) ?? 0) + 1);
  let hits = 0;
  for (const bg of bb) {
    const c = counts.get(bg) ?? 0;
    if (c > 0) {
      hits++;
      counts.set(bg, c - 1);
    }
  }
  return (2 * hits) / (ba.length + bb.length);
}

const ADDRESS_MATCH_THRESHOLD = 0.3;
const MAX_ADDRESS_MATCHES = 3;

const baytLogo = `${import.meta.env.BASE_URL}assets/bayt-logo.png`;
// Shared with the confirmation screen below — the resident's one way back in
// to check status is this path, keyed on the e-post they just typed above.
const TRACK_PAGE_PATH = "/arendestatus";
const TRACK_PAGE_LABEL = "arendestatus";

export const Route = createFileRoute("/felanmalan")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Felanmälan — BAYT" },
      { name: "description", content: "Gör en felanmälan till din fastighetsförvaltare." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FelanmalanPage,
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
  maxWidth: "100%",
  minWidth: 0,
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

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: "Outfit, sans-serif",
  fontSize: 18,
  fontWeight: 600,
  letterSpacing: "-0.01em",
  color: C.text,
};

const cardStyle: React.CSSProperties = {
  background: C.card,
  borderRadius: 12,
  padding: 24,
  width: "100%",
  boxSizing: "border-box",
  display: "grid",
  gap: 16,
  minWidth: 0,
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
};

// Read-only line on the confirmation step. Long free text (beskrivning, filnamn)
// has to wrap rather than widen the card — same overflow trap as the form grid.
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
      <span style={{ ...labelStyle, marginBottom: 0 }}>{label}</span>
      <span style={{ fontSize: 14, color: C.text, lineHeight: 1.5, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
        {value}
      </span>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function FelanmalanPage() {
  const [reporterEmail, setReporterEmail] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [residentAddress, setResidentAddress] = useState("");
  const [apartmentNumber, setApartmentNumber] = useState("");
  const [trappa, setTrappa] = useState("");
  const [reporterPhone, setReporterPhone] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [category, setCategory] = useState("");
  const [title, setTitle] = useState("");
  const [cause, setCause] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // Two-step flow: the resident fills everything in, then confirms the
  // apartment identity (fastighet + lägenhetsnummer + trappa) on its own screen.
  // Those three are the connect-or-create key in submit-felanmalan — a typo here
  // silently mints a phantom apartment instead of matching the real one.
  const [step, setStep] = useState<"form" | "confirm">("form");

  // Reads the `public_properties` view (id + name + address), not `properties` —
  // RLS correctly hides `properties` from anonymous visitors, which silently
  // left this dropdown empty and made the whole public form unsubmittable.
  const { data: properties = [] } = useQuery({
    queryKey: ["public-properties-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("public_properties").select("id, name, address").order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; address: string | null }>;
    },
  });

  // Narrow the Fastighet dropdown to buildings whose address resembles what the
  // resident typed, instead of listing every property in the portfolio.
  const matchedProperties = useMemo(() => {
    const q = normalizeAddress(residentAddress);
    if (!q) return [];
    return properties
      .map((p) => {
        const addr = normalizeAddress(p.address ?? "");
        const score = addr && (addr.includes(q) || q.includes(addr)) ? 1 : similarity(q, addr);
        return { ...p, score };
      })
      .filter((p) => p.score >= ADDRESS_MATCH_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_ADDRESS_MATCHES);
  }, [properties, residentAddress]);

  // Drop the selected building if it's no longer among the address matches
  // (e.g. the resident edited the address after picking one).
  useEffect(() => {
    if (propertyId && !matchedProperties.some((p) => p.id === propertyId)) {
      setPropertyId("");
    }
  }, [matchedProperties, propertyId]);

  const selectedProperty = properties.find((p) => p.id === propertyId);
  const confirmApartmentNumber = normalizeApartmentNumber(apartmentNumber);
  const confirmTrappa = normalizeTrappa(trappa);

  function validate(): string | null {
    if (
      !residentAddress.trim() ||
      !propertyId ||
      !apartmentNumber.trim() ||
      !trappa.trim() ||
      !reporterName.trim() ||
      !reporterPhone.trim() ||
      !reporterEmail.trim()
    ) {
      return "E-post, adress, fastighet, lägenhetsnummer, trappa, namn och telefonnummer krävs.";
    }
    return null;
  }

  // Step 1 → step 2. The <form> still owns validation so the browser's own
  // required-field bubbles fire before we ever reach the confirmation screen.
  function onContinue(e: React.FormEvent) {
    e.preventDefault();
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setStep("confirm");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function backToForm() {
    setError(null);
    setStep("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function onSubmit() {
    setError(null);
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      setStep("form");
      return;
    }
    setSaving(true);
    try {
      const filePayload = await Promise.all(
        files.map(async (f) => ({ name: f.name, type: f.type, base64: await fileToBase64(f) })),
      );

      const { data, error: fnError } = await supabase.functions.invoke("submit-felanmalan", {
        body: {
          property_id: propertyId,
          resident_address: residentAddress.trim() || null,
          apartment_number: confirmApartmentNumber,
          trappa: confirmTrappa,
          title: title.trim() || null,
          cause: cause.trim() || null,
          description: description.trim() || null,
          category: category || null,
          reporter_name: reporterName.trim(),
          reporter_phone: reporterPhone.trim(),
          reporter_email: reporterEmail.trim() || null,
          files: filePayload,
        },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setDone(true);
    } catch (err) {
      console.error("[felanmalan] submit failed:", err);
      setError("Något gick fel. Försök igen eller kontakta oss direkt.");
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div style={shellStyle}>
        <div style={{ width: "min(480px, 92vw)", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <img src={baytLogo} alt="BAYT" style={{ height: "clamp(40px, 10vw, 56px)", width: "auto", marginBottom: 24, filter: "brightness(0) invert(1)" }} />
          <div style={{ background: C.card, borderRadius: 12, padding: "40px 32px", width: "100%", textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <h1 style={{ fontFamily: "Outfit, sans-serif", fontSize: 20, fontWeight: 600, color: C.text, margin: "0 0 12px" }}>Tack!</h1>
            <p style={{ fontSize: 15, color: C.secondary, lineHeight: 1.5, margin: 0 }}>
              Din felanmälan har tagits emot. Vi återkommer så snart som möjligt.
            </p>
            <Link
              to={TRACK_PAGE_PATH}
              style={{
                display: "inline-block",
                marginTop: 20,
                fontSize: 14,
                fontWeight: 600,
                color: C.primary,
                textDecoration: "none",
              }}
            >
              Följ ditt ärende på {TRACK_PAGE_LABEL} →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <div style={{ width: "min(560px, 94vw)", display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 0" }}>
        <img src={baytLogo} alt="BAYT" style={{ height: "clamp(40px, 10vw, 56px)", width: "auto", marginBottom: 24, filter: "brightness(0) invert(1)" }} />
        <div style={{ width: "100%", textAlign: "center", marginBottom: 20 }}>
          <h1 style={{ fontFamily: "Outfit, sans-serif", fontSize: 24, fontWeight: 600, color: "#ffffff", margin: "0 0 8px" }}>Felanmälan</h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", margin: 0 }}>
            {step === "form" ? "Fyll i formuläret så tar vi hand om det." : "Kontrollera att uppgifterna stämmer innan du skickar."}
          </p>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 16,
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.65)",
          }}
        >
          <span>{step === "form" ? "Steg 1 av 2 · Uppgifter" : "Steg 2 av 2 · Bekräfta"}</span>
          <span style={{ display: "flex", gap: 6 }}>
            <span style={{ width: 22, height: 3, borderRadius: 2, background: "#5CB84A" }} />
            <span style={{ width: 22, height: 3, borderRadius: 2, background: step === "confirm" ? "#5CB84A" : "rgba(255,255,255,0.25)" }} />
          </span>
        </div>

        {step === "confirm" ? (
          <div style={cardStyle}>
            <div style={sectionHeadingStyle}>Stämmer det här?</div>
            <p style={{ fontSize: 14, color: C.secondary, lineHeight: 1.5, margin: "-8px 0 0" }}>
              Vi kopplar din anmälan till lägenheten utifrån fastighet, lägenhetsnummer och trappa. Kontrollera dem extra noga.
            </p>

            <div
              style={{
                background: C.accentBg,
                border: `1px solid ${C.accentBorder}`,
                borderRadius: 10,
                padding: 16,
                display: "grid",
                gap: 14,
                minWidth: 0,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <span style={labelStyle}>Fastighet</span>
                <div style={{ fontFamily: "Outfit, sans-serif", fontSize: 18, fontWeight: 600, color: C.text, overflowWrap: "anywhere" }}>
                  {selectedProperty?.name ?? "—"}
                </div>
                {selectedProperty?.address && (
                  <div style={{ fontSize: 13, color: C.secondary, marginTop: 2, overflowWrap: "anywhere" }}>{selectedProperty.address}</div>
                )}
              </div>
              {/* One field per row. Side by side, "LÄGENHETSNUMMER" (12px, 0.08em
                  tracking) is wider than a half-width column on a narrow phone and
                  overlaps the Trappa label next to it. */}
              <div style={{ minWidth: 0 }}>
                <span style={labelStyle}>Lägenhetsnummer</span>
                <div style={{ fontFamily: "Outfit, sans-serif", fontSize: 18, fontWeight: 600, color: C.text, overflowWrap: "anywhere" }}>
                  {confirmApartmentNumber || "—"}
                </div>
              </div>
              <div style={{ minWidth: 0 }}>
                <span style={labelStyle}>Trappa</span>
                <div style={{ fontFamily: "Outfit, sans-serif", fontSize: 18, fontWeight: 600, color: C.text, overflowWrap: "anywhere" }}>
                  {confirmTrappa || "—"}
                </div>
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20, display: "grid", gap: 14, minWidth: 0 }}>
              <div style={sectionHeadingStyle}>Dina kontaktuppgifter</div>
              <SummaryRow label="Namn" value={reporterName.trim() || "—"} />
              <SummaryRow label="Adress" value={residentAddress.trim() || "—"} />
              <SummaryRow label="Telefonnummer" value={reporterPhone.trim() || "—"} />
              <SummaryRow label="E-post" value={reporterEmail.trim() || "—"} />
            </div>

            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20, display: "grid", gap: 14, minWidth: 0 }}>
              <div style={sectionHeadingStyle}>Om felet</div>
              <SummaryRow label="Kategori" value={category || "—"} />
              <SummaryRow label="Rubrik" value={title.trim() || "—"} />
              <SummaryRow label="Orsak / fri text" value={cause.trim() || "—"} />
              <SummaryRow label="Beskrivning" value={description.trim() || "—"} />
              <SummaryRow
                label="Bilder & filer"
                value={files.length === 0 ? "Inga bifogade filer" : files.map((f) => f.name).join("\n")}
              />
            </div>

            {error && <div style={{ color: C.error, fontSize: 14 }}>{error}</div>}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, minWidth: 0 }}>
              <button
                type="button"
                onClick={backToForm}
                disabled={saving}
                style={{
                  height: 44,
                  background: C.card,
                  color: C.text,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  padding: "0 20px",
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                Ändra uppgifter
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={saving}
                style={{
                  flex: "1 1 200px",
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
                {saving ? "Skickar…" : "Bekräfta och skicka"}
              </button>
            </div>
          </div>
        ) : (
        <form onSubmit={onContinue} style={cardStyle}>
          <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
            <div style={sectionHeadingStyle}>Dina kontaktuppgifter</div>
            <div style={{ minWidth: 0 }}>
              <label style={labelStyle}>E-post *</label>
              <input
                type="email"
                style={inputStyle}
                value={reporterEmail}
                onChange={(e) => setReporterEmail(e.target.value)}
                required
              />
              <p style={{ fontSize: 12, color: C.secondary, margin: "6px 0 0" }}>
                Används för att du ska kunna följa ditt ärende på sidan {TRACK_PAGE_PATH}.
              </p>
            </div>
            <div style={{ minWidth: 0 }}>
              <label style={labelStyle}>Namn *</label>
              <input style={inputStyle} value={reporterName} onChange={(e) => setReporterName(e.target.value)} required />
            </div>
            <div style={{ minWidth: 0 }}>
              <label style={labelStyle}>Adress *</label>
              <input
                style={inputStyle}
                value={residentAddress}
                onChange={(e) => setResidentAddress(e.target.value)}
                placeholder="T.ex. Storgatan 1"
                required
              />
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
                inputMode="numeric"
                pattern="[0-9]*"
                value={trappa}
                onChange={(e) => setTrappa(normalizeTrappa(e.target.value))}
                placeholder={TRAPPA_PLACEHOLDER}
                required
              />
            </div>
            <div style={{ minWidth: 0 }}>
              <label style={labelStyle}>Telefonnummer *</label>
              <input type="tel" style={inputStyle} value={reporterPhone} onChange={(e) => setReporterPhone(e.target.value)} required />
            </div>
          </div>

          <div style={{
            ...sectionHeadingStyle,
            borderTop: `1px solid ${C.border}`, marginTop: 4, paddingTop: 20,
          }}>
            Om felet
          </div>

          <div style={{ minWidth: 0 }}>
            <label style={labelStyle}>Fastighet *</label>
            <select
              style={inputStyle}
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              disabled={!residentAddress.trim()}
              required
            >
              <option value="">
                {!residentAddress.trim()
                  ? "Skriv din adress ovan först"
                  : matchedProperties.length === 0
                    ? "Ingen fastighet hittades"
                    : "Välj fastighet"}
              </option>
              {matchedProperties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 0 }}>
            <label style={labelStyle}>Kategori</label>
            <select style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Välj kategori</option>
              {ISSUE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 0 }}>
            <label style={labelStyle}>Rubrik</label>
            <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div style={{ minWidth: 0 }}>
            <label style={labelStyle}>Orsak / fri text</label>
            <input style={inputStyle} value={cause} onChange={(e) => setCause(e.target.value)} placeholder="Kort orsak…" />
          </div>
          <div style={{ minWidth: 0 }}>
            <label style={labelStyle}>Beskrivning / fritext</label>
            <textarea style={textareaStyle} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div style={{ minWidth: 0 }}>
            <label style={labelStyle}>Bilder & filer</label>
            <FileDropzone
              files={files}
              onAdd={(picked) => setFiles((prev) => [...prev, ...picked])}
              onRemove={(i) => setFiles((prev) => prev.filter((_, k) => k !== i))}
            />
          </div>

          {error && <div style={{ color: C.error, fontSize: 14 }}>{error}</div>}

          <button
            type="submit"
            style={{
              height: 44,
              background: C.primary,
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              padding: "0 20px",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Fortsätt
          </button>
        </form>
        )}
      </div>
    </div>
  );
}

const shellStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "radial-gradient(ellipse at top, #15332c 0%, #0e1f1a 70%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  fontFamily: "Inter, system-ui, sans-serif",
};
