import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { parseSie } from "@/lib/sie";
import { fmtKr, groupOf, GROUPS } from "@/lib/ekonomi-oversikt";
import {
  budgetColumns,
  entriesFromPdf,
  entriesFromSie,
  parseBudgetRows,
  pdfCandidates,
  type BudgetColumn,
  toDbRows,
  type BudgetEntry,
  type BudgetSource,
  type PdfCandidate,
} from "@/lib/ekonomi-budget-import";

const INK = "#0D2B1E";
const GREEN = "#3D8A30";
const MUTED = "#6B7280";
const LINE = "#E3E7E2";
const HOT = "#C2334D";
const GOLD = "#C99A1B";
const CHUNK = 500;

const btn = (primary: boolean, disabled?: boolean) => ({
  height: 44,
  padding: "0 20px",
  borderRadius: 10,
  fontSize: 16,
  fontWeight: 600,
  fontFamily: "inherit",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.6 : 1,
  background: primary ? GREEN : "#fff",
  color: primary ? "#fff" : INK,
  border: primary ? `1px solid ${GREEN}` : `1px solid ${LINE}`,
});

// ------------------------------------------------------------ bibliotek (CDN, som övriga importer)
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

/** PDF:ens textbitar i läsordning. Varje cell i en tabell är normalt en egen bit. */
async function pdfItems(buf: ArrayBuffer): Promise<string[]> {
  const base = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/";
  const pdfjs: any = await import(/* @vite-ignore */ base + "pdf.min.mjs");
  const wres = await fetch(base + "pdf.worker.min.mjs");
  const blob = new Blob([await wres.text()], { type: "text/javascript" });
  pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const out: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const c = await page.getTextContent();
    for (const i of c.items as any[]) if (typeof i.str === "string" && i.str.trim() !== "") out.push(i.str);
  }
  return out;
}

async function sheetEntries(buf: ArrayBuffer, fileName: string, year: number): Promise<{ entries: BudgetEntry[]; note: string; rows: any[][]; cols: BudgetColumn[]; col: number | null }> {
  const X = await loadXlsx();
  let wb: any;
  if (/\.csv$/i.test(fileName)) {
    const text = new TextDecoder("utf-8").decode(buf);
    const fs = text.split(";").length > text.split(",").length ? ";" : ",";
    wb = X.read(text, { type: "string", FS: fs, cellDates: true });
  } else wb = X.read(buf, { type: "array", cellDates: true });
  let lastErr: Error | null = null;
  for (const name of wb.SheetNames as string[]) {
    let rows: any[][] = X.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
    rows = rows
      .map((r) => (r.length === 1 && typeof r[0] === "string" && r[0].includes(";") ? r[0].split(";") : r))
      .filter((r) => r.some((c) => c !== null && String(c).trim() !== ""));
    if (rows.length === 0) continue;
    try {
      const r = parseBudgetRows(rows, { year });
      if (r.entries.length > 0) {
        const cols = budgetColumns(rows);
        return { ...r, rows, cols, col: cols.length > 0 ? chosenCol(rows, cols, year) : null };
      }
    } catch (e) {
      lastErr = e as Error;
    }
  }
  throw lastErr ?? new Error("Hittade inga konton med budget i filen. Raderna ska börja med ett fyrsiffrigt kontonummer.");
}

/** Samma val som parseBudgetRows gör själv: årets "Budget", helst inte "förslag". */
function chosenCol(_rows: any[][], cols: BudgetColumn[], year: number): number {
  const plain = cols.filter((c) => !/förslag|forslag/i.test(c.label));
  const pool = plain.length > 0 ? plain : cols;
  return (pool.find((c) => c.year === year) ?? pool[pool.length - 1]).index;
}

type Proposal = {
  source: BudgetSource;
  fileName: string;
  entries: BudgetEntry[];
  note: string;
  year: number;
  years: number[];
  cands: PdfCandidate[];
  col: number;
  rows?: any[][];
  cols?: BudgetColumn[];
  sheetCol?: number | null;
};

const sum = (entries: BudgetEntry[], kind: "in" | "ut") =>
  entries
    .filter((e) => GROUPS.find((g) => g.key === groupOf(e.account))?.kind === kind)
    .reduce((s, e) => s + Math.abs(e.months.reduce((a, b) => a + b, 0)), 0);

/**
 * Admin: läs in budget ur en SIE-, Excel-, CSV- eller PDF-fil. Allt tolkas i webbläsaren och visas som
 * förhandsgranskning innan något sparas. Sparandet ersätter hela årets budget för föreningen.
 */
