import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  GROUP_BY_KEY,
  MONTHS,
  MONTHS_SHORT,
  balanceSeries,
  computeOverview,
  fmtKr,
  fmtPct,
  fmtStort,
  latestOf,
  monthlySeries,
  periodLabel,
  type Balance,
  type GroupKey,
  accountLabel,
  type GroupSummary,
  type Overview,
} from "@/lib/ekonomi-oversikt";

const INK = "#0D2B1E";
const GREEN = "#3D8A30";
const ACCENT = "#5CB84A";
const GOLD = "#E8C464";
const HOT = "#C2334D";
const MUTED = "#6B7280";
const LINE = "#E3E7E2";
const PAGE_SIZE = 1000;

export type FinanceData = {
  rows: Balance[];
  names: Record<string, string>;
  latestPeriod: string | null;
  importedAt: string | null;
};

/** Hämtar alla rader för fastigheten. PostgREST ger max 1000 per anrop, så vi sidindelar. */
export function useFinanceData(propertyId: string) {
  return useQuery({
    queryKey: ["finance-oversikt", propertyId],
    enabled: !!propertyId,
    queryFn: async (): Promise<FinanceData> => {
      const rows: Balance[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from("finance_balances")
          .select("year, month, account, amount")
          .eq("property_id", propertyId)
          .order("year")
          .order("month")
          .order("account")
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        for (const r of data ?? []) {
          rows.push({ year: r.year as number, month: r.month as number, account: r.account as string, amount: Number(r.amount) });
        }
        if (!data || data.length < PAGE_SIZE) break;
      }

      const names: Record<string, string> = {};
      const acc = await supabase.from("finance_accounts").select("account, name").eq("property_id", propertyId).limit(5000);
      if (acc.error) throw acc.error;
      for (const a of acc.data ?? []) names[a.account as string] = accountLabel(a.account as string, a.name as string);

      const imp = await supabase
        .from("finance_imports")
        .select("latest_period, created_at")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (imp.error) throw imp.error;
      const last = imp.data?.[0];
      return {
        rows,
        names,
        latestPeriod: (last?.latest_period as string | null) ?? null,
        importedAt: (last?.created_at as string | null) ?? null,
      };
    },
  });
}

type View =
  | { t: "home" }
  | { t: "group"; key: GroupKey }
  | { t: "section"; which: "in" | "ut" | "bank" | "lan" }
  | { t: "account"; account: string; kind: "in" | "ut" | "bank" | "lan" };

const arrow = (kind: "in" | "ut", now: number, before: number, has: boolean) => {
  if (!has || before === 0) return null;
  const pct = (now - before) / Math.abs(before);
  if (Math.abs(pct) < 0.005) return { text: "ungefär som förra året", color: MUTED };
  const up = pct > 0;
  // Mer pengar in är bra, mer pengar ut är dyrare.
  const good = kind === "in" ? up : !up;
  return { text: `${up ? "▲" : "▼"} ${fmtPct(pct).replace(/^[+−]/, "")} mot samma tid förra året`, color: good ? GREEN : HOT };
};

const card: CSSProperties = {
  background: "#fff",
  border: `1px solid ${LINE}`,
  borderRadius: 14,
  boxShadow: "0 1px 2px rgba(13,43,30,0.04)",
};

const clickable: CSSProperties = {
  ...card,
  width: "100%",
  textAlign: "left",
  cursor: "pointer",
  font: "inherit",
  color: INK,
  padding: "16px 18px",
};

