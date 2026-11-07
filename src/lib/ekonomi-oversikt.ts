/**
 * Ekonomi – översikt: gruppering av konton och uträkningar.
 * Ren TypeScript utan beroenden (testas i Node).
 *
 * Tecken: som i SIE — intäkter är negativa, kostnader positiva. Allt som visas
 * normaliseras till "positivt = mer pengar in / mer pengar ut" via `shown()`.
 */

export type Balance = { year: number; month: number; account: string; amount: number };

export type GroupKey =
  | "avgift"
  | "hyror"
  | "ovrigin"
  | "energi"
  | "rantor"
  | "skotsel"
  | "forvaltning"
  | "konsult"
  | "hissar"
  | "slitage"
  | "reparationer"
  | "tomtratt"
  | "forsakring"
  | "annat";

export type GroupDef = {
  key: GroupKey;
  kind: "in" | "ut";
  label: string;
  /** En mening som ett barn förstår. */
  kid: string;
};

export const GROUPS: GroupDef[] = [
  { key: "avgift", kind: "in", label: "Månadsavgifter från medlemmarna", kid: "Pengar som alla som bor här betalar varje månad för att huset ska fungera." },
  { key: "hyror", kind: "in", label: "Hyror för lokaler, p-platser och förråd", kid: "Pengar från dem som hyr en lokal, en parkeringsplats eller ett förråd av oss." },
  { key: "ovrigin", kind: "in", label: "Annat vi fått in", kid: "Småsummor, till exempel avgifter när någon flyttar och ränta från banken." },
  { key: "energi", kind: "ut", label: "Värme, el, vatten och sopor", kid: "Det som går åt för att huset ska vara varmt och ha ljus, vatten och sophämtning." },
  { key: "rantor", kind: "ut", label: "Räntor på lånen", kid: "Hyran vi betalar till banken för att ha lånat pengar till huset." },
  { key: "skotsel", kind: "ut", label: "Skötsel", kid: "Fastighetsskötaren, larm och serviceavtal — dem som ser till att huset fungerar varje dag." },
  { key: "forvaltning", kind: "ut", label: "Förvaltning", kid: "Styrelsen, revisorn, ekonomisk förvaltning, juridik, bank och allt pappersarbete." },
  { key: "konsult", kind: "ut", label: "Konsultarvode", kid: "Inhyrda experter som hjälper till med särskilda uppgifter." },
  { key: "hissar", kind: "ut", label: "Hissar", kid: "Service och reparationer av hissarna så att de går att åka i." },
  { key: "slitage", kind: "ut", label: "Slitage på husen", kid: "Hus blir äldre och slits. Det bokförs som en kostnad fast inga pengar lämnar kontot." },
  { key: "reparationer", kind: "ut", label: "Reparationer och underhåll", kid: "Att laga det som gått sönder och hålla huset i trim: tak, rör, dörrar, tvättstugor, besiktningar, brandskydd, trädgård och snöröjning." },
  { key: "tomtratt", kind: "ut", label: "Tomträtt", kid: "Marken under husen ägs av kommunen. Vi betalar hyra för att få ha husen där." },
  { key: "forsakring", kind: "ut", label: "Försäkring och skatt", kid: "Skydd om något händer med huset, och skatt till staten." },
  { key: "annat", kind: "ut", label: "Annat", kid: "Sådant som inte passar in i de andra lådorna, till exempel kabel-tv och bredband." },
];

export const GROUP_BY_KEY: Record<GroupKey, GroupDef> = Object.fromEntries(
  GROUPS.map((g) => [g.key, g]),
) as Record<GroupKey, GroupDef>;

const HISS_KONTON = new Set([4150, 4346, 4546]);

/** Vilken låda hör kontot hemma i? Returnerar null för balanskonton och 8999. */
export function groupOf(account: string): GroupKey | null {
  const n = Number(account);
  if (!Number.isFinite(n) || n < 3000 || n >= 9000 || n === 8999) return null;
  if (n < 4000) {
    if (n < 3050) return "avgift";
    if (n < 3100) return "hyror";
    return "ovrigin";
  }
  if (n >= 8300 && n < 8400) return "ovrigin"; // ränteintäkter
  if (n >= 8400 && n < 8500) return "rantor";
  if (HISS_KONTON.has(n)) return "hissar";
  if (n >= 4600 && n < 4700) return "energi";
  if (n >= 4740 && n < 4750) return "tomtratt";
  if ((n >= 4700 && n < 4740) || (n >= 4800 && n < 4900)) return "forsakring";
  if (n >= 4300 && n < 4600) return "reparationer";
  // Besiktning, OVK, underhållsplan, brandskydd, trädgård och snöröjning räknas som underhåll.
  if ((n >= 4140 && n < 4150) || (n >= 4160 && n < 4180)) return "reparationer";
  if (n >= 4100 && n < 4200) return "skotsel";
  if (n >= 5000 && n < 6000) return "skotsel";
  if (n === 6550 || n === 6599) return "konsult";
  if (n >= 6000 && n < 7000) return "forvaltning";
  if (n >= 7500 && n < 7700) return "forvaltning";
  if (n >= 7800 && n < 7900) return "slitage";
  return "annat";
}

