import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

const INK = "#0D2B1E";
const GREEN = "#3D8A30";
const MUTED = "#6B7280";
const LINE = "#E3E7E2";
const GOLD = "#E8C464";

export type Apt = { id: string; apartment_number: string };
export type SuspicionKind = "avvikelse" | "inneboende" | "ej_kontrollerad";
export type Suspicion = {
  id: string;
  property_id: string;
  apartment_id: string | null;
  kind: SuspicionKind;
  note: string | null;
  observed_at: string;
  notify_board: boolean;
  status: string;
  resolution: string | null;
  created_at: string;
};

export const KIND_LABEL: Record<SuspicionKind, string> = {
  avvikelse: "Avvikelse – möjlig olovlig uthyrning",
  inneboende: "Inneboende – fler bor där än medlemmen",
  ej_kontrollerad: "Ej kontrollerad",
};
const KIND_COLOR: Record<SuspicionKind, string> = { avvikelse: "#C2334D", inneboende: "#F2B01E", ej_kontrollerad: "#6B7280" };

const todayIso = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function useSuspicions(propertyId: string, enabled = true) {
  return useQuery({
    queryKey: ["sub-sus", propertyId],
    enabled: enabled && !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sublet_suspicions")
        .select("*")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Suspicion[];
    },
  });
}

