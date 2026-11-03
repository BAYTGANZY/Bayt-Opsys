/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

const BUCKET = "finance-docs";
const INK = "#0D2B1E";
const MUTED = "#6B7280";
const LINE = "#E3E7E2";
const HOT = "#C2334D";
const GOLD = "#E8C464";
const GOLD_SOFT = "rgba(232,196,100,0.16)";

export type FieldDef = { key: string; label: string; kind: "num" | "date"; keywords: string[] };

// Ordningen styr matchningen: mer specifika nyckelord först.
export const FIELDS: FieldDef[] = [
  { key: "decided_increase_pct", label: "Beslutad avgiftshöjning (%)", kind: "num", keywords: ["beslutad"] },
  { key: "cash_date", label: "Kassa per datum (ÅÅÅÅ-MM-DD)", kind: "date", keywords: ["kassa per", "kassadatum"] },
  { key: "operating_cashflow", label: "Kassaflöde från löpande verksamhet (kr)", kind: "num", keywords: ["kassaflöde"] },
  { key: "cash_balance", label: "Kassa idag (kr)", kind: "num", keywords: ["kassa idag"] },
  { key: "monthly_net_cashflow", label: "Löpande nettoflöde per månad (kr, minus = utflöde)", kind: "num", keywords: ["nettoflöde", "månadsflöde"] },
  { key: "min_cash_buffer", label: "Lägsta önskade kassa, buffert (kr)", kind: "num", keywords: ["buffert"] },
  { key: "annual_fees", label: "Årsavgifter bostäder per år (kr)", kind: "num", keywords: ["årsavgift"] },
  { key: "residential_area", label: "Bostadsyta (kvm)", kind: "num", keywords: ["bostadsyta"] },
  { key: "total_area", label: "Totalyta (kvm)", kind: "num", keywords: ["totalyta"] },
  { key: "apartments", label: "Antal bostadsrätter", kind: "num", keywords: ["antal bostadsr", "antal lägenheter"] },
  { key: "avg_interest_pct", label: "Genomsnittlig skuldränta (%)", kind: "num", keywords: ["skuldränta"] },
  { key: "annual_amortization", label: "Amortering per år (kr)", kind: "num", keywords: ["amortering"] },
  { key: "liquid_funds", label: "Likvida medel vid bokslut (kr)", kind: "num", keywords: ["likvida"] },
  { key: "interest_cost", label: "Räntekostnad per år (kr)", kind: "num", keywords: ["räntekostnad"] },
  { key: "net_result", label: "Årets resultat (kr)", kind: "num", keywords: ["årets resultat"] },
  { key: "equity_ratio_pct", label: "Soliditet (%)", kind: "num", keywords: ["soliditet"] },
];

export const EXTRA_LABELS: Record<string, string> = {
  loans: "Lån och villkorsändringsdagar",
  known_payments: "Kända utbetalningar",
  monthly_items: "Budgetposter",
};

export type Loan = { date: string; amount: number; rate: number };
export type Item = { label: string; amount: number; from: string; to: string };
export type Payment = { date: string; amount: number; label: string };
export type ImportDoc = { id: string; title: string; period: string | null; doc_type: string; file_path: string; file_name: string };

type Proposal = {
  fields: Array<{ key: string; value: number | string; source: string }>;
  loans: Loan[];
  items: Item[];
  payments: Payment[];
  note: string;
};
type Row = { key: string; label: string; kind: "num" | "date"; val: string; source: string; sel: boolean };
type Mode = "replace" | "append" | "skip";

// ----------------------------------------------------------------- hjälpare
const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/\s+/g, " ").trim();

function toNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.replace(/[\s\u00a0kr%]/g, "").replace(/\u2212/g, "-").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function toIso(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return new Date(v.getTime() + 12 * 3600e3).toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400e3)).toISOString().slice(0, 10);
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  return null;
}
function toYm(v: unknown): string | null {
  const m = typeof v === "string" ? v.trim().match(/^(\d{4})-(\d{2})$/) : null;
  if (m) return `${m[1]}-${m[2]}`;
  const d = toIso(v);
  return d ? d.slice(0, 7) : null;
}
const fmt = (v: unknown) => (typeof v === "number" ? v.toLocaleString("sv-SE") : v == null || v === "" ? "—" : String(v));
const uniq = <T,>(arr: T[], key: (t: T) => string) => {
  const seen = new Set<string>();
  return arr.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
const findField = (label: unknown) => {
  const n = norm(label);
  return FIELDS.find((f) => f.keywords.some((k) => n.includes(k)));
};

// ------------------------------------------------------------- bibliotek
function loadXlsx(): Promise<any> {
  const w = window as any;
  if (w.XLSX) return Promise.resolve(w.XLSX);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = () => resolve(w.XLSX);
    s.onerror = () => reject(new Error("Kunde inte ladda Excel-biblioteket."));
    document.head.appendChild(s);
  });
}

