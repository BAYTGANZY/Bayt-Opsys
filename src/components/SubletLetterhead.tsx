import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { Letterhead } from "@/lib/andrahand-print";

const INK = "#0D2B1E";
const GREEN = "#3D8A30";
const MUTED = "#6B7280";
const LINE = "#E3E7E2";

export async function fetchLetterhead(propertyId: string): Promise<Letterhead | null> {
  const { data, error } = await supabase.from("property_letterhead").select("*").eq("property_id", propertyId).maybeSingle();
  if (error) return null; // tabellen kan saknas — då skrivs utskriften utan brevhuvud
  return (data as Letterhead | null) ?? null;
}

// Förminskar loggan till högst 400 px så att den ryms som text i databasen.
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 400 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Bilden kunde inte läsas. Använd PNG eller JPG.")); };
    img.src = url;
  });
}

const FIELDS: { key: keyof Letterhead; label: string; ph: string }[] = [
  { key: "org_name", label: "Föreningens namn", ph: "Brf RTB" },
  { key: "org_number", label: "Organisationsnummer", ph: "769600-0000" },
  { key: "address", label: "Adress", ph: "Gatan 1, 123 45 Stad" },
  { key: "email", label: "E-post", ph: "styrelsen@forening.se" },
  { key: "phone", label: "Telefon", ph: "070-000 00 00" },
  { key: "website", label: "Hemsida", ph: "www.forening.se" },
];

export function SubletLetterhead({ propertyId, propertyName }: { propertyId: string; propertyName: string }) {
  const qc = useQueryClient();
  const [openForm, setOpenForm] = useState(false);
  const [draft, setDraft] = useState<Letterhead | null>(null);
  const q = useQuery({ queryKey: ["letterhead", propertyId], queryFn: () => fetchLetterhead(propertyId) });
  const cur: Letterhead = draft ?? q.data ?? { property_id: propertyId, org_name: propertyName };

  const save = useMutation({
    mutationFn: async () => {
      const row = { ...cur, property_id: propertyId, updated_at: new Date().toISOString() };
      const { data, error } = await supabase.from("property_letterhead").upsert(row, { onConflict: "property_id" }).select("property_id");
      if (error) throw new Error(/does not exist|schema cache|42P01|PGRST205/i.test(error.message) ? "Tabellen saknas. Kör SQL-filen andrahand-brevhuvud.sql i Supabase." : error.message);
      if (!data || data.length === 0) throw new Error("Du saknar behörighet att spara brevhuvudet.");
    },
    onSuccess: () => {
      toast.success("Brevhuvudet är sparat", { style: { background: GREEN, color: "#fff" } });
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ["letterhead", propertyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof Letterhead, v: string) => setDraft({ ...cur, [k]: v });
  const input: React.CSSProperties = { height: 38, padding: "0 10px", borderRadius: 8, border: `1px solid ${LINE}`, fontFamily: "inherit", fontSize: 14.5, width: "100%", boxSizing: "border-box", minWidth: 0 };

  return (
    <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 12 }}>
      <button type="button" onClick={() => setOpenForm((v) => !v)} style={{ background: "none", border: 0, padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 14.5, fontWeight: 600, color: INK }}>
        {openForm ? "▾" : "▸"} Brevhuvud på utskrifter (logga och kontaktuppgifter)
      </button>
      {openForm && (
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <div style={{ fontSize: 13.5, color: MUTED }}>Syns överst på utskrivna ansökningar och beslut. Ingen BAYT-logga skrivs ut.</div>
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            {cur.logo_data ? <img src={cur.logo_data} alt="Föreningens logga" style={{ maxHeight: 60, maxWidth: 160, objectFit: "contain", border: `1px solid ${LINE}`, borderRadius: 8, padding: 6 }} /> : <span style={{ color: MUTED, fontSize: 14 }}>Ingen logga uppladdad</span>}
            <label style={{ fontSize: 14, fontWeight: 600, color: INK, cursor: "pointer", border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 14px" }}>
              {cur.logo_data ? "Byt logga" : "Ladda upp logga"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: "none" }}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  try { set("logo_data", await shrink(f)); } catch (err) { toast.error((err as Error).message); }
                }}
              />
            </label>
            {cur.logo_data && (
              <button type="button" onClick={() => set("logo_data", "")} style={{ background: "none", border: 0, color: "#B91C1C", cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>
                Ta bort logga
              </button>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {FIELDS.map((f) => (
              <label key={f.key} style={{ display: "grid", gap: 4, fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: MUTED, minWidth: 0 }}>
                {f.label}
                <input style={input} value={(cur[f.key] as string) ?? ""} placeholder={f.ph} onChange={(e) => set(f.key, e.target.value)} />
              </label>
            ))}
          </div>
          <div>
            <button type="button" disabled={save.isPending || !draft} onClick={() => save.mutate()} style={{ height: 40, padding: "0 18px", borderRadius: 8, border: 0, background: GREEN, color: "#fff", fontWeight: 600, fontFamily: "inherit", fontSize: 14, cursor: save.isPending || !draft ? "not-allowed" : "pointer", opacity: save.isPending || !draft ? 0.6 : 1 }}>
              {save.isPending ? "Sparar …" : "Spara brevhuvud"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
