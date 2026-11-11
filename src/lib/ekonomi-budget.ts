/**
 * Budgetuppföljning: utfall hittills i år mot budget, per kostnads- och intäktsgrupp och konto.
 * Ren TypeScript utan beroenden. Använder samma kontogrupper och tecken som ekonomi-oversikt.ts:
 * i filerna är intäkter negativa och kostnader positiva, här visas allt som positiva belopp.
 */
import { GROUPS, groupOf, shown, type Balance, type GroupDef } from "./ekonomi-oversikt";

export type BudgetRow = { account: string; name: string; actual: number; budgetYtd: number; budgetYear: number };
export type BudgetGroup = GroupDef & {
  actual: number;
  budgetYtd: number;
  budgetYear: number;
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
};

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
): BudgetOverview {
  const actual = new Map<string, number>();
  const bYtd = new Map<string, number>();
  const bYear = new Map<string, number>();
  for (const r of actualRows) {
    if (r.year !== year || r.month < 1 || r.month > upTo) continue;
    actual.set(r.account, (actual.get(r.account) ?? 0) + r.amount);
  }
  for (const r of budgetRows) {
    if (r.year !== year || r.month < 1 || r.month > 12) continue;
    bYear.set(r.account, (bYear.get(r.account) ?? 0) + r.amount);
    if (r.month <= upTo) bYtd.set(r.account, (bYtd.get(r.account) ?? 0) + r.amount);
  }

  const groups: BudgetGroup[] = GROUPS.map((g) => ({ ...g, actual: 0, budgetYtd: 0, budgetYear: 0, accounts: [] }));
  const byKey = new Map(groups.map((g) => [g.key, g]));
  const accounts = new Set<string>([...actual.keys(), ...bYear.keys()]);
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
    };
    g.actual += row.actual;
    g.budgetYtd += row.budgetYtd;
    g.budgetYear += row.budgetYear;
    if ([row.actual, row.budgetYtd, row.budgetYear].some((v) => Math.abs(v) > 0.5)) g.accounts.push(row);
  }
  for (const g of groups) g.accounts.sort((x, y) => y.actual - x.actual || x.account.localeCompare(y.account));

  const tot = (kind: "in" | "ut", f: "actual" | "budgetYtd" | "budgetYear") =>
    groups.filter((g) => g.kind === kind).reduce((s, g) => s + g[f], 0);

  // Ackumulerade kostnader månad för månad.
  const monthlyActual = Array(12).fill(0) as number[];
  const monthlyBudget = Array(12).fill(0) as number[];
  for (const r of actualRows) {
    if (r.year !== year || r.month < 1 || r.month > upTo) continue;
    const k = groupOf(r.account);
    if (k && GROUPS.find((g) => g.key === k)!.kind === "ut") monthlyActual[r.month - 1] += r.amount;
  }
  for (const r of budgetRows) {
    if (r.year !== year || r.month < 1 || r.month > 12) continue;
    const k = groupOf(r.account);
    if (k && GROUPS.find((g) => g.key === k)!.kind === "ut") monthlyBudget[r.month - 1] += r.amount;
  }
  let a = 0;
  let b = 0;
  const cumA: Array<number | null> = [];
  const cumB: number[] = [];
  for (let i = 0; i < 12; i++) {
    a += monthlyActual[i];
    b += monthlyBudget[i];
    cumA.push(i < upTo ? a : null);
    cumB.push(b);
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
  };
}
