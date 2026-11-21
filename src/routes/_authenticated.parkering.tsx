import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useVisibleProperties } from "@/hooks/useVisibleProperties";
import { confirmDialog } from "@/components/ConfirmDialog";
import { normalizeApartmentNumber, normalizeTrappa, TRAPPA_PLACEHOLDER } from "@/lib/apartment-tokens";
import { isStaff } from "@/lib/permissions";

/**
 * Parkeringskön — den som ställt sig i kö via /parkering-ko (edge-funktionen submit-parkering).
 * Köplatsen är `queued_at`: först in, först ut, per förening och typ. Admin och styrelse
 * (sin egen förening, via RLS) ser kön, erbjuder och tilldelar platser och kan lägga in någon
 * som hört av sig på annat sätt. Bara admin raderar. Se CLAUDE.md, "Parkeringskö".
 */
export const Route = createFileRoute("/_authenticated/parkering")({
  head: () => ({ meta: [{ title: "Parkeringskö — BAYT" }] }),
  component: ParkeringPage,
});

const INK = "#0D2B1E";
const GREEN = "#3D8A30";
const MUTED = "#6B7280";
const LINE = "#E3E7E2";
const GOLD = "#E8C464";
const GOLD_SOFT = "rgba(232,196,100,0.16)";

type Status = "vantar" | "erbjuden" | "tilldelad" | "struken";
type Entry = {
  id: string;
  reference: string;
  property_id: string;
  kind: "parkering" | "garage";
  apartment_number: string;
  trappa: string | null;
  name: string;
  email: string;
  phone: string | null;
  vehicle_reg: string | null;
  note: string | null;
  status: Status;
  staff_note: string | null;
  spot_label: string | null;
  source: "webb" | "styrelse";
  handled_by_name: string | null;
  handled_at: string | null;
  queued_at: string;
};

const KINDS: Array<{ key: Entry["kind"]; label: string }> = [
  { key: "parkering", label: "Parkeringsplats" },
  { key: "garage", label: "Garageplats" },
];
const STATUS_LABEL: Record<Status, string> = { vantar: "Väntar", erbjuden: "Erbjuden", tilldelad: "Tilldelad", struken: "Struken" };
const STATUS_STYLE: Record<Status, { bg: string; fg: string }> = {
  vantar: { bg: "#F3F4F6", fg: "#374151" },
  erbjuden: { bg: "#FEF3C7", fg: "#92400E" },
  tilldelad: { bg: "#DCFCE7", fg: "#166534" },
  struken: { bg: "#FEE2E2", fg: "#991B1B" },
};

const STYLES = `
  .pk-btn { height: 36px; padding: 0 14px; border-radius: 8px; font-size: 13.5px; font-weight: 600; cursor: pointer; font-family: inherit; background: #fff; color: #0D2B1E; border: 1px solid #E3E7E2; }
  .pk-btn:hover { border-color: #3D8A30; }
  .pk-btn:disabled { opacity: .6; cursor: not-allowed; }
  .pk-btn.pk-primary { background: #3D8A30; border-color: #3D8A30; color: #fff; height: 40px; }
  .pk-btn.pk-danger { color: #B42318; }
  .pk-input { height: 40px; padding: 0 12px; border: 1px solid #E3E7E2; border-radius: 8px; font: inherit; font-size: 14px; background: #fff; min-width: 0; max-width: 100%; box-sizing: border-box; }
`;

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" });
const aptText = (e: Entry) => `${e.apartment_number}${e.trappa ? ` · trappa ${e.trappa}` : ""}`;

