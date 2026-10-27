import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { HOMEPAGE_URL } from "@/components/LegalPage";

const KEY = "bayt-cookie-notice-ok";

export function CookieNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {
      setShow(true);
    }
  }, []);
  if (!show) return null;
  const ok = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignoreras */
    }
    setShow(false);
  };
  return (
    <div
      role="dialog"
      aria-label="Information om cookies"
      style={{
        position: "fixed", left: 12, right: 12, bottom: 12, zIndex: 400, maxWidth: 560, margin: "0 auto",
        background: "#0D2B1E", color: "#e6efd8", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 16,
        padding: "14px 16px", boxShadow: "0 18px 40px -14px rgba(0,0,0,0.6)", fontSize: 13.5, lineHeight: 1.5,
        display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div style={{ flex: 1, minWidth: 220 }}>
        Vi använder bara cookies som behövs för inloggning och drift, inga för reklam eller spårning.{" "}
        <Link to={"/cookies" as never} style={{ color: "#8be07a" }}>Läs mer</Link>
      </div>
      <button
        type="button"
        onClick={ok}
        style={{ height: 38, padding: "0 18px", border: "none", borderRadius: 10, background: "#5CB84A", color: "#0D2B1E", fontWeight: 700, cursor: "pointer" }}
      >
        Förstått
      </button>
    </div>
  );
}

export function LegalLinks({ dark = true }: { dark?: boolean }) {
  const color = dark ? "#9fb79f" : "#6B7280";
  const s: React.CSSProperties = { color, fontSize: 12, textDecoration: "none" };
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", padding: "12px 8px" }}>
      <Link to={"/integritet" as never} style={s}>Integritetspolicy</Link>
      <Link to={"/cookies" as never} style={s}>Cookies</Link>
      <a href={HOMEPAGE_URL} target="_blank" rel="noreferrer" style={s}>bayt.se</a>
    </div>
  );
}
