import { useMemo, useState } from "react";
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Finance = Record<string, any>;
type PlanX = Plan & { recommended_savings?: number | string | null };

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const mkr = (v: number) => `${(v / 1e6).toFixed(1).replace(".", ",")} mkr`;
const pc = (v: number, d = 1) => `${v.toFixed(d).replace(".", ",")} %`;

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

const card: React.CSSProperties = { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: "16px 18px" };
const h3: React.CSSProperties = { fontFamily: "Outfit, Inter, system-ui, sans-serif", fontSize: 20, fontWeight: 700, margin: "0 0 12px", color: INK };
const lab: React.CSSProperties = { fontSize: 11.5, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED };

function Stat({ label, value, sub, bad }: { label: string; value: string; sub?: string; bad?: boolean }) {
  return (
    <div style={{ ...card, background: bad ? "#FEF3F3" : "#fff", borderColor: bad ? "#F1C0C0" : LINE }}>
      <div style={lab}>{label}</div>
      <div style={{ fontFamily: "Outfit, Inter, system-ui, sans-serif", fontSize: 28, fontWeight: 700, marginTop: 4, color: bad ? "#B91C1C" : INK }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function EkonomiAvgift({ propertyId, propertyName }: { propertyId: string; propertyName?: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

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
  const perM2Month = (kronor: number) => (resArea > 0 ? kronor / resArea / 12 : 0);
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
          </>
        ) : (
          <div style={{ marginTop: 10, fontSize: 15, lineHeight: 1.6 }}>
            Uträkningen saknar underlag. Ange <strong>rekommenderad avsättning</strong> under Underhållsplan, Inställningar, och kontrollera att{" "}
            <strong>årsavgifterna</strong> är ifyllda här.
          </div>
        )}
      </div>

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
          <Stat label="Likvida medel" value={mkr(num(fin.liquid_funds))} />
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
// Formulär för att fylla i eller ändra siffrorna
// ---------------------------------------------------------------------------
function FinanceForm({
  propertyId, propertyName, initial, onDone, onCancel,
}: { propertyId: string; propertyName?: string; initial: Finance | null; onDone: () => void; onCancel?: () => void }) {
  const [f, setF] = useState({
    fiscal_label: String(initial?.fiscal_label ?? ""),
    annual_fees: initial?.annual_fees != null ? String(initial.annual_fees) : "",
    residential_area: initial?.residential_area != null ? String(initial.residential_area) : "",
    total_area: initial?.total_area != null ? String(initial.total_area) : "",
    apartments: initial?.apartments != null ? String(initial.apartments) : "",
    avg_interest_pct: initial?.avg_interest_pct != null ? String(initial.avg_interest_pct) : "",
    annual_amortization: initial?.annual_amortization != null ? String(initial.annual_amortization) : "",
    liquid_funds: initial?.liquid_funds != null ? String(initial.liquid_funds) : "",
    interest_cost: initial?.interest_cost != null ? String(initial.interest_cost) : "",
    net_result: initial?.net_result != null ? String(initial.net_result) : "",
    operating_cashflow: initial?.operating_cashflow != null ? String(initial.operating_cashflow) : "",
    equity_ratio_pct: initial?.equity_ratio_pct != null ? String(initial.equity_ratio_pct) : "",
    decided_increase_pct: initial?.decided_increase_pct != null ? String(initial.decided_increase_pct) : "",
    notes: String(initial?.notes ?? ""),
    source: String(initial?.source ?? ""),
    loans: loansToText(Array.isArray(initial?.loans) ? (initial!.loans as Loan[]) : []),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const n = (s: string) => (s.trim() === "" ? null : num(s.replace(/\s/g, "").replace(",", ".")));

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
        notes: f.notes || null,
        source: f.source || null,
        loans: parseLoans(f.loans),
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
        {field("Likvida medel (kr)", "liquid_funds")}
        {field("Räntekostnad per år (kr)", "interest_cost")}
        {field("Årets resultat (kr)", "net_result")}
        {field("Kassaflöde från löpande verksamhet (kr)", "operating_cashflow")}
        {field("Soliditet (%)", "equity_ratio_pct")}
        {field("Beslutad avgiftshöjning (%)", "decided_increase_pct")}
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
