import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { kr, occurrences, type Action, type Plan } from "@/lib/maintenance";

const INK = "#0D2B1E";
const GREEN = "#3D8A30";
const MUTED = "#6B7280";
const LINE = "#E3E7E2";
const RED = "#8B1A2B";
const HOT = "#C2334D";
const BEIGE = "#F2E3BC";

type Loan = { date: string; amount: number; rate: number };
type Payment = { date: string; amount: number; label: string };
type Item = { label: string; amount: number; from: string; to: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Finance = Record<string, any>;
type PlanX = Plan & { recommended_savings?: number | string | null };

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const mkr = (v: number) => `${(v / 1e6).toFixed(1).replace(".", ",")} mkr`;
const mkr2 = (v: number) => `${(v / 1e6).toFixed(2).replace(".", ",")} mkr`;
const pc = (v: number, d = 1) => `${v.toFixed(d).replace(".", ",")} %`;

const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
const ymLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;
const isYm = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

function parseLoans(text: string): Loan[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [d, a, r] = l.split(";").map((s) => s.trim());
      return { date: d ?? "", amount: num((a ?? "").replace(/\s/g, "")), rate: num((r ?? "").replace(",", ".")) };
    })
    .filter((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.date) && l.amount > 0);
}
const loansToText = (loans: Loan[]) =>
  loans.map((l) => `${l.date}; ${l.amount}; ${String(l.rate).replace(".", ",")}`).join("\n");

function parsePayments(text: string): Payment[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [d, a, ...rest] = l.split(";").map((s) => s.trim());
      return { date: d ?? "", amount: num((a ?? "").replace(/\s/g, "")), label: rest.join("; ") };
    })
    .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && p.amount > 0);
}
const paymentsToText = (p: Payment[]) => p.map((x) => `${x.date}; ${x.amount}; ${x.label}`).join("\n");

const card: React.CSSProperties = { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: "16px 18px" };
const h3: React.CSSProperties = { fontFamily: "Outfit, Inter, system-ui, sans-serif", fontSize: 20, fontWeight: 700, margin: "0 0 12px", color: INK };
const lab: React.CSSProperties = { fontSize: 11.5, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED };
const inp: React.CSSProperties = { height: 38, padding: "0 10px", borderRadius: 8, border: `1px solid ${LINE}`, font: "inherit", fontSize: 14, width: "100%", boxSizing: "border-box" };

