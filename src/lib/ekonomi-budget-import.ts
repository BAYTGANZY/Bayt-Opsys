/**
 * Budget in från olika filtyper: SIE (#PBUDGET), Excel/CSV (konto + årsbelopp eller 12 månader) och PDF (konto-rader).
 * Ren TypeScript, ingen webbläsarkod — testbar i Node. Allt som kommer ut har SIE-tecken: intäkter minus, kostnader plus,
 * så att `computeBudget` kan använda raderna rakt av, oavsett vilken fil de kom från.
 */
import { GROUPS, groupOf } from "./ekonomi-oversikt";
import type { SieResult } from "./sie";

export type BudgetEntry = { account: string; name: string; months: number[] };
export type BudgetSource = "sie" | "sheet" | "pdf";

const MONTH_PREFIX = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

const kindOf = (account: string) => {
  const k = groupOf(account);
  return k ? GROUPS.find((g) => g.key === k)!.kind : null;
};

/** Svenskt eller engelskt tal ("1 200 000,50", "1.200.000", "-45 000", "−45000"). null om det inte är ett tal. */
export function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.replace(/[  \s]/g, "").replace(/[−–]/g, "-");
  if (s === "" || !/^-?[\d.,]+$/.test(s)) return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "");
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Intäkter lagras som minus och kostnader som plus (SIE). En budget i Excel har ofta intäkter som plus. */
export function sieSign(account: string, amount: number): number {
  return kindOf(account) === "in" ? -Math.abs(amount) : amount;
}

/** Fördelar ett årsbelopp lika över 12 månader. Sista månaden tar öresavrundningen så att summan blir exakt. */
export function spreadYear(total: number): number[] {
  const m = Math.round((total / 12) * 100) / 100;
  const out = Array(12).fill(m) as number[];
  out[11] = Math.round((total - m * 11) * 100) / 100;
  return out;
}

function addEntry(map: Map<string, BudgetEntry>, account: string, name: string, months: number[]) {
  if (!groupOf(account)) return; // balanskonton m.m. visas aldrig i uppföljningen
  if (months.every((v) => Math.abs(v) < 0.005)) return;
  const signed = months.map((v) => sieSign(account, v));
  const cur = map.get(account);
  if (cur) {
    cur.months = cur.months.map((v, i) => v + signed[i]);
    if (!cur.name && name) cur.name = name;
  } else map.set(account, { account, name, months: signed });
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** Läser en tabell (rader av celler) från Excel/CSV. Rubrikrad med "Konto" och antingen ett årsbelopp eller 12 månadskolumner. */
export function parseBudgetRows(rows: unknown[][]): { entries: BudgetEntry[]; note: string } {
  const map = new Map<string, BudgetEntry>();
  let note = "";

  let h = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    if (rows[i].some((c) => /^(konto|kontonr|kontonummer|account)$/.test(norm(c)))) {
      h = i;
      break;
    }
  }

  let cAcc = -1;
  let cName = -1;
  let cYear = -1;
  const cMonth: number[] = Array(12).fill(-1);
  if (h >= 0) {
    const head = rows[h].map(norm);
    cAcc = head.findIndex((x) => /^(konto|kontonr|kontonummer|account)$/.test(x));
    cName = head.findIndex((x) => /^(kontonamn|namn|benämning|benamning|text|beskrivning)$/.test(x));
    head.forEach((x, i) => {
      const mi = MONTH_PREFIX.findIndex((p) => x === p || x.startsWith(p + " ") || (x.startsWith(p) && x.length <= 9 && /^[a-zåäö]+$/.test(x)));
      if (mi >= 0) cMonth[mi] = i;
      else if (/^(1[0-2]|[1-9])$/.test(x)) cMonth[Number(x) - 1] = i;
    });
    for (const key of ["budget", "helår", "helar", "total", "summa"]) {
      const i = head.findIndex((x, idx) => idx !== cAcc && x.includes(key));
      if (i >= 0) {
        cYear = i;
        break;
      }
    }
  }
  const hasMonths = cMonth.filter((i) => i >= 0).length >= 6;
  if (h >= 0 && !hasMonths && cYear < 0) throw new Error("Hittade kontokolumnen men ingen kolumn med budget. Rubriken ska innehålla ordet Budget, eller månadsnamn (jan–dec).");

  const body = h >= 0 ? rows.slice(h + 1) : rows;
  let usedFirstNumber = false;
  for (const r of body) {
    let account = "";
    let name = "";
    const accCell = h >= 0 ? r[cAcc] : r[0];
    const m = String(accCell ?? "").trim().match(/^(\d{4})(?:\s+(.+))?$/);
    if (!m) continue;
    account = m[1];
    name = (m[2] ?? "").trim();
    if (!name && cName >= 0) name = String(r[cName] ?? "").trim();
    if (!name && h < 0) name = String(r[1] ?? "").trim();
    if (name && toNumber(name) !== null) name = "";

    if (hasMonths) {
      const months = cMonth.map((i) => (i >= 0 ? toNumber(r[i]) ?? 0 : 0));
      addEntry(map, account, name, months);
    } else if (h >= 0) {
      const t = toNumber(r[cYear]);
      if (t !== null) addEntry(map, account, name, spreadYear(t));
    } else {
      const nums = r.slice(1).map((c) => toNumber(c)).filter((n): n is number => n !== null);
      if (nums.length >= 12) addEntry(map, account, name, nums.slice(0, 12));
      else if (nums.length >= 1) {
        usedFirstNumber = true;
        addEntry(map, account, name, spreadYear(nums[0]));
      }
    }
  }
  if (hasMonths && cMonth.some((i) => i < 0)) note = "Alla tolv månader fanns inte i filen. De som saknas räknas som noll.";
  else if (!hasMonths) note = "Årsbeloppet är fördelat lika över tolv månader.";
  if (usedFirstNumber) note += " Filen saknade rubrikrad, så första beloppskolumnen användes.";
  return { entries: [...map.values()].sort((a, b) => a.account.localeCompare(b.account)), note: note.trim() };
}

