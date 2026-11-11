/**
 * SIE 4-läsare för Ekonomi – översikt.
 *
 * Läser bara det som översikten behöver: föreningens namn och organisationsnummer,
 * räkenskapsåren, kontolistan, ingående balans (#IB), månadssaldon (#PSALDO) och periodbudget (#PBUDGET).
 * Verifikationer (#VER/#TRANS) läses ALDRIG — de kan innehålla namn på leverantörer
 * och enskilda personer och hör inte hemma i en översikt.
 *
 * Ren TypeScript utan beroenden så att den kan köras i webbläsaren och testas i Node.
 */

export type SieRow = {
  year: number;
  /** 0 = ingående balans, 1..12 = förändring under månaden */
  month: number;
  account: string;
  amount: number;
};

export type SieResult = {
  name: string;
  orgnr: string;
  years: number[];
  accounts: Record<string, string>;
  rows: SieRow[];
  /** Periodbudget (#PBUDGET), månad 1..12, samma tecken som i SIE. Tom om filen saknar budget. */
  budget: SieRow[];
  /**
   * Senaste månad (YYYYMM) med bokförda KOSTNADER (4xxx–7xxx). Intäkterna (avgifterna)
   * är bokförda en månad före kostnaderna, så intäkter räknas till samma månad —
   * annars jämförs 11 månaders intäkter mot 10 månaders kostnader.
   */
  latestPeriod: string | null;
};

// Tecknen 0x80–0xFF i CP437 (SIE-filer från Nabo är "FORMAT PC8").
const CP437_HIGH =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";

export function decodeCp437(bytes: Uint8Array): string {
  let out = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const end = Math.min(i + CHUNK, bytes.length);
    let s = "";
    for (let j = i; j < end; j++) {
      const b = bytes[j];
      s += b < 0x80 ? String.fromCharCode(b) : CP437_HIGH[b - 0x80];
    }
    out += s;
  }
  return out;
}

/** Delar en rad i tokens; "citat" och {objektlistor} räknas som en token var. */
function tokenize(line: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const n = line.length;
  while (i < n) {
    const c = line[i];
    if (c === " " || c === "\t") {
      i++;
    } else if (c === '"') {
      let j = i + 1;
      let s = "";
      while (j < n && line[j] !== '"') {
        if (line[j] === "\\" && j + 1 < n) j++;
        s += line[j];
        j++;
      }
      tokens.push(s);
      i = j + 1;
    } else if (c === "{") {
      let j = i;
      while (j < n && line[j] !== "}") j++;
      tokens.push(line.slice(i, j + 1));
      i = j + 1;
    } else {
      let j = i;
      while (j < n && line[j] !== " " && line[j] !== "\t") j++;
      tokens.push(line.slice(i, j));
      i = j;
    }
  }
  return tokens;
}

/**
 * Sista månaden som är "färdigbokförd". Bokföringen körs löpande, så innevarande månad
 * är oftast bara halvbokad (en fjärrvärmefaktura saknas men avskrivningen finns) och
 * skulle dra ner årets kostnader om den räknades med. En månad räknas som färdig när
 * dess kostnader är minst hälften av medianen för månaderna före.
 */
function latestCompleteMonth(costByMonth: Map<string, number>, years: number[]): string | null {
  const year = Math.max(...years);
  if (!Number.isFinite(year)) return null;
  const totals: Array<[number, number]> = [];
  for (let m = 1; m <= 12; m++) {
    const v = costByMonth.get(`${year}-${m}`);
    if (v !== undefined && Math.abs(v) > 0.004) totals.push([m, v]);
  }
  for (let i = totals.length - 1; i >= 0; i--) {
    const before = totals.slice(0, i).map((x) => x[1]).sort((a, b) => a - b);
    const median = before.length ? before[Math.floor(before.length / 2)] : 0;
    if (before.length < 3 || totals[i][1] >= 0.5 * median) {
      return `${year}${String(totals[i][0]).padStart(2, "0")}`;
    }
  }
  return null;
}

