import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { pushSheet } from "@/lib/sheet-stack";

export function BottomSheet({
  open, onClose, children, heightVh = 65,
}: { open: boolean; onClose: () => void; children: ReactNode; heightVh?: number }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const popSheet = pushSheet(onClose);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; popSheet(); };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}
      onClick={onClose}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", animation: "bayt-fade-in 200ms ease-out" }} />
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          height: `${heightVh}vh`,
          background: "#fff",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          boxShadow: "0 -8px 24px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
          animation: "bayt-sheet-up 240ms ease-out",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 4px" }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "#E5E7EB" }} />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
