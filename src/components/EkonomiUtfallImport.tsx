import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { fmtKr, groupOf, GROUPS, MONTHS } from "@/lib/ekonomi-oversikt";
import {
  budgetColumns,
  entriesFromPdf,
  parseBudgetRows,
  pdfCandidates,
  pickColumn,
  totalsOf,
  type BudgetColumn,
  type BudgetEntry,
  type PdfCandidate,
} from "@/lib/ekonomi-budget-import";
import { pdfItems, readSheets } from "@/components/EkonomiBudgetImport";

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
const sel = { height: 38, borderRadius: 8, border: `1px solid ${LINE}`, padding: "0 8px", fontSize: 16 } as const;

type Proposal = {
  source: "sheet" | "pdf";
  fileName: string;
  entries: BudgetEntry[];
  year: number;
  month: number;
  rows?: any[][];
  cols?: BudgetColumn[];
  col?: number;
  cands?: PdfCandidate[];
  pdfCol?: number;
};

const kindSum = (entries: BudgetEntry[], kind: "in" | "ut") =>
  totalsOf(entries)
    .filter((e) => GROUPS.find((g) => g.key === groupOf(e.account))?.kind === kind)
    .reduce((s, e) => s + Math.abs(e.total), 0);

function defaultMonth(year: number) {
  const now = new Date();
  return year === now.getFullYear() ? now.getMonth() + 1 : 12;
}

/**
 * Admin: läs in vad föreningen faktiskt har förbrukat hittills från en Excel-, CSV- eller PDF-fil
 * (till exempel en resultatrapport med kolumnen "Utfall ack."). SIE läses in i rutan bredvid.
 * Beloppen gäller fram till vald månad och sparas som ett belopp per konto.
 */