/** Normaliserat belopp: positivt = pengar in (för "in"-konton) eller pengar ut. */
export function shown(kind: "in" | "ut", sum: number): number {
  return kind === "in" ? -sum : sum;
}

export const isBank = (a: string) => /^19[1-9]\d$/.test(a);
export const isLoan = (a: string) => /^(235\d|2417)$/.test(a);

export type Row = {
  account: string;
  name: string;
  now: number;
  before: number;
};

export type GroupSummary = GroupDef & { now: number; before: number; accounts: Row[] };

export type Overview = {
  year: number;
  /** Sista månaden som ingår (1–12). */
  upTo: number;
  hasBefore: boolean;
  inNow: number;
  inBefore: number;
  utNow: number;
  utBefore: number;
  groups: GroupSummary[];
  bank: number | null;
  loan: number | null;
  bankAccounts: Array<{ account: string; name: string; value: number }>;
  loanAccounts: Array<{ account: string; name: string; value: number }>;
  interestPerMonth: number | null;
  /** Kostnader som inte är riktiga utbetalningar (slitaget). */
  nonCash: number;
  /** De konton där kostnaden ökat mest mot samma period förra året. */
  dearer: Array<Row & { group: GroupKey; diff: number; pct: number | null }>;
};

function sumFor(
  rows: Balance[],
  year: number,
  upTo: number,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.year !== year || r.month < 1 || r.month > upTo) continue;
    m.set(r.account, (m.get(r.account) ?? 0) + r.amount);
  }
  return m;
}

/** Saldo på ett balanskonto vid slutet av månad `upTo`: ingående + månadsförändringar. */
function balanceAt(rows: Balance[], year: number, upTo: number, account: string): number {
  let v = 0;
  for (const r of rows) {
    if (r.year !== year || r.account !== account) continue;
    if (r.month === 0 || r.month <= upTo) v += r.amount;
  }
  return v;
}

export function computeOverview(
  rows: Balance[],
  names: Record<string, string>,
  year: number,
  upTo: number,
): Overview {
  const now = sumFor(rows, year, upTo);
  const before = sumFor(rows, year - 1, upTo);
  const hasBefore = rows.some((r) => r.year === year - 1 && r.month >= 1);

  const groups: GroupSummary[] = GROUPS.map((g) => ({ ...g, now: 0, before: 0, accounts: [] }));
  const byKey = new Map(groups.map((g) => [g.key, g]));

  const accounts = new Set<string>([...now.keys(), ...before.keys()]);
  for (const a of accounts) {
    const key = groupOf(a);
    if (!key) continue;
    const g = byKey.get(key)!;
    const n = shown(g.kind, now.get(a) ?? 0);
    const b = shown(g.kind, before.get(a) ?? 0);
    g.now += n;
    g.before += b;
    if (Math.abs(n) > 0.5 || Math.abs(b) > 0.5) g.accounts.push({ account: a, name: names[a] ?? `Konto ${a}`, now: n, before: b });
  }
  for (const g of groups) g.accounts.sort((x, y) => y.now - x.now || x.account.localeCompare(y.account));

  const tot = (kind: "in" | "ut", f: "now" | "before") =>
    groups.filter((g) => g.kind === kind).reduce((s, g) => s + g[f], 0);

  const bankAccounts: Overview["bankAccounts"] = [];
  const loanAccounts: Overview["loanAccounts"] = [];
  const balanceAccts = new Set(rows.filter((r) => r.year === year).map((r) => r.account));
  for (const a of [...balanceAccts].sort()) {
    if (isBank(a)) {
      const v = balanceAt(rows, year, upTo, a);
      if (Math.abs(v) > 0.5) bankAccounts.push({ account: a, name: names[a] ?? `Konto ${a}`, value: v });
    } else if (isLoan(a)) {
      const v = -balanceAt(rows, year, upTo, a); // skulder är negativa i SIE
      if (Math.abs(v) > 0.5) loanAccounts.push({ account: a, name: names[a] ?? `Konto ${a}`, value: v });
    }
  }
  const hasBalance = rows.some((r) => r.year === year && r.month === 0 && /^[12]/.test(r.account));
  const bank = hasBalance ? bankAccounts.reduce((s, x) => s + x.value, 0) : null;
  const loan = hasBalance ? loanAccounts.reduce((s, x) => s + x.value, 0) : null;

  const rantor = byKey.get("rantor")!;
  const interestPerMonth = rantor.now > 0 && upTo > 0 ? rantor.now / upTo : null;

  const dearer = groups
    .filter((g) => g.kind === "ut" && g.key !== "slitage")
    .flatMap((g) => g.accounts.map((r) => ({ ...r, group: g.key, diff: r.now - r.before, pct: r.before > 0 ? (r.now - r.before) / r.before : null })))
    .filter((r) => hasBefore && r.diff >= 50000 && (r.pct === null || r.pct >= 0.1))
    .sort((a, b) => b.diff - a.diff)
    .slice(0, 4);

  return {
    year,
    upTo,
    hasBefore,
    inNow: tot("in", "now"),
    inBefore: tot("in", "before"),
    utNow: tot("ut", "now"),
    utBefore: tot("ut", "before"),
    groups,
    bank,
    loan,
    bankAccounts,
    loanAccounts,
    interestPerMonth,
    nonCash: byKey.get("slitage")!.now,
    dearer,
  };
}

