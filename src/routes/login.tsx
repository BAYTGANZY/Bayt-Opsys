import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
const baytLogo = `${import.meta.env.BASE_URL}assets/bayt-logo.png`;


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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(search.error ?? null);
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
          src={baytLogo}
          alt="BAYT"
          style={{ height: "clamp(48px, 14vw, 72px)", width: "auto", objectFit: "contain", marginBottom: 18, filter: "brightness(0) invert(1)" }}
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
            {error && (
              <div style={{ color: "#DC2626", fontSize: 13, marginTop: 12 }}>{error}</div>
            )}
            <button
              type="submit"
              disabled={submitting}
              style={{
                marginTop: 20,
                width: "100%",
                height: 44,
                background: "#3D8A30",
                color: "#ffffff",
                border: "none",
                borderRadius: 6,
                fontSize: 15,
                fontWeight: 600,
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? "Loggar in…" : "Logga in"}
            </button>
          </form>
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