export function EkonomiUtfallImport({ propertyId, defaultYear }: { propertyId: string; defaultYear: number }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<"idle" | "reading" | "preview" | "saving">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [p, setP] = useState<Proposal | null>(null);

  function fromSheet(rows: any[][], col: number | undefined, year: number) {
    const r = parseBudgetRows(rows, { keyword: "utfall", col, year });
    const cols = budgetColumns(rows, "utfall");
    const picked = col !== undefined ? cols.find((c) => c.index === col) : pickColumn(cols, year, "utfall");
    return { entries: r.entries, cols, col: picked?.index, year: picked?.year ?? year };
  }

  async function onFile(f: File) {
    setErr(null);
    setStage("reading");
    try {
      const buf = await f.arrayBuffer();
      const name = f.name;
      let next: Proposal;
      if (/\.(se|sie|si)$/i.test(name)) throw new Error("SIE-filer läses in i rutan \"Uppdatera siffrorna\" här under.");
      if (/\.(xlsx|xls|csv)$/i.test(name)) {
        let found: Proposal | null = null;
        let lastErr: Error | null = null;
        for (const rows of await readSheets(buf, name)) {
          try {
            const r = fromSheet(rows, undefined, defaultYear);
            if (r.entries.length > 0) {
              found = { source: "sheet", fileName: name, entries: r.entries, year: r.year, month: defaultMonth(r.year), rows, cols: r.cols, col: r.col };
              break;
            }
          } catch (e) {
            lastErr = e as Error;
          }
        }
        if (!found) throw lastErr ?? new Error("Hittade inga konton med utfall i filen.");
        next = found;
      } else if (/\.pdf$/i.test(name)) {
        const cands = pdfCandidates(await pdfItems(buf));
        if (cands.length === 0) throw new Error("Hittade inga kontorader med belopp i PDF:en. Är den inskannad? Använd i så fall Excel eller SIE.");
        next = { source: "pdf", fileName: name, entries: entriesFromPdf(cands, 0), year: defaultYear, month: defaultMonth(defaultYear), cands, pdfCol: 0 };
      } else throw new Error("Filtypen stöds inte. Välj en Excel-, CSV- eller PDF-fil.");
      if (next.entries.length === 0) throw new Error("Inga konton med utfall hittades i filen.");
      setP(next);
      setStage("preview");
    } catch (e) {
      setErr((e as Error).message ?? "Filen kunde inte läsas.");
      setStage("idle");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function setSheetCol(index: number) {
    if (!p?.rows) return;
    const r = fromSheet(p.rows, index, p.year);
    setP({ ...p, entries: r.entries, col: index, year: r.year, month: defaultMonth(r.year) });
  }
  function setPdfCol(c: number) {
    if (!p?.cands) return;
    setP({ ...p, pdfCol: c, entries: entriesFromPdf(p.cands, c) });
  }

  async function save() {
    if (!p) return;
    setStage("saving");
    setErr(null);
    try {
      const tot = totalsOf(p.entries);
      if (tot.length === 0) throw new Error("Det finns inget att spara.");
      const rows = tot.map((t) => ({ property_id: propertyId, year: p.year, month: p.month, account: t.account, amount: t.total }));
      const del = await supabase.from("finance_balances").delete().eq("property_id", propertyId).eq("year", p.year);
      if (del.error) throw del.error;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const ins = await supabase.from("finance_balances").upsert(rows.slice(i, i + CHUNK), { onConflict: "property_id,year,month,account" });
        if (ins.error) throw ins.error;
      }
      const chk = await supabase.from("finance_balances").select("account", { count: "exact", head: true }).eq("property_id", propertyId).eq("year", p.year);
      if (chk.error) throw chk.error;
      if ((chk.count ?? 0) !== rows.length) throw new Error(`Bara ${chk.count ?? 0} av ${rows.length} rader sparades. Kontrollera behörigheten.`);
      const names = tot.filter((t) => t.name).map((t) => ({ property_id: propertyId, account: t.account, name: t.name }));
      for (let i = 0; i < names.length; i += CHUNK) {
        const up = await supabase.from("finance_accounts").upsert(names.slice(i, i + CHUNK), { onConflict: "property_id,account" });
        if (up.error) throw up.error;
      }
      const log = await supabase
        .from("finance_imports")
        .insert({
          property_id: propertyId,
          imported_by: user?.id ?? null,
          file_name: p.fileName,
          years: [p.year],
          latest_period: `${p.year}${String(p.month).padStart(2, "0")}`,
          account_count: tot.length,
          row_count: rows.length,
        })
        .select("id");
      if (log.error) throw log.error;
      if (!log.data || log.data.length === 0) throw new Error("Importloggen kunde inte sparas.");
      await qc.invalidateQueries({ queryKey: ["finance-oversikt"] });
      await qc.invalidateQueries({ queryKey: ["finance-budget"] });
      toast.success(`Utfallet till och med ${MONTHS[p.month - 1]} ${p.year} är sparat`, { style: { background: GREEN, color: "#fff" } });
      setP(null);
      setStage("idle");
    } catch (e) {
      setErr(`Sparandet misslyckades: ${(e as Error).message}`);
      setStage("preview");
    }
  }

  const busy = stage === "reading" || stage === "saving";
  const cost = p ? kindSum(p.entries, "ut") : 0;
  const income = p ? kindSum(p.entries, "in") : 0;
  const pdfCols = p?.cands ? Math.max(...p.cands.map((c) => c.amounts.length)) : 0;

  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, background: "#fff", fontFamily: "Inter, sans-serif", color: INK }}>
      <p style={{ margin: "0 0 10px", color: MUTED, fontSize: 15, lineHeight: 1.55 }}>
        Läs in vad föreningen faktiskt har förbrukat hittills från en Excel-, CSV- eller PDF-fil, till exempel en resultatrapport med kolumnen "Utfall ack.". Du
        väljer till och med vilken månad siffrorna gäller. Det som sparas ersätter årets tidigare utfall för den här föreningen.
      </p>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.pdf" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      {(stage === "idle" || stage === "reading") && (
        <button type="button" style={btn(true, busy)} disabled={busy} onClick={() => fileRef.current?.click()}>
          {stage === "reading" ? "Läser filen …" : "Välj fil med utfall"}
        </button>
      )}
      {err && <p style={{ color: HOT, margin: "12px 0 0", lineHeight: 1.5 }}>{err}</p>}

      {p && (stage === "preview" || stage === "saving") && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 17 }}>{p.fileName}</div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", margin: "10px 0" }}>
            {p.source === "sheet" && (p.cols?.length ?? 0) > 1 && (
              <label style={{ fontSize: 15 }}>
                Utfallskolumn{" "}
                <select value={p.col} onChange={(e) => setSheetCol(Number(e.target.value))} style={sel}>
                  {p.cols!.map((c) => (
                    <option key={c.index} value={c.index}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {p.source === "pdf" && pdfCols > 1 && (
              <label style={{ fontSize: 15 }}>
                Utfall finns i{" "}
                <select value={p.pdfCol} onChange={(e) => setPdfCol(Number(e.target.value))} style={sel}>
                  {Array.from({ length: pdfCols }, (_, i) => (
                    <option key={i} value={i}>
                      kolumn {i + 1} ({fmtKr(p.cands![0].amounts[Math.min(i, p.cands![0].amounts.length - 1)])} på första raden)
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label style={{ fontSize: 15 }}>
              Gäller till och med{" "}
              <select value={p.month} onChange={(e) => setP({ ...p, month: Number(e.target.value) })} style={sel}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>{" "}
              <input type="number" value={p.year} min={2000} max={2100} onChange={(e) => setP({ ...p, year: Number(e.target.value) })} style={{ ...sel, width: 90 }} />
            </label>
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.6 }}>
            {p.entries.length} konton. Kostnader hittills <strong>{fmtKr(cost)}</strong>, intäkter hittills <strong>{fmtKr(income)}</strong>.
          </div>
          {p.source === "pdf" && <div style={{ color: GOLD, fontSize: 14, marginTop: 4, fontWeight: 600 }}>Siffrorna är lästa ur en PDF. Kontrollera dem mot dokumentet innan du sparar.</div>}
          <div style={{ color: MUTED, fontSize: 14, marginTop: 4 }}>
            Beloppen sparas som en summa per konto i {MONTHS[p.month - 1]}. Månadsuppdelningen i diagrammet försvinner då för {p.year}, men totalerna per konto stämmer.
          </div>
          <div style={{ marginTop: 10, border: `1px solid ${LINE}`, borderRadius: 10, maxHeight: 260, overflow: "auto" }}>
            {totalsOf(p.entries)
              .slice(0, 60)
              .map((e) => (
                <div key={e.account} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 12px", borderTop: `1px solid ${LINE}`, fontSize: 14.5 }}>
                  <span style={{ minWidth: 0 }}>
                    {e.account} {e.name}
                  </span>
                  <span style={{ whiteSpace: "nowrap" }}>{fmtKr(Math.abs(e.total))}</span>
                </div>
              ))}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button type="button" style={btn(true, busy)} disabled={busy} onClick={save}>
              {stage === "saving" ? "Sparar …" : `Spara utfall till och med ${MONTHS[p.month - 1]}`}
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