/** Månad för månad för ett konto, i år mot förra året. Index 0 = januari. */
export function monthlySeries(rows: Balance[], account: string, year: number, kind: "in" | "ut" | "balance") {
  const out = (y: number) => {
    const arr: Array<number | null> = Array(12).fill(null);
    for (const r of rows) {
      if (r.year === y && r.account === account && r.month >= 1) arr[r.month - 1] = (arr[r.month - 1] ?? 0) + r.amount;
    }
    return arr.map((v) => (v === null ? null : kind === "in" ? -v : v));
  };
  return { now: out(year), before: out(year - 1) };
}

/** Senaste året och månaden som finns i datat (fallback när importloggen saknas). */
export function latestOf(rows: Balance[]): { year: number; month: number } | null {
  let y = 0;
  for (const r of rows) if (r.year > y) y = r.year;
  if (!y) return null;
  let m = 0;
  for (const r of rows) if (r.year === y && r.month > m && /^[3-8]/.test(r.account)) m = r.month;
  return m ? { year: y, month: m } : null;
}

// ---- Text -----------------------------------------------------------------

const nf0 = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const fmtKr = (n: number) => `${nf0.format(Math.round(n)).replace(/−/g, "-")} kr`;

/** "8,1 miljoner kr" / "160 tusen kr" / "950 kr" */
export function fmtStort(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1_000_000) return `${sign}${nf1.format(a / 1_000_000)} miljoner kr`;
  if (a >= 10_000) return `${sign}${nf0.format(Math.round(a / 1000))} tusen kr`;
  return `${sign}${nf0.format(Math.round(a))} kr`;
}

export function fmtPct(p: number): string {
  return `${p >= 0 ? "+" : "−"}${nf0.format(Math.round(Math.abs(p) * 100))} %`;
}

export const MONTHS = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
export const MONTHS_SHORT = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

export function periodLabel(upTo: number): string {
  return upTo >= 12 ? "hela året" : upTo === 1 ? "januari" : `januari–${MONTHS[upTo - 1]}`;
}

/** Saldo vid slutet av varje månad för ett balanskonto. `sign` -1 för skulder (visas positivt). */
export function balanceSeries(rows: Balance[], account: string, year: number, sign: 1 | -1) {
  const arr: Array<number | null> = Array(12).fill(null);
  let ib = 0;
  const change = Array(12).fill(0) as number[];
  const seen = Array(12).fill(false) as boolean[];
  for (const r of rows) {
    if (r.year !== year || r.account !== account) continue;
    if (r.month === 0) ib += r.amount;
    else {
      change[r.month - 1] += r.amount;
      seen[r.month - 1] = true;
    }
  }
  let run = ib;
  let last = -1;
  for (let i = 0; i < 12; i++) if (seen[i]) last = i;
  for (let i = 0; i <= last; i++) {
    run += change[i];
    arr[i] = sign * run;
  }
  return arr;
}