const field: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", height: 40, padding: "0 12px", borderRadius: 8,
  border: `1px solid ${LINE}`, fontSize: 14, fontFamily: "inherit", background: "#fff", color: INK,
};
const labelCss: React.CSSProperties = { fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED, marginBottom: 5, display: "block" };
const btn: React.CSSProperties = { height: 36, padding: "0 14px", borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${LINE}`, background: "#fff", color: INK };

/**
 * Misstänkt olovlig uthyrning. Används både i Andrahand-registret (alla lägenheter
 * i fastigheten, med lägenhetsval) och under en enskild lägenhet (apartmentId satt).
 */
export function SubletSuspicions({
  propertyId,
  apartmentId,
  apts,
}: {
  propertyId: string;
  apartmentId?: string;
  apts?: Apt[];
}) {
  const qc = useQueryClient();
  const q = useSuspicions(propertyId);
  const all = q.data ?? [];
  const rows = apartmentId ? all.filter((x) => x.apartment_id === apartmentId) : all;
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ apartment_id: "", kind: "avvikelse" as SuspicionKind, note: "", observed_at: todayIso(), notify_board: true });

  const refresh = () => void qc.invalidateQueries({ queryKey: ["sub-sus", propertyId] });
  const aptLabel = (id: string | null) => apts?.find((a) => a.id === id)?.apartment_number;

  const save = useMutation({
    mutationFn: async () => {
      const apt = apartmentId ?? f.apartment_id;
      if (!apt) throw new Error("Välj lägenhet.");
      const { error } = await supabase.from("sublet_suspicions").insert({
        property_id: propertyId,
        apartment_id: apt,
        kind: f.kind,
        note: f.note.trim() || null,
        observed_at: f.observed_at || todayIso(),
        notify_board: f.notify_board,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Markeringen är sparad", { style: { background: GREEN, color: "#fff" } });
      setOpen(false);
      setF({ apartment_id: "", kind: "avvikelse", note: "", observed_at: todayIso(), notify_board: true });
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patch = useMutation({
    mutationFn: async (v: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("sublet_suspicions").update(v.patch).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sublet_suspicions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: apartmentId ? 14 : 20, fontWeight: 800, color: INK, fontFamily: apartmentId ? undefined : "Outfit, Inter, system-ui, sans-serif" }}>
            Misstänkt olovlig uthyrning
          </div>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>
            Skriv sakligt och bara det som är observerat. Kryssa i "Styrelsen ska informeras" om styrelsen ska få veta.
          </div>
        </div>
        <button type="button" className="no-print" onClick={() => setOpen((v) => !v)} style={{ ...btn, background: open ? "#fff" : GREEN, color: open ? INK : "#fff", borderColor: open ? LINE : GREEN }}>
          {open ? "Stäng" : "+ Ny markering"}
        </button>
      </div>

      {open && (
        <div className="no-print" style={{ border: `2px solid ${GOLD}`, borderRadius: 12, padding: 14, display: "grid", gap: 12, background: "#fff" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            {!apartmentId && (
              <div>
                <label style={labelCss}>Lägenhet</label>
                <select style={field} value={f.apartment_id} onChange={(e) => setF({ ...f, apartment_id: e.target.value })}>
                  <option value="">Välj lägenhet</option>
                  {(apts ?? []).map((a) => (
                    <option key={a.id} value={a.id}>Lgh {a.apartment_number}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label style={labelCss}>Typ</label>
              <select style={field} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as SuspicionKind })}>
                {(Object.keys(KIND_LABEL) as SuspicionKind[]).map((k) => (
                  <option key={k} value={k}>{KIND_LABEL[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelCss}>Observerat</label>
              <input style={field} type="date" value={f.observed_at} onChange={(e) => setF({ ...f, observed_at: e.target.value })} />
            </div>
          </div>
          <div>
            <label style={labelCss}>Anteckning</label>
            <textarea
              style={{ ...field, height: "auto", minHeight: 80, padding: 10, resize: "vertical", lineHeight: 1.5 }}
              value={f.note}
              onChange={(e) => setF({ ...f, note: e.target.value })}
              placeholder="t.ex. Annat namn på dörren än medlemmens, ingen i lägenheten vid tre besök."
            />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600 }}>
            <input type="checkbox" checked={f.notify_board} onChange={(e) => setF({ ...f, notify_board: e.target.checked })} />
            Styrelsen ska informeras
          </label>
          <div>
            <button type="button" disabled={save.isPending} onClick={() => save.mutate()} style={{ ...btn, background: GREEN, borderColor: GREEN, color: "#fff" }}>
              {save.isPending ? "Sparar…" : "Spara markering"}
            </button>
          </div>
        </div>
      )}

      {q.error && <div style={{ color: "#B91C1C", fontSize: 13 }}>Kunde inte hämta markeringar: {(q.error as Error).message}</div>}
      {!q.isLoading && !q.error && rows.length === 0 && <div style={{ fontSize: 13.5, color: MUTED }}>Inga markeringar.</div>}

      {rows.map((x) => {
        const closed = x.status === "avslutad";
        const lbl = aptLabel(x.apartment_id);
        return (
          <div key={x.id} style={{ border: `1px solid ${LINE}`, borderLeft: `5px solid ${KIND_COLOR[x.kind]}`, borderRadius: 12, padding: "10px 14px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", opacity: closed ? 0.6 : 1, background: "#fff" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {!apartmentId && <span style={{ fontWeight: 800, color: INK }}>{lbl ? `Lgh ${lbl}` : "Lägenhet ej angiven"}</span>}
                <span style={{ fontSize: 12, fontWeight: 700, color: KIND_COLOR[x.kind] }}>{KIND_LABEL[x.kind]}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, background: closed ? "#F3F4F6" : "#FDE2E7", color: closed ? MUTED : "#8B1A2B", borderRadius: 999, padding: "2px 9px" }}>
                  {closed ? "Avslutad" : "Öppen"}
                </span>
                {x.notify_board && <span style={{ fontSize: 11.5, fontWeight: 700, background: GOLD, color: INK, borderRadius: 999, padding: "2px 9px" }}>Styrelsen ska informeras</span>}
              </div>
              <div style={{ fontSize: 13, color: MUTED, marginTop: 3 }}>Observerat {fmtDate(x.observed_at)}</div>
              {x.note && <div style={{ fontSize: 14, color: "#374151", marginTop: 4, whiteSpace: "pre-wrap" }}>{x.note}</div>}
              {x.resolution && <div style={{ fontSize: 13, color: "#2E6B24", marginTop: 4 }}>Utfall: {x.resolution}</div>}
            </div>
            <div className="no-print" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-start" }}>
              {!closed && (
                <button
                  type="button"
                  style={{ ...btn, height: 32 }}
                  onClick={() => {
                    const r = window.prompt("Hur avslutades ärendet? (till exempel: lovlig uthyrning anmäld, uthyrningen upphörd, ingen åtgärd)");
                    if (r !== null) patch.mutate({ id: x.id, patch: { status: "avslutad", resolution: r.trim() || null } });
                  }}
                >
                  Markera avslutad
                </button>
              )}
              {closed && (
                <button type="button" style={{ ...btn, height: 32 }} onClick={() => patch.mutate({ id: x.id, patch: { status: "ny", resolution: null } })}>
                  Öppna igen
                </button>
              )}
              <button type="button" style={{ ...btn, height: 32, color: "#B91C1C", borderColor: "#F1C0C0" }} onClick={() => { if (window.confirm("Ta bort markeringen?")) remove.mutate(x.id); }}>
                Ta bort
              </button>
            </div>
          </div>
        );
      })}

      <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
        Markeringarna är misstankar, inte konstaterade fakta, och innehåller personuppgifter. Gallra avslutade ärenden och dela dem bara med styrelsen.
      </div>
    </div>
  );
}