async function pdfText(buf: ArrayBuffer): Promise<string> {
  const base = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/";
  const pdfjs: any = await import(/* @vite-ignore */ base + "pdf.min.mjs");
  const wres = await fetch(base + "pdf.worker.min.mjs");
  const blob = new Blob([await wres.text()], { type: "text/javascript" });
  pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  let out = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const c = await page.getTextContent();
    out += `\n[Sida ${p}]\n` + c.items.map((i: any) => i.str).join(" ");
  }
  return out;
}

// ------------------------------------------------------------------ mall
export async function downloadTemplate() {
  const X = await loadXlsx();
  const wb = X.utils.book_new();
  const add = (name: string, aoa: unknown[][]) => X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(aoa), name);
  add("Instruktion", [
    ["Instruktion"],
    ["Fyll i de blad du har siffror för och ta bort resten. Tomma celler ändrar ingenting."],
    ["Nyckeltal: ett värde per rad i kolumn B. Datum skrivs ÅÅÅÅ-MM-DD."],
    ["Lån: villkorsändringsdag, belopp i kr och ränta i procent."],
    ["Budgetposter: belopp per månad (minus = kostnad), från och till som ÅÅÅÅ-MM."],
    ["Kända utbetalningar: datum, belopp inklusive moms och beskrivning."],
    ["Ändra inte rubrikerna på rad 1."],
  ]);
  add("Nyckeltal", [["Fält", "Värde"], ...FIELDS.map((f) => [f.label, null])]);
  add("Lån", [["Villkorsändringsdag", "Belopp", "Ränta %"]]);
  add("Budgetposter", [["Namn", "Kr per månad", "Från (ÅÅÅÅ-MM)", "Till (ÅÅÅÅ-MM)"]]);
  add("Kända utbetalningar", [["Datum", "Belopp inkl moms", "Beskrivning"]]);
  X.writeFile(wb, "BAYT-ekonomimall.xlsx");
}

// ------------------------------------------------------------ Excel/CSV
async function parseSheetFile(buf: ArrayBuffer, fileName: string): Promise<Proposal> {
  const X = await loadXlsx();
  let wb: any;
  if (/\.csv$/i.test(fileName)) {
    const text = new TextDecoder("utf-8").decode(buf);
    const fs = text.split(";").length > text.split(",").length ? ";" : ",";
    wb = X.read(text, { type: "string", FS: fs, cellDates: true });
  } else {
    wb = X.read(buf, { type: "array", cellDates: true });
  }
  const p: Proposal = { fields: [], loans: [], items: [], payments: [], note: "" };
  let matched = 0;

  for (const name of wb.SheetNames as string[]) {
    let rows: any[][] = X.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
    rows = rows
      .map((r) => (r.length === 1 && typeof r[0] === "string" && r[0].includes(";") ? r[0].split(";") : r))
      .filter((r) => r.some((c) => c !== null && String(c).trim() !== ""));
    if (rows.length < 1) continue;
    const head = rows[0].map((c) => norm(c));
    const body = rows.slice(1);
    const col = (...keys: string[]) => head.findIndex((h) => keys.some((k) => h.includes(k)));
    const src = `${fileName}, blad "${name}"`;

    const cRate = col("ränta");
    const cAmt = col("belopp", "skuld");
    const cName = col("namn");
    const cFrom = col("från");
    const cPerMonth = col("per månad", "belopp");
    const cDate = col("villkor", "datum");

    if (cRate >= 0 && cAmt >= 0 && cDate >= 0) {
      for (const r of body) {
        const date = toIso(r[cDate]);
        const amount = toNum(r[cAmt]);
        let rate = toNum(r[cRate]);
        if (!date || !amount || rate == null) continue;
        if (rate > 0 && rate < 0.3) rate = rate * 100;
        p.loans.push({ date, amount, rate });
      }
      matched++;
    } else if (cName >= 0 && cFrom >= 0 && cPerMonth >= 0) {
      for (const r of body) {
        const amount = toNum(r[cPerMonth]);
        const from = toYm(r[cFrom]);
        if (amount == null || !from || String(r[cName] ?? "").trim() === "") continue;
        const cTo = col("till");
        p.items.push({ label: String(r[cName]).trim(), amount, from, to: cTo >= 0 ? toYm(r[cTo]) ?? "" : "" });
      }
      matched++;
    } else if (cDate >= 0 && cAmt >= 0) {
      const cLabel = col("beskriv", "text");
      for (const r of body) {
        const date = toIso(r[cDate]);
        const amount = toNum(r[cAmt]);
        if (!date || !amount) continue;
        p.payments.push({ date, amount, label: cLabel >= 0 ? String(r[cLabel] ?? "").trim() : "" });
      }
      matched++;
    } else if (head[0].includes("fält") || head[0].includes("nyckeltal")) {
      for (const r of body) {
        const def = findField(r[0]);
        if (!def || r[1] === null || String(r[1]).trim() === "") continue;
        const value = def.kind === "date" ? toIso(r[1]) : toNum(r[1]);
        if (value == null) continue;
        p.fields.push({ key: def.key, value, source: src });
      }
      matched++;
    }
  }
  if (matched === 0) throw new Error("Hittade inga kända blad eller kolumner. Ladda ner mallen och använd dess rubriker.");
  return p;
}

