import { useMemo, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { MONTHS, MONTHS_SHORT, fmtKr, fmtStort, latestOf, periodLabel, type Balance } from "@/lib/ekonomi-oversikt";
import { computeBudget, statusOf, yearSummaries, type BudgetGroup, type BudgetOverview, type Status } from "@/lib/ekonomi-budget";
import { useFinanceData } from "@/components/EkonomiOversiktView";
import { EkonomiBudgetImport } from "@/components/EkonomiBudgetImport";
import { EkonomiUtfallImport } from "@/components/EkonomiUtfallImport";
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

const DARK = "#0D2B1E";
const BRIGHT = "#5CB84A";

/** Två tunna staplar per månad: den mörka är jämförelsen (budget eller förra året), den ljusa är i år. */
function MonthBars({ series, label }: { series: Array<{ name: string; color: string; values: Array<number | null> }>; label: string }) {
  const W = 360;
  const H = 240;
  const L = 8;
  const R = 54;
  const T = 14;
  const B = 56;
  const all = series.flatMap((x) => x.values.map((v) => v ?? 0));
  const rawMax = Math.max(...all, 1);
  const step = (() => {
    const mag = Math.pow(10, Math.floor(Math.log10(rawMax / 4)));
    const n = rawMax / 4 / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  })();
  const max = Math.ceil(rawMax / step) * step;
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const gw = (W - L - R) / 12;
  const bw = Math.min(4.5, gw / 3);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const [pick, setPick] = useState<number | null>(null);
  const cx = (i: number) => L + gw * i + gw / 2;
  return (
    <div style={{ position: "relative", maxWidth: 640 }}>
      {pick !== null && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: `${Math.min(80, Math.max(20, (cx(pick) / W) * 100))}%`,
            transform: "translateX(-50%)",
            background: "#404040",
            color: "#fff",
            borderRadius: 12,
            padding: "8px 14px",
            fontSize: 15,
            lineHeight: 1.45,
            textAlign: "center",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 2,
          }}
        >
          {series.map((sr) => (
            <div key={sr.name} style={{ fontWeight: 600 }}>
              {sr.name}: {sr.values[pick] === null ? "—" : fmtKr(sr.values[pick] as number)}
            </div>
          ))}
          <div style={{ opacity: 0.85 }}>{MONTHS[pick]}</div>
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ width: "100%", maxWidth: 640, height: "auto", display: "block" }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R + 6} y1={y(t)} y2={y(t)} stroke="#D3D6D1" strokeDasharray={t === 0 ? undefined : "4 3"} />
            {t > 0 && (
              <text x={W - 2} y={y(t) - 3} textAnchor="end" fontSize="11" fill={MUTED}>
                {compactKr(t)}
              </text>
            )}
          </g>
        ))}
        {MONTHS_SHORT.map((m, i) => (
          <text key={m} x={L + gw * i + gw / 2} y={H - B + 16} textAnchor="middle" fontSize="10.5" fill={MUTED}>
            {m}
          </text>
        ))}
        {pick !== null && <line x1={cx(pick)} x2={cx(pick)} y1={T} y2={y(0)} stroke={HOT} strokeWidth="1.5" />}
        {series.map((sr, si) =>
          sr.values.map((v, i) =>
            v === null ? null : (
              <rect
                key={`${si}-${i}`}
                x={L + gw * i + gw / 2 + (si - (series.length - 1) / 2) * (bw + 1.5) - bw / 2}
                y={y(Math.max(v, 0))}
                width={bw}
                height={Math.max(0, y(0) - y(Math.max(v, 0)))}
                rx={bw / 2}
                fill={sr.color}
                opacity={pick === null || pick === i ? 1 : 0.45}
              />
            ),
          ),
        )}
        {MONTHS_SHORT.map((m, i) => (
          <rect
            key={`hit-${m}`}
            x={L + gw * i}
            y={T}
            width={gw}
            height={H - T - B + 24}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setPick(i)}
            onMouseLeave={() => setPick(null)}
            onClick={() => setPick((c) => (c === i ? null : i))}
          />
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "center", gap: 22, marginTop: 4, fontSize: 15, color: MUTED }}>
        {series.map((sr) => (
          <span key={sr.name} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 11, height: 11, borderRadius: 6, background: sr.color, display: "inline-block" }} />
            {sr.name}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Tidigare års utfall mot budget, ett år per rad. */
function HistoryTable({ rows, kind }: { rows: ReturnType<typeof yearSummaries>; kind: "in" | "ut" }) {
  if (rows.length === 0) return null;
  const col = (w: string): CSSProperties => ({ width: w, textAlign: "right", flexShrink: 0 });
  return (
    <div style={{ ...card, padding: "16px 18px" }}>
      <div style={{ fontWeight: 600, fontSize: 20 }}>Tidigare år</div>
      <p style={{ margin: "6px 0 10px", color: MUTED, fontSize: 14.5 }}>Hela året, {kind === "ut" ? "kostnader" : "intäkter"}: utfall mot budget.</p>
      <div style={{ display: "flex", padding: "6px 8px", color: MUTED, fontSize: 13, fontWeight: 600 }}>
        <span style={{ flex: 1 }}>År</span>
        <span style={col("74px")}>Utfall</span>
        <span style={col("74px")}>Budget</span>
        <span style={col("70px")}>Skillnad</span>
      </div>
      {rows.map((r) => {
        const a = kind === "ut" ? r.utActual : r.inActual;
        const b = kind === "ut" ? r.utBudget : r.inBudget;
        return (
          <div key={r.year} style={{ display: "flex", alignItems: "center", padding: "10px 8px", borderTop: `1px solid ${LINE}`, fontSize: 15.5 }}>
            <span style={{ flex: 1, fontWeight: 600 }}>
              {r.year}
              {r.months < 12 && <span style={{ color: MUTED, fontWeight: 400, fontSize: 13 }}> ({r.months} mån)</span>}
            </span>
            <span style={col("74px")}>{compactKr(a)}</span>
            <span style={{ ...col("74px"), color: MUTED }}>{b === null ? "saknas" : compactKr(b)}</span>
            <span style={{ ...col("70px"), fontWeight: 700, color: b === null ? MUTED : diffColor(kind, a, b) }}>{b === null ? "" : diffText(a - b)}</span>
          </div>
        );
      })}
    </div>
  );
}

function GroupRow({ g, open, toggle, showPrev, prevYear }: { g: BudgetGroup; open: boolean; toggle: () => void; showPrev: boolean; prevYear: number }) {
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
        {showPrev && (
          <div style={{ marginTop: 6, fontSize: 15, color: MUTED }}>
            Samma period {prevYear}: <strong style={{ color: INK }}>{fmtKr(g.prevYtd)}</strong>
            {Math.abs(g.actual - g.prevYtd) >= 1000 && <> ({diffText(g.actual - g.prevYtd)} mot i år)</>}
          </div>
        )}
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
                  {showPrev && <> · {prevYear}: {fmtKr(a.prevYtd)}</>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


/** Skillnad mot budget som kort, tecknad text. Positivt = mer än budget. */
function diffText(n: number): string {
  if (Math.abs(n) < 1000) return "±0";
  return `${n > 0 ? "+" : "−"}${compactKr(Math.abs(n)).replace("−", "")}`;
}

/** Färg på en skillnad: för kostnader är mer än budget dåligt, för intäkter är mindre än budget dåligt. */
function diffColor(kind: "in" | "ut", actual: number, budget: number): string {
  return STATUS[statusOf(kind, actual, budget)].color;
}

/** Översta rutan: ett enda besked i klartext, med de tre siffrorna under. */
function Verdict({ ov, prognosUt, monthsLeft }: { ov: BudgetOverview; prognosUt: number; monthsLeft: number }) {
  const s = statusOf("ut", ov.utActual, ov.utBudgetYtd);
  const diff = ov.utActual - ov.utBudgetYtd;
  const prognosDiff = prognosUt - ov.utBudgetYear;
  const headline =
    Math.abs(diff) < 1000 ? "Kostnaderna ligger på budget" : diff > 0 ? `Kostnaderna ligger ${fmtStort(diff)} över budget` : `Kostnaderna ligger ${fmtStort(-diff)} under budget`;
  const tile = (label: string, value: string, color?: string) => (
    <div style={{ flex: "1 1 120px", minWidth: 0 }}>
      <div style={{ color: MUTED, fontSize: 14 }}>{label}</div>
      <div style={{ fontFamily: "Outfit, Inter, sans-serif", fontSize: 24, fontWeight: 600, color: color ?? INK, lineHeight: 1.25 }}>{value}</div>
    </div>
  );
  return (
    <div style={{ ...card, padding: "18px 20px", borderLeft: `5px solid ${STATUS[s].color}` }}>
      <div style={{ color: MUTED, fontSize: 14, marginBottom: 2 }}>
        {periodLabel(ov.upTo)} {ov.year}
      </div>
      <div style={{ fontFamily: "Outfit, Inter, sans-serif", fontSize: 26, fontWeight: 600, lineHeight: 1.25 }}>{headline}</div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 14 }}>
        {tile("Spenderat", fmtStort(ov.utActual))}
        {tile("Budget", fmtStort(ov.utBudgetYtd))}
        {tile("Skillnad", `${diff > 0 ? "+" : diff < 0 ? "−" : ""}${fmtStort(Math.abs(diff))}`, STATUS[s].color)}
      </div>
      {monthsLeft > 0 && (
        <p style={{ margin: "14px 0 0", fontSize: 16, lineHeight: 1.5 }}>
          <strong>Prognos för året:</strong> {fmtStort(prognosUt)}
          {Math.abs(prognosDiff) < 1000 ? ", på årsbudgeten." : prognosDiff > 0 ? `, ${fmtStort(prognosDiff)} över årsbudgeten på ${fmtStort(ov.utBudgetYear)}.` : `, ${fmtStort(-prognosDiff)} under årsbudgeten på ${fmtStort(ov.utBudgetYear)}.`}
          <span style={{ color: MUTED }}> Räknat som utfall hittills plus budget för resten av året.</span>
        </p>
      )}
    </div>
  );
}

/** Månad för månad: utfall, budget och skillnad. Tryck på en månad för att se vad den består av. */
function MonthTable({ ov, kind, setKind, sel, setSel }: { ov: BudgetOverview; kind: "in" | "ut"; setKind?: (k: "in" | "ut") => void; sel: number; setSel: (m: number) => void }) {
  const rows = ov.months.map((m) => ({ month: m.month, actual: kind === "ut" ? m.utActual : m.inActual, budget: kind === "ut" ? m.utBudget : m.inBudget }));
  const sumA = rows.reduce((t, r) => t + (r.actual ?? 0), 0);
  const sumB = rows.filter((r) => r.actual !== null).reduce((t, r) => t + r.budget, 0);
  const col = (w: string): CSSProperties => ({ width: w, textAlign: "right", flexShrink: 0 });
  const tab = (k: "in" | "ut", label: string) => (
    <button
      onClick={() => setKind?.(k)}
      style={{ all: "unset", cursor: "pointer", padding: "7px 16px", borderRadius: 999, fontSize: 15, fontWeight: 600, border: `1px solid ${kind === k ? GREEN : LINE}`, background: kind === k ? "#F0F7EE" : "#fff", color: kind === k ? GREEN : MUTED }}
    >
      {label}
    </button>
  );
  return (
    <div style={{ ...card, padding: "16px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 600, fontSize: 20 }}>Månad för månad</div>
        {setKind && (
          <div style={{ display: "flex", gap: 8 }}>
            {tab("ut", "Kostnader")}
            {tab("in", "Intäkter")}
          </div>
        )}
      </div>
      <p style={{ margin: "6px 0 10px", color: MUTED, fontSize: 14.5 }}>Tryck på en månad för att se vad den består av.</p>
      <div style={{ display: "flex", padding: "6px 8px", color: MUTED, fontSize: 13, fontWeight: 600 }}>
        <span style={{ flex: 1 }}>Månad</span>
        <span style={col("74px")}>Utfall</span>
        <span style={col("74px")}>Budget</span>
        <span style={col("70px")}>Skillnad</span>
      </div>
      {rows.map((r) => {
        const has = r.actual !== null;
        const active = sel === r.month;
        const c = has ? diffColor(kind, r.actual ?? 0, r.budget) : MUTED;
        return (
          <button
            key={r.month}
            onClick={() => has && setSel(r.month)}
            disabled={!has}
            aria-pressed={active}
            style={{ all: "unset", boxSizing: "border-box", width: "100%", display: "flex", alignItems: "center", padding: "10px 8px", borderTop: `1px solid ${LINE}`, cursor: has ? "pointer" : "default", background: active ? "#F0F7EE" : "transparent", opacity: has ? 1 : 0.5, fontSize: 15.5, borderRadius: active ? 8 : 0 }}
          >
            <span style={{ flex: 1, fontWeight: active ? 700 : 500, textTransform: "capitalize" }}>{MONTHS[r.month - 1]}</span>
            <span style={col("74px")}>{has ? compactKr(r.actual ?? 0) : "–"}</span>
            <span style={{ ...col("74px"), color: MUTED }}>{compactKr(r.budget)}</span>
            <span style={{ ...col("70px"), color: c, fontWeight: 700 }}>{has ? diffText(kind === "ut" ? (r.actual ?? 0) - r.budget : (r.actual ?? 0) - r.budget) : ""}</span>
          </button>
        );
      })}
      <div style={{ display: "flex", padding: "11px 8px 4px", borderTop: `2px solid ${INK}`, fontWeight: 700, fontSize: 15.5 }}>
        <span style={{ flex: 1 }}>Hittills</span>
        <span style={col("74px")}>{compactKr(sumA)}</span>
        <span style={col("74px")}>{compactKr(sumB)}</span>
        <span style={{ ...col("70px"), color: diffColor(kind, sumA, sumB) }}>{diffText(sumA - sumB)}</span>
      </div>
      <p style={{ margin: "8px 0 0", color: MUTED, fontSize: 13.5, lineHeight: 1.5 }}>
        {kind === "ut" ? "Plus (+) betyder att vi spenderat mer än budgeterat den månaden." : "Minus (−) betyder att vi fått in mindre än budgeterat den månaden."}
      </p>
    </div>
  );
}

/** Vad den valda månaden består av, per grupp, med de största avvikelserna överst. */
function MonthDetail({ ov, kind }: { ov: BudgetOverview; kind: "in" | "ut" }) {
  const groups = ov.groups
    .filter((g) => g.kind === kind && (g.actual > 0.5 || g.budgetYtd > 0.5))
    .sort((a, b) => Math.abs(b.actual - b.budgetYtd) - Math.abs(a.actual - a.budgetYtd));
  const month = MONTHS[ov.upTo - 1];
  return (
    <div style={{ ...card, padding: "16px 18px" }}>
      <div style={{ fontWeight: 600, fontSize: 20, textTransform: "none" }}>
        Så blev {month} <span style={{ color: MUTED, fontWeight: 400, fontSize: 16 }}>({kind === "ut" ? "kostnader" : "intäkter"})</span>
      </div>
      {groups.length === 0 && <p style={{ color: MUTED, margin: "8px 0 0" }}>Inga poster den här månaden.</p>}
      {groups.map((g) => {
        const d = g.actual - g.budgetYtd;
        const c = diffColor(kind, g.actual, g.budgetYtd);
        return (
          <div key={g.key} style={{ padding: "11px 0", borderTop: `1px solid ${LINE}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
              <span style={{ fontWeight: 600, fontSize: 16 }}>{g.label}</span>
              <span style={{ color: c, fontWeight: 700, whiteSpace: "nowrap" }}>{diffText(d)}</span>
            </div>
            <div style={{ color: MUTED, fontSize: 14.5 }}>
              {fmtKr(g.actual)} <span style={{ opacity: 0.8 }}>· budget {g.budgetYtd > 0 ? fmtKr(g.budgetYtd) : "saknas"}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AdminImport({ propertyId, year, open }: { propertyId: string; year: number; open?: boolean }) {
  return (
    <details open={open} style={{ marginTop: 6 }}>
      <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 16, color: MUTED }}>Admin: läs in utfall och budget</summary>
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontWeight: 600, fontSize: 16 }}>Utfall (vad som har förbrukats)</div>
        <EkonomiUtfallImport propertyId={propertyId} defaultYear={year} />
        <div style={{ fontWeight: 600, fontSize: 16 }}>Budget</div>
        <EkonomiBudgetImport propertyId={propertyId} defaultYear={year} />
      </div>
    </details>
  );
}

export function EkonomiBudgetView({ propertyId }: { propertyId: string }) {
  const fin = useFinanceData(propertyId);
  const bud = useBudgetRows(propertyId);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [kind, setKind] = useState<"in" | "ut">("ut");
  const [compare, setCompare] = useState(false);
  const [selMonth, setSelMonth] = useState<number | null>(null);
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

  const sel = ov ? Math.min(selMonth ?? ov.upTo, ov.upTo) : 1;
  const monthOv = useMemo(
    () => (data && bud.data && period ? computeBudget(data.rows, bud.data.rows, data.names, period.year, sel, sel) : null),
    [data, bud.data, period, sel],
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
  const costGroups = ov.groups.filter((g) => g.kind === "ut" && (g.actual > 0.5 || g.budgetYear > 0.5 || g.budgetYtd > 0.5));
  const inGroups = ov.groups.filter((g) => g.kind === "in" && (g.actual > 0.5 || g.budgetYear > 0.5 || g.budgetYtd > 0.5));
  // Helårsprognos: utfallet hittills plus budgeten för resterande månader. Avvikelsen hittills antas alltså bestå, inget mer.
  const prognosUt = ov.utActual + (ov.utBudgetYear - ov.utBudgetYtd);
  const monthsLeft = 12 - ov.upTo;
  // Poster att hålla koll på: kostnadskonton som ligger över budget hittills, störst avvikelse först.
  const watch = costGroups
    .flatMap((g) => g.accounts.map((a) => ({ ...a, group: g.label })))
    .map((a) => ({ ...a, over: a.actual - a.budgetYtd, spent: a.budgetYear > 0 ? a.actual / a.budgetYear : a.actual > 0 ? Infinity : 0 }))
    .filter((a) => statusOf("ut", a.actual, a.budgetYtd) !== "ok")
    .sort((x, y) => y.over - x.over)
    .slice(0, 5);
  const showPrev = ov.hasPrev && compare;
  const pill = (on: boolean, label: string, onClick: () => void) => (
    <button
      key={label}
      onClick={onClick}
      style={{ all: "unset", cursor: "pointer", padding: "7px 16px", borderRadius: 999, fontSize: 15, fontWeight: 600, border: `1px solid ${on ? GREEN : LINE}`, background: on ? "#F0F7EE" : "#fff", color: on ? GREEN : MUTED }}
    >
      {label}
    </button>
  );
  const toggle = (k: string) => setOpenKey((cur) => (cur === k ? null : k));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8 }}>
          {pill(kind === "ut", "Kostnader", () => setKind("ut"))}
          {pill(kind === "in", "Intäkter", () => setKind("in"))}
        </div>
        {ov.hasPrev && (
          <div style={{ display: "flex", gap: 8 }}>
            {pill(!compare, `Bara ${ov.year}`, () => setCompare(false))}
            {pill(compare, `Jämför med ${ov.year - 1}`, () => setCompare(true))}
          </div>
        )}
      </div>

      <div style={{ ...card, padding: "16px 18px" }}>
        <div style={{ fontWeight: 600, fontSize: 20, marginBottom: 8 }}>Budget mot utfall, månad för månad</div>
        <MonthBars
          label="Budget och utfall per månad"
          series={[
            { name: "Budget", color: DARK, values: ov.months.map((m) => (kind === "ut" ? m.utBudget : m.inBudget)) },
            { name: String(ov.year), color: BRIGHT, values: ov.months.map((m) => (kind === "ut" ? m.utActual : m.inActual)) },
          ]}
        />
      </div>

      {showPrev && (
        <div style={{ ...card, padding: "16px 18px" }}>
          <div style={{ fontWeight: 600, fontSize: 20, marginBottom: 8 }}>Förra året mot i år, månad för månad</div>
          <MonthBars
            label="Förra året och i år per månad"
            series={[
              { name: String(ov.year - 1), color: DARK, values: ov.months.map((m) => (kind === "ut" ? m.utPrev : m.inPrev)) },
              { name: String(ov.year), color: BRIGHT, values: ov.months.map((m) => (kind === "ut" ? m.utActual : m.inActual)) },
            ]}
          />
        </div>
      )}

      <Verdict ov={ov} prognosUt={prognosUt} monthsLeft={monthsLeft} />

      <MonthTable ov={ov} kind={kind} sel={sel} setSel={setSelMonth} />

      {monthOv && <MonthDetail ov={monthOv} kind={kind} />}

      {watch.length > 0 && (
        <div style={{ ...card, padding: "16px 18px" }}>
          <div style={{ fontWeight: 600, fontSize: 18 }}>Håll koll på</div>
          <p style={{ margin: "4px 0 10px", color: MUTED, fontSize: 14.5 }}>Poster som ligger över budget hittills, störst avvikelse först.</p>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {watch.map((a) => {
              const st = statusOf("ut", a.actual, a.budgetYtd);
              const done = a.budgetYear <= 0 ? "Ingen budget för posten" : a.actual > a.budgetYear ? "Hela årsbudgeten är redan överskriden" : `${Math.round(a.spent * 100)} % av årsbudgeten är använd`;
              return (
                <div key={a.account} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderTop: `1px solid ${LINE}` }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 16 }}>
                      {a.account} {a.name}
                    </div>
                    <div style={{ color: MUTED, fontSize: 14 }}>{done}</div>
                  </div>
                  <div style={{ textAlign: "right", whiteSpace: "nowrap", color: STATUS[st].color, fontWeight: 600 }}>{fmtStort(a.over)} över</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h2 style={{ fontFamily: "Outfit, Inter, sans-serif", fontSize: 24, margin: "0 0 4px" }}>Hela året hittills, per post</h2>
        <p style={{ color: MUTED, margin: "0 0 12px", fontSize: 15, lineHeight: 1.5 }}>
          Fylld stapel är vad som spenderats. Det svarta strecket är var vi borde vara hittills enligt budget. Hela stapeln är årsbudgeten. Tryck på en post för
          att se kontona.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {costGroups.map((g) => (
            <GroupRow key={g.key} g={g} open={openKey === g.key} toggle={() => toggle(g.key)} showPrev={showPrev} prevYear={ov.year - 1} />
          ))}
        </div>
      </div>

      {inGroups.length > 0 && (
        <div>
          <h2 style={{ fontFamily: "Outfit, Inter, sans-serif", fontSize: 24, margin: "0 0 12px" }}>Intäkter</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {inGroups.map((g) => (
              <GroupRow key={g.key} g={g} open={openKey === g.key} toggle={() => toggle(g.key)} showPrev={showPrev} prevYear={ov.year - 1} />
            ))}
          </div>
        </div>
      )}

      {showPrev && <HistoryTable rows={yearSummaries(data.rows, bud.data?.rows ?? [], ov.year)} kind={kind} />}

      <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.6, margin: 0 }}>
        Källa: föreningens bokföring och budget. Siffrorna gäller {periodLabel(ov.upTo)} {ov.year}.{updated ? ` Uppdaterad ${updated}.` : ""} Avvikelser under 1 000 kr
        räknas som enligt budget. Det här är en förenklad uppföljning och ersätter inte årsredovisningen.
      </p>
      {isAdmin && <AdminImport propertyId={propertyId} year={ov.year} />}
    </div>
  );
}
