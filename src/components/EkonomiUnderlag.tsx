/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { sanitizeStorageName } from "@/lib/storage";
import { EkonomiImport, FIELDS, EXTRA_LABELS, downloadTemplate } from "@/components/EkonomiImport";

const INK = "#0D2B1E";
const MUTED = "#6B7280";
const LINE = "#E3E7E2";
const HOT = "#C2334D";
const GOLD = "#E8C464";
const GOLD_SOFT = "rgba(232,196,100,0.16)";
const BUCKET = "finance-docs";
const MAX_BYTES = 25 * 1024 * 1024;

type Doc = {
  id: string;
  property_id: string;
  doc_type: string;
  title: string;
  period: string | null;
  note: string | null;
  file_path: string;
  file_name: string;
  file_size: number | null;
  created_at: string;
};

const DOC_TYPES: Array<{ key: string; label: string }> = [
  { key: "underhallsplan", label: "Underhållsplan" },
  { key: "budget", label: "Budget" },
  { key: "arsredovisning", label: "Årsredovisning" },
  { key: "lan", label: "Lån och räntor" },
  { key: "kassa", label: "Kassa och bank" },
  { key: "offert", label: "Offert / avtal" },
  { key: "annat", label: "Annat" },
];
const TYPE_LABEL = Object.fromEntries(DOC_TYPES.map((t) => [t.key, t.label])) as Record<string, string>;

// Vilka siffror i Ekonomi & Avgift som bygger på vilken dokumenttyp.
const FEEDS: Array<{ type: string; figures: string }> = [
  { type: "budget", figures: "Årsavgifter, budgetposter, månadsflöde" },
  { type: "underhallsplan", figures: "Rekommenderad avsättning, investeringar, dyraste år" },
  { type: "lan", figures: "Lån, räntor och villkorsändringsdagar" },
  { type: "arsredovisning", figures: "Resultat, soliditet, amortering, kassaflöde, ytor" },
  { type: "kassa", figures: "Kassa idag och kända utbetalningar" },
];

const fmtSize = (n: number | null) => (n == null ? "" : n > 1e6 ? `${(n / 1e6).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1e3))} kB`);
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" });
const fmtVal = (v: unknown) => (typeof v === "number" ? v.toLocaleString("sv-SE") : v == null ? "—" : String(v));

async function openDoc(d: { file_path: string }) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(d.file_path, 600);
  if (error || !data?.signedUrl) return void toast.error("Kunde inte öppna filen.");
  window.open(data.signedUrl, "_blank", "noopener");
}

