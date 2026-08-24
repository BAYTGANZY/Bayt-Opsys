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

/**
 * AnsvarigDropdown — assigns an entreprenör contact as the responsible
 * party on an issue/inspection/project. Lists entreprenör contacts only
 * (client decision: work can be assigned to entreprenörer, nothing else).
 * System-wide by design: not scoped to a single property, since a
 * contractor commonly works across several fastigheter.
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
  const [saving, setSaving] = useState(false);

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
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from("contacts")
        .insert({ property_id: null, full_name: name, contact_type: "entreprenor" } as never)
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
    },
  });

  const selected = contacts.find((c) => c.id === value) ?? null;

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
    onChange(v || null);
  }

  async function submitNewContact() {
    if (!newName.trim() || saving) return;
    setSaving(true);
    try {
      await createContact.mutateAsync(newName.trim());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ minWidth: 0 }}>
      <label style={labelStyle}>Entreprenör</label>

      {adding ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            autoFocus
            style={{ ...inputStyle, flex: 1, minWidth: 140 }}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); submitNewContact(); }
              if (e.key === "Escape") { setAdding(false); setNewName(""); }
            }}
            placeholder="Namn på entreprenör"
          />
          <button
            type="button"
            onClick={submitNewContact}
            disabled={!newName.trim() || saving}
            style={{
              height: 40, padding: "0 14px", background: C.primary, color: "#fff",
              border: "none", borderRadius: 6, fontSize: 14, fontWeight: 600,
              cursor: !newName.trim() || saving ? "not-allowed" : "pointer",
              opacity: !newName.trim() || saving ? 0.7 : 1,
            }}
          >
            {saving ? "Lägger till…" : "Lägg till"}
          </button>
          <button
            type="button"
            onClick={() => { setAdding(false); setNewName(""); }}
            style={{
              height: 40, padding: "0 14px", background: "transparent", color: C.secondary,
              border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 14, fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Avbryt
          </button>
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
              </option>
            ))}
            {isAdmin && <option value={ADD_NEW}>+ Lägg till entreprenör</option>}
          </ChevronSelect>
          {selected?.active === false && (
            <div style={{ fontSize: 13, color: "#B45309", marginTop: 6 }}>
              Den här entreprenören finns inte kvar i systemet — namnet står kvar för historiken.
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
