import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { confirmDialog } from "@/components/ConfirmDialog";

/**
 * Länkkorten för Ekonomisk förvaltning, för EN förening (fastighet).
 *
 * Varje kort hör till exakt en fastighet (`forvaltning_links.property_id`). Det finns inga
 * gemensamma kort: en styrelse ska bara se sin egen förenings genvägar, och RLS-policyn
 * `forvaltning_links_select` (admin, eller styrelse via my_property_ids()) är det som faktiskt
 * håller isär föreningarna — filtret här är bara för att admin ska se en förening i taget.
 *
 * Används på två ställen: fastighetens Ekonomi-sida (/properties/:id/ekonomi, fliken
 * Förvaltning) och den fristående /ekonomisk-forvaltning med föreningsväljare.
 */
const INK = "#0D2B1E";
const GREEN = "#3D8A30";
const MUTED = "#6B7280";
const LINE = "#E3E7E2";
const CARD = "#FFFDF8";

type LinkRow = {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  sort_order: number;
};

/** Förslag som admin kan lägga in med ett klick. De saknar länk tills programmet är valt. */
const SUGGESTIONS: Array<{ title: string; description: string }> = [
  { title: "Bokföring", description: "Föreningens bokföring och redovisning." },
  { title: "Avisering och avgifter", description: "Månadsavgifter, avier och påminnelser." },
  { title: "Fakturahantering", description: "Leverantörsfakturor och attest." },
  { title: "Årsredovisning och budget", description: "Bokslut, budget och uppföljning." },
];

/** Gör om det admin skrivit till en säker webbadress, eller null. Bara http(s) släpps igenom —
 *  ett "javascript:"-värde som sparas här skulle annars köras när någon klickar på kortet. */
function normalizeUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function ForvaltningLinks({ propertyId }: { propertyId: string }) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const qc = useQueryClient();

  // Tabellen kommer från en handkörd migration. Saknas den ska sidan visa en tydlig notis,
  // aldrig gå sönder — samma hållning som contacts.active och contact_delegations.
  const q = useQuery({
    queryKey: ["forvaltning-links", propertyId],
    queryFn: async (): Promise<{ rows: LinkRow[]; missing: boolean }> => {
      const { data, error } = await supabase
        .from("forvaltning_links")
        .select("*")
        .eq("property_id", propertyId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) return { rows: [], missing: true };
      return { rows: (data ?? []) as LinkRow[], missing: false };
    },
  });

  const [editing, setEditing] = useState<LinkRow | "new" | null>(null);

  const refresh = () => void qc.invalidateQueries({ queryKey: ["forvaltning-links", propertyId] });

  const save = useMutation({
    mutationFn: async (v: { id?: string; title: string; description: string; url: string }) => {
      const title = v.title.trim();
      if (!title) throw new Error("Skriv en rubrik.");
      let url: string | null = null;
      if (v.url.trim()) {
        url = normalizeUrl(v.url);
        if (!url) throw new Error("Länken verkar inte vara en giltig webbadress (börja gärna med https://).");
      }
      const payload = { title, description: v.description.trim() || null, url };
      if (v.id) {
        const { data, error } = await supabase.from("forvaltning_links").update(payload).eq("id", v.id).select("id");
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("Ändringen sparades inte (saknar behörighet).");
      } else {
        const next = (q.data?.rows.reduce((m, r) => Math.max(m, r.sort_order), 0) ?? 0) + 10;
        const { data, error } = await supabase.from("forvaltning_links").insert({ ...payload, property_id: propertyId, sort_order: next }).select("id");
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("Länken sparades inte (saknar behörighet).");
      }
    },
    onSuccess: () => {
      toast.success("Sparat");
      setEditing(null);
      refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Kunde inte spara"),
  });

  const remove = async (r: LinkRow) => {
    const ok = await confirmDialog({
      title: "Ta bort kortet?",
      message: `”${r.title}” tas bort från sidan. Det går inte att ångra.`,
      confirmLabel: "Ta bort",
      danger: true,
    });
    if (!ok) return;
    const { data, error } = await supabase.from("forvaltning_links").delete().eq("id", r.id).select("id");
    if (error || !data || data.length === 0) {
      toast.error("Kunde inte ta bort kortet.");
      return;
    }
    toast.success("Borttaget");
    refresh();
  };

  const addSuggestions = useMutation({
    mutationFn: async () => {
      const base = (q.data?.rows.reduce((m, r) => Math.max(m, r.sort_order), 0) ?? 0) + 10;
      const rows = SUGGESTIONS.map((s, i) => ({ ...s, url: null, property_id: propertyId, sort_order: base + i * 10 }));
      const { data, error } = await supabase.from("forvaltning_links").insert(rows).select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Inget lades till (saknar behörighet).");
    },
    onSuccess: () => {
      toast.success("Förslagen lades till");
      refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Kunde inte lägga till"),
  });

  const rows = q.data?.rows ?? [];
  // Styrelse ser bara kort som faktiskt leder någonstans. Ett kort utan länk är en förberedelse för admin.
  const visible = isAdmin ? rows : rows.filter((r) => !!r.url);

  return (
    <div>
      {q.data?.missing && isAdmin && (
        <div style={{ background: "#FEF3C7", border: "1px solid #E8C464", borderRadius: 12, padding: "14px 16px", marginBottom: 20, fontSize: 15, lineHeight: 1.5 }}>
          Tabellen för länkar finns inte i databasen än. Kör filen <b>forvaltning-lankar.sql</b> i Supabase, så fungerar sidan.
        </div>
      )}

      {isAdmin && !q.data?.missing && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
          <button type="button" onClick={() => setEditing("new")} style={btn(true)}>
            + Lägg till länk
          </button>
          {rows.length === 0 && (
            <button type="button" onClick={() => addSuggestions.mutate()} disabled={addSuggestions.isPending} style={btn(false)}>
              Lägg in förslag på kort
            </button>
          )}
        </div>
      )}

      {editing && (
        <EditForm
          key={editing === "new" ? "new" : editing.id}
          row={editing === "new" ? null : editing}
          busy={save.isPending}
          onCancel={() => setEditing(null)}
          onSave={(v) => save.mutate({ id: editing === "new" ? undefined : editing.id, ...v })}
        />
      )}

      {q.isLoading ? (
        <p style={{ color: MUTED }}>Hämtar …</p>
      ) : visible.length === 0 ? (
        <p style={{ color: MUTED, fontSize: 16 }}>
          {isAdmin ? "Inga kort än. Lägg till en länk eller använd förslagen ovan." : "Inga genvägar är inlagda än."}
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {visible.map((r) => (
            <div key={r.id} style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
              <div style={{ fontFamily: "Outfit, Inter, sans-serif", fontSize: 21, fontWeight: 600, overflowWrap: "anywhere" }}>{r.title}</div>
              {r.description && <div style={{ color: MUTED, fontSize: 15, lineHeight: 1.5, overflowWrap: "anywhere" }}>{r.description}</div>}
              <div style={{ marginTop: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ ...btn(true), textDecoration: "none", display: "inline-block" }}>
                    Öppna
                  </a>
                ) : (
                  <span style={{ fontSize: 14, color: MUTED }}>Länk läggs in senare</span>
                )}
                {isAdmin && (
                  <>
                    <button type="button" onClick={() => setEditing(r)} style={btn(false)}>
                      Ändra
                    </button>
                    <button type="button" onClick={() => void remove(r)} style={{ ...btn(false), color: "#C2334D" }}>
                      Ta bort
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function btn(primary: boolean): React.CSSProperties {
  return {
    height: 40,
    padding: "0 16px",
    borderRadius: 10,
    border: primary ? "none" : `1px solid ${LINE}`,
    background: primary ? GREEN : "#fff",
    color: primary ? "#fff" : INK,
    fontSize: 15,
    fontWeight: 600,
    fontFamily: "inherit",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
  };
}

function EditForm({
  row,
  busy,
  onCancel,
  onSave,
}: {
  row: LinkRow | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (v: { title: string; description: string; url: string }) => void;
}) {
  const [title, setTitle] = useState(row?.title ?? "");
  const [description, setDescription] = useState(row?.description ?? "");
  const [url, setUrl] = useState(row?.url ?? "");
  const field: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    height: 44,
    borderRadius: 10,
    border: `1px solid ${LINE}`,
    padding: "0 12px",
    fontSize: 16,
    fontFamily: "inherit",
    background: "#fff",
  };
  const label: React.CSSProperties = { fontSize: 13, color: MUTED, marginBottom: 6, display: "block" };
  return (
    <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 20, marginBottom: 20, display: "grid", gap: 14, minWidth: 0 }}>
      <div>
        <label style={label}>Rubrik</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={field} placeholder="t.ex. Bokföring" />
      </div>
      <div>
        <label style={label}>Kort beskrivning (valfritt)</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} style={field} />
      </div>
      <div>
        <label style={label}>Länk till programmet (kan fyllas i senare)</label>
        <input value={url} onChange={(e) => setUrl(e.target.value)} style={field} placeholder="https://" inputMode="url" />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" disabled={busy} onClick={() => onSave({ title, description, url })} style={btn(true)}>
          {busy ? "Sparar …" : "Spara"}
        </button>
        <button type="button" onClick={onCancel} style={btn(false)}>
          Avbryt
        </button>
      </div>
    </div>
  );
}
