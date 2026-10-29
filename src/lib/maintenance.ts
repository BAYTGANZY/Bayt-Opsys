export type Plan = {
  id: string;
  property_id: string;
  name: string;
  start_year: number;
  end_year: number;
  vat_rate: number;
  extra_cost_pct: number;
  annual_increase_pct: number;
  current_annual_savings: number;
  fund_balance: number;
  boa_sqm: number | null;
  round_to: number;
};

export type Action = {
  id: string;
  plan_id: string;
  property_id: string;
  name: string;
  category: string | null;
  location: string | null;
  year: number;
  interval_years: number | null;
  prev_year: number | null;
  quantity: number;
  unit: string;
  unit_price: number;
  kind: "investering" | "underhall";
  status: "planerad" | "beslutad" | "genomford";
  label: string | null;
  description: string | null;
};

export type Occurrence = { action: Action; year: number; cost: number };

export const KIND_LABEL = { investering: "Investering", underhall: "Underhåll" } as const;
export const STATUS_LABEL = { planerad: "Planerad", beslutad: "Beslutad", genomford: "Genomförd" } as const;

export const CATEGORY_SUGGESTIONS = [
  "Mark",
  "Fasad",
  "Invändigt",
  "Ventilation",
  "Installationer",
  "Tak",
  "17. BRAND och SÄKERHET",
  "Besiktningar",
];

export const kr = (n: number) => `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(Math.round(n))} kr`;

/** Kostnad för ett tillfälle: antal × styckpris × påslag × uppräkning (× moms), avrundad enligt planen. */
export function costOf(a: Action, plan: Plan, withVat: boolean, year: number): number {
  let c = Number(a.quantity) * Number(a.unit_price);
  c *= 1 + Number(plan.extra_cost_pct) / 100;
  c *= Math.pow(1 + Number(plan.annual_increase_pct) / 100, Math.max(0, year - plan.start_year));
  if (withVat) c *= 1 + Number(plan.vat_rate) / 100;
  const r = Number(plan.round_to);
  return r > 1 ? Math.round(c / r) * r : Math.round(c);
}

/** Alla tillfällen under planperioden, inklusive återkommande åtgärder. */
export function occurrences(actions: Action[], plan: Plan, withVat: boolean): Occurrence[] {
  const out: Occurrence[] = [];
  for (const a of actions) {
    const years = [a.year];
    const step = Number(a.interval_years);
    if (step > 0) for (let y = a.year + step; y <= plan.end_year; y += step) years.push(y);
    for (const y of years) {
      if (y >= plan.start_year && y <= plan.end_year) out.push({ action: a, year: y, cost: costOf(a, plan, withVat, y) });
    }
  }
  return out.sort((x, y) => x.year - y.year || x.action.name.localeCompare(y.action.name, "sv"));
}
