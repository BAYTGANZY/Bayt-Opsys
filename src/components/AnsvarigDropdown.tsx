import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { ChevronSelect } from "@/components/ChevronSelect";

const C = {
  border: "#E5E7EB",
  text: "#1a1a1a",
  secondary: "#6B7280",
  card: "#ffffff",
  primary: "#3D8A30",
  warn: "#B45309",
  warnBg: "#FFFBEB",
  warnBorder: "#FDE68A",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  height: 40,
  padding: "0 12px",
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  fontSize: 14,
  color: C.text,
  background: C.card,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 500,
  color: C.secondary,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 6,
};

type Contact = {
  id: string;
  full_name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  /** false = retired, see supabase-functions/contacts-active-flag.sql */
  active?: boolean | null;
};

const ADD_NEW = "__add_new__";

/** Samma tillåtande regel som EntreprenorEmailDialog — fånga uppenbara
 *  felstavningar, inte validera RFC 5322. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hasEmail(c: Contact | null | undefined): boolean {
  return !!(c?.email && c.email.trim());
}

/**
 * AnsvarigDropdown — assigns an entreprenör contact as the responsible
 * party on an issue/inspection/project. Lists entreprenör contacts only
 * (client decision: work can be assigned to entreprenörer, nothing else).
 * System-wide by design: not scoped to a single property, since a
 * contractor commonly works across several fastigheter.
 *
 * **En entreprenör utan e-postadress går inte att välja** (för admin — se
 * nedan). Att tilldela ett ärende är numera också att mejla ut det
 * (src/lib/entreprenor-notify.ts), så en kontakt utan adress är en
 * tilldelning som inte kan levereras. I stället för att neka och skicka bort
 * användaren till kontaktkortet öppnas ett litet fält här: adressen sparas på
 * kontakten och valet går igenom i samma rörelse. Kontakten markeras
 * "e-post saknas" redan i listan, så det syns före klicket.
 *
 * Icke-admin blockeras inte: de får ändå inte skriva i `contacts`, så en
 * spärr skulle bara vara en återvändsgränd. De ser varningen i stället.
 */
