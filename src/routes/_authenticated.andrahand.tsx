import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { COLORS } from "@/components/property-tabs";
import { sanitizeStorageName } from "@/lib/storage";

export const Route = createFileRoute("/_authenticated/andrahand")({
  head: () => ({ meta: [{ title: "Andrahand — BAYT" }] }),
  component: AndrahandPage,
});

const INK = "#0D2B1E";
const GREEN = "#3D8A30";
const MUTED = "#6B7280";
const LINE = "#E3E7E2";
const HOT = "#C2334D";
const GOLD = "#E8C464";
const GOLD_SOFT = "rgba(232,196,100,0.16)";
const BUCKET = "sublet-docs";
const MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_FEE = 5920; // 10 % av prisbasbeloppet 2026

type StepKey = "ansokan" | "skal" | "hyresgast" | "lamplighet" | "slutbeslut" | "avtal";
type Sub = {
  id: string;
  property_id: string;
  apartment_id: string | null;
  member_name: string | null;
  tenant_name: string;
  tenant_contact: string | null;
  start_date: string;
  end_date: string | null;
  reason: string | null;
  permit_status: "ansokt" | "godkand" | "avslagen";
  permit_date: string | null;
  insurance_ok: boolean;
  fee_per_year: number | null;
  note: string | null;
  steps: Partial<Record<StepKey, boolean>> | null;
  tenant_rent: number | null;
  suitability_note: string | null;
  contract_date: string | null;
};
type SubDoc = { id: string; sublet_id: string; kind: string; file_path: string; file_name: string; file_size: number | null; created_at: string };
type Suspicion = {
  id: string;
  property_id: string;
  apartment_id: string | null;
  kind: "avvikelse" | "inneboende" | "ej_kontrollerad";
  note: string | null;
  observed_at: string;
  notify_board: boolean;
  status: "ny" | "meddelad" | "utreds" | "avslutad";
  board_notified_at: string | null;
  resolution: string | null;
  created_at: string;
};
type Apt = { id: string; apartment_number: string };

const STEPS: Array<{ key: StepKey; label: string; owner: "Medlem" | "Styrelse"; hint: string }> = [
  { key: "ansokan", label: "Ansökan", owner: "Medlem", hint: "Medlemmen har ansökt om andrahandsuthyrning." },
  { key: "skal", label: "Skäl och period", owner: "Styrelse", hint: "Styrelsen har granskat skäl och period." },
  { key: "hyresgast", label: "Hyresgäst", owner: "Medlem", hint: "Medlemmen har angett hyresgäst och kontaktuppgifter." },
  { key: "lamplighet", label: "Lämplighetsbedömning", owner: "Styrelse", hint: "Styrelsens egen bedömning, till exempel referenser och inkomst mot hyra." },
  { key: "slutbeslut", label: "Slutbeslut", owner: "Styrelse", hint: "Styrelsen fattar beslut." },
  { key: "avtal", label: "Avtal", owner: "Medlem", hint: "Avtal är signerat. Kräver att försäkring finns." },
];
const REASONS = ["Provsamboende", "Arbete eller studier på annan ort", "Sjukdom eller vård", "Tillfälligt boende", "Annat"];
const PERMIT_LABEL: Record<string, string> = { ansokt: "Ansökt", godkand: "Godkänd", avslagen: "Avslagen" };
const DOC_KINDS: Array<{ key: string; label: string }> = [
  { key: "avtal", label: "Hyresavtal" },
  { key: "forsakring", label: "Försäkringsbrev" },
  { key: "besiktning", label: "Besiktningsprotokoll" },
  { key: "nyckel", label: "Nyckelkvittens" },
  { key: "inventarie", label: "Inventarielista" },
  { key: "annat", label: "Annat" },
];
const REQUIRED_DOCS = ["besiktning", "nyckel", "inventarie"];
const KIND_LABEL: Record<string, string> = {
  avvikelse: "Avvikelse – möjlig olovlig uthyrning",
  inneboende: "Inneboende – fler bor där än medlemmen",
  ej_kontrollerad: "Ej kontrollerad",
};
const KIND_COLOR: Record<string, string> = { avvikelse: "#C2334D", inneboende: "#F2B01E", ej_kontrollerad: "#6B7280" };
const SUS_STATUS: Record<string, string> = { ny: "Ny", meddelad: "Styrelsen har tagit del", utreds: "Utreds", avslutad: "Avslutad" };

