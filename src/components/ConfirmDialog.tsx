// ===========================================================================
// In-app replacement for window.confirm() — the styled dialog every delete
// flow goes through instead of the browser's native popup.
//
// Promise-based on purpose: every former call site read
// `if (!window.confirm(...)) return;` inside an async handler, so
// `if (!(await confirmDialog(...))) return;` is a drop-in swap with the
// surrounding handler logic untouched.
//
// It mounts its own React root, so no provider or host component needs to be
// wired into the tree — any module can import and call it.
// ===========================================================================

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { pushSheet } from "@/lib/sheet-stack";

const C = {
  border: "#E9EBE9",
  text: "#111318",
  secondary: "#5B6169",
  danger: "#DC2626",
  primary: "#3D8A30",
};

const headingFont = "Outfit, Inter, system-ui, sans-serif";
const bodyFont = "Inter, system-ui, sans-serif";

export type ConfirmDialogOptions = {
  title: string;
  /** Rendered with white-space: pre-line, so \n\n paragraph breaks survive. */
  message: string;
  /** Label on the confirming button. Avbryt is always the other one. */
  confirmLabel?: string;
  /** Red confirm button for destructive actions. */
  danger?: boolean;
};

function ConfirmDialogView({
  title,
  message,
  confirmLabel = "OK",
  danger = false,
  onDone,
}: ConfirmDialogOptions & { onDone: (ok: boolean) => void }) {
  // Escape, backdrop click and the sheet-stack back gesture can all race the
  // buttons — the promise must resolve exactly once.
  const settled = useRef(false);
  const finish = useCallback(
    (ok: boolean) => {
      if (settled.current) return;
      settled.current = true;
      onDone(ok);
    },
    [onDone],
  );

  // Same plumbing as BottomSheet: Escape cancels, body scroll locks, and the
  // dialog joins the sheet-stack so a mobile "back" gesture dismisses it
  // instead of navigating away underneath it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const popSheet = pushSheet(() => finish(false));
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; popSheet(); };
  }, [finish]);

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={() => finish(false)}
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
          maxWidth: 380,
          boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
          fontFamily: bodyFont,
          animation: "bayt-fade-in 150ms ease-out",
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, fontWeight: 600, fontSize: 15, fontFamily: headingFont, color: C.text }}>
          {title}
        </div>
        <div style={{ padding: "14px 20px", fontSize: 13.5, lineHeight: 1.55, color: C.secondary, whiteSpace: "pre-line" }}>
          {message}
        </div>
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end", gap: 10 }}>
          {/* Cancel holds focus so a stray Enter never confirms a delete. */}
          <button
            type="button"
            autoFocus
            onClick={() => finish(false)}
            style={{ padding: "8px 16px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 13, color: C.text, fontFamily: bodyFont }}
          >
            Avbryt
          </button>
          <button
            type="button"
            onClick={() => finish(true)}
            style={{ padding: "8px 16px", background: danger ? C.danger : C.primary, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: bodyFont }}
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
 * Styled stand-in for `window.confirm` — resolves true on confirm, false on
 * Avbryt, Escape or a backdrop click.
 */
export function confirmDialog(opts: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    root.render(
      <ConfirmDialogView
        {...opts}
        onDone={(ok) => {
          // Next tick: React refuses to unmount a root synchronously from
          // inside one of its own event handlers.
          setTimeout(() => { root.unmount(); host.remove(); }, 0);
          resolve(ok);
        }}
      />,
    );
  });
}
