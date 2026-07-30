import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Copy, AlertCircle, CheckCircle2, Users, Upload, Lock, UserCircle, Trash2, Eye, EyeOff, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { sanitizeStorageName } from "@/lib/storage";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { ROLE_LABEL, ROLE_BADGE } from "@/lib/user-tokens";
import { confirmDialog } from "@/components/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/installningar")({
  head: () => ({ meta: [{ title: "Inställningar — BAYT" }] }),
  component: SettingsPage,
});

// ---------- Design tokens (3-level depth: page bg → panel → interactive) ----------
const C = {
  pageBg: "#F7F8F7",
  card: "#FFFFFF",
  border: "#E9EBE9",
  primary: "#3D8A30",
  primaryHover: "#356F29",
  accent: "#5CB84A",
  dark: "#0D2B1E",
  text: "#111318",
  secondary: "#5B6169",
  muted: "#9AA0A6",
  success: "#3D8A30",
  successBg: "#EEF6EC",
  error: "#C0392B",
  errorBg: "#FBEEEC",
};

const headingFont = "Outfit, Inter, system-ui, sans-serif";
const bodyFont = "Inter, system-ui, sans-serif";

const panelStyle: React.CSSProperties = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  boxShadow: "0 1px 3px rgba(13,43,30,0.04)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 500,
  color: C.secondary,
  marginBottom: 8,
  fontFamily: bodyFont,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 14px",
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  fontSize: 14,
  color: C.text,
  background: C.card,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: bodyFont,
  transition: "border-color 0.15s ease, box-shadow 0.15s ease",
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 24px",
  fontSize: 12,
  fontWeight: 500,
  color: C.muted,
  letterSpacing: "0.02em",
  borderBottom: `1px solid ${C.border}`,
  fontFamily: bodyFont,
};

const td: React.CSSProperties = {
  padding: "16px 24px",
  fontSize: 14,
  color: C.text,
  borderBottom: `1px solid ${C.border}`,
  fontFamily: bodyFont,
};

function RoleBadge({ role }: { role: string }) {
  const s = ROLE_BADGE[role] ?? { bg: "#F0F0F0", color: C.text };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: s.bg,
        color: s.color,
        fontFamily: bodyFont,
      }}
    >
      {ROLE_LABEL[role] ?? role}
    </span>
  );
}

function Avatar({ name, url }: { name: string | null; url?: string | null }) {
  const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
  if (url) {
    return (
      <img
        src={url}
        alt=""
        style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0, display: "block" }}
      />
    );
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: C.dark,
        color: C.accent,
        fontSize: 13,
        fontWeight: 700,
        fontFamily: headingFont,
        flexShrink: 0,
      }}
    >
      {initial}
    </span>
  );
}

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
};

const ROLES = ["admin", "styrelse", "entreprenor"];

type FullProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
};

function FeedbackBox({ feedback }: { feedback: { type: "ok" | "err"; message: string } | null }) {
  if (!feedback) return null;
  return (
    <div
      style={{
        marginTop: 16, display: "flex", alignItems: "flex-start", gap: 10,
        padding: "12px 14px", borderRadius: 8,
        background: feedback.type === "ok" ? C.successBg : C.errorBg,
        color: feedback.type === "ok" ? C.success : C.error,
        fontSize: 13.5, lineHeight: 1.5,
      }}
    >
      {feedback.type === "ok" ? <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />}
      <span>{feedback.message}</span>
    </div>
  );
}