export function AnsvarigDropdown({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (contactId: string | null) => void;
}) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);

  // Kontakten som väntar på en adress.
  //   assignOnSave = true  → vald i listan, tilldelas när adressen sparats
  //   assignOnSave = false → redan tilldelad sedan tidigare, bara lagas
  const [emailFixFor, setEmailFixFor] = useState<{ id: string; assignOnSave: boolean } | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [savingEmail, setSavingEmail] = useState(false);

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts-entreprenorer"],
    queryFn: async () => {
      // select("*") on purpose. `active` is added by a hand-run migration
      // (supabase-functions/contacts-active-flag.sql); naming the column
      // explicitly would 400 the Ansvarig dropdown on every ärende form if the
      // frontend ships before that SQL is applied. With "*" a missing column
      // just leaves `active` undefined and nothing gets filtered out.
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("contact_type", "entreprenor")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as Contact[];
    },
  });

  const createContact = useMutation({
    mutationFn: async ({ name, email }: { name: string; email: string }) => {
      const { data, error } = await supabase
        .from("contacts")
        .insert({ property_id: null, full_name: name, email, contact_type: "entreprenor" } as never)
        .select("id, full_name, company, phone, email")
        .single();
      if (error) throw error;
      return data as Contact;
    },
    onSuccess: (created) => {
      // This dropdown reads ["contacts-entreprenorer"] — invalidating anything
      // else leaves every other mounted dropdown showing a stale list.
      qc.invalidateQueries({ queryKey: ["contacts-entreprenorer"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      onChange(created.id);
      setAdding(false);
      setNewName("");
      setNewEmail("");
    },
  });

  const selected = contacts.find((c) => c.id === value) ?? null;
  const fixing = emailFixFor ? contacts.find((c) => c.id === emailFixFor.id) ?? null : null;

  // Retired entreprenörer (active = false) drop out of the picker so only the
  // ones still in the system can be assigned. The one already assigned to this
  // ärende is the exception: it stays listed, marked "inaktiv", so an old
  // ärende keeps showing who was ansvarig instead of silently reading
  // "Ej tilldelad".
  const options = useMemo(() => {
    const live = contacts.filter((c) => c.active !== false);
    return selected && selected.active === false ? [...live, selected] : live;
  }, [contacts, selected]);

  function handleSelectChange(v: string) {
    if (v === ADD_NEW) {
      setAdding(true);
      return;
    }
    const picked = v ? contacts.find((c) => c.id === v) ?? null : null;
    // Utan adress går ärendet inte att mejla ut — be om den först, och
    // tilldela när den är sparad. Valet sker alltså inte här.
    if (picked && !hasEmail(picked) && isAdmin) {
      setEmailFixFor({ id: picked.id, assignOnSave: true });
      setEmailDraft("");
      setEmailError(null);
      return;
    }
    setEmailFixFor(null);
    onChange(v || null);
  }

  async function submitNewContact() {
    if (!newName.trim() || !EMAIL_RE.test(newEmail.trim()) || saving) return;
    setSaving(true);
    try {
      await createContact.mutateAsync({ name: newName.trim(), email: newEmail.trim() });
    } finally {
      setSaving(false);
    }
  }

  async function submitEmailFix() {
    if (!emailFixFor || savingEmail) return;
    const email = emailDraft.trim();
    if (!EMAIL_RE.test(email)) {
      setEmailError("Ange en giltig e-postadress.");
      return;
    }
    setSavingEmail(true);
    setEmailError(null);
    try {
      const { data: updated, error } = await supabase
        .from("contacts")
        .update({ email } as never)
        .eq("id", emailFixFor.id)
        .select("id");
      if (error) throw error;
      // En UPDATE som RLS filtrerar bort är 200 med noll rader — utan den här
      // kontrollen ser det ut som att adressen sparades.
      if (!updated?.length) throw new Error("Du saknar behörighet att spara e-postadressen.");
      qc.invalidateQueries({ queryKey: ["contacts-entreprenorer"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      if (emailFixFor.assignOnSave) onChange(emailFixFor.id);
      setEmailFixFor(null);
      setEmailDraft("");
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : "Kunde inte spara e-postadressen.");
    } finally {
      setSavingEmail(false);
    }
  }

  const smallButton = (bg: string, color: string, border: string): React.CSSProperties => ({
    height: 40, padding: "0 14px", background: bg, color, border,
    borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: "pointer",
  });

  return (
    <div style={{ minWidth: 0 }}>
      <label style={labelStyle}>Entreprenör</label>

      {adding ? (
        <div style={{ display: "grid", gap: 8 }}>
          <input
            autoFocus
            style={inputStyle}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Namn på entreprenör"
          />
          {/* E-post krävs redan här: en ny entreprenör utan adress skulle
              skapas bara för att omedelbart fastna i e-postspärren ovan. */}
          <input
            type="email"
            style={inputStyle}
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); submitNewContact(); }
              if (e.key === "Escape") { setAdding(false); setNewName(""); setNewEmail(""); }
            }}
            placeholder="E-post (ärenden skickas hit)"
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={submitNewContact}
              disabled={!newName.trim() || !EMAIL_RE.test(newEmail.trim()) || saving}
              style={{
                ...smallButton(C.primary, "#fff", "none"),
                cursor: !newName.trim() || !EMAIL_RE.test(newEmail.trim()) || saving ? "not-allowed" : "pointer",
                opacity: !newName.trim() || !EMAIL_RE.test(newEmail.trim()) || saving ? 0.7 : 1,
              }}
            >
              {saving ? "Lägger till…" : "Lägg till"}
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setNewName(""); setNewEmail(""); }}
              style={{ ...smallButton("transparent", C.secondary, `1px solid ${C.border}`), fontWeight: 500 }}
            >
              Avbryt
            </button>
          </div>
        </div>
      ) : (
        <>
          <ChevronSelect
            style={inputStyle}
            value={value ?? ""}
            onChange={(e) => handleSelectChange(e.target.value)}
          >
            <option value="">Ej tilldelad</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}{c.company ? ` (${c.company})` : ""}{c.active === false ? " — inaktiv" : ""}
                {!hasEmail(c) ? " — e-post saknas" : ""}
              </option>
            ))}
            {isAdmin && <option value={ADD_NEW}>+ Lägg till entreprenör</option>}
          </ChevronSelect>

          {emailFixFor && (
            <div
              style={{
                marginTop: 8, padding: 12, background: C.warnBg,
                border: `1px solid ${C.warnBorder}`, borderRadius: 8, display: "grid", gap: 8,
              }}
            >
              <div style={{ fontSize: 13, color: C.warn, lineHeight: 1.5 }}>
                {fixing?.full_name ?? "Entreprenören"} har ingen e-postadress. Ärenden skickas dit,
                så adressen måste finnas {emailFixFor.assignOnSave ? "innan hen kan väljas" : "för att ärendet ska kunna skickas"}.
              </div>
              <input
                autoFocus
                type="email"
                style={inputStyle}
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); submitEmailFix(); }
                  if (e.key === "Escape") { setEmailFixFor(null); setEmailDraft(""); setEmailError(null); }
                }}
                placeholder="namn@foretag.se"
              />
              {emailError && <div style={{ fontSize: 12.5, color: "#DC2626" }}>{emailError}</div>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={submitEmailFix}
                  disabled={savingEmail}
                  style={{ ...smallButton(C.primary, "#fff", "none"), opacity: savingEmail ? 0.7 : 1 }}
                >
                  {savingEmail ? "Sparar…" : emailFixFor.assignOnSave ? "Spara och välj" : "Spara e-post"}
                </button>
                <button
                  type="button"
                  onClick={() => { setEmailFixFor(null); setEmailDraft(""); setEmailError(null); }}
                  style={{ ...smallButton("transparent", C.secondary, `1px solid ${C.border}`), fontWeight: 500 }}
                >
                  Avbryt
                </button>
              </div>
            </div>
          )}

          {selected?.active === false && (
            <div style={{ fontSize: 13, color: C.warn, marginTop: 6 }}>
              Den här entreprenören finns inte kvar i systemet — namnet står kvar för historiken.
            </div>
          )}
          {selected && !hasEmail(selected) && !emailFixFor && (
            <div style={{ fontSize: 13, color: C.warn, marginTop: 6 }}>
              Entreprenören saknar e-postadress — ärendet kan inte mejlas ut.{" "}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => { setEmailFixFor({ id: selected.id, assignOnSave: false }); setEmailDraft(""); setEmailError(null); }}
                  style={{
                    background: "none", border: "none", padding: 0, color: C.primary,
                    fontSize: 13, fontWeight: 600, cursor: "pointer", textDecoration: "underline",
                  }}
                >
                  Lägg till e-post
                </button>
              )}
            </div>
          )}
          {selected && (selected.phone || selected.email) && (
            <div style={{ fontSize: 13, color: C.secondary, marginTop: 6 }}>
              {[selected.phone, selected.email].filter(Boolean).join(" · ")}
            </div>
          )}
        </>
      )}
    </div>
  );
}