const STYLES = `
  .fp-btn { height: 40px; padding: 0 16px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; background: #fff; color: #0D2B1E; border: 1px solid #E3E7E2; }
  .fp-btn:hover { border-color: #3D8A30; }
  .fp-btn.fp-primary { background: #3D8A30; border-color: #3D8A30; color: #fff; }
  .fp-btn.fp-danger { color: #B91C1C; border-color: #F1C0C0; }
  .fp-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .fp-label { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #6B7280; margin-bottom: 6px; display: block; }
  .fp-input, .fp-textarea, .fp-select { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px; font-size: 15px; font-family: inherit; background: #fff; color: #0D2B1E; border: 1px solid #E3E7E2; }
  .fp-input, .fp-select { height: 42px; padding-top: 0; padding-bottom: 0; }
  .fp-textarea { resize: vertical; line-height: 1.5; }
  @media print {
    aside, header, nav, .no-print { display: none !important; }
    main { overflow: visible !important; height: auto !important; border: none !important; box-shadow: none !important; }
    body, .bayt-app { height: auto !important; overflow: visible !important; background: #fff !important; }
  }
`;

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(`${iso}T00:00:00`).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((t - today) / 86400000);
}
const fmtDate = (iso: string | null) => (iso ? new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" }) : "—");
const todayIso = () => new Date().toISOString().slice(0, 10);

function effSteps(s: Sub): Record<StepKey, boolean> {
  const st = { ansokan: false, skal: false, hyresgast: false, lamplighet: false, slutbeslut: false, avtal: false, ...(s.steps ?? {}) } as Record<StepKey, boolean>;
  if (s.permit_status === "godkand") {
    st.ansokan = st.skal = st.hyresgast = st.lamplighet = st.slutbeslut = true;
  }
  return st;
}
function currentStep(s: Sub) {
  const st = effSteps(s);
  return STEPS.find((x) => !st[x.key]) ?? null;
}

type Flag = { key: string; text: string; tone: "bad" | "warn" | "ok" };
function flagsFor(s: Sub, docs: SubDoc[]): Flag[] {
  const f: Flag[] = [];
  const d = daysUntil(s.end_date);
  const st = effSteps(s);
  if (s.permit_status === "avslagen") return [{ key: "avslagen", text: "Avslagen", tone: "bad" }];
  const cur = currentStep(s);
  if (s.permit_status === "ansokt" && cur?.owner === "Styrelse") f.push({ key: "beslut", text: `Väntar på styrelsen: ${cur.label}`, tone: "warn" });
  if (s.permit_status === "ansokt" && cur?.owner === "Medlem") f.push({ key: "medlem", text: `Väntar på medlem: ${cur.label}`, tone: "warn" });
  if (d != null && d < 0) f.push({ key: "utgangen", text: `Utgången (${-d} dagar sedan)`, tone: "bad" });
  else if (d != null && d <= 30) f.push({ key: "snart30", text: `Löper ut om ${d} dagar`, tone: "bad" });
  else if (d != null && d <= 90) f.push({ key: "snart90", text: `Löper ut om ${d} dagar`, tone: "warn" });
  if (s.permit_status === "godkand") {
    if (!s.insurance_ok) f.push({ key: "forsakring", text: "Försäkring saknas", tone: "warn" });
    if (!st.avtal) f.push({ key: "avtal", text: "Avtal ej signerat", tone: "warn" });
    const have = new Set(docs.map((x) => x.kind));
    const missing = REQUIRED_DOCS.filter((k) => !have.has(k));
    if (missing.length) f.push({ key: "bilagor", text: `Bilagor saknas (${missing.length})`, tone: "warn" });
  }
  if (f.length === 0) f.push({ key: "aktiv", text: s.end_date ? "Aktiv" : "Aktiv, utan slutdatum", tone: "ok" });
  return f;
}
const toneStyle = (t: Flag["tone"]): React.CSSProperties =>
  t === "bad" ? { background: "#FDE2E7", color: "#8B1A2B", border: "1px solid #F1C0C0" }
  : t === "warn" ? { background: "#FFF4E5", color: "#B45309", border: "1px solid #F6D9A8" }
  : { background: "rgba(92,184,74,0.14)", color: "#2E6B24", border: "1px solid #C9D8C3" };

type Filter = "att-besluta" | "att-gora" | "aktiva" | "avslutade" | "alla";

function AndrahandPage() {
  const isMobile = useIsMobile();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const qc = useQueryClient();
  const [propertyId, setPropertyId] = useState<string>(() => {
    try {
      return window.localStorage.getItem("bayt.presentation.property") ?? "";
    } catch {
      return "";
    }
  });
  const [filter, setFilter] = useState<Filter>("att-gora");
  const [editing, setEditing] = useState<Sub | "new" | null>(null);
  const [susForm, setSusForm] = useState(false);

  const propsQ = useQuery({
    queryKey: ["sub-properties"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
  const properties = propsQ.data ?? [];
  const propertyName = properties.find((p) => p.id === propertyId)?.name ?? "";

  useEffect(() => {
    if (properties.length === 0) return;
    if (!propertyId || !properties.some((p) => p.id === propertyId)) setPropertyId(properties[0].id);
  }, [propertyId, properties]);
  useEffect(() => {
    if (!propertyId) return;
    try {
      window.localStorage.setItem("bayt.presentation.property", propertyId);
    } catch {
      /* ignoreras */
    }
  }, [propertyId]);

  const aptsQ = useQuery({
    queryKey: ["sub-apts", propertyId],
    enabled: isAdmin && !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("apartments").select("id, apartment_number").eq("property_id", propertyId).order("apartment_number");
      if (error) throw error;
      return (data ?? []) as Apt[];
    },
  });
  const apts = aptsQ.data ?? [];
  const aptLabel = (id: string | null) => apts.find((a) => a.id === id)?.apartment_number;

  const subsQ = useQuery({
    queryKey: ["subs", propertyId],
    enabled: isAdmin && !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("sublettings").select("*").eq("property_id", propertyId).order("end_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Sub[];
    },
  });
  const subs = subsQ.data ?? [];

  const docsQ = useQuery({
    queryKey: ["sub-docs", propertyId],
    enabled: isAdmin && !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("sublet_documents").select("*").eq("property_id", propertyId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SubDoc[];
    },
  });
  const docs = docsQ.data ?? [];

  const susQ = useQuery({
    queryKey: ["sub-sus", propertyId],
    enabled: isAdmin && !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("sublet_suspicions").select("*").eq("property_id", propertyId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Suspicion[];
    },
  });
  const sus = susQ.data ?? [];

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["subs", propertyId] });
    void qc.invalidateQueries({ queryKey: ["sub-docs", propertyId] });
    void qc.invalidateQueries({ queryKey: ["sub-sus", propertyId] });
  };

  const patchSub = useMutation({
    mutationFn: async (v: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("sublettings").update(v.patch).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const removeSub = useMutation({
    mutationFn: async (s: Sub) => {
      const paths = docs.filter((d) => d.sublet_id === s.id).map((d) => d.file_path);
      const { error } = await supabase.from("sublettings").delete().eq("id", s.id);
      if (error) throw error;
      if (paths.length) void supabase.storage.from(BUCKET).remove(paths);
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const patchSus = useMutation({
    mutationFn: async (v: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("sublet_suspicions").update(v.patch).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const removeSus = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sublet_suspicions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const enriched = useMemo(
    () => subs.map((s) => ({ s, flags: flagsFor(s, docs.filter((d) => d.sublet_id === s.id)), cur: currentStep(s) })),
    [subs, docs],
  );
  const toDecide = enriched.filter((x) => x.s.permit_status === "ansokt" && x.cur?.owner === "Styrelse");
  const needsAction = enriched.filter((x) => x.flags.some((f) => f.tone === "bad" || f.tone === "warn"));
  const ended = enriched.filter((x) => x.s.permit_status === "avslagen" || (daysUntil(x.s.end_date) ?? 1) < 0);
  const active = enriched.filter((x) => !ended.includes(x));
  const shown = filter === "alla" ? enriched : filter === "att-besluta" ? toDecide : filter === "att-gora" ? needsAction : filter === "aktiva" ? active : ended;
  const expiring = enriched.filter((x) => { const d = daysUntil(x.s.end_date); return d != null && d >= 0 && d <= 90 && x.s.permit_status !== "avslagen"; }).length;
  const fees = enriched.filter((x) => x.s.permit_status === "godkand" && !ended.includes(x)).reduce((sum, x) => sum + (x.s.fee_per_year ?? 0), 0);
  const openSus = sus.filter((x) => x.status !== "avslutad");
  const waitingBoard = sus.filter((x) => x.notify_board && x.status === "ny");

  if (profile && !isAdmin) {
    return <div style={{ padding: 32, color: COLORS.secondary }}>Du har inte behörighet till den här sidan.</div>;
  }

  const stat = (label: string, value: string, bad?: boolean) => (
    <div style={{ background: bad ? "#FEF3F3" : "#fff", border: `1px solid ${bad ? "#F1C0C0" : LINE}`, borderRadius: 14, padding: "14px 18px", minWidth: 160, flex: "1 1 160px" }}>
      <div style={{ fontSize: 11.5, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED }}>{label}</div>
      <div style={{ fontFamily: "Outfit, Inter, system-ui, sans-serif", fontSize: 28, fontWeight: 700, color: bad ? "#B91C1C" : INK }}>{value}</div>
    </div>
  );

  return (
    <div style={{ padding: isMobile ? 16 : 32, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Inter, system-ui, sans-serif" }}>
      <style>{STYLES}</style>

      <div style={{ position: "relative", overflow: "hidden", borderRadius: 18, color: "#e6efd8", padding: "22px 24px", background: "radial-gradient(ellipse at 15% 0%, #21503f 0%, #0f2a21 55%, #0b1d17 100%)", border: `2px solid ${GOLD}`, boxShadow: `0 0 0 4px ${GOLD_SOFT}` }}>
        <div style={{ position: "absolute", right: -40, top: -50, width: 190, height: 190, borderRadius: "50%", border: `26px solid ${GOLD_SOFT}`, pointerEvents: "none" }} />
        <div style={{ position: "relative", display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <span style={{ display: "inline-block", fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", color: INK, background: GOLD, borderRadius: 999, padding: "3px 10px", marginBottom: 8 }}>KOLL PÅ UTHYRNINGEN</span>
            <h1 style={{ fontFamily: "Outfit, Inter, system-ui, sans-serif", fontSize: 28, fontWeight: 800, color: "#fff", margin: 0 }}>Andrahandsuthyrning</h1>
            <div style={{ fontSize: 14, color: "#c9d8c3", marginTop: 6, maxWidth: 640, lineHeight: 1.6 }}>
              Från ansökan till signerat avtal, med bilagor, påminnelser och en egen ruta för misstänkt olovlig uthyrning. {propertyName}
            </div>
          </div>
          <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select className="fp-select" style={{ maxWidth: 280 }} value={propertyId} onChange={(e) => setPropertyId(e.target.value)} aria-label="Fastighet">
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button type="button" className="fp-btn" onClick={() => window.print()}>Ladda ner rapport (PDF)</button>
          </div>
        </div>
      </div>

      {waitingBoard.length > 0 && (
        <div style={{ background: "#FDE2E7", border: "1px solid #F1C0C0", borderLeft: `5px solid ${HOT}`, borderRadius: 12, padding: "12px 16px", color: "#8B1A2B", fontWeight: 700 }}>
          {waitingBoard.length} {waitingBoard.length === 1 ? "misstanke väntar" : "misstankar väntar"} på att styrelsen tar del av dem. Se rutan "Misstänkt olovlig uthyrning" nedan.
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {stat("Aktiva uthyrningar", String(active.filter((x) => x.s.permit_status === "godkand").length))}
        {stat("Att besluta för styrelsen", String(toDecide.length), toDecide.length > 0)}
        {stat("Kräver åtgärd", String(needsAction.length), needsAction.length > 0)}
        {stat("Löper ut inom 90 dagar", String(expiring), expiring > 0)}
        {stat("Öppna misstankar", String(openSus.length), openSus.length > 0)}
        {stat("Avgifter per år", `${Math.round(fees).toLocaleString("sv-SE")} kr`)}
      </div>

      {editing && (
        <SubForm
          key={editing === "new" ? "new" : editing.id}
          propertyId={propertyId}
          apts={apts}
          initial={editing === "new" ? null : editing}
          onDone={() => { setEditing(null); refresh(); }}
          onCancel={() => setEditing(null)}
        />
      )}

      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {([
            ["att-besluta", `Att besluta (${toDecide.length})`],
            ["att-gora", `Kräver åtgärd (${needsAction.length})`],
            ["aktiva", `Aktiva (${active.length})`],
            ["avslutade", `Avslutade (${ended.length})`],
            ["alla", `Alla (${enriched.length})`],
          ] as Array<[Filter, string]>).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} style={{ height: 34, padding: "0 14px", borderRadius: 999, font: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1px solid ${filter === k ? INK : LINE}`, background: filter === k ? INK : "#fff", color: filter === k ? "#fff" : MUTED }}>
              {l}
            </button>
          ))}
        </div>
        <button type="button" className="fp-btn fp-primary" onClick={() => setEditing("new")}>+ Ny uthyrning</button>
      </div>

      {subsQ.isLoading && <div style={{ color: MUTED }}>Hämtar…</div>}
      {subsQ.error && <div style={{ color: "#B91C1C", fontSize: 14 }}>Kunde inte hämta registret: {(subsQ.error as Error).message}. Har du kört SQL:en?</div>}
      {!subsQ.isLoading && !subsQ.error && shown.length === 0 && <div style={{ color: MUTED, fontSize: 15 }}>Inget att visa för det här valet.</div>}

      <div style={{ display: "grid", gap: 12 }}>
        {shown.map(({ s, flags }) => (
          <CaseCard
            key={s.id}
            s={s}
            flags={flags}
            aptNo={aptLabel(s.apartment_id)}
            docs={docs.filter((d) => d.sublet_id === s.id)}
            propertyId={propertyId}
            onPatch={(patch) => patchSub.mutate({ id: s.id, patch })}
            onEdit={() => { setEditing(s); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            onDelete={() => { if (window.confirm("Ta bort uthyrningen och dess bilagor? Det går inte att ångra.")) removeSub.mutate(s); }}
            onDocsChanged={refresh}
          />
        ))}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, padding: "18px 20px", display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: "Outfit, Inter, system-ui, sans-serif", fontSize: 20, fontWeight: 800, color: INK }}>Misstänkt olovlig uthyrning</div>
            <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>Anteckningar från samordnaren. Skriv sakligt och bara det som är observerat. Kryssa i "Styrelsen ska informeras" så syns det för styrelsen.</div>
          </div>
          <button type="button" className="fp-btn fp-primary no-print" onClick={() => setSusForm((v) => !v)}>{susForm ? "Stäng" : "+ Ny markering"}</button>
        </div>

        {susForm && <SusForm propertyId={propertyId} apts={apts} onDone={() => { setSusForm(false); refresh(); }} />}

        {susQ.error && <div style={{ color: "#B91C1C", fontSize: 14 }}>Kunde inte hämta markeringar: {(susQ.error as Error).message}</div>}
        {sus.length === 0 && !susQ.isLoading && <div style={{ color: MUTED, fontSize: 14 }}>Inga markeringar.</div>}

        <div style={{ display: "grid", gap: 8 }}>
          {sus.map((x) => (
            <div key={x.id} style={{ border: `1px solid ${LINE}`, borderLeft: `5px solid ${KIND_COLOR[x.kind]}`, borderRadius: 12, padding: "11px 14px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", opacity: x.status === "avslutad" ? 0.6 : 1 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontWeight: 800, color: INK }}>{aptLabel(x.apartment_id) ? `Lgh ${aptLabel(x.apartment_id)}` : "Lägenhet ej angiven"}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: KIND_COLOR[x.kind] }}>{KIND_LABEL[x.kind]}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, background: x.status === "ny" ? "#FDE2E7" : "#F3F4F6", color: x.status === "ny" ? "#8B1A2B" : MUTED, borderRadius: 999, padding: "2px 9px" }}>{SUS_STATUS[x.status]}</span>
                  {x.notify_board && x.status === "ny" && <span style={{ fontSize: 11.5, fontWeight: 700, background: GOLD, color: INK, borderRadius: 999, padding: "2px 9px" }}>Styrelsen ska informeras</span>}
                </div>
                <div style={{ fontSize: 13, color: MUTED, marginTop: 3 }}>
                  Observerat {fmtDate(x.observed_at)}{x.board_notified_at ? ` · Styrelsen tog del ${fmtDate(x.board_notified_at)}` : ""}
                </div>
                {x.note && <div style={{ fontSize: 14.5, color: "#374151", marginTop: 4, whiteSpace: "pre-wrap" }}>{x.note}</div>}
                {x.resolution && <div style={{ fontSize: 13.5, color: "#2E6B24", marginTop: 4 }}>Utfall: {x.resolution}</div>}
              </div>
              <div className="no-print" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-start" }}>
                {x.status === "ny" && (
                  <button type="button" className="fp-btn" style={{ height: 32 }} onClick={() => patchSus.mutate({ id: x.id, patch: { status: "meddelad", board_notified_at: new Date().toISOString() } })}>
                    Styrelsen har tagit del
                  </button>
                )}
                {(x.status === "ny" || x.status === "meddelad") && (
                  <button type="button" className="fp-btn" style={{ height: 32 }} onClick={() => patchSus.mutate({ id: x.id, patch: { status: "utreds" } })}>Utreds</button>
                )}
                {x.status !== "avslutad" && (
                  <button
                    type="button"
                    className="fp-btn"
                    style={{ height: 32 }}
                    onClick={() => {
                      const r = window.prompt("Hur avslutades ärendet? (till exempel: lovlig uthyrning anmäld, uthyrningen upphörd, ingen åtgärd)");
                      if (r !== null) patchSus.mutate({ id: x.id, patch: { status: "avslutad", resolution: r.trim() || null } });
                    }}
                  >
                    Avsluta
                  </button>
                )}
                <button type="button" className="fp-btn fp-danger" style={{ height: 32 }} onClick={() => { if (window.confirm("Ta bort markeringen?")) removeSus.mutate(x.id); }}>Ta bort</button>
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
          Markeringarna är misstankar, inte konstaterade fakta, och innehåller personuppgifter. Gallra avslutade ärenden och dela dem bara med styrelsen.
        </div>
      </div>

      <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
        Registret är ett stöd för styrelsens uppföljning. Villkor för andrahandsuthyrning (samtycke, skäl, hyresnämndens prövning, avgiftens storlek) styrs av bostadsrättslagen och föreningens stadgar. Hyresavtal ska följa en av jurist granskad mall.
      </div>
    </div>
  );
}

function CaseCard({
  s, flags, aptNo, docs, propertyId, onPatch, onEdit, onDelete, onDocsChanged,
}: {
  s: Sub;
  flags: Flag[];
  aptNo?: string;
  docs: SubDoc[];
  propertyId: string;
  onPatch: (patch: Record<string, unknown>) => void;
  onEdit: () => void;
  onDelete: () => void;
  onDocsChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const st = effSteps(s);
  const cur = currentStep(s);
  const closed = s.permit_status === "avslagen";

  const toggle = (k: StepKey) => {
    if (closed) return;
    if (k === "avtal" && !st.avtal && !s.insurance_ok) {
      toast.error("Avtal först när försäkring finns. Markera försäkringsbrev under Redigera.");
      return;
    }
    const next = { ...(s.steps ?? {}), [k]: !st[k] };
    const patch: Record<string, unknown> = { steps: next };
    if (k === "avtal" && !st.avtal) patch.contract_date = todayIso();
    onPatch(patch);
  };
  const decide = (ok: boolean) => {
    const next = { ...(s.steps ?? {}), slutbeslut: ok };
    onPatch({ steps: next, permit_status: ok ? "godkand" : "avslagen", permit_date: todayIso() });
  };

  return (
    <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderLeft: `4px solid ${flags[0].tone === "bad" ? HOT : flags[0].tone === "warn" ? "#F2711C" : GREEN}`, borderRadius: 14, padding: "14px 18px", display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontWeight: 800, fontSize: 17, color: INK }}>{aptNo ? `Lgh ${aptNo}` : "Lägenhet ej angiven"}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>{PERMIT_LABEL[s.permit_status]}</span>
            {flags.map((f) => (
              <span key={f.key} style={{ ...toneStyle(f.tone), fontSize: 12, fontWeight: 700, borderRadius: 999, padding: "2px 10px" }}>{f.text}</span>
            ))}
          </div>
          <div style={{ fontSize: 14.5, color: "#374151", lineHeight: 1.7 }}>
            Hyresgäst: <strong>{s.tenant_name}</strong>{s.tenant_contact ? ` · ${s.tenant_contact}` : ""}
            <br />
            Medlem: {s.member_name || "—"} · Skäl: {s.reason || "—"}
            <br />
            Period: {fmtDate(s.start_date)} till {s.end_date ? fmtDate(s.end_date) : "tills vidare"}
            {s.tenant_rent ? ` · Hyra: ${Math.round(s.tenant_rent).toLocaleString("sv-SE")} kr/mån` : ""}
            <br />
            Försäkring: {s.insurance_ok ? "finns" : "saknas"}
            {s.fee_per_year ? ` · Avgift: ${Math.round(s.fee_per_year).toLocaleString("sv-SE")} kr per år` : ""}
            {s.contract_date ? ` · Avtal signerat ${fmtDate(s.contract_date)}` : ""}
          </div>
          {s.suitability_note && <div style={{ fontSize: 13.5, color: "#374151", marginTop: 4 }}>Lämplighetsbedömning: {s.suitability_note}</div>}
          {s.note && <div style={{ fontSize: 13.5, color: MUTED, marginTop: 4 }}>{s.note}</div>}
        </div>
        <div className="no-print" style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
          <button type="button" className="fp-btn" style={{ height: 34 }} onClick={() => setOpen((v) => !v)}>{open ? "Dölj bilagor" : `Bilagor (${docs.length})`}</button>
          <button type="button" className="fp-btn" style={{ height: 34 }} onClick={onEdit}>Redigera</button>
          <button type="button" className="fp-btn fp-danger" style={{ height: 34 }} onClick={onDelete}>Ta bort</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
        {STEPS.map((x, i) => {
          const done = st[x.key];
          const isCur = cur?.key === x.key && !closed;
          return (
            <button
              key={x.key}
              type="button"
              title={x.hint}
              onClick={() => toggle(x.key)}
              style={{
                textAlign: "left", font: "inherit", cursor: closed ? "default" : "pointer", padding: "9px 11px", borderRadius: 11,
                border: `1px solid ${done ? "#C9D8C3" : isCur ? GOLD : LINE}`, background: done ? "rgba(92,184,74,0.12)" : isCur ? GOLD_SOFT : "#fff",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 800, color: done ? GREEN : MUTED }}>{done ? "✓ " : ""}{String(i + 1).padStart(2, "0")}</div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{x.label}</div>
              <span style={{ display: "inline-block", marginTop: 4, fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "1px 8px", background: x.owner === "Styrelse" ? INK : "#F3F4F6", color: x.owner === "Styrelse" ? "#fff" : MUTED }}>{x.owner}</span>
            </button>
          );
        })}
      </div>

      {s.permit_status === "ansokt" && cur?.key === "slutbeslut" && (
        <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", background: GOLD_SOFT, border: `1px solid ${GOLD}`, borderRadius: 10, padding: "10px 12px" }}>
          <strong style={{ fontSize: 14 }}>Slutbeslut:</strong>
          <button type="button" className="fp-btn fp-primary" style={{ height: 34 }} onClick={() => decide(true)}>Godkänn</button>
          <button type="button" className="fp-btn fp-danger" style={{ height: 34 }} onClick={() => decide(false)}>Avslå</button>
        </div>
      )}

      {open && <DocsPanel sublet={s} docs={docs} propertyId={propertyId} onChanged={onDocsChanged} />}
    </div>
  );
}

function DocsPanel({ sublet, docs, propertyId, onChanged }: { sublet: Sub; docs: SubDoc[]; propertyId: string; onChanged: () => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [kind, setKind] = useState("besiktning");
  const [file, setFile] = useState<File | null>(null);
  const have = new Set(docs.map((d) => d.kind));

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Välj en fil först.");
      if (file.size > MAX_BYTES) throw new Error("Filen är för stor (max 25 MB).");
      const path = `${propertyId}/${sublet.id}/${crypto.randomUUID()}-${sanitizeStorageName(file.name)}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
      if (up.error) throw new Error("Uppladdningen misslyckades.");
      const { error } = await supabase.from("sublet_documents").insert({
        property_id: propertyId, sublet_id: sublet.id, kind, file_path: path, file_name: file.name, file_size: file.size,
      });
      if (error) {
        void supabase.storage.from(BUCKET).remove([path]);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Bilagan är sparad", { style: { background: "#3D8A30", color: "#fff" } });
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (d: SubDoc) => {
      const { error } = await supabase.from("sublet_documents").delete().eq("id", d.id);
      if (error) throw error;
      void supabase.storage.from(BUCKET).remove([d.file_path]);
    },
    onSuccess: onChanged,
    onError: (e: Error) => toast.error(e.message),
  });
  const openFile = async (d: SubDoc) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(d.file_path, 600);
    if (error || !data?.signedUrl) return void toast.error("Kunde inte öppna filen.");
    window.open(data.signedUrl, "_blank", "noopener");
  };

  return (
    <div className="no-print" style={{ background: "#F7F9F6", border: `1px solid ${LINE}`, borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {REQUIRED_DOCS.map((k) => (
          <span key={k} style={{ fontSize: 12, fontWeight: 700, borderRadius: 999, padding: "2px 10px", background: have.has(k) ? "rgba(92,184,74,0.14)" : "#FFF4E5", color: have.has(k) ? "#2E6B24" : "#B45309" }}>
            {have.has(k) ? "✓ " : ""}{DOC_KINDS.find((d) => d.key === k)?.label}
          </span>
        ))}
      </div>
      {docs.map((d) => (
        <div key={d.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, padding: "8px 12px" }}>
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 800, background: GOLD, color: INK, borderRadius: 999, padding: "2px 9px", marginRight: 8 }}>{DOC_KINDS.find((x) => x.key === d.kind)?.label ?? d.kind}</span>
            <span style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{d.file_name}</span>
            <span style={{ fontSize: 12.5, color: MUTED }}> · {fmtDate(d.created_at)}</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" className="fp-btn" style={{ height: 30 }} onClick={() => void openFile(d)}>Öppna</button>
            <button type="button" className="fp-btn fp-danger" style={{ height: 30 }} onClick={() => { if (window.confirm(`Ta bort "${d.file_name}"?`)) remove.mutate(d); }}>Ta bort</button>
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select className="fp-select" style={{ width: 210 }} value={kind} onChange={(e) => setKind(e.target.value)}>
          {DOC_KINDS.map((k) => (
            <option key={k.key} value={k.key}>{k.label}</option>
          ))}
        </select>
        <input ref={fileRef} type="file" style={{ display: "none" }} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button type="button" className="fp-btn" onClick={() => fileRef.current?.click()}>{file ? `Vald: ${file.name}` : "Välj fil"}</button>
        <button type="button" className="fp-btn fp-primary" disabled={!file || upload.isPending} onClick={() => upload.mutate()}>{upload.isPending ? "Laddar upp…" : "Spara bilaga"}</button>
      </div>
    </div>
  );
}

function SusForm({ propertyId, apts, onDone }: { propertyId: string; apts: Apt[]; onDone: () => void }) {
  const [f, setF] = useState({ apartment_id: "", kind: "avvikelse", note: "", observed_at: todayIso(), notify_board: true });
  const save = useMutation({
    mutationFn: async () => {
      if (!f.apartment_id) throw new Error("Välj lägenhet.");
      const { error } = await supabase.from("sublet_suspicions").insert({
        property_id: propertyId, apartment_id: f.apartment_id, kind: f.kind, note: f.note.trim() || null,
        observed_at: f.observed_at || todayIso(), notify_board: f.notify_board,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Markeringen är sparad", { style: { background: "#3D8A30", color: "#fff" } });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="no-print" style={{ background: "#F7F9F6", border: `1px solid ${LINE}`, borderRadius: 12, padding: 14, display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <div>
          <label className="fp-label">Lägenhet</label>
          <select className="fp-select" value={f.apartment_id} onChange={(e) => setF({ ...f, apartment_id: e.target.value })}>
            <option value="">Välj lägenhet</option>
            {apts.map((a) => (
              <option key={a.id} value={a.id}>Lgh {a.apartment_number}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="fp-label">Typ</label>
          <select className="fp-select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            {Object.entries(KIND_LABEL).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="fp-label">Observerat</label>
          <input className="fp-input" type="date" value={f.observed_at} onChange={(e) => setF({ ...f, observed_at: e.target.value })} />
        </div>
      </div>
      <div>
        <label className="fp-label">Anteckning (sakligt, bara det du observerat)</label>
        <textarea className="fp-textarea" rows={3} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="t.ex. Annat namn på dörren och dörrklockan än medlemmens, ingen i lägenheten vid tre besök." />
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600 }}>
        <input type="checkbox" checked={f.notify_board} onChange={(e) => setF({ ...f, notify_board: e.target.checked })} />
        Styrelsen ska informeras
      </label>
      <div>
        <button type="button" className="fp-btn fp-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Sparar…" : "Spara markering"}</button>
      </div>
    </div>
  );
}

function SubForm({ propertyId, apts, initial, onDone, onCancel }: { propertyId: string; apts: Apt[]; initial: Sub | null; onDone: () => void; onCancel: () => void }) {
  const s = (v: unknown) => (v == null ? "" : String(v));
  const [f, setF] = useState({
    apartment_id: s(initial?.apartment_id),
    member_name: s(initial?.member_name),
    tenant_name: s(initial?.tenant_name),
    tenant_contact: s(initial?.tenant_contact),
    start_date: s(initial?.start_date),
    end_date: s(initial?.end_date),
    reason: s(initial?.reason),
    permit_status: s(initial?.permit_status) || "ansokt",
    permit_date: s(initial?.permit_date),
    insurance_ok: initial?.insurance_ok ?? false,
    fee_per_year: initial ? s(initial.fee_per_year) : String(DEFAULT_FEE),
    tenant_rent: s(initial?.tenant_rent),
    suitability_note: s(initial?.suitability_note),
    note: s(initial?.note),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\s/g, "").replace(",", ".")));

  const save = useMutation({
    mutationFn: async () => {
      if (!f.tenant_name.trim()) throw new Error("Ange hyresgästens namn.");
      if (!f.start_date) throw new Error("Ange startdatum.");
      if (f.end_date && f.end_date < f.start_date) throw new Error("Slutdatum kan inte vara före startdatum.");
      const row = {
        property_id: propertyId,
        apartment_id: f.apartment_id || null,
        member_name: f.member_name.trim() || null,
        tenant_name: f.tenant_name.trim(),
        tenant_contact: f.tenant_contact.trim() || null,
        start_date: f.start_date,
        end_date: f.end_date || null,
        reason: f.reason || null,
        permit_status: f.permit_status,
        permit_date: f.permit_date || null,
        insurance_ok: f.insurance_ok,
        fee_per_year: numOrNull(f.fee_per_year),
        tenant_rent: numOrNull(f.tenant_rent),
        suitability_note: f.suitability_note.trim() || null,
        note: f.note.trim() || null,
      };
      const { error } = initial
        ? await supabase.from("sublettings").update(row).eq("id", initial.id)
        : await supabase.from("sublettings").insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sparat", { style: { background: "#3D8A30", color: "#fff" } });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message ?? "Kunde inte spara"),
  });

  const fld = (label: string, k: keyof typeof f, type = "text", placeholder?: string) => (
    <div>
      <label className="fp-label">{label}</label>
      <input className="fp-input" type={type} value={String(f[k])} onChange={set(k)} placeholder={placeholder} />
    </div>
  );

  return (
    <div className="no-print" style={{ background: "#fff", border: `2px solid ${GOLD}`, borderRadius: 16, padding: "18px 20px", display: "grid", gap: 14 }}>
      <div style={{ fontFamily: "Outfit, Inter, system-ui, sans-serif", fontSize: 20, fontWeight: 800, color: INK }}>{initial ? "Redigera uthyrning" : "Ny uthyrning"}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        <div>
          <label className="fp-label">Lägenhet</label>
          <select className="fp-select" value={f.apartment_id} onChange={set("apartment_id")}>
            <option value="">Välj lägenhet</option>
            {apts.map((a) => (
              <option key={a.id} value={a.id}>Lgh {a.apartment_number}</option>
            ))}
          </select>
        </div>
        {fld("Medlem (hyr ut)", "member_name")}
        {fld("Hyresgäst", "tenant_name")}
        {fld("Hyresgästens kontakt", "tenant_contact", "text", "telefon eller e-post")}
        {fld("Startdatum", "start_date", "date")}
        {fld("Slutdatum (tomt = tills vidare)", "end_date", "date")}
        <div>
          <label className="fp-label">Skäl</label>
          <select className="fp-select" value={f.reason} onChange={set("reason")}>
            <option value="">Välj skäl</option>
            {REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="fp-label">Beslut</label>
          <select className="fp-select" value={f.permit_status} onChange={set("permit_status")}>
            <option value="ansokt">Ansökt</option>
            <option value="godkand">Godkänd</option>
            <option value="avslagen">Avslagen</option>
          </select>
        </div>
        {fld("Beslutsdatum", "permit_date", "date")}
        {fld("Hyra till medlemmen (kr per månad)", "tenant_rent", "text", "t.ex. 9000")}
        {fld("Avgift till föreningen per år (kr)", "fee_per_year", "text", "5920")}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15 }}>
        <input type="checkbox" checked={f.insurance_ok} onChange={(e) => setF({ ...f, insurance_ok: e.target.checked })} />
        Försäkringsbrev finns (krävs innan avtal kan markeras som signerat)
      </label>
      <div>
        <label className="fp-label">Lämplighetsbedömning (styrelsens egen bedömning)</label>
        <textarea className="fp-textarea" rows={3} value={f.suitability_note} onChange={set("suitability_note")} placeholder="t.ex. Referenser kontrollerade, hyran är rimlig mot hyresgästens inkomst enligt underlag från medlemmen." />
      </div>
      <div>
        <label className="fp-label">Anteckning</label>
        <textarea className="fp-textarea" rows={3} value={f.note} onChange={set("note")} />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" className="fp-btn fp-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Sparar…" : "Spara"}</button>
        <button type="button" className="fp-btn" onClick={onCancel}>Avbryt</button>
      </div>
    </div>
  );
}