export function parseSie(bytes: Uint8Array): SieResult {
  // Nabo skriver "FORMAT PC8" i huvudet men leverar ibland UTF-8 ändå (filen för
  // föregående år gjorde det). Giltig UTF-8 med svenska tecken kan i praktiken inte
  // vara CP437 — å/ä/ö är ogiltiga startbyte i UTF-8 — så UTF-8 prövas först.
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 600));
  const isPc8 = /^#FORMAT\s+PC8/im.test(head);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = isPc8 ? decodeCp437(bytes) : new TextDecoder("windows-1252").decode(bytes);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  // Filen för 2025 är CP437-text som i efterhand kodats som UTF-8 byte för byte, så
  // å/ä/ö hamnar som styrtecknen U+0080–U+009F. Mappa tillbaka dem via CP437-tabellen.
  text = text.replace(/[\u0080-\u009f]/g, (ch) => CP437_HIGH[ch.charCodeAt(0) - 0x80]);

  let name = "";
  let orgnr = "";
  const yearOfIndex = new Map<number, number>();
  const accounts: Record<string, string> = {};
  const rows: SieRow[] = [];
  const budget: SieRow[] = [];
  const costByMonth = new Map<string, number>();

  for (const raw of text.split(/\r?\n/)) {
    if (raw.charCodeAt(0) !== 35) continue; // '#'
    const t = tokenize(raw.trim());
    const tag = t[0];

    if (tag === "#FNAMN") name = t[1] ?? "";
    else if (tag === "#ORGNR") orgnr = t[1] ?? "";
    else if (tag === "#RAR") {
      const idx = Number(t[1]);
      const start = t[2] ?? "";
      if (Number.isFinite(idx) && /^\d{8}$/.test(start)) yearOfIndex.set(idx, Number(start.slice(0, 4)));
    } else if (tag === "#KONTO") {
      if (t[1]) accounts[t[1]] = t[2] ?? "";
    } else if (tag === "#IB") {
      // #IB årsindex konto saldo — bara balanskonton har ingående balans.
      const year = yearOfIndex.get(Number(t[1]));
      const account = t[2];
      const amount = Number(t[3]);
      if (year && account && /^[12]/.test(account) && Number.isFinite(amount)) {
        rows.push({ year, month: 0, account, amount });
      }
    } else if (tag === "#PBUDGET") {
      // #PBUDGET årsindex period konto {objekt} saldo — samma form som #PSALDO.
      const year = yearOfIndex.get(Number(t[1]));
      const period = t[2];
      const account = t[3];
      const amount = Number(t[5]);
      if (!year || !account || !/^\d{6}$/.test(period ?? "")) continue;
      if (t[4] !== "{}" || !Number.isFinite(amount)) continue;
      const month = Number(period.slice(4));
      if (month < 1 || month > 12) continue;
      budget.push({ year, month, account, amount });
    } else if (tag === "#PSALDO") {
      // #PSALDO årsindex period konto {objekt} saldo — bara rader utan objekt.
      const year = yearOfIndex.get(Number(t[1]));
      const period = t[2];
      const account = t[3];
      const objects = t[4];
      const amount = Number(t[5]);
      if (!year || !account || !/^\d{6}$/.test(period ?? "")) continue;
      if (objects !== "{}" || !Number.isFinite(amount)) continue;
      const month = Number(period.slice(4));
      if (month < 1 || month > 12) continue;
      rows.push({ year, month, account, amount });
      if (/^[4-7]/.test(account)) {
        const key = `${year}-${month}`;
        costByMonth.set(key, (costByMonth.get(key) ?? 0) + amount);
      }
    }
  }

  const latest = latestCompleteMonth(costByMonth, [...yearOfIndex.values()]);

  return {
    name,
    orgnr,
    years: [...yearOfIndex.values()].sort((a, b) => a - b),
    accounts,
    rows,
    budget,
    latestPeriod: latest || null,
  };
}

/** Jämför organisationsnummer utan bindestreck/blanksteg. */
export function sameOrgnr(a: string, b: string): boolean {
  const n = (s: string) => s.replace(/\D/g, "");
  return n(a) !== "" && n(a) === n(b);
}
