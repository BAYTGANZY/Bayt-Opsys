/**
 * Budgetuppföljning: utfall hittills i år mot budget, per kostnads- och intäktsgrupp och konto.
 * Ren TypeScript utan beroenden. Använder samma kontogrupper och tecken som ekonomi-oversikt.ts:
 * i filerna är intäkter negativa och kostnader positiva, här visas allt som positiva belopp.
 */
import { GROUPS, groupOf, shown, type Balance, type GroupDef } from "./ekonomi-oversikt";

export type BudgetRow = { account: string; name: string; actual: number; budgetYtd: number; budgetYear: number; /** Samma period förra året (utfall). */ prevYtd: number };
export type BudgetGroup = GroupDef & {
  actual: number;
  budgetYtd: number;
  budgetYear: number;
  prevYtd: number;
  accounts: BudgetRow[];
};

/** ok = inom budget, near = över men högst 5 %, over = mer än 5 % över (kostnader) / under (intäkter). */
export type Status = "ok" | "near" | "over";

export type BudgetOverview = {
  year: number;
  upTo: number;
  hasBudget: boolean;
  groups: BudgetGroup[];
  inActual: number;
  inBudgetYtd: number;
  inBudgetYear: number;
  utActual: number;
  utBudgetYtd: number;
  utBudgetYear: number;
  /** Ackumulerade kostnader per månad, index 0 = januari. Utfallet slutar vid `upTo`. */
  cumulative: { actual: Array<number | null>; budget: number[] };
  /** Månad för månad, index 0 = januari. Utfallet är null för månader efter `upTo`. Alla belopp är positiva ("shown"). */
  months: MonthRow[];
  /** Finns det utfall för föregående år? */
  hasPrev: boolean;
};

export type MonthRow = {
  month: number;
  utActual: number | null;
  utBudget: number;
  inActual: number | null;
  inBudget: number;
  /** Förra årets utfall samma månad, null om förra året saknas. */
  utPrev: number | null;
  inPrev: number | null;
};

export type YearSummary = { year: number; months: number; utActual: number; utBudget: number | null; inActual: number; inBudget: number | null };

/** Tidigare års utfall mot budget, senaste först. Bara år före `currentYear` som har utfall. Budget är null när året saknar budget. */
export function yearSummaries(actualRows: Balance[], budgetRows: Balance[], currentYear: number, limit = 5): YearSummary[] {
  const years = [...new Set(actualRows.filter((r) => r.month >= 1 && r.year < currentYear).map((r) => r.year))].sort((a, b) => b - a).slice(0, limit);
  return years.map((year) => {
    let ut = 0;
    let inn = 0;
    const months = new Set<number>();
    for (const r of actualRows) {
      if (r.year !== year || r.month < 1) continue;
      const k = groupOf(r.account);
      if (!k) continue;
      months.add(r.month);
      if (GROUPS.find((g) => g.key === k)!.kind === "ut") ut += r.amount;
      else inn += -r.amount;
    }
    const has = budgetRows.some((r) => r.year === year);
    let bUt = 0;
    let bIn = 0;
    if (has) {
      for (const r of normalizeBudgetSigns(budgetRows, year)) {
        if (r.year !== year) continue;
        const k = groupOf(r.account);
        if (!k) continue;
        if (GROUPS.find((g) => g.key === k)!.kind === "ut") bUt += r.amount;
        else bIn += -r.amount;
      }
    }
    return { year, months: months.size, utActual: ut, utBudget: has ? bUt : null, inActual: inn, inBudget: has ? bIn : null };
  });
}

/**
 * En budget kan ha lästs in med fel tecken (Excel har ofta kostnader som minus). I databasen ska kostnader vara plus och
 * intäkter minus, precis som i SIE. Räkna ut vad filen gör som helhet och vänd på hela slaget om det behövs, så att
 * redan inlästa budgetar blir rätt utan ny inläsning. Utfallet rörs aldrig.
 */
export function normalizeBudgetSigns(rows: Balance[], year: number): Balance[] {
  let ut = 0;
  let inn = 0;
  for (const r of rows) {
    if (r.year !== year) continue;
    const k = groupOf(r.account);
    if (!k) continue;
    if (GROUPS.find((g) => g.key === k)!.kind === "ut") ut += r.amount;
    else inn += r.amount;
  }
  const flipUt = ut < 0;
  const flipIn = inn > 0;
  if (!flipUt && !flipIn) return rows;
  return rows.map((r) => {
    if (r.year !== year) return r;
    const k = groupOf(r.account);
    if (!k) return r;
    const kind = GROUPS.find((g) => g.key === k)!.kind;
    return (kind === "ut" ? flipUt : flipIn) ? { ...r, amount: -r.amount } : r;
  });
}

/** Kostnad: över budget är dåligt. Intäkt: under budget är dåligt. Små avvikelser (under 1 000 kr) räknas som ok. */
export function statusOf(kind: "in" | "ut", actual: number, budgetYtd: number): Status {
  const diff = kind === "ut" ? actual - budgetYtd : budgetYtd - actual; // positivt = dåligt
  if (diff <= 1000) return "ok";
  if (budgetYtd <= 0) return "over";
  return diff / budgetYtd <= 0.05 ? "near" : "over";
}