export function EkonomiUnderlag({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [type, setType] = useState("arsredovisning");
  const [title, setTitle] = useState("");
  const [period, setPeriod] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filter, setFilter] = useState("alla");
  const [importDoc, setImportDoc] = useState<Doc | null>(null);

  const q = useQuery({
    queryKey: ["pdocs", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_documents")
        .select("*")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Doc[];
    },
  });
  const docs = q.data ?? [];

  const finQ = useQuery({
    queryKey: ["pfin", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("property_finance").select("*").eq("property_id", propertyId).maybeSingle();
      if (error) throw error;
      return (data as Record<string, any> | null) ?? null;
    },
  });
  const fin = finQ.data ?? null;
  const fs = (fin?.field_sources ?? {}) as Record<string, { doc_id: string; title: string; note?: string; at?: string }>;

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Välj en fil först.");
      if (file.size > MAX_BYTES) throw new Error("Filen är för stor (max 25 MB).");
      if (!/\.(pdf|xlsx|xls|csv)$/i.test(file.name)) throw new Error("Bara PDF, Excel (.xlsx/.xls) och CSV tillåts.");
      const path = `${propertyId}/${crypto.randomUUID()}-${sanitizeStorageName(file.name)}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
      if (up.error) throw new Error("Uppladdningen misslyckades.");
      const { error } = await supabase.from("property_documents").insert({
        property_id: propertyId,
        doc_type: type,
        title: title.trim() || file.name,
        period: period.trim() || null,
        note: note.trim() || null,
        file_path: path,
        file_name: file.name,
        file_size: file.size,
      });
      if (error) {
        void supabase.storage.from(BUCKET).remove([path]);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Underlaget är sparat", { style: { background: "#3D8A30", color: "#fff" } });
      setFile(null);
      setTitle("");
      setPeriod("");
      setNote("");
      if (fileRef.current) fileRef.current.value = "";
      void qc.invalidateQueries({ queryKey: ["pdocs", propertyId] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Kunde inte spara"),
  });

  const remove = useMutation({
    mutationFn: async (d: Doc) => {
      const { error } = await supabase.from("property_documents").delete().eq("id", d.id);
      if (error) throw error;
      void supabase.storage.from(BUCKET).remove([d.file_path]);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["pdocs", propertyId] }),
    onError: (e: Error) => toast.error(e.message ?? "Kunde inte ta bort"),
  });

  const latest = (t: string) => docs.find((d) => d.doc_type === t) ?? null;
  const shown = filter === "alla" ? docs : docs.filter((d) => d.doc_type === filter);
  const canImport = (d: Doc) => d.doc_type !== "underhallsplan" && d.doc_type !== "offert";

  const sourcedFields = FIELDS.filter((f) => fs[f.key]);
  const unsourced = FIELDS.filter((f) => !fs[f.key] && fin?.[f.key] != null && fin?.[f.key] !== "");
  const extraKeys = Object.keys(EXTRA_LABELS).filter((k) => fs[k]);

  const dInp: React.CSSProperties = {
    height: 40, padding: "0 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.08)", color: "#fff", font: "inherit", fontSize: 14, width: "100%", boxSizing: "border-box",
  };
  const dLab: React.CSSProperties = { fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9fb79f" };
  const cardStyle: React.CSSProperties = { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: "16px 18px" };
  const h3: React.CSSProperties = { fontFamily: "Outfit, Inter, system-ui, sans-serif", fontSize: 20, fontWeight: 700, margin: 0, color: INK };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Hjälte med uppladdning */}
      <div
        style={{
          position: "relative", overflow: "hidden", borderRadius: 18, color: "#e6efd8", padding: "22px 24px",
          background: "radial-gradient(ellipse at 15% 0%, #21503f 0%, #0f2a21 55%, #0b1d17 100%)",
          border: `2px solid ${GOLD}`, boxShadow: `0 0 0 4px ${GOLD_SOFT}, 0 18px 40px -18px rgba(0,0,0,0.55)`,
        }}
      >
        <div style={{ position: "absolute", right: -40, top: -50, width: 190, height: 190, borderRadius: "50%", border: `26px solid ${GOLD_SOFT}`, pointerEvents: "none" }} />
        <div style={{ position: "relative" }}>
          <span style={{ display: "inline-block", fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", color: INK, background: GOLD, borderRadius: 999, padding: "3px 10px", marginBottom: 8 }}>
            SPÅRBARHET
          </span>
          <div style={{ fontFamily: "Outfit, Inter, system-ui, sans-serif", fontSize: 26, fontWeight: 800, color: "#fff" }}>Underlag</div>
          <div style={{ fontSize: 14, color: "#c9d8c3", margin: "6px 0 16px", lineHeight: 1.6 }}>
            Ladda upp dokumenten som siffrorna bygger på. Excel och CSV läses in exakt, PDF tolkas med AI och granskas av dig. Varje importerad siffra får dokumentet som källa.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
            <label>
              <span style={dLab}>Typ av underlag</span>
              <select style={dInp} value={type} onChange={(e) => setType(e.target.value)}>
                {DOC_TYPES.map((t) => (
                  <option key={t.key} value={t.key} style={{ color: INK }}>{t.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span style={dLab}>Titel (valfritt)</span>
              <input style={dInp} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="t.ex. Årsredovisning 2025" />
            </label>
            <label>
              <span style={dLab}>Period</span>
              <input style={dInp} value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="t.ex. 2025 eller 2026–2027" />
            </label>
            <label>
              <span style={dLab}>Anteckning</span>
              <input style={dInp} value={note} onChange={(e) => setNote(e.target.value)} placeholder="valfritt" />
            </label>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 14 }}>
            <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.csv,application/pdf" style={{ display: "none" }} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              style={{ height: 44, padding: "0 20px", borderRadius: 12, border: `1px solid ${GOLD}`, background: GOLD_SOFT, color: GOLD, fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}
            >
              {file ? `Vald: ${file.name}` : "Välj fil (PDF, Excel, CSV)"}
            </button>
            <button
              type="button"
              disabled={!file || upload.isPending}
              onClick={() => upload.mutate()}
              style={{ height: 44, padding: "0 24px", borderRadius: 12, border: "none", background: GOLD, color: INK, fontWeight: 800, fontSize: 14, cursor: !file ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: !file || upload.isPending ? 0.6 : 1 }}
            >
              {upload.isPending ? "Laddar upp…" : "Spara underlag"}
            </button>
            <button
              type="button"
              onClick={() => void downloadTemplate().catch((e: Error) => toast.error(e.message))}
              style={{ height: 44, padding: "0 20px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}
            >
              Ladda ner Excel-mall
            </button>
            <span style={{ fontSize: 12.5, color: "#9fb79f" }}>Max 25 MB. Filerna är privata och syns bara för admin.</span>
          </div>
        </div>
      </div>

      {/* Import */}
      {importDoc && <EkonomiImport key={importDoc.id} propertyId={propertyId} doc={importDoc} onClose={() => setImportDoc(null)} />}

      {/* Siffror och deras källor */}
      <div style={cardStyle}>
        <h3 style={{ ...h3, marginBottom: 4 }}>Så här är siffrorna grundade</h3>
        <div style={{ fontSize: 13, color: MUTED, marginBottom: 12 }}>Senaste uppladdade underlag per typ av siffra.</div>
        <div style={{ display: "grid", gap: 8 }}>
          {FEEDS.map((f) => {
            const d = latest(f.type);
            return (
              <div
                key={f.type}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
                  padding: "11px 14px", borderRadius: 12, background: d ? "#F7F9F6" : "#FEF3F3",
                  border: `1px solid ${d ? LINE : "#F1C0C0"}`, borderLeft: `4px solid ${d ? "#3D8A30" : HOT}`,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: INK }}>{f.figures}</div>
                  <div style={{ fontSize: 13, color: d ? MUTED : "#B91C1C", marginTop: 2 }}>
                    {d ? `${TYPE_LABEL[f.type]}: ${d.title}${d.period ? ` (${d.period})` : ""} · uppladdad ${fmtDate(d.created_at)}` : `Inget ${TYPE_LABEL[f.type].toLowerCase()} uppladdat än`}
                  </div>
                </div>
                {d && (
                  <button type="button" className="fp-btn" style={{ height: 34 }} onClick={() => void openDoc(d)}>
                    Öppna underlaget
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Källa per siffra */}
      <div style={cardStyle}>
        <h3 style={{ ...h3, marginBottom: 4 }}>Källa per siffra</h3>
        <div style={{ fontSize: 13, color: MUTED, marginBottom: 12 }}>Siffror som kommit in via import och vilket dokument de bygger på.</div>
        {sourcedFields.length + extraKeys.length === 0 && (
          <div style={{ fontSize: 14, color: MUTED }}>Ingen import är gjord ännu. Tryck "Läs in siffror" på ett dokument i arkivet.</div>
        )}
        <div style={{ display: "grid", gap: 6 }}>
          {sourcedFields.map((f) => {
            const s = fs[f.key];
            const d = docs.find((x) => x.id === s.doc_id);
            return (
              <div key={f.key} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", padding: "8px 12px", border: `1px solid ${LINE}`, borderRadius: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 700 }}>{f.label.replace(/ \(.*\)$/, "")}</span>: {fmtVal(fin?.[f.key])}
                  <div style={{ fontSize: 12.5, color: MUTED }}>Källa: {s.title}{s.note ? ` · ${s.note}` : ""}{s.at ? ` · ${fmtDate(s.at)}` : ""}</div>
                </div>
                {d ? (
                  <button type="button" className="fp-btn" style={{ height: 32 }} onClick={() => void openDoc(d)}>Öppna</button>
                ) : (
                  <span style={{ fontSize: 12.5, color: HOT }}>Dokumentet är borttaget</span>
                )}
              </div>
            );
          })}
          {extraKeys.map((k) => {
            const s = fs[k];
            const d = docs.find((x) => x.id === s.doc_id);
            return (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", padding: "8px 12px", border: `1px solid ${LINE}`, borderRadius: 10 }}>
                <div>
                  <span style={{ fontWeight: 700 }}>{EXTRA_LABELS[k]}</span>
                  <div style={{ fontSize: 12.5, color: MUTED }}>Källa: {s.title}{s.note ? ` · ${s.note}` : ""}{s.at ? ` · ${fmtDate(s.at)}` : ""}</div>
                </div>
                {d && <button type="button" className="fp-btn" style={{ height: 32 }} onClick={() => void openDoc(d)}>Öppna</button>}
              </div>
            );
          })}
        </div>
        {unsourced.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 13, color: "#B45309", lineHeight: 1.6 }}>
            Utan källhänvisning (inlagda för hand): {unsourced.map((f) => f.label.replace(/ \(.*\)$/, "")).join(", ")}.
          </div>
        )}
      </div>

      {/* Arkiv */}
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <h3 style={h3}>Arkiv ({docs.length})</h3>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[{ key: "alla", label: "Alla" }, ...DOC_TYPES].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setFilter(t.key)}
                style={{
                  height: 30, padding: "0 12px", borderRadius: 999, font: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                  border: `1px solid ${filter === t.key ? INK : LINE}`, background: filter === t.key ? INK : "#fff", color: filter === t.key ? "#fff" : MUTED,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {q.isLoading && <div style={{ color: MUTED }}>Hämtar…</div>}
        {q.error && <div style={{ color: "#B91C1C", fontSize: 14 }}>Kunde inte hämta underlagen: {(q.error as Error).message}. Har du kört SQL:en för property_documents?</div>}
        {!q.isLoading && !q.error && shown.length === 0 && <div style={{ color: MUTED, fontSize: 14 }}>Inga dokument här ännu.</div>}

        <div style={{ display: "grid", gap: 8 }}>
          {shown.map((d) => (
            <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "11px 14px", border: `1px solid ${LINE}`, borderRadius: 12 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: INK, background: GOLD, borderRadius: 999, padding: "2px 9px" }}>
                    {TYPE_LABEL[d.doc_type] ?? d.doc_type}
                  </span>
                  <span style={{ fontWeight: 700, color: INK, overflowWrap: "anywhere" }}>{d.title}</span>
                </div>
                <div style={{ fontSize: 12.5, color: MUTED, marginTop: 4, overflowWrap: "anywhere" }}>
                  {[d.period, d.file_name, fmtSize(d.file_size), `uppladdad ${fmtDate(d.created_at)}`].filter(Boolean).join(" · ")}
                </div>
                {d.note && <div style={{ fontSize: 13, color: "#374151", marginTop: 4 }}>{d.note}</div>}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {canImport(d) && (
                  <button
                    type="button"
                    className="fp-btn fp-primary"
                    style={{ height: 34 }}
                    onClick={() => {
                      setImportDoc(d);
                      window.scrollTo({ top: document.getElementById("underlag")?.offsetTop ?? 0, behavior: "smooth" });
                    }}
                  >
                    Läs in siffror
                  </button>
                )}
                <button type="button" className="fp-btn" style={{ height: 34 }} onClick={() => void openDoc(d)}>Öppna</button>
                <button
                  type="button"
                  className="fp-btn fp-danger"
                  style={{ height: 34 }}
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`Ta bort "${d.title}"? Det går inte att ångra.`)) remove.mutate(d);
                  }}
                >
                  Ta bort
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