/** "Min profil" — merged in from the old standalone /profile page. */
function MinProfilCard() {
  const { user, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const userId = user?.id;

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; message: string } | null>(null);

  const { data: profile } = useQuery<FullProfile | null>({
    queryKey: ["profile", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, phone, avatar_url, created_at")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data as FullProfile | null) ?? null;
    },
    enabled: !!userId,
  });

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setPhone(profile.phone ?? "");
      setAvatarUrl(profile.avatar_url ?? null);
    }
  }, [profile]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setSaving(true);
    setFeedback(null);
    try {
      const { error } = await supabase.from("profiles").update({ full_name: fullName || null, phone: phone || null, avatar_url: avatarUrl }).eq("id", userId);
      if (error) throw error;
      setFeedback({ type: "ok", message: "Profilen uppdaterad" });
      queryClient.invalidateQueries({ queryKey: ["profile", userId] });
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      await refreshProfile();
    } catch (err: unknown) {
      setFeedback({ type: "err", message: err instanceof Error ? err.message : "Något gick fel" });
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarUpload(file: File) {
    if (!userId) return;
    setFeedback(null);
    try {
      const ext = sanitizeStorageName(file.name.split(".").pop() ?? "png");
      const path = `${userId}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = urlData?.publicUrl ?? null;
      if (!publicUrl) throw new Error("Kunde inte hämta bild-URL");
      setAvatarUrl(publicUrl);
      const { error: updateError } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", userId);
      if (updateError) throw updateError;
      setFeedback({ type: "ok", message: "Profilbild uppdaterad" });
      queryClient.invalidateQueries({ queryKey: ["profile", userId] });
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
      // Topbaren/sidomenyn läser profilen via AuthProvider, inte via React Query.
      await refreshProfile();
    } catch (err: unknown) {
      setFeedback({ type: "err", message: err instanceof Error ? err.message : "Något gick fel vid uppladdning" });
    }
  }

  return (
    <form onSubmit={handleSave} style={{ ...panelStyle, padding: 24 }}>
      <h2 style={{ fontFamily: headingFont, fontSize: 18, fontWeight: 600, color: C.text, margin: "0 0 20px", display: "flex", alignItems: "center", gap: 8 }}>
        <UserCircle size={18} /> Min profil
      </h2>

      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 16 }}>
        {avatarUrl ? (
          <img src={avatarUrl} alt="Profilbild" style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", border: `1px solid ${C.border}` }} />
        ) : (
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: C.border, display: "flex", alignItems: "center", justifyContent: "center", color: C.secondary }}>
            <UserCircle size={24} />
          </div>
        )}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          style={{ height: 36, padding: "0 14px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontWeight: 500, color: C.text, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: bodyFont }}
        >
          <Upload size={16} /> Byt bild
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => { const file = e.target.files?.[0]; if (file) handleAvatarUpload(file); e.target.value = ""; }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Namn</label>
        <input type="text" style={inputStyle} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Förnamn Efternamn" />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Telefon</label>
        <input type="tel" style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="070-123 45 67" />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>E-post</label>
        <input type="email" style={{ ...inputStyle, background: "#F5F5F5", color: C.secondary }} value={profile?.email ?? ""} disabled readOnly />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Roll</label>
        <input type="text" style={{ ...inputStyle, background: "#F5F5F5", color: C.secondary }} value={profile?.role ? (ROLE_LABEL[profile.role] ?? profile.role) : ""} disabled readOnly />
      </div>

      <button
        type="submit"
        disabled={saving}
        style={{ height: 42, padding: "0 22px", background: C.primary, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, fontFamily: bodyFont, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}
      >
        {saving ? "Sparar…" : "Spara ändringar"}
      </button>

      <FeedbackBox feedback={feedback} />
    </form>
  );
}

/** "Byt lösenord" — merged in from the old standalone /profile page. */
function BytLosenordCard() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; message: string } | null>(null);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    if (newPassword.length < 8) {
      setFeedback({ type: "err", message: "Lösenordet måste vara minst 8 tecken" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setFeedback({ type: "err", message: "Lösenorden matchar inte" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setFeedback({ type: "ok", message: "Lösenordet har uppdaterats" });
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      setFeedback({ type: "err", message: err instanceof Error ? err.message : "Något gick fel" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleChangePassword} style={{ ...panelStyle, padding: 24 }}>
      <h2 style={{ fontFamily: headingFont, fontSize: 18, fontWeight: 600, color: C.text, margin: "0 0 20px", display: "flex", alignItems: "center", gap: 8 }}>
        <Lock size={18} /> Byt lösenord
      </h2>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Nytt lösenord</label>
        <div style={{ position: "relative" }}>
          <input type={showPassword ? "text" : "password"} style={{ ...inputStyle, paddingRight: 40 }} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Minst 8 tecken" minLength={8} />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Dölj lösenord" : "Visa lösenord"}
            style={{ position: "absolute", right: 0, top: 0, height: 42, width: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", color: C.secondary, cursor: "pointer" }}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Bekräfta lösenord</label>
        <input type={showPassword ? "text" : "password"} style={inputStyle} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} />
      </div>

      <button
        type="submit"
        disabled={saving}
        style={{ height: 42, padding: "0 22px", background: C.primary, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, fontFamily: bodyFont, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}
      >
        {saving ? "Sparar…" : "Byt lösenord"}
      </button>

      <FeedbackBox feedback={feedback} />
    </form>
  );
}

function SettingsPage() {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; message: string } | null>(null);
  const [inviting, setInviting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [accessPanelUserId, setAccessPanelUserId] = useState<string | null>(null);

  const { data: allProperties = [] } = useQuery({
    queryKey: ["properties", "min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  const fmtDate = useMemo(
    () => new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit" }),
    []
  );

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, phone, avatar_url, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProfileRow[];
    },
  });

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !role) return;
    setInviting(true);
    setFeedback(null);
    try {
      const { error } = await supabase.functions.invoke("invite-user", {
        body: {
          email,
          role,
          full_name: fullName || undefined,
          property_ids: role === "styrelse" ? selectedPropertyIds : undefined,
        },
      });
      if (error) throw error;
      setFeedback({ type: "ok", message: `Inbjudan skickad till ${email}` });
      setEmail("");
      setFullName("");
      setRole("");
      setSelectedPropertyIds([]);
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      // The invite may have restored or created a contacts row (the trigger in
      // account-continuity.sql relinks a returning e-post, and gives a brand new
      // entreprenör a kontaktpost). Both Ansvarig-dropdownen and Kontakter must
      // pick that up without a reload — they have separate cache keys.
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["contacts-entreprenorer"] });
    } catch (err: unknown) {
      console.error("[installningar] invite-user failed:", err);
      // FunctionsHttpError carries the real server response on `.context` —
      // read it instead of guessing, so the message shown is the actual cause.
      let msg = "Något gick fel";
      if (err && typeof err === "object" && "context" in err) {
        try {
          const body = await (err as { context: Response }).context.json();
          msg = body?.error ?? msg;
        } catch {
          msg = err instanceof Error ? err.message : msg;
        }
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setFeedback({ type: "err", message: msg });
    } finally {
      setInviting(false);
    }
  }

  async function handleDelete(id: string, name: string | null) {
    const ok = await confirmDialog({
      title: `Vill du radera ${name ?? "denna användare"}?`,
      message:
        "Inloggningen tas bort direkt och personen förlorar all åtkomst. " +
        "Deras ärenden, kontaktpost och historik ligger kvar — bjuder du in " +
        "samma e-postadress igen kopplas allt ihop automatiskt och de fortsätter där de slutade.",
      confirmLabel: "Radera",
      danger: true,
    });
    if (!ok) return;
    setDeletingId(id);
    try {
      // An entreprenör exists twice: as a login (profiles) and as a pickable
      // name (contacts, joined on contacts.profile_id). invite-user only
      // removes the login — without the retire step below the contact lives on
      // and the deleted entreprenör keeps showing up in every Ansvarig
      // dropdown. Look it up BEFORE the delete: the FK on contacts.profile_id
      // may null the link out as a side effect, after which it can't be found.
      //
      // profiles_remember_account() (account-continuity.sql) does the same
      // thing DB-side, and additionally snapshots the account so a re-invite on
      // the same e-post restores it. The client half is kept as the fallback
      // for a deploy where that SQL hasn't been run yet; both are idempotent.
      const { data: linkedContacts } = await supabase
        .from("contacts")
        .select("id")
        .eq("profile_id", id);

      const { error } = await supabase.functions.invoke("invite-user", { body: { action: "delete", id } });
      if (error) throw error;

      // Retire, don't delete: assigned_contact_id on gamla felanmälningar,
      // besiktningar och projekt still points here, and those must keep showing
      // who was ansvarig. active = false only hides them from the dropdowns.
      const contactIds = (linkedContacts ?? []).map((c: { id: string }) => c.id);
      if (contactIds.length > 0) {
        const { error: retireError } = await supabase
          .from("contacts")
          .update({ active: false, profile_id: null })
          .in("id", contactIds);
        if (retireError) {
          // The login is already gone at this point — don't fail the whole
          // delete, just say the dropdown wasn't cleaned up.
          console.error("[installningar] kunde inte inaktivera kontakten:", retireError);
          toast.warning("Användaren raderades, men kontakten finns kvar i Ansvarig-listan. Inaktivera den under Kontakter.");
        }
      }

      toast.success("Användaren raderad");
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["contacts-entreprenorer"] });
      queryClient.invalidateQueries({ queryKey: ["my-contact-id"] });
    } catch (err: unknown) {
      let msg = "Något gick fel";
      if (err && typeof err === "object" && "context" in err) {
        try {
          const body = await (err as { context: Response }).context.json();
          msg = body?.error ?? msg;
        } catch {
          msg = err instanceof Error ? err.message : msg;
        }
      } else if (err instanceof Error) {
        msg = err.message;
      }
      toast.error(msg);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div style={{ background: C.pageBg, minHeight: "100%", padding: isMobile ? 20 : 40, fontFamily: bodyFont }}>
      <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", flexDirection: "column", gap: 32 }}>
        <h1 style={{ fontFamily: headingFont, fontSize: 26, fontWeight: 600, letterSpacing: "-0.01em", color: C.text, margin: 0 }}>
          Inställningar
        </h1>

        {/* Min profil + Byt lösenord (merged in from the old /profile page) */}
        <section style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20, alignItems: "start" }}>
          <MinProfilCard />
          <BytLosenordCard />
        </section>

        {/* Demolänk — admin only */}
        {isAdmin && (
        <section
          style={{
            ...panelStyle,
            padding: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 500, letterSpacing: "0.04em", marginBottom: 6 }}>
              DEMOLÄNK
            </div>
            <div style={{ fontFamily: headingFont, fontSize: 16, fontWeight: 600, color: C.text }}>
              app.bayt.se/demo
            </div>
            <div style={{ fontSize: 13, color: C.secondary, marginTop: 4 }}>
              Skicka till potentiella kunder för en guidad rundtur.
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              const link = "app.bayt.se/demo";
              try {
                if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(link);
                else {
                  const ta = document.createElement("textarea");
                  ta.value = link;
                  document.body.appendChild(ta);
                  ta.select();
                  document.execCommand("copy");
                  document.body.removeChild(ta);
                }
                toast.success("Länk kopierad!");
              } catch {
                toast.error("Kunde inte kopiera");
              }
            }}
            style={{
              height: 40,
              padding: "0 18px",
              background: C.accent,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              fontFamily: bodyFont,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              transition: "filter 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(0.95)")}
            onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}
          >
            <Copy size={16} /> Kopiera länk
          </button>
        </section>
        )}

        {/* Users section — admin only */}
        {isAdmin && (
        <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <h2 style={{ fontFamily: headingFont, fontSize: 18, fontWeight: 600, color: C.text, margin: 0 }}>
              Användare
            </h2>
            <p style={{ fontSize: 13, color: C.secondary, margin: "4px 0 0" }}>
              Bjud in nya medlemmar av teamet och hantera deras roller.
            </p>
          </div>

          {/* Invite form */}
          <form onSubmit={handleInvite} style={{ ...panelStyle, padding: 24 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1.2fr 1.2fr 1fr",
                gap: 16,
              }}
            >
              <div>
                <label style={labelStyle}>E-post</label>
                <input
                  type="email"
                  required
                  placeholder="user@example.com"
                  style={inputStyle}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={(e) => (e.currentTarget.style.borderColor = C.primary)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = C.border)}
                />
              </div>
              <div>
                <label style={labelStyle}>Namn</label>
                <input
                  type="text"
                  placeholder="Förnamn Efternamn"
                  style={inputStyle}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  onFocus={(e) => (e.currentTarget.style.borderColor = C.primary)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = C.border)}
                />
              </div>
              <div>
                <label style={labelStyle}>Roll</label>
                <select
                  required
                  style={{ ...inputStyle, cursor: "pointer" }}
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  onFocus={(e) => (e.currentTarget.style.borderColor = C.primary)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = C.border)}
                >
                  <option value="">Välj roll</option>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                  ))}
                </select>
              </div>
            </div>

            {role === "styrelse" && (
              <div style={{ marginTop: 16 }}>
                <label style={labelStyle}>Fastigheter (styrelsen får endast se dessa)</label>
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, maxHeight: 160, overflowY: "auto", padding: 8 }}>
                  {allProperties.length === 0 ? (
                    <div style={{ fontSize: 13, color: C.muted, padding: 8 }}>Inga fastigheter finns ännu</div>
                  ) : (
                    allProperties.map((p) => (
                      <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", fontSize: 13.5, color: C.text, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={selectedPropertyIds.includes(p.id)}
                          onChange={(e) => {
                            setSelectedPropertyIds((prev) =>
                              e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)
                            );
                          }}
                        />
                        {p.name}
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}

            <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
              <button
                type="submit"
                disabled={inviting}
                style={{
                  height: 42,
                  padding: "0 22px",
                  background: C.primary,
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: bodyFont,
                  cursor: inviting ? "not-allowed" : "pointer",
                  opacity: inviting ? 0.7 : 1,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  transition: "background 0.15s ease, box-shadow 0.15s ease",
                }}
                onMouseEnter={(e) => { if (!inviting) e.currentTarget.style.background = C.primaryHover; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = C.primary; }}
              >
                <Plus size={17} /> {inviting ? "Skickar…" : "Bjud in användare"}
              </button>
            </div>

            {feedback && (
              <div
                style={{
                  marginTop: 16,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "12px 14px",
                  borderRadius: 8,
                  background: feedback.type === "ok" ? C.successBg : C.errorBg,
                  color: feedback.type === "ok" ? C.success : C.error,
                  fontSize: 13.5,
                  lineHeight: 1.5,
                }}
              >
                {feedback.type === "ok" ? (
                  <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                ) : (
                  <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                )}
                <span>{feedback.message}</span>
              </div>
            )}
          </form>

          {/* Users table */}
          <div style={{ ...panelStyle, overflow: "hidden" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 24px",
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Alla användare</span>
              <span style={{ fontSize: 12, color: C.muted }}>{profiles.length} st</span>
            </div>

            {isLoading ? (
              <div style={{ padding: 8 }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 24px" }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#EEF0EE" }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                      <div style={{ width: "30%", height: 10, borderRadius: 4, background: "#EEF0EE" }} />
                      <div style={{ width: "50%", height: 9, borderRadius: 4, background: "#F3F4F3" }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : profiles.length === 0 ? (
              <div style={{ padding: "48px 24px", textAlign: "center" }}>
                <Users size={28} color={C.muted} style={{ marginBottom: 10 }} />
                <div style={{ fontSize: 14, color: C.secondary }}>Inga användare ännu</div>
              </div>
            ) : isMobile ? (
              <div>
                {profiles.map((p) => (
                  <div
                    key={p.id}
                    style={{ display: "flex", gap: 12, padding: "16px 24px", borderBottom: `1px solid ${C.border}` }}
                  >
                    <Avatar name={p.full_name} url={p.avatar_url} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600, color: C.text, fontSize: 14 }}>{p.full_name ?? "—"}</div>
                      <div style={{ fontSize: 13, color: C.secondary, margin: "2px 0 8px" }}>
                        {p.email ?? "—"}{p.phone ? ` · ${p.phone}` : ""}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {p.role && <RoleBadge role={p.role} />}
                        <span style={{ fontSize: 12, color: C.muted }}>{fmtDate.format(new Date(p.created_at))}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignSelf: "flex-start" }}>
                      {p.role === "styrelse" && (
                        <button
                          type="button"
                          onClick={() => setAccessPanelUserId(p.id)}
                          title="Hantera åtkomst"
                          style={{ background: "transparent", border: "none", color: C.secondary, cursor: "pointer", padding: 6, display: "flex" }}
                        >
                          <KeyRound size={16} />
                        </button>
                      )}
                      {p.id !== user?.id && (
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id, p.full_name)}
                          disabled={deletingId === p.id}
                          title="Radera användare"
                          style={{ background: "transparent", border: "none", color: C.error, cursor: deletingId === p.id ? "not-allowed" : "pointer", padding: 6, opacity: deletingId === p.id ? 0.5 : 1, display: "flex" }}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Namn</th>
                    <th style={th}>E-post</th>
                    <th style={th}>Roll</th>
                    <th style={th}>Telefon</th>
                    <th style={th}>Skapad</th>
                    <th style={{ ...th, width: 1 }} />
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((p) => (
                    <tr
                      key={p.id}
                      style={{ transition: "background 0.12s ease" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFBFA")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <td style={td}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Avatar name={p.full_name} url={p.avatar_url} />
                          <span style={{ fontWeight: 600 }}>{p.full_name ?? "—"}</span>
                        </div>
                      </td>
                      <td style={{ ...td, color: C.secondary }}>{p.email ?? "—"}</td>
                      <td style={td}>{p.role ? <RoleBadge role={p.role} /> : "—"}</td>
                      <td style={{ ...td, color: C.secondary }}>{p.phone ?? "—"}</td>
                      <td style={{ ...td, color: C.muted }}>{fmtDate.format(new Date(p.created_at))}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          {p.role === "styrelse" && (
                            <button
                              type="button"
                              onClick={() => setAccessPanelUserId(p.id)}
                              title="Hantera åtkomst"
                              style={{ background: "transparent", border: "none", color: C.secondary, cursor: "pointer", padding: 6, display: "flex" }}
                            >
                              <KeyRound size={16} />
                            </button>
                          )}
                          {p.id !== user?.id && (
                            <button
                              type="button"
                              onClick={() => handleDelete(p.id, p.full_name)}
                              disabled={deletingId === p.id}
                              title="Radera användare"
                              style={{ background: "transparent", border: "none", color: C.error, cursor: deletingId === p.id ? "not-allowed" : "pointer", padding: 6, opacity: deletingId === p.id ? 0.5 : 1, display: "flex" }}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
        )}
      </div>

      {accessPanelUserId && (
        <StyrelseAccessDialog
          userId={accessPanelUserId}
          userName={profiles.find((p) => p.id === accessPanelUserId)?.full_name ?? null}
          allProperties={allProperties}
          onClose={() => setAccessPanelUserId(null)}
        />
      )}
    </div>
  );
}

function StyrelseAccessDialog({
  userId,
  userName,
  allProperties,
  onClose,
}: {
  userId: string;
  userName: string | null;
  allProperties: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: current, isLoading } = useQuery({
    queryKey: ["styrelse-properties", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("styrelse_properties").select("property_id").eq("profile_id", userId);
      if (error) throw error;
      return (data ?? []).map((r) => r.property_id as string);
    },
  });

  useEffect(() => {
    if (current) setSelected(current);
  }, [current]);

  async function handleSave() {
    setSaving(true);
    try {
      const before = new Set(current ?? []);
      const after = new Set(selected);
      const toAdd = selected.filter((id) => !before.has(id));
      const toRemove = (current ?? []).filter((id) => !after.has(id));

      if (toRemove.length > 0) {
        const { error } = await supabase
          .from("styrelse_properties")
          .delete()
          .eq("profile_id", userId)
          .in("property_id", toRemove);
        if (error) throw error;
      }
      if (toAdd.length > 0) {
        const { error } = await supabase
          .from("styrelse_properties")
          .insert(toAdd.map((property_id) => ({ profile_id: userId, property_id })));
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ["styrelse-properties", userId] });
      toast.success("Åtkomst uppdaterad");
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Något gick fel");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hantera åtkomst — {userName ?? "Styrelsemedlem"}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div style={{ padding: 16, color: C.secondary, fontSize: 14 }}>Laddar…</div>
        ) : (
          <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
            {allProperties.length === 0 ? (
              <div style={{ fontSize: 13, color: C.muted, padding: 8 }}>Inga fastigheter finns ännu</div>
            ) : (
              allProperties.map((p) => (
                <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", fontSize: 14, color: C.text, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={selected.includes(p.id)}
                    onChange={(e) => {
                      setSelected((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)));
                    }}
                  />
                  {p.name}
                </label>
              ))
            )}
          </div>
        )}
        <DialogFooter>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || isLoading}
            style={{ height: 40, padding: "0 20px", background: C.primary, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, fontFamily: bodyFont, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}
          >
            {saving ? "Sparar…" : "Spara"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
