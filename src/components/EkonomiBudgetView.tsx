import { useMemo, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { MONTHS_SHORT, fmtKr, fmtStort, latestOf, periodLabel, type Balance } from "@/lib/ekonomi-oversikt";
import { computeBudget, statusOf, type BudgetGroup, type BudgetOverview, type Status } from "@/lib/ekonomi-budget";
import { useFinanceData } from "@/components/EkonomiOversiktView";
import { EkonomiBudgetImport } from "@/components/EkonomiBudgetImport";
import { useAuth } from "@/lib/auth";
import { compactKr } from "@/components/MiniCharts";

const INK = "#0D2B1E";
const GREEN = "#3D8A30";
const GOLD = "#C99A1B";
const HOT = "#C2334D";
const MUTED = "#6B7280";
const LINE = "#E3E7E2";
const PAGE_SIZE = 1000;

const card: CSSProperties = { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, boxShadow: "0 1px 2px rgba(13,43,30,0.04)" };

const STATUS: Record<Status, { color: string; bg: string; label: string }> = {
  ok: { color: GREEN, bg: "#F0F7EE", label: "Inom budget" },
  near: { color: GOLD, bg: "#FBF4E0", label: "Nära gränsen" },
  over: { color: HOT, bg: "#FCEEF0", label: "Över budget" },
};
const STATUS_IN: Record<Status, string> = { ok: "Enligt budget", near: "Lite under budget", over: "Under budget" };

type BudgetData = { rows: Balance[]; missingTable: boolean };

/** Budgetrader för fastigheten. Tabellen kommer från en handkörd migration: saknas den visas en
 *  vänlig notis i stället för ett fel. */
function useBudgetRows(propertyId: string) {
  return useQuery({
    queryKey: ["finance-budget", propertyId],
    enabled: !!propertyId,
    queryFn: async (): Promise<BudgetData> => {
      const rows: Balance[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from("finance_budgets")
          .select("year, month, account, amount")
          .eq("property_id", propertyId)
          .order("year")
          .order("month")
          .order("account")
          .range(from, from + PAGE_SIZE - 1);
        if (error) {
          if (/relation .* does not exist|schema cache|42P01|PGRST205/i.test(`${error.message} ${error.code ?? ""}`)) return { rows: [], missingTable: true };
          throw error;
        }
        for (const r of data ?? []) rows.push({ year: r.year as number, month: r.month as number, account: r.account as string, amount: Number(r.amount) });
        if (!data || data.length < PAGE_SIZE) break;
      }
      return { rows, missingTable: false };
    },
  });
}

function Badge({ s, kind }: { s: Status; kind: "in" | "ut" }) {
  const st = STATUS[s];
  return (
    <span style={{ background: st.bg, color: st.color, borderRadius: 999, padding: "3px 10px", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
      {kind === "in" ? STATUS_IN[s] : st.label}
    </span>
  );
}

/** Stapel: fylld del = utfall, lodrätt streck = var vi borde vara hittills enligt budget. Bredden är årsbudgeten. */
function BudgetBar({ actual, ytd, year, color }: { actual: number; ytd: number; year: number; color: string }) {
  const max = Math.max(year, actual, ytd, 1);
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;
  return (
    <div style={{ position: "relative", height: 12, background: "#EEF1EC", borderRadius: 6, overflow: "visible" }} aria-hidden>
      <div style={{ width: pct(actual), height: "100%", background: color, borderRadius: 6 }} />
      {ytd > 0 && <div style={{ position: "absolute", left: pct(ytd), top: -3, bottom: -3, width: 2, background: INK, borderRadius: 1 }} />}
    </div>
  );
}

function kpiSentence(actual: number, budgetYtd: number): string {
  const diff = actual - budgetYtd;
  if (budgetYtd <= 0) return "Ingen budget finns för den här posten.";
  const abs = fmtStort(Math.abs(diff));
  if (Math.abs(diff) < 1000) return "Precis enligt budget.";
  return diff > 0 ? `${abs} mer än budgeterat.` : `${abs} mindre än budgeterat.`;
}

function Kpi({ title, actual, budget, kind }: { title: string; actual: number; budget: number; kind: "in" | "ut" }) {
  const s = statusOf(kind, actual, budget);
  return (
    <div style={{ ...card, padding: "16px 18px", flex: "1 1 240px", minWidth: 0 }}>
      <div style={{ color: MUTED, fontSize: 15 }}>{title}</div>
      <div style={{ fontFamily: "Outfit, Inter, sans-serif", fontSize: 30, fontWeight: 600, margin: "2px 0" }}>{fmtStort(actual)}</div>
      <div style={{ color: MUTED, fontSize: 15 }}>Budget för samma tid: {fmtStort(budget)}</div>
      <div style={{ margin: "10px 0 6px" }}>
        <Badge s={s} kind={kind} />
      </div>
      <div style={{ fontSize: 15, lineHeight: 1.5 }}>{kpiSentence(actual, budget)}</div>
    </div>
  );
}

/** Ackumulerade kostnader över året: utfall (heldragen) mot budget (streckad). */
function CostChart({ ov }: { ov: BudgetOverview }) {
  const W = 360;
  const H = 230;
  const L = 46;
  const R = 12;
  const T = 14;
  const B = 28;
  const { actual, budget } = ov.cumulative;
  const max = Math.max(...budget, ...actual.map((v) => v ?? 0), 1);
  const x = (i: number) => L + (i * (W - L - R)) / 11;
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const path = (vals: Array<number | null>) => {
    let d = "";
    vals.forEach((v, i) => {
      if (v === null) return;
      d += `${d ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
    });
    return d;
  };
  const ticks = [0, max / 2, max];
  const lastIdx = ov.upTo - 1;
  const lastActual = actual[lastIdx];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Kostnader hittills i år jämfört med budget" style={{ width: "100%", maxWidth: 640, height: "auto", display: "block" }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={LINE} />
          <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill={MUTED}>
            {compactKr(t)}
          </text>
        </g>
      ))}
      {MONTHS_SHORT.map((m, i) => (
        <text key={m} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10.5" fill={MUTED}>
          {m}
        </text>
      ))}
      <path d={path(budget)} fill="none" stroke={INK} strokeWidth="2" strokeDasharray="5 4" />
      <path d={path(actual)} fill="none" stroke={GREEN} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {lastActual !== null && lastActual !== undefined && <circle cx={x(lastIdx)} cy={y(lastActual)} r="4.5" fill={GREEN} />}
    </svg>
  );
}

function GroupRow({ g, open, toggle }: { g: BudgetGroup; open: boolean; toggle: () => void }) {
  const s = statusOf(g.kind, g.actual, g.budgetYtd);
  const color = STATUS[s].color;
  const left = g.budgetYear - g.actual;
  return (
    <div style={{ ...card, overflow: "hidden" }}>
      <button
        onClick={toggle}
        aria-expanded={open}
        style={{ all: "unset", boxSizing: "border-box", width: "100%", cursor: "pointer", padding: "14px 18px", display: "block" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, fontSize: 17 }}>{g.label}</span>
          <Badge s={s} kind={g.kind} />
        </div>
        <div style={{ margin: "10px 0 8px" }}>
          <BudgetBar actual={g.actual} ytd={g.budgetYtd} year={g.budgetYear} color={color} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", fontSize: 15, color: MUTED }}>
          <span>
            Hittills <strong style={{ color: INK }}>{fmtKr(g.actual)}</strong> · budget hittills {fmtKr(g.budgetYtd)}
          </span>
          <span>{g.budgetYear > 0 ? (left >= 0 ? `${fmtKr(left)} kvar av årsbudgeten` : `${fmtKr(-left)} över årsbudgeten`) : "Ej budgeterat"}</span>
        </div>
      </button>
      {open && (
        <div style={{ borderTop: `1px solid ${LINE}`, padding: "6px 18px 14px" }}>
          <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.5, margin: "8px 0" }}>{g.kid}</p>
          {g.accounts.length === 0 && <p style={{ color: MUTED, margin: 0 }}>Inga konton i den här gruppen.</p>}
          {g.accounts.map((a) => {
            const as = statusOf(g.kind, a.actual, a.budgetYtd);
            const kvar = a.budgetYear - a.actual;
            return (
              <div key={a.account} style={{ padding: "10px 0", borderTop: `1px solid ${LINE}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600 }}>
                    {a.name} <span style={{ color: MUTED, fontWeight: 400 }}>({a.account})</span>
                  </span>
                  <span style={{ color: STATUS[as].color, fontWeight: 600, fontSize: 14 }}>{a.budgetYear > 0 || a.budgetYtd > 0 ? (g.kind === "in" ? STATUS_IN[as] : STATUS[as].label) : "Ej budgeterat"}</span>
                </div>
                <div style={{ margin: "8px 0 6px" }}>
                  <BudgetBar actual={a.actual} ytd={a.budgetYtd} year={a.budgetYear} color={STATUS[as].color} />
                </div>
                <div style={{ fontSize: 14.5, color: MUTED, lineHeight: 1.55 }}>
                  Hittills <strong style={{ color: INK }}>{fmtKr(a.actual)}</strong> · budget hittills {fmtKr(a.budgetYtd)} · årsbudget {fmtKr(a.budgetYear)}
                  {a.budgetYear > 0 && <> · {kvar >= 0 ? `${fmtKr(kvar)} kvar` : `${fmtKr(-kvar)} över`}</>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdminImport({ propertyId, year, open }: { propertyId: string; year: number; open?: boolean }) {
  return (
    <details open={open} style={{ marginTop: 6 }}>
      <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 16, color: MUTED }}>Admin: läs in budget</summary>
      <div style={{ marginTop: 12 }}>
        <EkonomiBudgetImport propertyId={propertyId} defaultYear={year} />
      </div>
    </details>
  );
}

export function EkonomiBudgetView({ propertyId }: { propertyId: string }) {
  const fin = useFinanceData(propertyId);
  const bud = useBudgetRows(propertyId);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const data = fin.data;
  const period = useMemo(() => {
    if (!data || data.rows.length === 0) return null;
    const fromLog =
      data.latestPeriod && /^\d{6}$/.test(data.latestPeriod)
        ? { year: Number(data.latestPeriod.slice(0, 4)), month: Number(data.latestPeriod.slice(4)) }
        : null;
    return fromLog ?? latestOf(data.rows);
  }, [data]);

  const ov = useMemo(
    () => (data && bud.data && period ? computeBudget(data.rows, bud.data.rows, data.names, period.year, period.month) : null),
    [data, bud.data, period],
  );

  if (fin.isLoading || bud.isLoading) return <p style={{ color: MUTED }}>Hämtar siffrorna …</p>;
  if (fin.error) return <p style={{ color: HOT }}>Kunde inte hämta siffrorna: {(fin.error as Error).message}</p>;
  if (bud.error) return <p style={{ color: HOT }}>Kunde inte hämta budgeten: {(bud.error as Error).message}</p>;

  if (!data || !period || !ov) {
    return (
      <div style={{ ...card, padding: 24 }}>
        <p style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Inga siffror har lagts in ännu.</p>
        <p style={{ margin: "8px 0 0", color: MUTED }}>När föreningens rapport har laddats upp visas utfallet mot budget här.</p>
      </div>
    );
  }

  if (bud.data?.missingTable || !ov.hasBudget) {
    return (
      <div style={{ ...card, padding: 24 }}>
        <p style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Ingen budget är inläst för {period.year}.</p>
        <p style={{ margin: "8px 0 0", color: MUTED, lineHeight: 1.55 }}>
          Budgeten kan läsas in från en egen fil (Excel, CSV, PDF eller SIE){isAdmin ? "." : ". Kontakta BAYT så hjälper vi till att få in den."}
        </p>
        {isAdmin && <AdminImport propertyId={propertyId} year={period.year} open />}
      </div>
    );
  }

  const updated = data.importedAt ? new Date(data.importedAt).toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" }) : null;
  const utStatus = statusOf("ut", ov.utActual, ov.utBudgetYtd);
  const utDiff = ov.utActual - ov.utBudgetYtd;
  const kvarUt = ov.utBudgetYear - ov.utActual;
  const costGroups = ov.groups.filter((g) => g.kind === "ut" && (g.actual > 0.5 || g.budgetYear > 0.5 || g.budgetYtd > 0.5));
  const inGroups = ov.groups.filter((g) => g.kind === "in" && (g.actual > 0.5 || g.budgetYear > 0.5 || g.budgetYtd > 0.5));
  const toggle = (k: string) => setOpenKey((cur) => (cur === k ? null : k));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ ...card, padding: "18px 20px", borderLeft: `5px solid ${STATUS[utStatus].color}` }}>
        <div style={{ fontFamily: "Outfit, Inter, sans-serif", fontSize: 22, fontWeight: 600, lineHeight: 1.3 }}>
          {Math.abs(utDiff) < 1000
            ? "Kostnaderna ligger precis på budget."
            : utDiff > 0
              ? `Kostnaderna ligger ${fmtStort(utDiff)} över budget hittills.`
              : `Kostnaderna ligger ${fmtStort(-utDiff)} under budget hittills.`}
        </div>
        <p style={{ margin: "8px 0 0", color: MUTED, fontSize: 16, lineHeight: 1.55 }}>
          {periodLabel(ov.upTo)} {ov.year} har föreningen spenderat {fmtStort(ov.utActual)}. Budgeten för samma tid var {fmtStort(ov.utBudgetYtd)}. Av
          årsbudgeten på {fmtStort(ov.utBudgetYear)} är {kvarUt >= 0 ? `${fmtStort(kvarUt)} kvar` : `${fmtStort(-kvarUt)} redan överskridet`}.
        </p>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <Kpi title="Kostnader hittills" actual={ov.utActual} budget={ov.utBudgetYtd} kind="ut" />
        <Kpi title="Intäkter hittills" actual={ov.inActual} budget={ov.inBudgetYtd} kind="in" />
      </div>

      <div style={{ ...card, padding: "16px 18px" }}>
        <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 4 }}>Kostnader över året</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 14, color: MUTED, margin: "0 0 8px" }}>
          <span>
            <span style={{ display: "inline-block", width: 22, height: 3, background: GREEN, verticalAlign: "middle", marginRight: 6 }} />
            Faktiskt hittills
          </span>
          <span>
            <span style={{ display: "inline-block", width: 22, borderTop: `2px dashed ${INK}`, verticalAlign: "middle", marginRight: 6 }} />
            Budget
          </span>
        </div>
        <CostChart ov={ov} />
      </div>

      <div>
        <h2 style={{ fontFamily: "Outfit, Inter, sans-serif", fontSize: 24, margin: "0 0 4px" }}>Kostnader per post</h2>
        <p style={{ color: MUTED, margin: "0 0 12px", fontSize: 15, lineHeight: 1.5 }}>
          Fylld stapel är vad som spenderats. Det svarta strecket är var vi borde vara hittills enligt budget. Hela stapeln är årsbudgeten. Tryck på en post för
          att se kontona.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {costGroups.map((g) => (
            <GroupRow key={g.key} g={g} open={openKey === g.key} toggle={() => toggle(g.key)} />
          ))}
        </div>
      </div>

      {inGroups.length > 0 && (
        <div>
          <h2 style={{ fontFamily: "Outfit, Inter, sans-serif", fontSize: 24, margin: "0 0 12px" }}>Intäkter</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {inGroups.map((g) => (
              <GroupRow key={g.key} g={g} open={openKey === g.key} toggle={() => toggle(g.key)} />
            ))}
          </div>
        </div>
      )}

      <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.6, margin: 0 }}>
        Källa: föreningens bokföring och budget. Siffrorna gäller {periodLabel(ov.upTo)} {ov.year}.{updated ? ` Uppdaterad ${updated}.` : ""} Avvikelser under 1 000 kr
        räknas som enligt budget. Det här är en förenklad uppföljning och ersätter inte årsredovisningen.
      </p>
      {isAdmin && <AdminImport propertyId={propertyId} year={ov.year} />}
    </div>
  );
}
