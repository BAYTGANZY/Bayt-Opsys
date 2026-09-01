// ===========================================================================
// "Är det här rätt adress?" — rutan som alltid ställs innan ett ärende mejlas
// iväg till en entreprenör.
//
// Samma imperativa mönster som confirmDialog(): den monterar sin egen React-
// root och returnerar ett Promise, så vilken save-handler som helst kan
// invänta svaret utan att en modal behöver hängas in i trädet.
//
// Skillnaden mot en ren ja/nej-ruta är att adressen är redigerbar i själva
// frågan. Rättar admin den skickas den nya adressen tillbaka — och anroparen
// (gateEntreprenorEmail i src/lib/entreprenor-notify.ts) sparar den på
// kontakten innan utskicket. Frågan är alltså också formuläret; ingen ska
// behöva lämna ärendet, gå till kontaktkortet och komma tillbaka.
// ===========================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { pushSheet } from "@/lib/sheet-stack";

const C = {
  border: "#E9EBE9",
  text: "#111318",
  secondary: "#5B6169",
  primary: "#3D8A30",
  tint: "#F0F7EE",
  tintBorder: "#5CB84A",
  error: "#DC2626",
};

const headingFont = "Outfit, Inter, system-ui, sans-serif";
const bodyFont = "Inter, system-ui, sans-serif";

/** Avsiktligt tillåtande: målet är att fånga "anna@" och "anna.se", inte att
 *  vara RFC 5322. En adress som ser rimlig ut men studsar är mailserverns
 *  besked att ge, inte det här fältets. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EntreprenorEmailDialogOptions = {
  /** Entreprenörens namn — den som ska få mejlet. */
  name: string;
  company?: string | null;
  /** Adressen som står på kontakten just nu. Tom = ingen sparad ännu. */
  email: string;
  /** Etikett på skicka-knappen, t.ex. "Skicka och spara". */
  confirmLabel?: string;
  /** Vad mejlet handlar om, visas som en rad i rutan. */
  arendeTitle?: string | null;
};

function EntreprenorEmailDialogView({
  name,
  company,
  email,
  confirmLabel = "Skicka",
  arendeTitle,
  onDone,
}: EntreprenorEmailDialogOptions & { onDone: (email: string | null) => void }) {
  const [value, setValue] = useState(email);
  const [touched, setTouched] = useState(false);
  // Escape, backdropklick och sheet-stackens bakåtgest kan alla kapplöpa med
  // knapparna — löftet får bara lösas en gång.
  const settled = useRef(false);
  const finish = useCallback(
    (result: string | null) => {
      if (settled.current) return;
      settled.current = true;
      onDone(result);
    },
    [onDone],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish(null); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const popSheet = pushSheet(() => finish(null));
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; popSheet(); };
  }, [finish]);

  const trimmed = value.trim();
  const valid = EMAIL_RE.test(trimmed);
  const changed = trimmed.toLowerCase() !== email.trim().toLowerCase();

  function submit() {
    if (!valid) { setTouched(true); return; }
    finish(trimmed);
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 42,
    padding: "0 12px",
    border: `1px solid ${touched && !valid ? C.error : C.border}`,
    borderRadius: 8,
    fontSize: 14,
    color: C.text,
    background: "#fff",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: bodyFont,
  };

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={() => finish(null)}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", animation: "bayt-fade-in 200ms ease-out" }} />
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          background: "#fff",
          borderRadius: 14,
          width: "100%",
          maxWidth: 420,
          boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
          fontFamily: bodyFont,
          animation: "bayt-fade-in 150ms ease-out",
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, fontWeight: 600, fontSize: 15, fontFamily: headingFont, color: C.text }}>
          Skicka ärendet till entreprenören?
        </div>

        <div style={{ padding: "16px 20px 4px", fontSize: 13.5, lineHeight: 1.55, color: C.secondary }}>
          <div style={{ background: C.tint, border: `1px solid ${C.tintBorder}`, borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#0D2B1E" }}>
              {name}{company ? ` (${company})` : ""}
            </div>
            {arendeTitle && (
              <div style={{ fontSize: 12.5, color: C.secondary, marginTop: 2 }}>Ärende: {arendeTitle}</div>
            )}
          </div>

          {email.trim()
            ? "Ärendets uppgifter mejlas till adressen nedan. Stämmer den?"
            : "Entreprenören har ingen e-postadress sparad. Ange den adress ärendet ska skickas till."}

          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: C.secondary, textTransform: "uppercase", letterSpacing: "0.08em", margin: "14px 0 6px" }}>
            E-postadress
          </label>
          <input
            autoFocus
            type="email"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => setTouched(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); submit(); }
            }}
            placeholder="namn@foretag.se"
            style={inputStyle}
          />
          {touched && !valid && (
            <div style={{ fontSize: 12.5, color: C.error, marginTop: 6 }}>Ange en giltig e-postadress.</div>
          )}
          {changed && valid && (
            <div style={{ fontSize: 12.5, color: C.secondary, marginTop: 6 }}>
              Den nya adressen sparas på {name} och används även framöver.
            </div>
          )}
        </div>

        <div style={{ padding: "16px 20px", marginTop: 4, borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            type="button"
            onClick={() => finish(null)}
            style={{ padding: "9px 16px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 13, color: C.text, fontFamily: bodyFont }}
          >
            Avbryt
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!valid}
            style={{
              padding: "9px 16px", background: C.primary, color: "#fff", border: "none",
              borderRadius: 8, cursor: valid ? "pointer" : "not-allowed", fontSize: 13,
              fontWeight: 600, fontFamily: bodyFont, opacity: valid ? 1 : 0.55,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Frågar "är det här rätt adress?" och löser med adressen att skicka till —
 * eller `null` om admin avbröt (Avbryt, Escape eller backdropklick).
 *
 * Ett `null` betyder "skicka inte", och eftersom tilldelningen och utskicket
 * hör ihop avbryter anroparen hela sparningen på det svaret.
 */
export function askEntreprenorEmail(opts: EntreprenorEmailDialogOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    root.render(
      <EntreprenorEmailDialogView
        {...opts}
        onDone={(result) => {
          // Nästa tick: React vägrar avmontera en root synkront inifrån en av
          // sina egna event-handlers.
          setTimeout(() => { root.unmount(); host.remove(); }, 0);
          resolve(result);
        }}
      />,
    );
  });
}