export function EkonomiOversiktView({ propertyId }: { propertyId: string }) {
  const q = useFinanceData(propertyId);
  const [stack, setStack] = useState<View[]>([{ t: "home" }]);
  const view = stack[stack.length - 1];
  const open = (v: View) => setStack((s) => [...s, v]);
  const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

  const data = q.data;
  const period = useMemo(() => {
    if (!data || data.rows.length === 0) return null;
    const fromLog = data.latestPeriod && /^\d{6}$/.test(data.latestPeriod)
      ? { year: Number(data.latestPeriod.slice(0, 4)), month: Number(data.latestPeriod.slice(4)) }
      : null;
    return fromLog ?? latestOf(data.rows);
  }, [data]);

  const ov = useMemo(
    () => (data && period ? computeOverview(data.rows, data.names, period.year, period.month) : null),
    [data, period],
  );

  if (q.isLoading) return <p style={{ color: MUTED }}>Hämtar siffrorna …</p>;
  if (q.error) return <p style={{ color: HOT }}>Kunde inte hämta siffrorna: {(q.error as Error).message}</p>;
  if (!data || !ov || !period) {
    return (
      <div style={{ ...card, padding: 24 }}>
        <p style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Inga siffror har lagts in ännu.</p>
        <p style={{ margin: "8px 0 0", color: MUTED }}>När bokföringen har laddats upp visas föreningens ekonomi här.</p>
      </div>
    );
  }

  const updated = data.importedAt ? new Date(data.importedAt).toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" }) : null;

  const crumb = (text: string) => (
    <button
      onClick={back}
      style={{ border: 0, background: "none", color: GREEN, font: "inherit", fontWeight: 600, fontSize: 16, cursor: "pointer", padding: "4px 0", marginBottom: 12 }}
    >
      ‹ {text}
    </button>
  );

  let body: ReactNode;
  if (view.t === "home") body = <Home ov={ov} open={open} />;
  else if (view.t === "group") {
    const g = ov.groups.find((x) => x.key === view.key)!;
    body = (
      <>
        {crumb("Tillbaka")}
        <GroupView g={g} total={g.kind === "ut" ? ov.utNow : ov.inNow} has={ov.hasBefore} onAccount={(a) => open({ t: "account", account: a, kind: g.kind })} />
      </>
    );
  } else if (view.t === "section") {
    body = (
      <>
        {crumb("Tillbaka")}
        <SectionView ov={ov} which={view.which} open={open} />
      </>
    );
  } else {
    body = (
      <>
        {crumb("Tillbaka")}
        <AccountView data={data} ov={ov} account={view.account} kind={view.kind} />
      </>
    );
  }

  return (
    <div>
      {body}
      <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.6, marginTop: 28 }}>
        Källa: föreningens bokföring. Siffrorna gäller {periodLabel(ov.upTo)} {ov.year}
        {ov.hasBefore ? `, jämfört med samma tid ${ov.year - 1}` : ""}.{updated ? ` Uppdaterad ${updated}.` : ""} Det här är en förenklad översikt och
        ersätter inte årsredovisningen.
      </p>
    </div>
  );
}