export function EkonomiBudgetImport({ propertyId, defaultYear }: { propertyId: string; defaultYear: number }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<"idle" | "reading" | "preview" | "saving">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [p, setP] = useState<Proposal | null>(null);

  async function onFile(f: File) {
    setErr(null);
    setStage("reading");
    try {
      const buf = await f.arrayBuffer();
      const name = f.name;
      let next: Proposal;
      if (/\.(se|sie|si)$/i.test(name)) {
        const res = parseSie(new Uint8Array(buf));
        const years = [...new Set(res.budget.map((b) => b.year))].sort((a, b) => b - a);
        if (years.length === 0) throw new Error("Filen innehåller ingen budget (#PBUDGET). Exportera den igen med budgeten ifylld, eller läs in budgeten från en Excel- eller PDF-fil.");
        const year = years.includes(defaultYear) ? defaultYear : years[0];
        next = { source: "sie", fileName: name, entries: entriesFromSie(res, year), note: "", year, years, cands: [], col: 0 };
        (next as any).res = res;
      } else if (/\.(xlsx|xls|csv)$/i.test(name)) {
        const r = await sheetEntries(buf, name, defaultYear);
        const picked = r.cols.find((c) => c.index === r.col);
        next = { source: "sheet", fileName: name, entries: r.entries, note: r.note, year: picked?.year ?? defaultYear, years: [], cands: [], col: 0, rows: r.rows, cols: r.cols, sheetCol: r.col };
      } else if (/\.pdf$/i.test(name)) {
        const items = await pdfItems(buf);
        const cands = pdfCandidates(items);
        if (cands.length === 0) throw new Error("Hittade inga kontorader med belopp i PDF:en. Är den inskannad? Använd i så fall Excel eller SIE.");
        const maxCols = Math.max(...cands.map((c) => c.amounts.length));
        const col = maxCols >= 2 ? maxCols - 1 : 0;
        next = { source: "pdf", fileName: name, entries: entriesFromPdf(cands, col), note: "Årsbeloppet är fördelat lika över tolv månader.", year: defaultYear, years: [], cands, col };
      } else throw new Error("Filtypen stöds inte. Välj en SIE-, Excel-, CSV- eller PDF-fil.");
      if (next.entries.length === 0) throw new Error("Inga konton med budget hittades i filen.");
      setP(next);
      setStage("preview");
    } catch (e) {
      setErr((e as Error).message ?? "Filen kunde inte läsas.");
      setStage("idle");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function setYear(year: number) {
    if (!p) return;
    if (p.source === "sie") setP({ ...p, year, entries: entriesFromSie((p as any).res, year) });
    else setP({ ...p, year });
  }
  function setSheetCol(index: number) {
    if (!p?.rows) return;
    const c = p.cols?.find((x) => x.index === index);
    const r = parseBudgetRows(p.rows, { col: index });
    setP({ ...p, sheetCol: index, entries: r.entries, note: r.note, year: c?.year ?? p.year });
  }
  function setCol(col: number) {
    if (!p) return;
    setP({ ...p, col, entries: entriesFromPdf(p.cands, col) });
  }

  async function save() {
    if (!p) return;
    setStage("saving");
    setErr(null);
    try {
      const rows = toDbRows(propertyId, p.year, p.entries);
      if (rows.length === 0) throw new Error("Det finns inget att spara.");
      const del = await supabase.from("finance_budgets").delete().eq("property_id", propertyId).eq("year", p.year);
      if (del.error) throw del.error;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const ins = await supabase.from("finance_budgets").insert(rows.slice(i, i + CHUNK));
        if (ins.error) throw ins.error;
      }
      const chk = await supabase.from("finance_budgets").select("account", { count: "exact", head: true }).eq("property_id", propertyId).eq("year", p.year);
      if (chk.error) throw chk.error;
      if ((chk.count ?? 0) !== rows.length) throw new Error(`Bara ${chk.count ?? 0} av ${rows.length} rader sparades. Kontrollera behörigheten.`);
      await qc.invalidateQueries({ queryKey: ["finance-budget"] });
      toast.success(`Budgeten för ${p.year} är sparad`, { style: { background: GREEN, color: "#fff" } });
      setP(null);
      setStage("idle");
    } catch (e) {
      const m = (e as Error).message ?? "";
      setErr(/relation .* does not exist|schema cache|42P01|PGRST205/i.test(m) ? "Tabellen för budget saknas. Kör SQL-filen ekonomi-budget.sql en gång i Supabase och försök igen." : `Sparandet misslyckades: ${m}`);
      setStage("preview");
    }
  }

  const busy = stage === "reading" || stage === "saving";
  const cost = p ? sum(p.entries, "ut") : 0;
  const income = p ? sum(p.entries, "in") : 0;

  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, background: "#fff", fontFamily: "Inter, sans-serif", color: INK }}>
      <p style={{ margin: "0 0 10px", color: MUTED, fontSize: 15, lineHeight: 1.55 }}>
        Läs in budgeten från en fil: SIE (om budgeten finns i bokföringen), Excel, CSV eller PDF. Du får se vad som hittades innan något sparas. Det som sparas
        ersätter hela årets budget för den här föreningen.
      </p>
      <input ref={fileRef} type="file" accept=".se,.sie,.si,.xlsx,.xls,.csv,.pdf" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      {stage === "idle" || stage === "reading" ? (
        <button type="button" style={btn(true, busy)} disabled={busy} onClick={() => fileRef.current?.click()}>
          {stage === "reading" ? "Läser filen …" : "Välj budgetfil"}
        </button>
      ) : null}

      {err && <p style={{ color: HOT, margin: "12px 0 0", lineHeight: 1.5 }}>{err}</p>}

      {p && (stage === "preview" || stage === "saving") && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 17 }}>{p.fileName}</div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", margin: "10px 0" }}>
            <label style={{ fontSize: 15 }}>
              Budgetår{" "}
              {p.source === "sie" ? (
                <select value={p.year} onChange={(e) => setYear(Number(e.target.value))} style={{ height: 38, borderRadius: 8, border: `1px solid ${LINE}`, padding: "0 8px", fontSize: 16 }}>
                  {p.years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              ) : (
                <input type="number" value={p.year} min={2000} max={2100} onChange={(e) => setYear(Number(e.target.value))} style={{ height: 38, width: 90, borderRadius: 8, border: `1px solid ${LINE}`, padding: "0 8px", fontSize: 16 }} />
              )}
            </label>
            {p.source === "sheet" && (p.cols?.length ?? 0) > 1 && (
              <label style={{ fontSize: 15 }}>
                Budgetkolumn{" "}
                <select value={p.sheetCol ?? undefined} onChange={(e) => setSheetCol(Number(e.target.value))} style={{ height: 38, borderRadius: 8, border: `1px solid ${LINE}`, padding: "0 8px", fontSize: 16 }}>
                  {p.cols!.map((c) => (
                    <option key={c.index} value={c.index}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {p.source === "pdf" && Math.max(...p.cands.map((c) => c.amounts.length)) > 1 && (
              <label style={{ fontSize: 15 }}>
                Budget finns i{" "}
                <select value={p.col} onChange={(e) => setCol(Number(e.target.value))} style={{ height: 38, borderRadius: 8, border: `1px solid ${LINE}`, padding: "0 8px", fontSize: 16 }}>
                  {Array.from({ length: Math.max(...p.cands.map((c) => c.amounts.length)) }, (_, i) => (
                    <option key={i} value={i}>
                      kolumn {i + 1} ({fmtKr(p.cands[0].amounts[Math.min(i, p.cands[0].amounts.length - 1)])} på första raden)
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.6 }}>
            {p.entries.length} konton. Kostnader <strong>{fmtKr(cost)}</strong>, intäkter <strong>{fmtKr(income)}</strong> för hela året.
          </div>
          {p.note && <div style={{ color: MUTED, fontSize: 14, marginTop: 4 }}>{p.note}</div>}
          {p.source === "pdf" && <div style={{ color: GOLD, fontSize: 14, marginTop: 4, fontWeight: 600 }}>Siffrorna är lästa ur en PDF. Kontrollera dem mot dokumentet innan du sparar.</div>}
          <div style={{ marginTop: 10, border: `1px solid ${LINE}`, borderRadius: 10, maxHeight: 260, overflow: "auto" }}>
            {p.entries.slice(0, 60).map((e) => {
              const total = e.months.reduce((a, b) => a + b, 0);
              return (
                <div key={e.account} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 12px", borderTop: `1px solid ${LINE}`, fontSize: 14.5 }}>
                  <span style={{ minWidth: 0 }}>
                    {e.account} {e.name}
                  </span>
                  <span style={{ whiteSpace: "nowrap" }}>{fmtKr(Math.abs(total))}</span>
                </div>
              );
            })}
            {p.entries.length > 60 && <div style={{ padding: "7px 12px", color: MUTED, fontSize: 14 }}>… och {p.entries.length - 60} konton till</div>}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button type="button" style={btn(true, busy)} disabled={busy} onClick={save}>
              {stage === "saving" ? "Sparar …" : `Spara budget ${p.year}`}
            </button>
            <button type="button" style={btn(false, busy)} disabled={busy} onClick={() => { setP(null); setErr(null); setStage("idle"); }}>
              Avbryt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