export function computeBudget(
  actualRows: Balance[],
  budgetRows: Balance[],
  names: Record<string, string>,
  year: number,
  upTo: number,
  from = 1,
): BudgetOverview {
  budgetRows = normalizeBudgetSigns(budgetRows, year);
  const actual = new Map<string, number>();
  const prev = new Map<string, number>();
  const bYtd = new Map<string, number>();
  const bYear = new Map<string, number>();
  for (const r of actualRows) {
    if (r.year !== year || r.month < from || r.month > upTo) continue;
    actual.set(r.account, (actual.get(r.account) ?? 0) + r.amount);
  }
  for (const r of actualRows) {
    if (r.year !== year - 1 || r.month < from || r.month > upTo) continue;
    prev.set(r.account, (prev.get(r.account) ?? 0) + r.amount);
  }
  for (const r of budgetRows) {
    if (r.year !== year || r.month < 1 || r.month > 12) continue;
    bYear.set(r.account, (bYear.get(r.account) ?? 0) + r.amount);
    if (r.month >= from && r.month <= upTo) bYtd.set(r.account, (bYtd.get(r.account) ?? 0) + r.amount);
  }

  const groups: BudgetGroup[] = GROUPS.map((g) => ({ ...g, actual: 0, budgetYtd: 0, budgetYear: 0, prevYtd: 0, accounts: [] }));
  const byKey = new Map(groups.map((g) => [g.key, g]));
  const accounts = new Set<string>([...actual.keys(), ...bYear.keys(), ...prev.keys()]);
  for (const a of accounts) {
    const key = groupOf(a);
    if (!key) continue;
    const g = byKey.get(key)!;
    const row: BudgetRow = {
      account: a,
      name: names[a] ?? `Konto ${a}`,
      actual: shown(g.kind, actual.get(a) ?? 0),
      budgetYtd: shown(g.kind, bYtd.get(a) ?? 0),
      budgetYear: shown(g.kind, bYear.get(a) ?? 0),
      prevYtd: shown(g.kind, prev.get(a) ?? 0),
    };
    g.actual += row.actual;
    g.budgetYtd += row.budgetYtd;
    g.budgetYear += row.budgetYear;
    g.prevYtd += row.prevYtd;
    if ([row.actual, row.budgetYtd, row.budgetYear].some((v) => Math.abs(v) > 0.5)) g.accounts.push(row);
  }
  for (const g of groups) g.accounts.sort((x, y) => y.actual - x.actual || x.account.localeCompare(y.account));

  const tot = (kind: "in" | "ut", f: "actual" | "budgetYtd" | "budgetYear") =>
    groups.filter((g) => g.kind === kind).reduce((s, g) => s + g[f], 0);

  // Månad för månad (hela året), kostnader och intäkter, plus ackumulerade kostnader till diagrammet.
  const mUtA = Array(12).fill(0) as number[];
  const mUtB = Array(12).fill(0) as number[];
  const mInA = Array(12).fill(0) as number[];
  const mInB = Array(12).fill(0) as number[];
  const mUtP = Array(12).fill(0) as number[];
  const mInP = Array(12).fill(0) as number[];
  let hasPrev = false;
  const kindOfAcc = (acc: string) => {
    const k = groupOf(acc);
    return k ? GROUPS.find((g) => g.key === k)!.kind : null;
  };
  for (const r of actualRows) {
    if (r.year !== year || r.month < 1 || r.month > upTo) continue;
    const k = kindOfAcc(r.account);
    if (k === "ut") mUtA[r.month - 1] += r.amount;
    else if (k === "in") mInA[r.month - 1] += -r.amount;
  }
  for (const r of actualRows) {
    if (r.year !== year - 1 || r.month < 1 || r.month > 12) continue;
    const k = kindOfAcc(r.account);
    if (k === "ut") mUtP[r.month - 1] += r.amount;
    else if (k === "in") mInP[r.month - 1] += -r.amount;
    if (k) hasPrev = true;
  }
  for (const r of budgetRows) {
    if (r.year !== year || r.month < 1 || r.month > 12) continue;
    const k = kindOfAcc(r.account);
    if (k === "ut") mUtB[r.month - 1] += r.amount;
    else if (k === "in") mInB[r.month - 1] += -r.amount;
  }
  let a = 0;
  let b = 0;
  const cumA: Array<number | null> = [];
  const cumB: number[] = [];
  const months: MonthRow[] = [];
  for (let i = 0; i < 12; i++) {
    a += mUtA[i];
    b += mUtB[i];
    cumA.push(i < upTo ? a : null);
    cumB.push(b);
    months.push({ month: i + 1, utActual: i < upTo ? mUtA[i] : null, utBudget: mUtB[i], inActual: i < upTo ? mInA[i] : null, inBudget: mInB[i], utPrev: hasPrev ? mUtP[i] : null, inPrev: hasPrev ? mInP[i] : null });
  }

  return {
    year,
    upTo,
    hasBudget: budgetRows.some((r) => r.year === year),
    groups,
    inActual: tot("in", "actual"),
    inBudgetYtd: tot("in", "budgetYtd"),
    inBudgetYear: tot("in", "budgetYear"),
    utActual: tot("ut", "actual"),
    utBudgetYtd: tot("ut", "budgetYtd"),
    utBudgetYear: tot("ut", "budgetYear"),
    cumulative: { actual: cumA, budget: cumB },
    months,
    hasPrev,
  };
}
