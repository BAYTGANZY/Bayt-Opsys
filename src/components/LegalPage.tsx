import { Link } from "@tanstack/react-router";

const logo = `${import.meta.env.BASE_URL}assets/bayt-logo.png`;
export const HOMEPAGE_URL = "https://bayt.se";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#0e1f1a", fontFamily: "Inter, system-ui, sans-serif", color: "#14221b" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 20px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href={HOMEPAGE_URL} target="_blank" rel="noreferrer">
          <img src={logo} alt="BAYT" style={{ height: 34, display: "block" }} />
        </a>
        <Link to={"/login" as never} style={{ color: "#cfe0c4", fontSize: 13, textDecoration: "none" }}>
          Till inloggning
        </Link>
      </div>
      <div style={{ maxWidth: 820, margin: "24px auto 0", background: "#f4efe3", borderRadius: "24px 24px 0 0", padding: "32px 24px 56px", lineHeight: 1.65, fontSize: 15 }}>
        <h1 style={{ fontFamily: "Outfit, Inter, sans-serif", fontSize: 32, margin: "0 0 4px" }}>{title}</h1>
        <div style={{ color: "#5d6a60", fontSize: 13, marginBottom: 24 }}>Senast uppdaterad: {updated}</div>
        {children}
        <div style={{ marginTop: 40, paddingTop: 16, borderTop: "1px solid #d9d2bd", display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13 }}>
          <Link to={"/integritet" as never} style={{ color: "#2b7a3d" }}>Integritetspolicy</Link>
          <Link to={"/cookies" as never} style={{ color: "#2b7a3d" }}>Cookies</Link>
          <a href={HOMEPAGE_URL} target="_blank" rel="noreferrer" style={{ color: "#2b7a3d" }}>bayt.se</a>
        </div>
      </div>
    </div>
  );
}

export const h2: React.CSSProperties = { fontFamily: "Outfit, Inter, sans-serif", fontSize: 20, margin: "28px 0 8px" };
