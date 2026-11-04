import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { SubletSuspicions } from "@/components/SubletSuspicions";

const INK = "#0D2B1E";
const GREEN = "#3D8A30";
const MUTED = "#6B7280";
const LINE = "#E3E7E2";
const GOLD = "#E8C464";
const DEFAULT_FEE = 5920;
const REASONS = ["Provsamboende", "Arbete eller studier på annan ort", "Sjukdom eller vård", "Tillfälligt boende", "Annat"];

type Row = {
  id: string;
  member_name: string | null;
  tenant_name: string;
  tenant_contact: string | null;
  start_date: string;
  end_date: string | null;
  reason: string | null;
  insurance_ok: boolean;
  tenant_rent: number | null;
};

const fmt = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" }) : "tills vidare";

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((new Date(`${iso}T00:00:00`).getTime() - today) / 86400000);
}

const field: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", height: 40, padding: "0 12px", borderRadius: 8,
  border: `1px solid ${LINE}`, fontSize: 14, fontFamily: "inherit", background: "#fff", color: INK,
};
const label: React.CSSProperties = { fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED, marginBottom: 5, display: "block" };
const btn: React.CSSProperties = { height: 38, padding: "0 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${LINE}`, background: "#fff", color: INK };

export function ApartmentSublet({
  propertyId,
  apartmentId,
  memberName,
}: {
  propertyId: string;
  apartmentId: string;
  memberName?: string | null;
}) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    member_name: memberName ?? "",
    tenant_name: "",
    tenant_contact: "",
    start_date: "",
    end_date: "",
    reason: "",
    tenant_rent: "",
    insurance_ok: false,
  });

  const q = useQuery({
    queryKey: ["apt-sublets", apartmentId],
    enabled: isAdmin && !!apartmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sublettings")
        .select("id, member_name, tenant_name, tenant_contact, start_date, end_date, reason, insurance_ok, tenant_rent")
        .eq("apartment_id", apartmentId)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const rows = q.data ?? [];

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["apt-sublets", apartmentId] });
    void qc.invalidateQueries({ queryKey: ["subs", propertyId] });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!f.tenant_name.trim()) throw new Error("Ange hyresgästens namn.");
      if (!f.start_date) throw new Error("Ange startdatum.");
      if (f.end_date && f.end_date < f.start_date) throw new Error("Slutdatum kan inte vara före startdatum.");
      const rent = f.tenant_rent.trim() === "" ? null : Number(f.tenant_rent.replace(/\s/g, "").replace(",", "."));
      const { error } = await supabase.from("sublettings").insert({
        property_id: propertyId,
        apartment_id: apartmentId,
        member_name: f.member_name.trim() || null,
        tenant_name: f.tenant_name.trim(),
        tenant_contact: f.tenant_contact.trim() || null,
        start_date: f.start_date,
        end_date: f.end_date || null,
        reason: f.reason || null,
        permit_status: "godkand",
        insurance_ok: f.insurance_ok,
        fee_per_year: DEFAULT_FEE,
        tenant_rent: rent,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Andrahandsuthyrningen är registrerad", { style: { background: GREEN, color: "#fff" } });
      setOpen(false);
      setF({ ...f, tenant_name: "", tenant_contact: "", start_date: "", end_date: "", reason: "", tenant_rent: "", insurance_ok: false });
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sublettings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) return null;

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  return (
    <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 24, paddingTop: 20, maxWidth: 720, display: "grid", gap: 24 }}>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>Andrahand</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>Information om uthyrning av den här lägenheten.</div>
          </div>
          <button type="button" onClick={() => setOpen((v) => !v)} style={{ ...btn, background: open ? "#fff" : GREEN, color: open ? INK : "#fff", borderColor: open ? LINE : GREEN }}>
            {open ? "Stäng" : "+ Registrera andrahand"}
          </button>
        </div>

        {open && (
          <div style={{ marginTop: 14, border: `2px solid ${GOLD}`, borderRadius: 12, padding: 14, display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={label}>Medlem (hyr ut)</label>
                <input style={field} value={f.member_name} onChange={set("member_name")} />
              </div>
              <div>
                <label style={label}>Hyresgäst *</label>
                <input style={field} value={f.tenant_name} onChange={set("tenant_name")} />
              </div>
            </div>
            <div>
              <label style={label}>Hyresgästens kontakt</label>
              <input style={field} value={f.tenant_contact} onChange={set("tenant_contact")} placeholder="telefon eller e-post" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={label}>Startdatum *</label>
                <input style={field} type="date" value={f.start_date} onChange={set("start_date")} />
              </div>
              <div>
                <label style={label}>Slutdatum (tomt = tills vidare)</label>
                <input style={field} type="date" value={f.end_date} onChange={set("end_date")} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={label}>Skäl</label>
                <select style={field} value={f.reason} onChange={set("reason")}>
                  <option value="">Välj skäl</option>
                  {REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={label}>Hyra till medlemmen (kr/mån)</label>
                <input style={field} value={f.tenant_rent} onChange={set("tenant_rent")} placeholder="t.ex. 9000" />
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <input type="checkbox" checked={f.insurance_ok} onChange={(e) => setF({ ...f, insurance_ok: e.target.checked })} />
              Försäkringsbrev finns
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" disabled={save.isPending} onClick={() => save.mutate()} style={{ ...btn, background: GREEN, borderColor: GREEN, color: "#fff" }}>
                {save.isPending ? "Sparar…" : "Spara"}
              </button>
              <button type="button" onClick={() => setOpen(false)} style={btn}>Avbryt</button>
            </div>
          </div>
        )}

        {q.error && <div style={{ color: "#B91C1C", fontSize: 13, marginTop: 10 }}>Kunde inte hämta: {(q.error as Error).message}. Har du kört SQL:en?</div>}
        {!q.isLoading && !q.error && rows.length === 0 && !open && (
          <div style={{ fontSize: 13, color: MUTED, marginTop: 10 }}>Ingen andrahandsuthyrning registrerad.</div>
        )}

        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {rows.map((r) => {
            const d = daysLeft(r.end_date);
            const ended = d != null && d < 0;
            const hot = !ended && d != null && d <= 30;
            const badge = ended ? "Avslutad" : d != null && d <= 90 ? `Löper ut om ${d} dagar` : "Aktiv";
            return (
              <div key={r.id} style={{ border: `1px solid ${LINE}`, borderLeft: `4px solid ${hot ? "#C2334D" : ended ? "#9CA3AF" : GREEN}`, borderRadius: 10, padding: "10px 12px", opacity: ended ? 0.7 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ fontWeight: 700, color: INK, fontSize: 14 }}>{r.tenant_name}</div>
                  <span style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: "2px 10px", background: hot ? "#FDE2E7" : "rgba(92,184,74,0.14)", color: hot ? "#8B1A2B" : "#2E6B24" }}>{badge}</span>
                </div>
                <div style={{ fontSize: 13, color: "#374151", marginTop: 4, lineHeight: 1.6 }}>
                  {fmt(r.start_date)} till {fmt(r.end_date)}
                  {r.reason ? ` · ${r.reason}` : ""}
                  {r.tenant_contact ? ` · ${r.tenant_contact}` : ""}
                  <br />
                  Försäkring: {r.insurance_ok ? "finns" : "saknas"}
                  {r.tenant_rent ? ` · Hyra: ${Math.round(r.tenant_rent).toLocaleString("sv-SE")} kr/mån` : ""}
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 6, alignItems: "center" }}>
                  <Link to="/andrahand" style={{ fontSize: 13, fontWeight: 600, color: GREEN, textDecoration: "none" }}>
                    Se i registret (bilagor, redigera) →
                  </Link>
                  <button
                    type="button"
                    onClick={() => { if (window.confirm("Ta bort uthyrningen? Det går inte att ångra.")) remove.mutate(r.id); }}
                    style={{ background: "none", border: "none", color: "#B91C1C", fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: 0 }}
                  >
                    Ta bort
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 20 }}>
        <SubletSuspicions propertyId={propertyId} apartmentId={apartmentId} />
      </div>
    </div>
  );
}