// ------------------------------------------------------------------ PDF
function fromAi(r: any, fileName: string): Proposal {
  const p: Proposal = { fields: [], loans: [], items: [], payments: [], note: String(r?.notes ?? "") };
  for (const def of FIELDS) {
    const f = r?.fields?.[def.key];
    if (!f || f.value == null) continue;
    const value = def.kind === "date" ? toIso(f.value) : toNum(f.value);
    if (value == null) continue;
    p.fields.push({ key: def.key, value, source: String(f.source ?? fileName) });
  }
  for (const l of Array.isArray(r?.loans) ? r.loans : []) {
    const date = toIso(l?.date);
    const amount = toNum(l?.amount);
    const rate = toNum(l?.rate);
    if (date && amount && rate != null) p.loans.push({ date, amount, rate });
  }
  if (r?.period) p.note = `Period: ${r.period}. ${p.note}`.trim();
  return p;
}

// ------------------------------------------------------------ komponent
export function EkonomiImport({ propertyId, doc, onClose }: { propertyId: string; doc: ImportDoc; onClose: () => void }) {
  const qc = useQueryClient();
  const isSheet = /\.(xlsx|xls|csv)$/i.test(doc.file_name);
  const [stage, setStage] = useState<"idle" | "reading" | "preview">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [prop, setProp] = useState<Proposal | null>(null);
  const [modes, setModes] = useState<{ loans: Mode; items: Mode; payments: Mode }>({ loans: "replace", items: "append", payments: "append" });

  const finQ = useQuery({
    queryKey: ["pfin", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("property_finance").select("*").eq("property_id", propertyId).maybeSingle();
      if (error) throw error;
      return (data as Record<string, any> | null) ?? null;
    },
  });
  const fin = finQ.data ?? null;

  async function read() {
    setStage("reading");
    setErr(null);
    try {
      const { data: blob, error } = await supabase.storage.from(BUCKET).download(doc.file_path);
      if (error || !blob) throw new Error("Kunde inte hämta filen.");
      const buf = await blob.arrayBuffer();
      let p: Proposal;
      if (isSheet) {
        p = await parseSheetFile(buf, doc.file_name);
      } else {
        const text = await pdfText(buf);
        if (text.replace(/\[Sida \d+\]|\s/g, "").length < 200) {
          throw new Error("Ingen läsbar text i PDF:en. Är den inskannad? Använd i så fall Excel-mallen.");
        }
        const { data, error: fe } = await supabase.functions.invoke("extract-finance-doc", {
          body: { text: text.slice(0, 150000), doc_type: doc.doc_type },
        });
        if (fe) {
          const body = await (fe as any).context?.json?.().catch(() => null);
          throw new Error(body?.error ?? fe.message ?? "Tolkningen misslyckades.");
        }
        if (data?.error) throw new Error(data.error);
        p = fromAi(data.result, doc.file_name);
      }
      if (p.fields.length + p.loans.length + p.items.length + p.payments.length === 0) {
        throw new Error("Inga siffror hittades i dokumentet.");
      }
      setProp(p);
      setRows(
        p.fields.map((f) => {
          const def = FIELDS.find((d) => d.key === f.key)!;
          const cur = fin?.[f.key];
          return { key: f.key, label: def.label, kind: def.kind, val: String(f.value), source: f.source, sel: isSheet || cur == null || cur === "" };
        }),
      );
      setStage("preview");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Något gick fel");
      setStage("idle");
    }
  }

  const apply = useMutation({
    mutationFn: async () => {
      if (!prop) return;
      const cur = fin ?? {};
      const now = new Date().toISOString();
      const upd: Record<string, any> = { property_id: propertyId, updated_at: now };
      const srcs: Record<string, any> = { ...(cur.field_sources ?? {}) };
      const stamp = (note: string) => ({ doc_id: doc.id, title: doc.title, note, at: now });

      for (const r of rows) {
        if (!r.sel) continue;
        const v = r.kind === "date" ? toIso(r.val) : toNum(r.val);
        if (v == null) throw new Error(`"${r.label}": ogiltigt värde.`);
        upd[r.key] = v;
        srcs[r.key] = stamp(r.source);
      }
      if (modes.loans !== "skip" && prop.loans.length) {
        const old: Loan[] = Array.isArray(cur.loans) ? cur.loans : [];
        upd.loans = modes.loans === "replace" ? prop.loans : uniq([...old, ...prop.loans], (l) => `${l.date}|${l.amount}`).sort((a, b) => a.date.localeCompare(b.date));
        srcs.loans = stamp(`${prop.loans.length} lån`);
      }
      if (modes.items !== "skip" && prop.items.length) {
        const old: Item[] = Array.isArray(cur.monthly_items) ? cur.monthly_items : [];
        upd.monthly_items = modes.items === "replace" ? prop.items : uniq([...old, ...prop.items], (i) => `${i.label}|${i.from}|${i.amount}`);
        srcs.monthly_items = stamp(`${prop.items.length} budgetposter`);
      }
      if (modes.payments !== "skip" && prop.payments.length) {
        const old: Payment[] = Array.isArray(cur.known_payments) ? cur.known_payments : [];
        upd.known_payments = modes.payments === "replace" ? prop.payments : uniq([...old, ...prop.payments], (p) => `${p.date}|${p.amount}|${p.label}`);
        srcs.known_payments = stamp(`${prop.payments.length} utbetalningar`);
      }
      upd.field_sources = srcs;
      const tag = `Importerat från ${doc.title}`;
      const oldSource = String(cur.source ?? "");
      if (!oldSource.includes(tag)) upd.source = oldSource ? `${oldSource}; ${tag}` : tag;

      const { error } = await supabase.from("property_finance").upsert(upd, { onConflict: "property_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Siffrorna är uppdaterade", { style: { background: "#3D8A30", color: "#fff" } });
      void qc.invalidateQueries({ queryKey: ["pfin", propertyId] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message ?? "Kunde inte spara"),
  });

  const th: React.CSSProperties = { textAlign: "left", padding: "6px 8px", fontSize: 11.5, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED, borderBottom: `1px solid ${LINE}` };
  const td: React.CSSProperties = { padding: "7px 8px", borderBottom: `1px solid ${LINE}`, fontSize: 14, verticalAlign: "top" };
  const modeSel = (k: "loans" | "items" | "payments", count: number) =>
    count > 0 && (
      <select value={modes[k]} onChange={(e) => setModes({ ...modes, [k]: e.target.value as Mode })} style={{ height: 34, borderRadius: 8, border: `1px solid ${LINE}`, padding: "0 8px", font: "inherit", fontSize: 13 }}>
        <option value="replace">Ersätt befintliga</option>
        <option value="append">Lägg till (hoppar över dubbletter)</option>
        <option value="skip">Hoppa över</option>
      </select>
    );

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 18, border: `2px solid ${GOLD}`, boxShadow: `0 0 0 4px ${GOLD_SOFT}`, background: "#fff" }}>
      <div style={{ background: "radial-gradient(ellipse at 15% 0%, #21503f 0%, #0f2a21 55%, #0b1d17 100%)", color: "#e6efd8", padding: "18px 22px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <span style={{ display: "inline-block", fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", color: INK, background: GOLD, borderRadius: 999, padding: "3px 10px", marginBottom: 6 }}>
            {isSheet ? "IMPORT FRÅN EXCEL/CSV" : "PDF-TOLKNING MED AI"}
          </span>
          <div style={{ fontFamily: "Outfit, Inter, system-ui, sans-serif", fontSize: 22, fontWeight: 800, color: "#fff" }}>{doc.title}</div>
          <div style={{ fontSize: 13, color: "#9fb79f" }}>{doc.file_name}</div>
        </div>
        <button type="button" onClick={onClose} style={{ height: 38, padding: "0 16px", borderRadius: 10, border: `1px solid ${GOLD}`, background: "transparent", color: GOLD, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          Stäng
        </button>
      </div>

      <div style={{ padding: "18px 22px", display: "grid", gap: 16 }}>
        {stage !== "preview" && (
          <div>
            <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.6, marginBottom: 12 }}>
              {isSheet
                ? "Filen läses i din webbläsare. Inget skickas vidare. Du ser en förhandsgranskning innan något sparas."
                : "Texten i PDF:en läses i din webbläsare och skickas till Claude (Anthropic) för tolkning. Du får en förhandsgranskning och kan ändra varje värde innan något sparas."}
            </div>
            <button
              type="button"
              disabled={stage === "reading"}
              onClick={() => void read()}
              style={{ height: 44, padding: "0 24px", borderRadius: 12, border: "none", background: GOLD, color: INK, fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit", opacity: stage === "reading" ? 0.6 : 1 }}
            >
              {stage === "reading" ? "Läser in…" : "Läs ut siffror"}
            </button>
            {err && <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "#FEF3F3", border: "1px solid #F1C0C0", color: "#B91C1C", fontSize: 14 }}>{err}</div>}
          </div>
        )}

        {stage === "preview" && prop && (
          <>
            {prop.note && <div style={{ fontSize: 13.5, color: "#374151", background: "#F7F9F6", border: `1px solid ${LINE}`, borderRadius: 10, padding: "9px 12px" }}>{prop.note}</div>}
            {!isSheet && <div style={{ fontSize: 13, color: "#B45309" }}>AI-tolkade värden kan vara fel. Kontrollera mot dokumentet. Rader som ändrar ett befintligt värde är avbockade från start.</div>}

            {rows.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Spara</th>
                      <th style={th}>Siffra</th>
                      <th style={th}>Nu</th>
                      <th style={th}>Nytt värde</th>
                      <th style={th}>Källa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const cur = fin?.[r.key];
                      const changed = cur != null && cur !== "" && String(cur) !== String(r.kind === "date" ? r.val : toNum(r.val));
                      return (
                        <tr key={r.key} style={{ background: changed ? "#FFF9E8" : undefined }}>
                          <td style={td}>
                            <input type="checkbox" checked={r.sel} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, sel: e.target.checked } : x)))} />
                          </td>
                          <td style={{ ...td, fontWeight: 600 }}>{r.label}</td>
                          <td style={{ ...td, color: MUTED }}>{fmt(cur)}</td>
                          <td style={td}>
                            <input
                              value={r.val}
                              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, val: e.target.value } : x)))}
                              style={{ height: 34, width: 150, padding: "0 8px", borderRadius: 8, border: `1px solid ${changed ? GOLD : LINE}`, font: "inherit", fontSize: 14 }}
                            />
                          </td>
                          <td style={{ ...td, color: MUTED, fontSize: 13 }}>{r.source}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {prop.loans.length > 0 && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                  <strong>Lån ({prop.loans.length})</strong>
                  {modeSel("loans", prop.loans.length)}
                </div>
                <div style={{ fontSize: 13.5, color: "#374151", lineHeight: 1.7 }}>
                  {prop.loans.map((l, i) => (
                    <div key={i}>{l.date} · {fmt(l.amount)} kr · {String(l.rate).replace(".", ",")} %</div>
                  ))}
                </div>
              </div>
            )}
            {prop.items.length > 0 && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                  <strong>Budgetposter ({prop.items.length})</strong>
                  {modeSel("items", prop.items.length)}
                </div>
                <div style={{ fontSize: 13.5, color: "#374151", lineHeight: 1.7 }}>
                  {prop.items.map((it, i) => (
                    <div key={i}>{it.label} · {fmt(it.amount)} kr/mån · från {it.from}{it.to ? ` till ${it.to}` : ""}</div>
                  ))}
                </div>
              </div>
            )}
            {prop.payments.length > 0 && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                  <strong>Kända utbetalningar ({prop.payments.length})</strong>
                  {modeSel("payments", prop.payments.length)}
                </div>
                <div style={{ fontSize: 13.5, color: "#374151", lineHeight: 1.7 }}>
                  {prop.payments.map((p, i) => (
                    <div key={i}>{p.date} · {fmt(p.amount)} kr · {p.label || "—"}</div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={apply.isPending}
                onClick={() => apply.mutate()}
                style={{ height: 46, padding: "0 26px", borderRadius: 12, border: "none", background: GOLD, color: INK, fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit", opacity: apply.isPending ? 0.7 : 1 }}
              >
                {apply.isPending ? "Sparar…" : "Spara valda siffror"}
              </button>
              <button type="button" className="fp-btn" onClick={() => { setStage("idle"); setProp(null); setRows([]); }}>
                Börja om
              </button>
            </div>
            <div style={{ fontSize: 12.5, color: HOT }}>Allt som sparas får detta dokument som källa och visas under "Källa per siffra".</div>
          </>
        )}
      </div>
    </div>
  );
}