function Stat({ label, value, sub, bad }: { label: string; value: string; sub?: string; bad?: boolean }) {
  return (
    <div style={{ ...card, background: bad ? "#FEF3F3" : "#fff", borderColor: bad ? "#F1C0C0" : LINE }}>
      <div style={lab}>{label}</div>
      <div style={{ fontFamily: "Outfit, Inter, system-ui, sans-serif", fontSize: 28, fontWeight: 700, marginTop: 4, color: bad ? "#B91C1C" : INK }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

type LiqRow = { ym: string; bal: number; pay: number; payLabels: string[]; inc: number; loan: number; items: number; interest: number };

export function EkonomiAvgift({ propertyId, propertyName }: { propertyId: string; propertyName?: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  // Likviditetsscenario (sparas inte)
  const [incPct, setIncPct] = useState("0");
  const [incFrom, setIncFrom] = useState("2027-01");
  const [loanAmt, setLoanAmt] = useState("0");
  const [loanMonth, setLoanMonth] = useState("2027-01");
  const [ratePp, setRatePp] = useState("0");
  const [solveMsg, setSolveMsg] = useState<string | null>(null);

  const finQ = useQuery({
    queryKey: ["pfin", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("property_finance").select("*").eq("property_id", propertyId).maybeSingle();
      if (error) throw error;
      return (data as Finance | null) ?? null;
    },
  });
  const planQ = useQuery({
    queryKey: ["pfin-plan", propertyId],
    queryFn: async () => {
      const { data } = await supabase.from("maintenance_plans").select("*").eq("property_id", propertyId).maybeSingle();
      return (data as PlanX | null) ?? null;
    },
  });
  const plan = planQ.data ?? null;
  const actionsQ = useQuery({
    queryKey: ["pfin-actions", plan?.id],
    enabled: !!plan,
    queryFn: async () => {
      const { data } = await supabase.from("maintenance_actions").select("*").eq("plan_id", plan!.id);
      return (data ?? []) as Action[];
    },
  });

  const fin = finQ.data;
  const loans: Loan[] = useMemo(
    () => (Array.isArray(fin?.loans) ? (fin!.loans as Loan[]).map((l) => ({ date: String(l.date), amount: num(l.amount), rate: num(l.rate) })) : []),
    [fin],
  );
  const payments: Payment[] = useMemo(
    () => (Array.isArray(fin?.known_payments) ? (fin!.known_payments as Payment[]).map((p) => ({ date: String(p.date), amount: num(p.amount), label: String(p.label ?? "") })) : []),
    [fin],
  );
  const items: Item[] = useMemo(
    () =>
      Array.isArray(fin?.monthly_items)
        ? (fin!.monthly_items as Item[]).map((i) => ({ label: String(i.label ?? ""), amount: num(i.amount), from: String(i.from ?? ""), to: String(i.to ?? "") }))
        : [],
    [fin],
  );

  // Dyraste investeringsår i underhållsplanen.
  const peak = useMemo(() => {
    if (!plan || !actionsQ.data) return null;
    const occ = occurrences(actionsQ.data, plan, true);
    const by = new Map<number, number>();
    for (const o of occ) if (o.action.kind === "investering") by.set(o.year, (by.get(o.year) ?? 0) + o.cost);
    let year = 0;
    let cost = 0;
    for (const [y, c] of by) if (c > cost) { year = y; cost = c; }
    return year ? { year, cost } : null;
  }, [plan, actionsQ.data]);

  if (finQ.isLoading || planQ.isLoading) return <div style={{ color: MUTED }}>Hämtar…</div>;

  if (!fin || editing) {
    return (
      <FinanceForm
        propertyId={propertyId}
        initial={fin}
        onDone={() => {
          setEditing(false);
          void qc.invalidateQueries({ queryKey: ["pfin", propertyId] });
        }}
        onCancel={fin ? () => setEditing(false) : undefined}
        propertyName={propertyName}
      />
    );
  }

  // ----- Beräkningar -----
  const fees = num(fin.annual_fees);
  const resArea = num(fin.residential_area);
  const totArea = num(fin.total_area);
  const apts = num(fin.apartments);
  const recommended = plan ? num(plan.recommended_savings) : 0;
  const current = plan ? num(plan.current_annual_savings) : 0;
  const gap = Math.max(0, recommended - current);
  const haveGap = recommended > 0 && fees > 0;
  const pct = haveGap ? (gap / fees) * 100 : 0;
  const debt = loans.reduce((s, l) => s + l.amount, 0);
  const wRate = debt > 0 ? loans.reduce((s, l) => s + l.amount * l.rate, 0) / debt : num(fin.avg_interest_pct);
  const onePp = debt * 0.01;
  const onePpPct = fees > 0 ? (onePp / fees) * 100 : 0;
  const now = new Date();
  const dayMs = 86400000;
  const daysTo = (d: string) => Math.round((new Date(`${d}T00:00:00`).getTime() - now.getTime()) / dayMs);
  const due12 = loans.filter((l) => daysTo(l.date) <= 365).reduce((s, l) => s + l.amount, 0);
  const due90 = loans.filter((l) => daysTo(l.date) <= 90);
  const perLghMonth = (kronor: number) => (apts > 0 ? kronor / apts / 12 : 0);
  const avgFeeLghMonth = perLghMonth(fees);

  const scenarios = [
    { n: 1, title: "Hela höjningen direkt", sub: "Full täckning från start" },
    { n: 3, title: "Fördelat på tre år", sub: "Tre lika stora steg" },
    { n: 5, title: "Fördelat på fem år", sub: "Fem lika stora steg" },
  ];

  const yearsToPeak = plan && peak ? Math.max(0, peak.year - plan.start_year) : 0;
  const missingToPeak = gap * yearsToPeak;
  const fundedAtPeak = plan ? num(plan.fund_balance) + current * yearsToPeak : 0;

  const nextLoans = [...loans].sort((a, b) => a.date.localeCompare(b.date));

  // ----- Likviditet -----
  const haveCash = fin.cash_balance != null && !!fin.cash_date;
  const cash0 = num(fin.cash_balance);
  const monthly = num(fin.monthly_net_cashflow);
  const buffer = num(fin.min_cash_buffer);
  const startYm = haveCash ? String(fin.cash_date).slice(0, 7) : "";
  const savedRatePp = num(fin.rate_change_pp);
  const savedRateFrom = isYm(String(fin.rate_change_from ?? "")) ? String(fin.rate_change_from) : "2027-01";
  const incP = num(incPct.replace(",", "."));
  const loanA = num(loanAmt.replace(/\s/g, ""));
  const tryPp = num(ratePp.replace(",", "."));

  /** Extra räntekostnad per månad: lånen prissätts om vid sin villkorsändring (eller vald startmånad om den är senare). */
  const extraInterest = (ym: string, pp: number, fromYm: string) =>
    pp === 0
      ? 0
      : loans.reduce((s, l) => {
          const lm = l.date.slice(0, 7);
          const start = lm > fromYm ? lm : fromYm;
          return ym >= start ? s + (l.amount * pp) / 100 / 12 : s;
        }, 0);

  const simulate = (inc: number, from: string, loanAmount: number, loanYm: string, tryRate: number): LiqRow[] => {
    if (!haveCash) return [];
    let bal = cash0;
    const out: LiqRow[] = [];
    for (let i = 1; i <= 12; i++) {
      const ym = addMonths(startYm, i);
      const pays = payments.filter((p) => p.date.slice(0, 7) === ym);
      const pay = pays.reduce((s, p) => s + p.amount, 0);
      const add = inc > 0 && ym >= from ? (fees * inc) / 100 / 12 : 0;
      const loan = loanAmount > 0 && ym === loanYm ? loanAmount : 0;
      const itm = items.reduce((s, it) => (isYm(it.from) && ym >= it.from && (!isYm(it.to) || ym <= it.to) ? s + it.amount : s), 0);
      const interest = extraInterest(ym, savedRatePp, savedRateFrom) + extraInterest(ym, tryRate, from);
      bal += monthly + itm - interest + add - pay + loan;
      out.push({ ym, bal, pay, payLabels: pays.map((p) => p.label), inc: add, loan, items: itm, interest });
    }
    return out;
  };
  const minBal = (rows: LiqRow[]) => rows.reduce((m, r) => Math.min(m, r.bal), Infinity);

  // Scenariot (det användaren provar) och basfallet (sparade budgetposter och räntaantagande, inget mer).
  const liq = simulate(incP, incFrom, loanA, loanMonth, tryPp);
  const base = simulate(0, incFrom, 0, loanMonth, 0);
  const lowest = liq.reduce<LiqRow | null>((m, r) => (m == null || r.bal < m.bal ? r : m), null);
  const baseLowest = base.reduce<LiqRow | null>((m, r) => (m == null || r.bal < m.bal ? r : m), null);
  const underBuffer = liq.filter((r) => r.bal < buffer);
  const negative = liq.filter((r) => r.bal < 0);
  const liqBad = !!lowest && lowest.bal < buffer;
  const baseBad = !!baseLowest && baseLowest.bal < buffer;

  function solve() {
    if (!haveCash || fees <= 0) return;
    const ok = (p: number) => minBal(simulate(p, incFrom, loanA, loanMonth, tryPp)) >= buffer;
    if (ok(0)) {
      setIncPct("0");
      setSolveMsg("Ingen höjning behövs för att hålla kassan över bufferten med dessa val.");
      return;
    }
    for (let p = 0.1; p <= 60.0001; p += 0.1) {
      if (ok(p)) {
        const v = Math.round(p * 10) / 10;
        setIncPct(String(v).replace(".", ","));
        setSolveMsg(`Minst ${pc(v)} från ${incFrom} krävs för att kassan ska hålla sig över ${kr(buffer)}.`);
        return;
      }
    }
    setIncPct("60");
    setSolveMsg("Bara en höjning räcker inte, eftersom den börjar verka för sent. Kombinera med lån, kredit eller förhandlad amortering.");
  }

  const chart = (() => {
    if (liq.length === 0) return null;
    const W = 900, H = 230, L = 56, R = 8, T = 14, B = 30;
    const vals = [...liq.map((r) => r.bal), cash0, buffer, 0];
    const min = Math.min(...vals), max = Math.max(...vals);
    const y = (v: number) => T + (H - T - B) * (1 - (v - min) / (max - min || 1));
    const bw = (W - L - R) / liq.length;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="#9CA3AF" />
        <text x={L - 6} y={y(0) + 4} fontSize="11" textAnchor="end" fill="#6B7280">0</text>
        {buffer > 0 && (
          <>
            <line x1={L} x2={W - R} y1={y(buffer)} y2={y(buffer)} stroke={HOT} strokeDasharray="5 4" />
            <text x={L + 4} y={y(buffer) - 5} fontSize="11" textAnchor="start" fill={HOT} fontWeight="700">Buffert {mkr(buffer)}</text>
          </>
        )}
        <text x={L - 6} y={y(max) + 4} fontSize="11" textAnchor="end" fill="#6B7280">{mkr(max)}</text>
        {liq.map((r, i) => {
          const x = L + i * bw + bw * 0.18;
          const w = bw * 0.64;
          const top = Math.min(y(r.bal), y(0));
          const h = Math.abs(y(r.bal) - y(0));
          const color = r.bal < 0 ? HOT : r.bal < buffer ? "#F2711C" : GREEN;
          return (
            <g key={r.ym}>
              <title>{`${ymLabel(r.ym)}: ${kr(r.bal)}`}</title>
              <rect x={x} y={top} width={w} height={Math.max(1, h)} fill={color} rx="2" />
              <text x={x + w / 2} y={r.bal >= 0 ? top - 4 : top + h + 12} fontSize="10.5" textAnchor="middle" fill={color} fontWeight="700">{mkr(r.bal)}</text>
              <text x={x + w / 2} y={H - 10} fontSize="11" textAnchor="middle" fill="#6B7280">{ymLabel(r.ym)}</text>
            </g>
          );
        })}
      </svg>
    );
  })();

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {/* Hjälte */}
      <div style={{ background: "radial-gradient(ellipse at 20% 0%, #21503f 0%, #0f2a21 55%, #0b1d17 100%)", borderRadius: 18, padding: "24px 26px", color: "#e6efd8" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#7fe08a" }}>{propertyName ?? "Fastigheten"} · Ekonomi & Avgift</div>
        {haveGap ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap", margin: "8px 0 6px" }}>
              <span style={{ fontFamily: "Outfit, Inter, system-ui, sans-serif", fontSize: 64, fontWeight: 800, lineHeight: 1, color: gap > 0 ? BEIGE : "#fff" }}>{pc(pct)}</span>
              <span style={{ fontSize: 18, color: "#fff", fontWeight: 600 }}>
                {gap > 0 ? "avgiftshöjning behövs för att täcka underhållsplanen" : "Avsättningen täcker underhållsplanens behov"}
              </span>
            </div>
            <div style={{ fontSize: 14.5, lineHeight: 1.7, color: "#c9d8c3" }}>
              Uträkning: Nabo rekommenderar <strong style={{ color: "#fff" }}>{kr(recommended)}</strong> per år, föreningen sätter av{" "}
              <strong style={{ color: "#fff" }}>{kr(current)}</strong>. Gapet är <strong style={{ color: "#fff" }}>{kr(gap)}</strong> per år, delat med årsavgifterna{" "}
              <strong style={{ color: "#fff" }}>{kr(fees)}</strong> blir <strong style={{ color: "#fff" }}>{pc(pct)}</strong>.
            </div>
            {gap > 0 && resArea > 0 && (
              <div style={{ marginTop: 10, fontSize: 14, color: "#c9d8c3" }}>
                Det motsvarar ca {Math.round(gap / resArea)} kr per kvm och år, och ca {Math.round(perLghMonth(gap)).toLocaleString("sv-SE")} kr per månad för en genomsnittlig lägenhet
                (nuvarande snittavgift ca {Math.round(avgFeeLghMonth).toLocaleString("sv-SE")} kr per månad).
              </div>
            )}
            {haveCash && baseLowest && (
              <div style={{ marginTop: 14, background: baseBad ? "rgba(122,20,38,0.5)" : "rgba(92,184,74,0.18)", border: `1px solid ${baseBad ? HOT : GREEN}`, borderRadius: 10, padding: "10px 14px", fontSize: 14.5, color: baseBad ? BEIGE : "#d6efcf" }}>
                <strong>Likviditet utan åtgärder:</strong> kassan når som lägst {mkr2(baseLowest.bal)} i {ymLabel(baseLowest.ym)}.{" "}
                {baseBad
                  ? "En avgiftshöjning löser underhållsbehovet på sikt men räcker inte i tid för att fylla kassan på våren."
                  : "Kassan håller sig över bufferten."}
              </div>
            )}
          </>
        ) : (
          <div style={{ marginTop: 10, fontSize: 15, lineHeight: 1.6 }}>
            Uträkningen saknar underlag. Ange <strong>rekommenderad avsättning</strong> under Underhållsplan, Inställningar, och kontrollera att{" "}
            <strong>årsavgifterna</strong> är ifyllda här.
          </div>
        )}
      </div>

      {/* Likviditet */}
      {haveCash && (
        <div style={{ ...card, borderColor: liqBad ? "#F1C0C0" : LINE, background: liqBad ? "#FEF8F8" : "#fff" }}>
          <h3 style={{ ...h3, color: liqBad ? RED : INK }}>Likviditet de närmaste 12 månaderna</h3>
          <div style={{ fontSize: 14, color: MUTED, marginBottom: 12, lineHeight: 1.6 }}>
            Utgår från kassan {kr(cash0)} den {String(fin.cash_date)}, ett löpande nettoflöde på {kr(monthly)} per månad, {items.length} budgetposter{savedRatePp !== 0 ? `, ränteantagande ${savedRatePp > 0 ? "+" : ""}${String(savedRatePp).replace(".", ",")} procentenheter` : ""} och kända utbetalningar.
            Bufferten {kr(buffer)} motsvarar ungefär en månads utgifter.
            {(incP > 0 || loanA > 0 || tryPp !== 0) && <strong> Diagrammet visar scenariot du provar nedan.</strong>}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 14 }}>
            <Stat label="Lägsta kassa" value={lowest ? mkr2(lowest.bal) : "—"} sub={lowest ? ymLabel(lowest.ym) : undefined} bad={liqBad} />
            <Stat label="Månader under bufferten" value={`${underBuffer.length} av 12`} bad={underBuffer.length > 0} />
            <Stat label="Månader med negativ kassa" value={`${negative.length}`} bad={negative.length > 0} />
          </div>

          <div style={{ marginBottom: 12 }}>{chart}</div>

          <div style={{ background: "#F7F9F6", border: `1px solid ${LINE}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Prova åtgärder</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
              <label><span style={lab}>Avgiftshöjning (%)</span><input style={inp} value={incPct} onChange={(e) => { setIncPct(e.target.value); setSolveMsg(null); }} inputMode="decimal" /></label>
              <label><span style={lab}>Gäller från (ÅÅÅÅ-MM)</span><input style={inp} value={incFrom} onChange={(e) => { setIncFrom(e.target.value); setSolveMsg(null); }} /></label>
              <label><span style={lab}>Lån eller kredit (kr)</span><input style={inp} value={loanAmt} onChange={(e) => { setLoanAmt(e.target.value); setSolveMsg(null); }} inputMode="numeric" /></label>
              <label><span style={lab}>Utbetalas (ÅÅÅÅ-MM)</span><input style={inp} value={loanMonth} onChange={(e) => { setLoanMonth(e.target.value); setSolveMsg(null); }} /></label>
              <label><span style={lab}>Extra ränteökning (procentenheter)</span><input style={inp} value={ratePp} onChange={(e) => { setRatePp(e.target.value); setSolveMsg(null); }} inputMode="decimal" /></label>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
              <button type="button" className="fp-btn fp-primary" onClick={solve}>
                Räkna fram höjning
              </button>
              <button
                type="button"
                className="fp-btn"
                onClick={() => {
                  setIncPct("0");
                  setLoanAmt("0");
                  setRatePp("0");
                  setSolveMsg(null);
                }}
              >
                Nollställ
              </button>
              <span style={{ fontSize: 13, color: MUTED }}>Hittar lägsta höjningen från vald månad som håller kassan över bufferten, med lån och ränta ovan inräknade.</span>
            </div>
            {solveMsg && (
              <div style={{ marginTop: 10, padding: "9px 12px", borderRadius: 8, background: "#fff", border: `1px solid ${LINE}`, fontSize: 14, fontWeight: 600, color: INK }}>
                {solveMsg}
              </div>
            )}
            {incP > 0 && (
              <div style={{ fontSize: 13, color: MUTED, marginTop: 8 }}>
                {pc(incP)} höjning ger ca {kr((fees * incP) / 100 / 12)} mer per månad från {incFrom}.
              </div>
            )}
            {tryPp !== 0 && debt > 0 && (
              <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
                {String(tryPp).replace(".", ",")} procentenheter på {mkr(debt)} lån är ca {kr((debt * tryPp) / 100 / 12)} per månad när alla lån prissatts om.
              </div>
            )}
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr>
                  {["Månad", "Utbetalningar", "Budgetposter / ränta", "Tillskott", "Kassa vid månadens slut"].map((h) => (
                    <th key={h} style={{ ...lab, textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${LINE}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {liq.map((r) => {
                  const bad = r.bal < buffer;
                  const adj = r.items - r.interest;
                  return (
                    <tr key={r.ym} style={{ background: r.bal < 0 ? "#FDE2E7" : bad ? "#FFF4E5" : undefined }}>
                      <td style={{ padding: "8px", borderBottom: `1px solid ${LINE}`, fontWeight: 600 }}>{ymLabel(r.ym)}</td>
                      <td style={{ padding: "8px", borderBottom: `1px solid ${LINE}` }}>
                        {r.pay > 0 ? `${kr(r.pay)} (${r.payLabels.join(", ")})` : "—"}
                      </td>
                      <td style={{ padding: "8px", borderBottom: `1px solid ${LINE}` }}>{Math.round(adj) !== 0 ? kr(adj) : "—"}</td>
                      <td style={{ padding: "8px", borderBottom: `1px solid ${LINE}` }}>
                        {r.inc + r.loan > 0 ? kr(r.inc + r.loan) : "—"}
                      </td>
                      <td style={{ padding: "8px", borderBottom: `1px solid ${LINE}`, fontWeight: 700, color: r.bal < 0 ? "#B91C1C" : bad ? "#B45309" : INK }}>{kr(r.bal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 8 }}>
            Förenklad prognos: ett jämnt månadsflöde, budgetposter och kända betalningar. Verklig kassa varierar med säsong, räntebetalningar och oväntade kostnader.
          </div>
        </div>
      )}

      {/* Budget och antaganden */}
      {haveCash && (
        <AssumptionsEditor
          key={JSON.stringify([items, savedRatePp, savedRateFrom])}
          propertyId={propertyId}
          items={items}
          ratePp={savedRatePp}
          rateFrom={savedRateFrom}
          onSaved={() => void qc.invalidateQueries({ queryKey: ["pfin", propertyId] })}
        />
      )}

      {/* Scenarier */}
      {haveGap && gap > 0 && (
        <div>
          <h3 style={h3}>Så kan höjningen fördelas</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
            {scenarios.map((s) => {
              const step = gap / s.n;
              const missing = (gap * (s.n - 1)) / 2;
              return (
                <div key={s.n} style={card}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{s.title}</div>
                  <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 10 }}>{s.sub}</div>
                  <div style={{ fontFamily: "Outfit, Inter, system-ui, sans-serif", fontSize: 34, fontWeight: 800, color: INK }}>
                    {pc(pct / s.n)}
                    <span style={{ fontSize: 14, fontWeight: 600, color: MUTED }}> {s.n === 1 ? "en gång" : "per år"}</span>
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.7, marginTop: 6 }}>
                    {kr(step)} mer per år i varje steg
                    <br />
                    ca {Math.round(perLghMonth(step)).toLocaleString("sv-SE")} kr per lägenhet och månad
                    {s.n > 1 && <> i varje steg, totalt {Math.round(perLghMonth(gap)).toLocaleString("sv-SE")} kr</>}
                    <br />
                    {s.n === 1 ? (
                      <span style={{ color: GREEN, fontWeight: 600 }}>Ingen avsättning uteblir</span>
                    ) : (
                      <span style={{ color: HOT, fontWeight: 600 }}>{mkr(missing)} i avsättning uteblir under omställningen</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Vänta */}
      {haveGap && gap > 0 && plan && peak && (
        <div style={{ ...card, borderColor: "#F1C0C0", background: "#FEF3F3" }}>
          <h3 style={{ ...h3, color: RED }}>Vad det kostar att vänta</h3>
          <div style={{ fontSize: 15, lineHeight: 1.7 }}>
            Varje år utan höjning växer det obetäckta behovet med <strong>{kr(gap)}</strong>. Fram till {peak.year}, då underhållsplanens största investering faller ({mkr(peak.cost)}), har{" "}
            <strong>{mkr(missingToPeak)}</strong> för lite avsatts jämfört med Nabos rekommendation. Med nuvarande avsättning finns då ca <strong>{mkr(fundedAtPeak)}</strong> (saldo plus avsättning, förenklat och före övriga åtgärder).
            Skillnaden måste lånefinansieras eller täckas med högre avgift.
          </div>
        </div>
      )}

      {/* Bankens nyckeltal */}
      <div>
        <h3 style={h3}>Nyckeltal som banken tittar på</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
          <Stat label="Räntebärande skuld" value={mkr(debt)} sub={totArea > 0 ? `${Math.round(debt / totArea).toLocaleString("sv-SE")} kr per kvm totalyta` : undefined} />
          <Stat label="Snittränta på lånen" value={pc(wRate, 2)} sub="Viktad efter lånebelopp" />
          <Stat
            label="Räntekänslighet"
            value={`${kr(onePp)} / år`}
            sub={`1 procentenhet högre ränta motsvarar ${pc(onePpPct)} av årsavgifterna`}
            bad={onePpPct > 5}
          />
          <Stat label="Lån med villkorsändring inom 12 månader" value={mkr(due12)} sub={debt > 0 ? `${Math.round((due12 / debt) * 100)} % av skulden` : undefined} bad={debt > 0 && due12 / debt > 0.5} />
          {fin.equity_ratio_pct != null && <Stat label="Soliditet" value={`${num(fin.equity_ratio_pct)} %`} />}
          <Stat label="Likvida medel" value={mkr(haveCash ? cash0 : num(fin.liquid_funds))} sub={haveCash ? `Per ${String(fin.cash_date)}` : "Per bokslut"} />
          <Stat
            label="Amortering per år"
            value={kr(num(fin.annual_amortization))}
            sub={num(fin.operating_cashflow) > 0 ? `Kassaflöde från löpande verksamhet: ${kr(num(fin.operating_cashflow))}` : undefined}
            bad={num(fin.operating_cashflow) > 0 && num(fin.annual_amortization) > num(fin.operating_cashflow)}
          />
          <Stat label="Årets resultat" value={kr(num(fin.net_result))} bad={num(fin.net_result) < 0} />
        </div>
      </div>

      {/* Lån */}
      {nextLoans.length > 0 && (
        <div style={card}>
          <h3 style={h3}>Lån och villkorsändringsdagar</h3>
          {due90.length > 0 && (
            <div style={{ background: "#FEF3F3", border: "1px solid #F1C0C0", borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: 14, color: RED, fontWeight: 600 }}>
              {due90.length} lån ({mkr(due90.reduce((s, l) => s + l.amount, 0))}) har villkorsändring inom 90 dagar. Ränta och bindningstid behöver förhandlas.
            </div>
          )}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr>
                  {["Villkorsändring", "Om", "Belopp", "Ränta"].map((h) => (
                    <th key={h} style={{ ...lab, textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${LINE}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {nextLoans.map((l, i) => {
                  const d = daysTo(l.date);
                  const soon = d <= 90;
                  return (
                    <tr key={i} style={{ background: soon ? "#FEF3F3" : undefined }}>
                      <td style={{ padding: "8px", borderBottom: `1px solid ${LINE}`, fontWeight: 600 }}>{l.date}</td>
                      <td style={{ padding: "8px", borderBottom: `1px solid ${LINE}`, color: soon ? RED : MUTED }}>
                        {d < 0 ? `${-d} dagar sedan` : `${d} dagar`}
                      </td>
                      <td style={{ padding: "8px", borderBottom: `1px solid ${LINE}` }}>{kr(l.amount)}</td>
                      <td style={{ padding: "8px", borderBottom: `1px solid ${LINE}` }}>{pc(l.rate, 2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 8 }}>Lånebeloppen avser senaste bokslut. Uppdatera med dagens låneöversikt innan mötet.</div>
        </div>
      )}

      {/* Styrelsen */}
      <div style={card}>
        <h3 style={h3}>Styrelsen behöver ta hänsyn till</h3>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.75 }}>
          {haveCash && baseLowest && baseBad && (
            <li>
              <strong>Likviditeten:</strong> utan åtgärder beräknas kassan som lägst vara {mkr2(baseLowest.bal)} i {ymLabel(baseLowest.ym)}, under bufferten på {mkr2(buffer)}. En avgiftshöjning hinner inte lösa det i vår. Överväg lån, checkkredit eller förhandlad amortering i samband med villkorsändringarna.
            </li>
          )}
          {haveGap && gap > 0 && (
            <li>
              Avsättningen ligger <strong>{kr(gap)} per år</strong> under Nabos rekommendation. Det motsvarar en avgiftshöjning på ca <strong>{pc(pct)}</strong> om hela gapet ska täckas med avgifter.
            </li>
          )}
          {due12 > 0 && (
            <li>
              <strong>{mkr(due12)}</strong> av skulden får nya villkor inom 12 månader. Förhandlingsläget påverkas av planens kvalitet, avsättningen och nyckeltalen ovan.
            </li>
          )}
          {onePp > 0 && (
            <li>
              Räntekänslighet: varje procentenhet högre ränta kostar <strong>{kr(onePp)} per år</strong>, motsvarande {pc(onePpPct)} av årsavgifterna.
            </li>
          )}
          {num(fin.operating_cashflow) > 0 && num(fin.annual_amortization) > num(fin.operating_cashflow) && (
            <li>Amorteringen är större än kassaflödet från den löpande verksamheten. Likviditeten behöver följas.</li>
          )}
          {num(fin.net_result) < 0 && <li>Resultatet är negativt. Se förklaringen i årsredovisningen (förlust främst av avskrivningar).</li>}
          {fin.decided_increase_pct != null && <li>Redan beslutad avgiftsjustering: {num(fin.decided_increase_pct)} %.</li>}
        </ul>
        {fin.notes && <div style={{ fontSize: 13, color: MUTED, marginTop: 10 }}>{fin.notes}</div>}
      </div>

      <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
        Underlag: {fin.source ?? "—"}. {fin.fiscal_label ?? ""} Beräkningarna är förenklade och ska bekräftas med föreningens revisor eller ekonomiska förvaltare innan beslut.
      </div>

      <div>
        <button type="button" className="fp-btn" onClick={() => setEditing(true)}>
          Redigera siffror
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Budgetposter och ränteantagande (sparas och styr hela prognosen)
// ---------------------------------------------------------------------------
type Row = { label: string; amount: string; from: string; to: string };

function AssumptionsEditor({
  propertyId, items, ratePp, rateFrom, onSaved,
}: { propertyId: string; items: Item[]; ratePp: number; rateFrom: string; onSaved: () => void }) {
  const [rows, setRows] = useState<Row[]>(() =>
    items.map((i) => ({ label: i.label, amount: String(i.amount), from: i.from, to: i.to })),
  );
  const [pp, setPp] = useState(String(ratePp).replace(".", ","));
  const [from, setFrom] = useState(rateFrom);
  const [open, setOpen] = useState(items.length > 0 || ratePp !== 0);

  useEffect(() => {
    // Nollställ vid byte av fastighet hanteras av key i föräldern.
  }, []);

  const setRow = (i: number, k: keyof Row, v: string) => setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));

  const save = useMutation({
    mutationFn: async () => {
      for (const r of rows) {
        if (r.label.trim() === "" && r.amount.trim() === "") continue;
        if (!isYm(r.from)) throw new Error(`"${r.label || "Budgetpost"}": ange startmånad som ÅÅÅÅ-MM.`);
        if (r.to.trim() !== "" && !isYm(r.to)) throw new Error(`"${r.label || "Budgetpost"}": slutmånad ska vara ÅÅÅÅ-MM eller tom.`);
      }
      const clean = rows
        .filter((r) => r.label.trim() !== "" || r.amount.trim() !== "")
        .map((r) => ({
          label: r.label.trim() || "Budgetpost",
          amount: num(r.amount.replace(/\s/g, "").replace(",", ".")),
          from: r.from.trim(),
          to: r.to.trim(),
        }));
      const ppN = num(pp.replace(",", "."));
      if (ppN !== 0 && !isYm(from)) throw new Error("Ange månad för ränteökningen som ÅÅÅÅ-MM.");
      const { error } = await supabase
        .from("property_finance")
        .update({
          monthly_items: clean,
          rate_change_pp: ppN,
          rate_change_from: isYm(from) ? from : null,
          updated_at: new Date().toISOString(),
        })
        .eq("property_id", propertyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Budget och antaganden sparade", { style: { background: "#3D8A30", color: "#fff" } });
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message ?? "Kunde inte spara"),
  });

  return (
    <div style={card}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ all: "unset", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}
      >
        <span style={{ ...h3, margin: 0 }}>Budget och antaganden</span>
        <span style={{ color: MUTED, fontSize: 18 }}>{open ? "▴" : "▾"}</span>
      </button>
      <div style={{ fontSize: 13.5, color: MUTED, margin: "6px 0 0", lineHeight: 1.6 }}>
        Lägg in det som ska ändra prognosen: nya kostnader och intäkter per månad från budgeten, och en förväntad ränteökning. Allt sparas och räknas in i likviditeten, hjälten och knappen "Räkna fram höjning".
      </div>

      {open && (
        <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Budgetposter per månad</div>
            <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 8 }}>
              Belopp per månad: minus = kostnad, plus = intäkt. Lämna "till" tomt om posten gäller tills vidare.
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {rows.map((r, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(160px, 2fr) minmax(110px, 1fr) minmax(100px, 1fr) minmax(100px, 1fr) auto", gap: 8, alignItems: "end" }}>
                  <label><span style={lab}>Namn</span><input style={inp} value={r.label} onChange={(e) => setRow(i, "label", e.target.value)} placeholder="t.ex. Tomträttsavgäld höjs" /></label>
                  <label><span style={lab}>Kr per månad</span><input style={inp} value={r.amount} onChange={(e) => setRow(i, "amount", e.target.value)} placeholder="-14000" inputMode="decimal" /></label>
                  <label><span style={lab}>Från (ÅÅÅÅ-MM)</span><input style={inp} value={r.from} onChange={(e) => setRow(i, "from", e.target.value)} placeholder="2027-01" /></label>
                  <label><span style={lab}>Till (valfritt)</span><input style={inp} value={r.to} onChange={(e) => setRow(i, "to", e.target.value)} placeholder="2027-06" /></label>
                  <button type="button" className="fp-btn fp-danger" onClick={() => setRows((cur) => cur.filter((_, idx) => idx !== i))} aria-label="Ta bort raden">✕</button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10 }}>
              <button type="button" className="fp-btn" onClick={() => setRows((cur) => [...cur, { label: "", amount: "", from: "2027-01", to: "" }])}>
                + Lägg till budgetpost
              </button>
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Ränteantagande</div>
            <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 8 }}>
              Förväntad förändring av räntan i procentenheter (minus = lägre ränta). Slår på varje lån från dess villkorsändring, men tidigast från vald månad.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, maxWidth: 480 }}>
              <label><span style={lab}>Ränteförändring (procentenheter)</span><input style={inp} value={pp} onChange={(e) => setPp(e.target.value)} placeholder="0,5" inputMode="decimal" /></label>
              <label><span style={lab}>Från (ÅÅÅÅ-MM)</span><input style={inp} value={from} onChange={(e) => setFrom(e.target.value)} placeholder="2027-01" /></label>
            </div>
          </div>

          <div>
            <button type="button" className="fp-btn fp-primary" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Sparar…" : "Spara budget och antaganden"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formulär för att fylla i eller ändra siffrorna
// ---------------------------------------------------------------------------
function FinanceForm({
  propertyId, propertyName, initial, onDone, onCancel,
}: { propertyId: string; propertyName?: string; initial: Finance | null; onDone: () => void; onCancel?: () => void }) {
  const s = (v: unknown) => (v != null ? String(v) : "");
  const [f, setF] = useState({
    fiscal_label: String(initial?.fiscal_label ?? ""),
    annual_fees: s(initial?.annual_fees),
    residential_area: s(initial?.residential_area),
    total_area: s(initial?.total_area),
    apartments: s(initial?.apartments),
    avg_interest_pct: s(initial?.avg_interest_pct),
    annual_amortization: s(initial?.annual_amortization),
    liquid_funds: s(initial?.liquid_funds),
    interest_cost: s(initial?.interest_cost),
    net_result: s(initial?.net_result),
    operating_cashflow: s(initial?.operating_cashflow),
    equity_ratio_pct: s(initial?.equity_ratio_pct),
    decided_increase_pct: s(initial?.decided_increase_pct),
    cash_balance: s(initial?.cash_balance),
    cash_date: s(initial?.cash_date),
    monthly_net_cashflow: s(initial?.monthly_net_cashflow),
    min_cash_buffer: s(initial?.min_cash_buffer),
    notes: String(initial?.notes ?? ""),
    source: String(initial?.source ?? ""),
    loans: loansToText(Array.isArray(initial?.loans) ? (initial!.loans as Loan[]) : []),
    payments: paymentsToText(Array.isArray(initial?.known_payments) ? (initial!.known_payments as Payment[]) : []),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const n = (v: string) => (v.trim() === "" ? null : num(v.replace(/\s/g, "").replace(",", ".")));

  const save = useMutation({
    mutationFn: async () => {
      const row = {
        property_id: propertyId,
        fiscal_label: f.fiscal_label || null,
        annual_fees: n(f.annual_fees),
        residential_area: n(f.residential_area),
        total_area: n(f.total_area),
        apartments: n(f.apartments),
        avg_interest_pct: n(f.avg_interest_pct),
        annual_amortization: n(f.annual_amortization),
        liquid_funds: n(f.liquid_funds),
        interest_cost: n(f.interest_cost),
        net_result: n(f.net_result),
        operating_cashflow: n(f.operating_cashflow),
        equity_ratio_pct: n(f.equity_ratio_pct),
        decided_increase_pct: n(f.decided_increase_pct),
        cash_balance: n(f.cash_balance),
        cash_date: f.cash_date.trim() || null,
        monthly_net_cashflow: n(f.monthly_net_cashflow),
        min_cash_buffer: n(f.min_cash_buffer),
        notes: f.notes || null,
        source: f.source || null,
        loans: parseLoans(f.loans),
        known_payments: parsePayments(f.payments),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("property_finance").upsert(row, { onConflict: "property_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sparat", { style: { background: "#3D8A30", color: "#fff" } });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message ?? "Kunde inte spara"),
  });

  const field = (label: string, k: keyof typeof f, placeholder?: string) => (
    <div>
      <label className="fp-label">{label}</label>
      <input className="fp-input" value={f[k]} onChange={set(k)} placeholder={placeholder} />
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 820 }}>
      {!initial && (
        <div style={{ ...card, background: "#F7F9F6" }}>
          Ingen ekonomi är inlagd för {propertyName ?? "den här fastigheten"} ännu. Fyll i siffror ur årsredovisning och budget. Det räcker med årsavgifter, ytor och antal lägenheter för att få uträkningen av avgiftshöjningen.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        {field("Årsavgifter bostäder per år (kr)", "annual_fees", "t.ex. 8503680")}
        {field("Bostadsyta (kvm)", "residential_area")}
        {field("Totalyta (kvm)", "total_area")}
        {field("Antal bostadsrätter", "apartments")}
        {field("Genomsnittlig skuldränta (%)", "avg_interest_pct")}
        {field("Amortering per år (kr)", "annual_amortization")}
        {field("Likvida medel vid bokslut (kr)", "liquid_funds")}
        {field("Räntekostnad per år (kr)", "interest_cost")}
        {field("Årets resultat (kr)", "net_result")}
        {field("Kassaflöde från löpande verksamhet (kr)", "operating_cashflow")}
        {field("Soliditet (%)", "equity_ratio_pct")}
        {field("Beslutad avgiftshöjning (%)", "decided_increase_pct")}
        {field("Kassa idag (kr)", "cash_balance")}
        {field("Kassa per datum (ÅÅÅÅ-MM-DD)", "cash_date", "2026-10-30")}
        {field("Löpande nettoflöde per månad (kr, minus = utflöde)", "monthly_net_cashflow", "-25000")}
        {field("Lägsta önskade kassa, buffert (kr)", "min_cash_buffer", "700000")}
      </div>
      <div>
        <label className="fp-label">Kända utbetalningar: datum (ÅÅÅÅ-MM-DD); belopp inkl. moms; beskrivning</label>
        <textarea className="fp-textarea" rows={5} value={f.payments} onChange={set("payments")} placeholder={"2027-01-31; 562500; Stigarledningar, delbetalning"} />
      </div>
      <div>
        <label className="fp-label">Lån, en rad per lån: villkorsändringsdag (ÅÅÅÅ-MM-DD); belopp; ränta %</label>
        <textarea className="fp-textarea" rows={7} value={f.loans} onChange={set("loans")} placeholder={"2026-12-21; 5251034; 3,67\n2027-01-12; 20499500; 3,79"} />
      </div>
      {field("Underlag och period", "fiscal_label", "t.ex. Budget 2026, årsredovisning 2025")}
      {field("Källa", "source", "t.ex. Årsredovisning 2025")}
      <div>
        <label className="fp-label">Anteckningar</label>
        <textarea className="fp-textarea" rows={3} value={f.notes} onChange={set("notes")} />
      </div>
      <div className="fp-actions" style={{ marginTop: 0 }}>
        <button type="button" className="fp-btn fp-primary" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Sparar…" : "Spara"}
        </button>
        {onCancel && (
          <button type="button" className="fp-btn" onClick={onCancel}>
            Avbryt
          </button>
        )}
      </div>
    </div>
  );
}