function ParkeringPage() {
  const isMobile = useIsMobile();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const canUse = isStaff(profile?.role) || profile?.role === "styrelse";
  const { allowedIds } = useVisibleProperties();
  const qc = useQueryClient();
  const [propertyId, setPropertyId] = useState("");
  const [kind, setKind] = useState<Entry["kind"]>("parkering");
  const [showClosed, setShowClosed] = useState(false);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const propsQ = useQuery({
    queryKey: ["parkering-properties", profile?.role],
    enabled: canUse,
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
  const properties = (propsQ.data ?? []).filter((p) => !allowedIds || allowedIds.has(p.id));
  const activeProperty = propertyId && properties.some((p) => p.id === propertyId) ? propertyId : properties[0]?.id ?? "";
  const propertyName = properties.find((p) => p.id === activeProperty)?.name ?? "";

  const q = useQuery({
    queryKey: ["parking-queue", activeProperty],
    enabled: canUse && !!activeProperty,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("parking_queue").select("*").eq("property_id", activeProperty).order("queued_at", { ascending: true }).order("reference", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
  });
  const all = q.data ?? [];
  const missingTable = !!q.error && /does not exist|relation/i.test((q.error as Error).message);

  const refresh = () => void qc.invalidateQueries({ queryKey: ["parking-queue"] });

  const ofKind = all.filter((e) => e.kind === kind);
  const active = ofKind.filter((e) => e.status === "vantar" || e.status === "erbjuden");
  const closed = ofKind.filter((e) => e.status === "tilldelad" || e.status === "struken");
  const positionOf = useMemo(() => new Map(active.map((e, i) => [e.id, i + 1])), [active]);
  const needle = search.trim().toLowerCase();
  const matches = (e: Entry) => !needle || [e.name, e.email, e.apartment_number, e.reference, e.vehicle_reg ?? "", e.spot_label ?? ""].some((v) => v.toLowerCase().includes(needle));

  /** Alla statusändringar går hit. .select("id") — en UPDATE som RLS stoppar ger 200 med noll rader. */
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Entry> }) => {
      const { data, error } = await supabase
        .from("parking_queue")
        .update({ ...patch, handled_by_name: profile?.full_name ?? null, handled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Ändringen sparades inte (saknar behörighet).");
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from("parking_queue").delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Raden raderades inte.");
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  /**
   * Flytta en plats i kön. Köplatsen är queued_at, så att flytta är att ge raden en tid mellan grannarna
   * (mitt emellan de två raderna där den ska hamna, eller en minut utanför kanten). Är grannarna för tätt
   * (samma millisekund) byter raderna tid med varandra i stället.
   */
  const move = useMutation({
    mutationFn: async ({ e, dir }: { e: Entry; dir: -1 | 1 }) => {
      const i = active.findIndex((x) => x.id === e.id);
      const near = active[i + dir];
      if (!near) return;
      const far = active[i + 2 * dir];
      const t = (x: Entry) => new Date(x.queued_at).getTime();
      const write = async (id: string, ms: number) => {
        const { data, error } = await supabase
          .from("parking_queue")
          .update({ queued_at: new Date(ms).toISOString(), handled_by_name: profile?.full_name ?? null, handled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", id)
          .select("id");
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("Ändringen sparades inte (saknar behörighet).");
      };
      const gap = far ? Math.abs(t(near) - t(far)) : Infinity;
      if (gap > 2) {
        await write(e.id, far ? Math.round((t(near) + t(far)) / 2) : t(near) + dir * 60_000);
      } else {
        const mine = t(e);
        await write(e.id, t(near));
        await write(near.id, mine);
      }
    },
    onSuccess: refresh,
    onError: (err: Error) => toast.error(err.message),
  });

  const offer = async (e: Entry) => {
    const spot = window.prompt(`Vilken plats erbjuds ${e.name}? (t.ex. P-plats 14, garage 3)`, e.spot_label ?? "");
    if (spot === null) return;
    try {
      await update.mutateAsync({ id: e.id, patch: { status: "erbjuden", spot_label: spot.trim() || null } });
    } catch {
      return;
    }
    const { data: d, error: err } = await supabase.functions.invoke("submit-parkering", { body: { action: "offer", id: e.id } });
    if (err || !d?.success) toast.error(d?.error ?? "Platsen erbjöds, men mejlet till personen kunde inte skickas. Kontakta hen själv.");
    else toast.success(`Erbjudandet mejlades till ${e.email}`);
  };
  const assign = async (e: Entry) => {
    const spot = window.prompt(`Vilken plats har ${e.name} fått? (t.ex. P-plats 14, garage 3)`, e.spot_label ?? "");
    if (spot === null) return;
    update.mutate({ id: e.id, patch: { status: "tilldelad", spot_label: spot.trim() || null } });
  };
  const strike = async (e: Entry) => {
    if (await confirmDialog({ title: "Stryk ur kön?", message: `${e.name} (lgh ${aptText(e)}) tas ur kön. Raden ligger kvar i listan som struken.`, confirmLabel: "Stryk", danger: true })) {
      update.mutate({ id: e.id, patch: { status: "struken" } });
    }
  };
  const del = async (e: Entry) => {
    if (await confirmDialog({ title: "Radera helt?", message: `${e.name} (${e.reference}) raderas för alltid. Det går inte att ångra.`, confirmLabel: "Radera", danger: true })) {
      remove.mutate(e.id);
    }
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/parkering-ko?forening=${activeProperty}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Länken till köanmälan är kopierad");
    } catch {
      window.prompt("Kopiera länken:", url);
    }
  };

  const exportCsv = () => {
    const quote = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Plats i kön", "Typ", "Status", "Namn", "Lägenhet", "Trappa", "E-post", "Telefon", "Reg.nr", "Plats", "Anmäld", "Referens", "Meddelande"];
    const rows = all
      .slice()
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.queued_at.localeCompare(b.queued_at))
      .map((e) => [
        positionOf.get(e.id) ?? "", KINDS.find((k) => k.key === e.kind)?.label ?? e.kind, STATUS_LABEL[e.status], e.name, e.apartment_number, e.trappa ?? "",
        e.email, e.phone ?? "", e.vehicle_reg ?? "", e.spot_label ?? "", e.queued_at.slice(0, 10), e.reference, e.note ?? "",
      ]);
    const csv = "﻿" + [head, ...rows].map((r) => r.map(quote).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `parkeringskö-${propertyName || "förening"}-${new Date().toISOString().slice(0, 10)}.csv`.replace(/\s+/g, "-");
    a.click();
    URL.revokeObjectURL(url);
  };

  if (profile && !canUse) {
    return <div style={{ padding: 32, color: MUTED }}>Du har inte behörighet till den här sidan.</div>;
  }

  const row = (e: Entry) => {
    const st = STATUS_STYLE[e.status];
    const pos = positionOf.get(e.id);
    if (editingId === e.id) {
      return <EntryForm key={e.id} propertyId={e.property_id} kind={e.kind} initial={e} existing={all} onDone={() => { setEditingId(null); refresh(); }} onCancel={() => setEditingId(null)} />;
    }
    const idx = active.findIndex((x) => x.id === e.id);
    return (
      <div key={e.id} style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: "14px 16px", display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          {pos != null && (
            <div style={{ minWidth: 44, height: 44, borderRadius: 12, background: INK, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Outfit, Inter, system-ui, sans-serif", fontWeight: 700, fontSize: 20 }}>{pos}</div>
          )}
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <strong style={{ fontSize: 16, color: INK }}>{e.name}</strong>
              <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: st.bg, color: st.fg }}>{STATUS_LABEL[e.status]}</span>
              {e.source === "styrelse" && <span style={{ fontSize: 12, color: MUTED }}>inlagd av styrelsen</span>}
            </div>
            <div style={{ fontSize: 13.5, color: MUTED, marginTop: 3, lineHeight: 1.55 }}>
              Lgh {aptText(e)} · anmäld {fmtDate(e.queued_at)} · {e.reference}
              {e.vehicle_reg ? ` · ${e.vehicle_reg}` : ""}
            </div>
            <div style={{ fontSize: 13.5, marginTop: 3 }}>
              <a href={`mailto:${e.email}`} style={{ color: GREEN }}>{e.email}</a>
              {e.phone ? <> · <a href={`tel:${e.phone}`} style={{ color: GREEN }}>{e.phone}</a></> : null}
            </div>
            {e.spot_label && <div style={{ fontSize: 13.5, marginTop: 3, color: INK }}>Plats: <strong>{e.spot_label}</strong></div>}
            {e.note && <div style={{ fontSize: 13.5, marginTop: 6, background: "#F9FAFB", border: `1px solid ${LINE}`, borderRadius: 8, padding: "6px 10px", color: "#374151", whiteSpace: "pre-wrap" }}>{e.note}</div>}
            {e.handled_by_name && e.handled_at && <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>Senast ändrad av {e.handled_by_name}, {fmtDate(e.handled_at)}</div>}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {idx >= 0 && !needle && <button type="button" className="pk-btn" title="Flytta upp i kön" aria-label="Flytta upp i kön" disabled={idx === 0 || move.isPending} onClick={() => move.mutate({ e, dir: -1 })}>↑</button>}
            {idx >= 0 && !needle && <button type="button" className="pk-btn" title="Flytta ned i kön" aria-label="Flytta ned i kön" disabled={idx === active.length - 1 || move.isPending} onClick={() => move.mutate({ e, dir: 1 })}>↓</button>}
            <button type="button" className="pk-btn" onClick={() => { setAdding(false); setEditingId(e.id); }}>Ändra</button>
            {e.status === "vantar" && <button type="button" className="pk-btn" disabled={update.isPending} onClick={() => offer(e)}>Erbjud plats</button>}
            {(e.status === "vantar" || e.status === "erbjuden") && <button type="button" className="pk-btn" disabled={update.isPending} onClick={() => assign(e)}>Tilldela</button>}
            {e.status === "erbjuden" && <button type="button" className="pk-btn" disabled={update.isPending} onClick={() => update.mutate({ id: e.id, patch: { status: "vantar", spot_label: null } })}>Tillbaka i kön</button>}
            {(e.status === "vantar" || e.status === "erbjuden") && <button type="button" className="pk-btn pk-danger" disabled={update.isPending} onClick={() => strike(e)}>Stryk</button>}
            {e.status === "struken" && <button type="button" className="pk-btn" disabled={update.isPending} onClick={() => update.mutate({ id: e.id, patch: { status: "vantar" } })}>Återställ</button>}
            {isAdmin && <button type="button" className="pk-btn pk-danger" disabled={remove.isPending} onClick={() => del(e)}>Radera</button>}
          </div>
        </div>
      </div>
    );
  };

  const shownActive = active.filter(matches);
  const shownClosed = closed.filter(matches);

  return (
    <div style={{ padding: isMobile ? 16 : 32, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Inter, system-ui, sans-serif" }}>
      <style>{STYLES}</style>

      <div style={{ position: "relative", overflow: "hidden", borderRadius: 18, color: "#e6efd8", padding: "22px 24px", background: "radial-gradient(ellipse at 15% 0%, #21503f 0%, #0f2a21 55%, #0b1d17 100%)", border: `2px solid ${GOLD}`, boxShadow: `0 0 0 4px ${GOLD_SOFT}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <span style={{ display: "inline-block", fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", color: INK, background: GOLD, borderRadius: 999, padding: "3px 10px", marginBottom: 8 }}>KOLL PÅ KÖN</span>
            <h1 style={{ fontFamily: "Outfit, Inter, system-ui, sans-serif", fontSize: 28, fontWeight: 800, color: "#fff", margin: 0 }}>Parkeringskö</h1>
            <div style={{ fontSize: 14, color: "#c9d8c3", marginTop: 6, maxWidth: 640, lineHeight: 1.6 }}>
              Den som ställt sig i kö på hemsidan. Först in står först. {propertyName}
            </div>
          </div>
          <select className="pk-input" style={{ maxWidth: 280 }} value={activeProperty} onChange={(e) => setPropertyId(e.target.value)} aria-label="Förening">
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {missingTable && (
        <div style={{ background: "#FFF7E6", border: "1px solid #F1D9A0", borderRadius: 10, padding: "12px 16px", fontSize: 14, color: "#7A4B00" }}>
          Kölistan är inte aktiverad ännu. SQL-filen <strong>parkering-ko.sql</strong> behöver köras en gång i Supabase.
        </div>
      )}
      {q.error && !missingTable && <div style={{ color: "#B91C1C", fontSize: 14 }}>Kunde inte hämta kön: {(q.error as Error).message}</div>}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {KINDS.map((k) => {
            const n = all.filter((e) => e.kind === k.key && (e.status === "vantar" || e.status === "erbjuden")).length;
            return (
              <button key={k.key} type="button" onClick={() => setKind(k.key)} style={{ height: 34, padding: "0 14px", borderRadius: 999, font: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1px solid ${kind === k.key ? INK : LINE}`, background: kind === k.key ? INK : "#fff", color: kind === k.key ? "#fff" : MUTED }}>
                {k.label} ({n})
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {all.length > 3 && <input className="pk-input" style={{ width: 220 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Sök namn, lägenhet eller reg.nr" aria-label="Sök i kön" />}
          <button type="button" className="pk-btn" onClick={copyLink} disabled={!activeProperty}>Kopiera länk till anmälan</button>
          {all.length > 0 && <button type="button" className="pk-btn" onClick={exportCsv}>Exportera (Excel)</button>}
          <button type="button" className="pk-btn pk-primary" onClick={() => { setEditingId(null); setAdding((v) => !v); }} disabled={!activeProperty || missingTable}>+ Lägg till i kön</button>
        </div>
      </div>

      {adding && activeProperty && (
        <EntryForm propertyId={activeProperty} kind={kind} existing={all} onDone={() => { setAdding(false); refresh(); }} onCancel={() => setAdding(false)} />
      )}

      {q.isLoading && <div style={{ color: MUTED }}>Hämtar…</div>}
      {!q.isLoading && !q.error && shownActive.length === 0 && (
        <div style={{ color: MUTED, fontSize: 15 }}>{needle ? "Inga träffar." : "Ingen står i kön just nu."}</div>
      )}
      <div style={{ display: "grid", gap: 10 }}>{shownActive.map(row)}</div>

      {closed.length > 0 && (
        <>
          <button type="button" className="pk-btn" style={{ justifySelf: "start" }} onClick={() => setShowClosed((v) => !v)}>
            {showClosed ? "Dölj" : "Visa"} tilldelade och strukna ({closed.length})
          </button>
          {showClosed && <div style={{ display: "grid", gap: 10 }}>{shownClosed.map(row)}</div>}
        </>
      )}

      <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
        Länken "Kopiera länk till anmälan" lägger du på föreningens hemsida. Den som anmäler sig får ett bekräftelsemejl med en personlig länk där hen kan följa sin plats eller lämna kön. Styrelsen får ett mejl vid varje ny anmälan. "Erbjud plats" mejlar personen en länk där hen tackar ja eller nej. "Tilldela" mejlar inte.
      </div>
    </div>
  );
}

const todayStr = () => new Date().toISOString().slice(0, 10);

/** Lägg till eller ändra en rad. Datumet "Står i kö sedan" styr köplatsen — används för dem som anmält sig före webbformuläret fanns. */
function EntryForm({ propertyId, kind, initial, existing, onDone, onCancel }: { propertyId: string; kind: Entry["kind"]; initial?: Entry; existing: Entry[]; onDone: () => void; onCancel: () => void }) {
  const { profile } = useAuth();
  const [k, setK] = useState<Entry["kind"]>(initial?.kind ?? kind);
  const [apt, setApt] = useState(initial?.apartment_number ?? "");
  const [trappa, setTrappa] = useState(initial?.trappa ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [reg, setReg] = useState(initial?.vehicle_reg ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [since, setSince] = useState(initial ? initial.queued_at.slice(0, 10) : todayStr());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);
    if (!apt) return setError("Ange lägenhetsnummer (siffror).");
    if (!trappa) return setError("Ange trappa (siffror).");
    if (!name.trim()) return setError("Ange namn.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError("Ange en giltig e-postadress.");
    if (!since) return setError("Ange datum för när personen ställde sig i kö.");
    // Samma lägenhet kan inte stå i kön, eller redan ha en plats, två gånger per typ (samma regel som på hemsidan).
    const clash = existing.find((x) => x.id !== initial?.id && x.kind === k && x.apartment_number === apt && (x.trappa ?? "") === trappa && x.status !== "struken");
    if (clash) {
      return setError(clash.status === "tilldelad"
        ? `Lägenhet ${apt} (trappa ${trappa}) har redan en tilldelad plats (${clash.name}).`
        : `Lägenhet ${apt} (trappa ${trappa}) står redan i kön (${clash.name}). Ändra den raden i stället.`);
    }
    const fields = {
      kind: k, apartment_number: apt, trappa, name: name.trim(), email: email.trim().toLowerCase(),
      phone: phone.trim() || null, vehicle_reg: reg.trim().toUpperCase() || null, note: note.trim() || null,
    };
    // Datumet ändras bara om det faktiskt valts om — annars behåller raden sin exakta tid (och sin plats).
    const dateChanged = initial ? since !== initial.queued_at.slice(0, 10) : since !== todayStr();
    const queued = dateChanged ? { queued_at: new Date(`${since}T12:00:00`).toISOString() } : {};
    const who = { handled_by_name: profile?.full_name ?? null, handled_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    setSaving(true);
    const res = initial
      ? await supabase.from("parking_queue").update({ ...fields, ...queued, ...who }).eq("id", initial.id).select("id")
      : await supabase.from("parking_queue").insert({ property_id: propertyId, ...fields, ...queued, source: "styrelse", ...who }).select("id");
    setSaving(false);
    if (res.error) return setError(res.error.code === "23505" ? "Den e-postadressen står redan i kön för den här typen." : res.error.message);
    if (!res.data || res.data.length === 0) return setError("Raden sparades inte (saknar behörighet).");
    toast.success(initial ? "Ändringen sparades" : "Tillagd i kön");
    onDone();
  };

  return (
    <form onSubmit={save} style={{ background: "#fff", border: `1px solid ${initial ? GREEN : LINE}`, borderRadius: 14, padding: 16, display: "grid", gap: 12 }} noValidate>
      <strong style={{ color: INK }}>{initial ? `Ändra ${initial.name}` : "Lägg till i kön"}</strong>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        <select className="pk-input" value={k} onChange={(e) => setK(e.target.value as Entry["kind"])} aria-label="Typ">
          {KINDS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
        </select>
        <input className="pk-input" inputMode="numeric" placeholder="Lägenhetsnummer" value={apt} onChange={(e) => setApt(normalizeApartmentNumber(e.target.value))} />
        <input className="pk-input" inputMode="numeric" placeholder={`Trappa, ${TRAPPA_PLACEHOLDER.toLowerCase()}`} value={trappa} onChange={(e) => setTrappa(normalizeTrappa(e.target.value))} />
        <input className="pk-input" placeholder="Namn" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="pk-input" type="email" placeholder="E-post" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="pk-input" type="tel" placeholder="Telefon (valfritt)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input className="pk-input" placeholder="Reg.nr (valfritt)" value={reg} onChange={(e) => setReg(e.target.value)} />
        <label style={{ display: "grid", gap: 3, fontSize: 12, color: MUTED }}>
          Står i kö sedan
          <input className="pk-input" type="date" max={todayStr()} value={since} onChange={(e) => setSince(e.target.value)} />
        </label>
      </div>
      <input className="pk-input" placeholder="Anteckning (valfritt)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div style={{ fontSize: 12.5, color: MUTED }}>Datumet avgör köplatsen: den som stått längst står först. Du kan också flytta en plats med pilarna i listan.</div>
      {error && <div style={{ color: "#B91C1C", fontSize: 14 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="pk-btn pk-primary" disabled={saving}>{saving ? "Sparar…" : initial ? "Spara" : "Lägg till"}</button>
        <button type="button" className="pk-btn" onClick={onCancel}>Avbryt</button>
      </div>
    </form>
  );
}
