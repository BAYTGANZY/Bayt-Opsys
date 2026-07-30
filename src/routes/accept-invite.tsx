import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";
const baytLogo = `${import.meta.env.BASE_URL}assets/bayt-logo.png`;

export const Route = createFileRoute("/accept-invite")({
  ssr: false,
  head: () => ({ meta: [{ title: "Skapa lösenord — BAYT" }] }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Supabase's invite link lands here with the session tokens in the URL hash;
    // supabase-js auto-exchanges them into a session on load, so just confirm one exists.
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        setInvalid(true);
      }
      setReady(true);
    });
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Lösenordet måste vara minst 8 tecken.");
      return;
    }
    if (password !== confirm) {
      setError("Lösenorden matchar inte.");
      return;
    }
    setSubmitting(true);
    const { data: userData, error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setSubmitting(false);
      setError(updateError.message);
      return;
    }
    if (userData.user) {
      await supabase.from("profiles").update({ password_set: true }).eq("id", userData.user.id);
    }
    setSubmitting(false);
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
          {!ready ? (
            <div style={{ fontSize: 14, color: "#6B7280", textAlign: "center", padding: "20px 0" }}>
              Laddar…
            </div>
          ) : invalid ? (
            <div style={{ fontSize: 14, color: "#DC2626", textAlign: "center", padding: "8px 0" }}>
              Länken är ogiltig eller har gått ut. Be en administratör skicka en ny inbjudan.
            </div>
          ) : (
            <form onSubmit={onSubmit}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a", marginBottom: 16 }}>
                Skapa ditt lösenord
              </div>
              <label style={labelStyle}>Lösenord</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ ...inputStyle, paddingRight: 40 }}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Dölj lösenord" : "Visa lösenord"}
                  style={{ position: "absolute", right: 0, top: 0, height: 40, width: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", color: "#6B7280", cursor: "pointer" }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <label style={{ ...labelStyle, marginTop: 16 }}>Bekräfta lösenord</label>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                style={inputStyle}
                autoComplete="new-password"
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
                {submitting ? "Sparar…" : "Skapa konto"}
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