function Home({ ov, open }: { ov: Overview; open: (v: View) => void }) {
  const res = ov.inNow - ov.utNow;
  const even = Math.abs(res) < 0.01 * Math.max(ov.utNow, 1);
  const cashRes = res + ov.nonCash;
  const ut = ov.groups.filter((g) => g.kind === "ut" && g.now > 0).sort((a, b) => b.now - a.now);
  const inArrow = arrow("in", ov.inNow, ov.inBefore, ov.hasBefore);
  const utArrow = arrow("ut", ov.utNow, ov.utBefore, ov.hasBefore);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ ...card, padding: "24px 24px 20px", background: INK, color: "#fff", border: 0 }}>
        <div style={{ fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase", color: ACCENT, fontWeight: 700 }}>
          {periodLabel(ov.upTo)} {ov.year}
        </div>
        <h2 style={{ fontFamily: "Outfit, Inter, sans-serif", fontSize: 28, lineHeight: 1.25, margin: "10px 0 0", fontWeight: 600 }}>
          {even
            ? "Hittills i år har vi betalat ut ungefär lika mycket som vi har fått in."
            : res < 0
              ? `Hittills i år har vi betalat ut ${fmtStort(-res)} mer än vi har fått in.`
              : `Hittills i år har vi fått in ${fmtStort(res)} mer än vi har betalat ut.`}
        </h2>
        {ov.nonCash > 0 && res < 0 && (
          <div style={{ marginTop: 16, background: "rgba(92,184,74,0.16)", borderRadius: 10, padding: "12px 14px", fontSize: 16, lineHeight: 1.55 }}>
            <strong style={{ color: ACCENT }}>Bra att veta: </strong>
            {fmtStort(ov.nonCash)} av det är slitaget på husen. Det räknas som en kostnad, men inga pengar lämnar kontot.{" "}
            {cashRes >= 0
              ? `Räknar vi bort slitaget har vi ${fmtStort(cashRes)} över.`
              : `Räknar vi bort slitaget är det fortfarande ${fmtStort(-cashRes)} mer ut än in.`}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        <button style={clickable} onClick={() => open({ t: "section", which: "in" })}>
          <div style={{ color: MUTED, fontSize: 15, fontWeight: 600 }}>Pengar in</div>
          <div style={{ fontFamily: "Outfit, Inter, sans-serif", fontSize: 32, fontWeight: 600, margin: "4px 0" }}>{fmtStort(ov.inNow)}</div>
          {inArrow && <div style={{ color: inArrow.color, fontSize: 14 }}>{inArrow.text}</div>}
          <div style={{ color: GREEN, fontSize: 14, fontWeight: 600, marginTop: 8 }}>Se vad det består av ›</div>
        </button>
        <button style={clickable} onClick={() => open({ t: "section", which: "ut" })}>
          <div style={{ color: MUTED, fontSize: 15, fontWeight: 600 }}>Pengar ut</div>
          <div style={{ fontFamily: "Outfit, Inter, sans-serif", fontSize: 32, fontWeight: 600, margin: "4px 0" }}>{fmtStort(ov.utNow)}</div>
          {utArrow && <div style={{ color: utArrow.color, fontSize: 14 }}>{utArrow.text}</div>}
          <div style={{ color: GREEN, fontSize: 14, fontWeight: 600, marginTop: 8 }}>Se vart pengarna gått ›</div>
        </button>
      </div>

      <section>
        <h3 style={h3}>Vart tar pengarna vägen?</h3>
        <p style={sub}>Så här stor del av allt vi betalat ut går till varje sak:</p>
        <div style={{ display: "grid", gap: 10 }}>
          {ut.map((g) => {
            const share = ov.utNow > 0 ? (g.now / ov.utNow) * 100 : 0;
            const a = arrow("ut", g.now, g.before, ov.hasBefore);
            return (
              <button key={g.key} style={clickable} onClick={() => open({ t: "group", key: g.key })}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                  <span style={{ fontWeight: 600, fontSize: 17 }}>{g.label}</span>
                  <span style={{ fontFamily: "Outfit, Inter, sans-serif", fontWeight: 600, fontSize: 20, whiteSpace: "nowrap" }}>{g.now > 0 && share < 0.5 ? "<1" : Math.round(share)} %</span>
                </div>
                <div style={{ height: 8, background: "#EEF2EC", borderRadius: 4, margin: "10px 0 6px" }}>
                  <div style={{ width: `${Math.max(2, Math.min(100, share))}%`, height: 8, background: ACCENT, borderRadius: 4 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14, color: MUTED, flexWrap: "wrap" }}>
                  <span>{fmtStort(g.now)}</span>
                  {a && <span style={{ color: a.color }}>{a.text}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {(ov.bank !== null || ov.loan !== null) && (
        <section>
          <h3 style={h3}>Hur ser kassan ut?</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
            {ov.bank !== null && (
              <button style={clickable} onClick={() => open({ t: "section", which: "bank" })}>
                <div style={{ color: MUTED, fontSize: 15, fontWeight: 600 }}>På banken</div>
                <div style={{ fontFamily: "Outfit, Inter, sans-serif", fontSize: 30, fontWeight: 600, margin: "4px 0" }}>{fmtStort(ov.bank)}</div>
                <div style={{ color: MUTED, fontSize: 14 }}>Pengar vi har tillgängliga just nu.</div>
              </button>
            )}
            {ov.loan !== null && ov.loan > 0 && (
              <button style={clickable} onClick={() => open({ t: "section", which: "lan" })}>
                <div style={{ color: MUTED, fontSize: 15, fontWeight: 600 }}>Lånet till banken</div>
                <div style={{ fontFamily: "Outfit, Inter, sans-serif", fontSize: 30, fontWeight: 600, margin: "4px 0" }}>{fmtStort(ov.loan)}</div>
                <div style={{ color: MUTED, fontSize: 14 }}>
                  {ov.interestPerMonth
                    ? `Räntan kostar ungefär ${fmtStort(ov.interestPerMonth)} i månaden, alltså cirka ${fmtKr(Math.round(ov.interestPerMonth / 30 / 100) * 100)} varje dag.`
                    : "Det vi ännu inte betalat tillbaka."}
                </div>
              </button>
            )}
          </div>
        </section>
      )}

      {ov.dearer.length > 0 && (
        <section>
          <h3 style={h3}>Vad har blivit dyrare?</h3>
          <p style={sub}>Det som ökat mest jämfört med samma tid förra året:</p>
          <div style={{ display: "grid", gap: 10 }}>
            {ov.dearer.map((d) => (
              <button key={d.account} style={clickable} onClick={() => open({ t: "account", account: d.account, kind: "ut" })}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: 17 }}>{d.name}</span>
                  <span style={{ color: HOT, fontWeight: 700 }}>
                    {d.pct === null ? "nytt i år" : fmtPct(d.pct)} · {fmtStort(d.diff)} mer
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 style={h3}>Vad betyder orden?</h3>
        <div style={{ ...card, padding: "4px 18px" }}>
          {GLOSSARY.map(([w, t]) => (
            <details key={w} style={{ padding: "12px 0", borderBottom: `1px solid ${LINE}` }}>
              <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 17 }}>{w}</summary>
              <p style={{ margin: "8px 0 0", lineHeight: 1.6, color: "#374151" }}>{t}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

const GLOSSARY: Array<[string, string]> = [
  ["Månadsavgift", "Pengarna alla som bor i föreningen betalar varje månad. Det är föreningens viktigaste inkomst."],
  ["Slitage (avskrivning)", "Hus blir äldre och slits. Därför bokför man en del av husets värde som en kostnad varje år. Inga pengar lämnar kontot, men det är med i resultatet."],
  ["Ränta", "Hyran man betalar för att ha lånat pengar. Ju större lån, desto mer ränta."],
  ["Tomträtt", "Marken under husen ägs av kommunen. Föreningen betalar en avgift för att få ha husen där."],
  ["Förvaltning", "Dem som sköter vardagen åt föreningen: fastighetsskötsel, ekonomi och pappersarbete."],
  ["Underskott och överskott", "Överskott är när det blir pengar över. Underskott är när det går ut mer än det kommer in."],
];

const h3: CSSProperties = { fontFamily: "Outfit, Inter, sans-serif", fontSize: 22, fontWeight: 600, margin: "4px 0 4px", color: INK };
const sub: CSSProperties = { margin: "0 0 12px", color: MUTED, fontSize: 15 };

function GroupView({ g, total, has, onAccount }: { g: GroupSummary; total: number; has: boolean; onAccount: (account: string) => void }) {
  const a = arrow(g.kind, g.now, g.before, has);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ ...card, padding: 22 }}>
        <h2 style={{ fontFamily: "Outfit, Inter, sans-serif", fontSize: 26, margin: 0, color: INK }}>{g.label}</h2>
        <p style={{ margin: "8px 0 0", fontSize: 17, lineHeight: 1.55, color: "#374151" }}>{g.kid}</p>
        <div style={{ fontFamily: "Outfit, Inter, sans-serif", fontSize: 34, fontWeight: 600, marginTop: 14 }}>{fmtStort(g.now)}</div>
        {a && <div style={{ color: a.color, fontSize: 15 }}>{a.text}</div>}
      </div>
      <h3 style={{ ...h3, marginTop: 8 }}>Det här ingår</h3>
      <div style={{ display: "grid", gap: 10 }}>
        {g.accounts.map((r) => {
          const share = total > 0 ? Math.max(0, (r.now / total) * 100) : 0;
          const ra = arrow(g.kind, r.now, r.before, has);
          return (
            <button key={r.account} style={clickable} onClick={() => onAccount(r.account)}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                <span style={{ fontWeight: 600, fontSize: 17 }}>{r.name}</span>
                <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{fmtKr(r.now)}</span>
              </div>
              <div style={{ height: 6, background: "#EEF2EC", borderRadius: 3, margin: "8px 0 6px" }}>
                <div style={{ width: `${Math.min(100, share)}%`, height: 6, background: ACCENT, borderRadius: 3 }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: MUTED, gap: 12, flexWrap: "wrap" }}>
                <span>Konto {r.account}</span>
                {ra ? <span style={{ color: ra.color }}>{ra.text}</span> : <span>Se månad för månad ›</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SectionView({ ov, which, open }: { ov: Overview; which: "in" | "ut" | "bank" | "lan"; open: (v: View) => void }) {
  if (which === "in" || which === "ut") {
    const gs = ov.groups.filter((g) => g.kind === which && Math.abs(g.now) > 0.5).sort((a, b) => b.now - a.now);
    const total = which === "in" ? ov.inNow : ov.utNow;
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <h2 style={{ fontFamily: "Outfit, Inter, sans-serif", fontSize: 26, margin: 0 }}>{which === "in" ? "Pengar in" : "Pengar ut"}</h2>
        <p style={{ ...sub, fontSize: 17 }}>
          Totalt {fmtStort(total)} {periodLabel(ov.upTo)}. Tryck på en rad för att se mer.
        </p>
        {gs.map((g) => {
          const a = arrow(g.kind, g.now, g.before, ov.hasBefore);
          return (
            <button key={g.key} style={clickable} onClick={() => open({ t: "group", key: g.key })}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                <span style={{ fontWeight: 600, fontSize: 17 }}>{g.label}</span>
                <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{fmtStort(g.now)}</span>
              </div>
              <div style={{ fontSize: 14, color: MUTED, marginTop: 6 }}>{GROUP_BY_KEY[g.key].kid}</div>
              {a && <div style={{ fontSize: 13, color: a.color, marginTop: 6 }}>{a.text}</div>}
            </button>
          );
        })}
      </div>
    );
  }
  const list = which === "bank" ? ov.bankAccounts : ov.loanAccounts;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h2 style={{ fontFamily: "Outfit, Inter, sans-serif", fontSize: 26, margin: 0 }}>{which === "bank" ? "På banken" : "Lånet till banken"}</h2>
      <p style={{ ...sub, fontSize: 17 }}>
        {which === "bank" ? "Så här fördelar sig pengarna på föreningens konton." : "Så här fördelar sig lånet."}
      </p>
      {list.map((a) => (
        <button key={a.account} style={clickable} onClick={() => open({ t: "account", account: a.account, kind: which })}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
            <span style={{ fontWeight: 600, fontSize: 17 }}>{a.name}</span>
            <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{fmtKr(a.value)}</span>
          </div>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>Konto {a.account} · Se månad för månad ›</div>
        </button>
      ))}
    </div>
  );
}

function AccountView({ data, ov, account, kind }: { data: FinanceData; ov: Overview; account: string; kind: "in" | "ut" | "bank" | "lan" }) {
  const name = data.names[account] ?? `Konto ${account}`;
  const isBalance = kind === "bank" || kind === "lan";
  const series = isBalance
    ? (() => {
        const sign = kind === "lan" ? -1 : 1;
        return { now: balanceSeries(data.rows, account, ov.year, sign), before: balanceSeries(data.rows, account, ov.year - 1, sign) };
      })()
    : monthlySeries(data.rows, account, ov.year, kind === "in" ? "in" : "ut");
  const max = Math.max(1, ...series.now.map((v) => Math.abs(v ?? 0)), ...series.before.map((v) => Math.abs(v ?? 0)));
  const total = (arr: Array<number | null>, upTo: number) => arr.slice(0, upTo).reduce<number>((s, v) => s + (v ?? 0), 0);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ ...card, padding: 22 }}>
        <h2 style={{ fontFamily: "Outfit, Inter, sans-serif", fontSize: 26, margin: 0 }}>{name}</h2>
        <div style={{ color: MUTED, fontSize: 14, marginTop: 4 }}>Konto {account}</div>
        {!isBalance && (
          <div style={{ marginTop: 12, fontSize: 17, lineHeight: 1.6 }}>
            <strong>{fmtKr(total(series.now, ov.upTo))}</strong> {periodLabel(ov.upTo)} {ov.year}
            {ov.hasBefore && (
              <>
                {" "}
                mot <strong>{fmtKr(total(series.before, ov.upTo))}</strong> samma tid {ov.year - 1}.
              </>
            )}
          </div>
        )}
      </div>
      <h3 style={{ ...h3, marginTop: 8 }}>{isBalance ? "Så här såg det ut i slutet av varje månad" : "Månad för månad"}</h3>
      <div style={{ ...card, padding: "8px 18px" }}>
        {MONTHS.map((m, i) => {
          const a = series.now[i];
          const b = series.before[i];
          if (a === null && b === null) return null;
          return (
            <div key={m} style={{ padding: "12px 0", borderBottom: i < 11 ? `1px solid ${LINE}` : 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600, textTransform: "capitalize", fontSize: 16 }}>{m}</span>
                <span style={{ fontSize: 15 }}>
                  <strong>{a === null ? "–" : fmtKr(a)}</strong>
                  {ov.hasBefore && b !== null && <span style={{ color: MUTED }}> · {ov.year - 1}: {fmtKr(b)}</span>}
                </span>
              </div>
              <div style={{ height: 8, background: "#EEF2EC", borderRadius: 4, marginTop: 8 }}>
                <div style={{ width: `${Math.min(100, (Math.abs(a ?? 0) / max) * 100)}%`, height: 8, background: i + 1 > ov.upTo && !isBalance ? GOLD : ACCENT, borderRadius: 4 }} />
              </div>
            </div>
          );
        })}
      </div>
      {!isBalance && ov.upTo < 12 && (
        <p style={{ color: MUTED, fontSize: 14, margin: 0 }}>
          Månaderna efter {MONTHS_SHORT[ov.upTo - 1]} (gula staplar) är inte färdigbokförda och ingår inte i summorna ovan.
        </p>
      )}
    </div>
  );
}
