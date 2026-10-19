import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { LOGO_ON_DARK } from "@/lib/logo";

export const Route = createFileRoute("/aterstall-losenord")({
  ssr: false,
  head: () => ({ meta: [{ title: "Nytt lösenord — BAYT" }, { name: "robots", content: "noindex" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [checked, setChecked] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Länken i mejlet loggar in en tillfällig session. Vi väntar in den.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setReady(true);
        setChecked(true);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    const t = setTimeout(() => setChecked(true), 2500);
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Lösenordet måste vara minst 8 tecken.");
      return;
    }
    if (password !== confirm) {
      setError("Lösenorden är inte lika.");
      return;
    }
    setSubmitting(true);
    const { data, error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message || "Kunde inte spara lösenordet. Begär en ny länk.");
      setSubmitting(false);
      return;
    }
    // Bäst-möjliga-fall: markera att lösenord är satt.
    try {
      if (data.user) {
        await supabase.from("profiles").update({ password_set: true }).eq("id", data.user.id);
      }
    } catch {
      /* spelar ingen roll för själva återställningen */
    }
    await supabase.auth.signOut();
    navigate({ to: "/login" });
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
          {!ready && !checked && <div style={{ fontSize: 14, color: "#6B7280" }}>Kontrollerar länken…</div>}

          {!ready && checked && (
            <div style={{ fontSize: 14, color: "#1a1a1a", lineHeight: 1.5 }}>
              Länken är ogiltig eller har gått ut. Gå till inloggningen och välj "Glömt lösenord?" för att få en ny.
              <div style={{ marginTop: 14 }}>
                <button type="button" onClick={() => navigate({ to: "/login" })} style={linkStyle}>
                  Till inloggningen
                </button>
              </div>
            </div>
          )}

          {ready && (
            <form onSubmit={onSubmit}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a", marginBottom: 16 }}>
                Välj nytt lösenord
              </div>
              <label style={labelStyle}>Nytt lösenord</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
                autoComplete="new-password"
              />
              <label style={{ ...labelStyle, marginTop: 16 }}>Upprepa lösenordet</label>
              <input
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                style={inputStyle}
                autoComplete="new-password"
              />
              {error && <div style={{ color: "#DC2626", fontSize: 13, marginTop: 12 }}>{error}</div>}
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
                {submitting ? "Sparar…" : "Spara lösenord"}
              </button>
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