/** SIE: budgeten för ett visst år ur #PBUDGET. */
export function entriesFromSie(res: SieResult, year: number): BudgetEntry[] {
  const out = new Map<string, BudgetEntry>();
  for (const r of res.budget) {
    if (r.year !== year || !groupOf(r.account)) continue;
    const e = out.get(r.account) ?? { account: r.account, name: res.accounts[r.account] ?? "", months: Array(12).fill(0) as number[] };
    e.months[r.month - 1] += r.amount; // redan SIE-tecken
    out.set(r.account, e);
  }
  return [...out.values()].filter((e) => e.months.some((v) => Math.abs(v) > 0.005)).sort((a, b) => a.account.localeCompare(b.account));
}

// ---------------------------------------------------------------- PDF
export type PdfCandidate = { account: string; name: string; amounts: number[] };

const isText = (t: string | undefined) => !!t && /^[A-Za-zÅÄÖåäö]/.test(t.trim());

/**
 * Hittar rader som börjar med ett fyrsiffrigt konto, följt av ett namn och ett eller flera belopp.
 * Indata är PDF:ens textbitar i läsordning (pdf.js ger varje cell som en egen bit), inte löpande text:
 * "590 000" och "600 000" är då två belopp, inte ett sexsiffrigt tal.
 */
export function pdfCandidates(items: string[]): PdfCandidate[] {
  const it = items.map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
  const accountAt = (k: number): { account: string; name: string } | null => {
    const m = it[k]?.match(/^([3-8]\d{3})(?:\s+(\D.*))?$/);
    if (!m || !groupOf(m[1])) return null;
    if (m[2]) return { account: m[1], name: m[2] };
    return isText(it[k + 1]) ? { account: m[1], name: "" } : null;
  };
  const out: PdfCandidate[] = [];
  for (let k = 0; k < it.length; k++) {
    const head = accountAt(k);
    if (!head) continue;
    let j = k + 1;
    let name = head.name;
    if (!name) {
      const parts: string[] = [];
      while (j < it.length && toNumber(it[j]) === null && parts.length < 3) parts.push(it[j++]);
      name = parts.join(" ");
    }
    const amounts: number[] = [];
    while (j < it.length && toNumber(it[j]) !== null && !accountAt(j)) amounts.push(toNumber(it[j++])!);
    if (amounts.length > 0) out.push({ account: head.account, name, amounts });
    k = j - 1;
  }
  return out;
}

/** Bygger poster av PDF-raderna. `col` är vilken beloppskolumn som är budgeten (0 = första). */
export function entriesFromPdf(cands: PdfCandidate[], col: number): BudgetEntry[] {
  const map = new Map<string, BudgetEntry>();
  for (const c of cands) {
    const v = c.amounts[Math.min(col, c.amounts.length - 1)];
    if (v !== undefined) addEntry(map, c.account, c.name, spreadYear(v));
  }
  return [...map.values()].sort((a, b) => a.account.localeCompare(b.account));
}

/** Rader för tabellen finance_budgets. Månader med noll sparas inte. */
export function toDbRows(propertyId: string, year: number, entries: BudgetEntry[]) {
  const rows: Array<{ property_id: string; year: number; month: number; account: string; amount: number }> = [];
  for (const e of entries)
    e.months.forEach((v, i) => {
      if (Math.abs(v) >= 0.005) rows.push({ property_id: propertyId, year, month: i + 1, account: e.account, amount: Math.round(v * 100) / 100 });
    });
  return rows;
}
