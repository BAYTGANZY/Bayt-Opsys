import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { LOGO_ON_DARK } from "@/lib/logo";

/**
 * Publik kontroll av ett intyg om godkänd andrahandsuthyrning — ingen inloggning.
 *   /verifiera?kod=XXXX-XXXX-XXXX   (QR-koden på intyget pekar hit)
 * Visar bara det en mottagare behöver för att se att intyget är äkta; kontaktuppgifter lämnas aldrig ut.
 */
export const Route = createFileRoute("/verifiera")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ kod: typeof s.kod === "string" ? s.kod : "" }),
  head: () => ({ meta: [{ title: "Kontrollera intyg — BAYT" }] }),
  component: VerifieraPage,
});

type Result = {
  valid: boolean; reference: string; property_name: string; apartment_number: string; trappa: string | null;
  applicant_name: string; tenant_name: string; start_date: string; end_date: string;
  decided_at: string | null; decided_by_name: string | null; expired: boolean;
};

const C = { border: "#E5E7EB", primary: "#3D8A30", secondary: "#6B7280", text: "#1a1a1a", error: "#C2334D" };
const sv = (iso?: string | null) => (iso ? new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" }) : "—");

function VerifieraPage() {
  const { kod } = Route.useSearch();
  const [code, setCode] = useState(kod);
  const [state, setState] = useState<"idle" | "loading" | "ok" | "invalid" | "error">("idle");
  const [res, setRes] = useState<Result | null>(null);

  const check = async (c: string) => {
    if (c.replace(/[^A-Za-z0-9]/g, "").length < 12) { setState("invalid"); setRes(null); return; }
    setState("loading");
    const { data, error } = await supabase.functions.invoke("submit-andrahand", { body: { action: "verify", code: c } });
    // 404 från funktionen = okänd kod; invoke ger då error men inget nätverksfel
    if (data && (data as Result).valid) { setRes(data as Result); setState("ok"); return; }
    const status = (error as { context?: { status?: number } } | null)?.context?.status;
    if (error && status !== 404) { setState("error"); return; }
    setRes(null); setState("invalid");
  };

  useEffect(() => { if (kod) void check(kod); }, [kod]);

  const card: React.CSSProperties = { background: "#fff", borderRadius: 12, padding: 24, width: "100%", boxSizing: "border-box", display: "grid", gap: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" };
  const row = (k: string, v: string) => (
    <div key={k} style={{ display: "flex", gap: 12, fontSize: 15, flexWrap: "wrap" }}>
      <span style={{ width: 130, color: C.secondary }}>{k}</span><span style={{ fontWeight: 600, color: C.text }}>{v}</span>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse at top, #15332c 0%, #0e1f1a 70%)", display: "flex", justifyContent: "center", padding: 16, fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 560, display: "grid", gap: 16, alignContent: "start", paddingTop: 24 }}>
        <img src={LOGO_ON_DARK} alt="BAYT" style={{ height: 34, justifySelf: "center" }} />
        <div style={{ textAlign: "center", color: "#fff" }}>
          <h1 style={{ fontFamily: "Outfit, sans-serif", fontSize: "clamp(24px, 6vw, 30px)", fontWeight: 700, margin: 0 }}>Kontrollera intyg</h1>
          <p style={{ margin: "8px auto 0", maxWidth: 440, fontSize: 15, lineHeight: 1.55, color: "#c9d8c3" }}>Ange verifieringskoden som står på intyget om godkänd andrahandsuthyrning.</p>
        </div>
        <form style={card} onSubmit={(e) => { e.preventDefault(); void check(code); }}>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
            style={{ height: 48, padding: "0 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 18, letterSpacing: "0.06em", fontFamily: "'Courier New', monospace", boxSizing: "border-box", width: "100%" }} />
          <button type="submit" disabled={state === "loading"} style={{ height: 48, borderRadius: 8, border: "none", background: C.primary, color: "#fff", fontSize: 16, fontWeight: 600, cursor: "pointer", opacity: state === "loading" ? 0.6 : 1 }}>
            {state === "loading" ? "Kontrollerar…" : "Kontrollera"}
          </button>
        </form>

        {state === "ok" && res && (
          <div style={{ ...card, border: `2px solid ${res.expired ? "#B7791F" : C.primary}` }}>
            <div style={{ fontFamily: "Outfit, sans-serif", fontSize: 20, fontWeight: 700, color: res.expired ? "#B7791F" : C.primary }}>
              {res.expired ? "✓ Äkta intyg — uthyrningsperioden har gått ut" : "✓ Äkta intyg — godkänd andrahandsuthyrning"}
            </div>
            {row("Förening", res.property_name)}
            {row("Lägenhet", `${res.apartment_number}${res.trappa ? `, trappa ${res.trappa}` : ""}`)}
            {row("Hyrs ut av", res.applicant_name)}
            {row("Hyresgäst", res.tenant_name)}
            {row("Period", `${sv(res.start_date)} till ${sv(res.end_date)}`)}
            {row("Beslutat av", res.decided_by_name ?? "Styrelsen")}
            {row("Beslutsdatum", sv(res.decided_at))}
            {row("Ärende", res.reference)}
            <div style={{ fontSize: 13, color: C.secondary }}>Uppgifterna ska stämma med det utskrivna intyget. Avviker något är intyget inte äkta.</div>
          </div>
        )}
        {state === "invalid" && (
          <div style={{ ...card, border: `2px solid ${C.error}`, color: C.error, fontWeight: 600 }}>
            Koden hittades inte. Kontrollera att du skrivit av den rätt — intyget kan inte styrkas.
          </div>
        )}
        {state === "error" && <div style={{ ...card, color: C.error }}>Kontrollen kunde inte genomföras just nu. Försök igen om en stund.</div>}
      </div>
    </div>
  );
}
