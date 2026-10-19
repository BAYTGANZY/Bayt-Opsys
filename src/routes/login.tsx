import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { LOGO_ON_DARK } from "@/lib/logo";

type Search = { error?: string };

export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): Search => ({
    error: typeof s.error === "string" ? s.error : undefined,
  }),
  head: () => ({ meta: [{ title: "Logga in — BAYT" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/login" });
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(search.error ?? null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session) {
      // already logged in; route guard will handle role
      navigate({ to: "/start" });
    }
  }, [loading, session, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError || !data.user) {
      setError("Felaktig e-post eller lösenord.");
      setSubmitting(false);
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();

    if (!profile?.role || !["admin", "styrelse", "entreprenor"].includes(profile.role)) {
      await supabase.auth.signOut();
      setError("Åtkomst nekad.");
      setSubmitting(false);
      return;
    }
    navigate({ to: "/start" });
  };

  const onReset = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Ange din e-postadress.");
      return;
    }
    setSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}aterstall-losenord`,
    });
    setSubmitting(false);
    if (resetError) {
      setError("Kunde inte skicka mejlet just nu. Försök igen om en stund.");
      return;
    }
    // Samma svar oavsett om adressen finns, så ingen kan se vilka som har konto.
    setInfo("Om adressen har ett konto har vi skickat en länk för att välja nytt lösenord. Kolla även skräpposten.");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "radial-gradient(ellipse at top, #15332c 0%, #0e1f1a 70%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div style={{ width: "min(360px, 92vw)", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <img
          src={LOGO_ON_DARK}
          alt="BAYT"
          style={{ height: "clamp(48px, 14vw, 72px)", width: "auto", objectFit: "contain", marginBottom: 18 }}
        />
        <div
          style={{
            background: "#ffffff",
            borderRadius: 8,
            padding: "min(24px, 5vw)",
            width: "100%",
            border: "1px solid #E5E7EB",
          }}
        >
          {mode === "login" ? (
            <form onSubmit={onSubmit}>
              <label style={labelStyle}>E-post</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
                autoComplete="email"
              />
              <label style={{ ...labelStyle, marginTop: 16 }}>Lösenord</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
                autoComplete="current-password"
              />
              {error && <div style={{ color: "#DC2626", fontSize: 13, marginTop: 12 }}>{error}</div>}
              <button type="submit" disabled={submitting} style={buttonStyle(submitting)}>
                {submitting ? "Loggar in…" : "Logga in"}
              </button>
              <div style={{ textAlign: "center", marginTop: 14 }}>
                <button
                  type="button"
                  onClick={() => {
                    setMode("reset");
                    setError(null);
                    setInfo(null);
                  }}
                  style={linkStyle}
                >
                  Glömt lösenord?
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={onReset}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a", marginBottom: 6 }}>
                Återställ lösenord
              </div>
              <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 16, lineHeight: 1.5 }}>
                Ange din e-postadress, så mejlar vi en länk där du väljer ett nytt lösenord.
              </div>
              <label style={labelStyle}>E-post</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
                autoComplete="email"
              />
              {error && <div style={{ color: "#DC2626", fontSize: 13, marginTop: 12 }}>{error}</div>}
              {info && <div style={{ color: "#3D8A30", fontSize: 13, marginTop: 12, lineHeight: 1.5 }}>{info}</div>}
              <button type="submit" disabled={submitting} style={buttonStyle(submitting)}>
                {submitting ? "Skickar…" : "Skicka länk"}
              </button>
              <div style={{ textAlign: "center", marginTop: 14 }}>
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setError(null);
                    setInfo(null);
                  }}
                  style={linkStyle}
                >
                  Tillbaka till inloggning
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 500,
  color: "#1a1a1a",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 12px",
  border: "1px solid #E5E7EB",
  borderRadius: 6,
  fontSize: 14,
  color: "#1a1a1a",
  background: "#ffffff",
  boxSizing: "border-box",
  outline: "none",
};

function buttonStyle(disabled: boolean): React.CSSProperties {
  return {
    marginTop: 20,
    width: "100%",
    height: 44,
    background: "#3D8A30",
    color: "#ffffff",
    border: "none",
    borderRadius: 6,
    fontSize: 15,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.7 : 1,
  };
}

const linkStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: "#3D8A30",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "underline",
  fontFamily: "inherit",
};
