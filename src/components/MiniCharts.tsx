import type { CSSProperties } from "react";

/**
 * Två små, lättlästa diagram för snabb helhetsbild: staplar (staplade delar per period)
 * och en munk med förklaringstabell. Egen enkel kod, inget diagrambibliotek: stapeltexterna
 * är vanlig HTML så de skalar som övrig text (viktigt för läsbarheten på mobil), och munken
 * är en SVG med ett segment per post.
 *
 * Färger skickas in, så samma komponenter fungerar på de mörka hemsidorna och de ljusa
 * ekonomisidorna.
 */

export type ChartTheme = { ink: string; muted: string; grid: string };
export const DARK_CHART: ChartTheme = { ink: "#e6efd8", muted: "#9db39a", grid: "rgba(255,255,255,0.10)" };
export const LIGHT_CHART: ChartTheme = { ink: "#0D2B1E", muted: "#6B7280", grid: "#E3E7E2" };

/** Serie­färger för kategorier, i fallande storlek. Grått är alltid "Övrigt". */
export const SERIES_COLORS = ["#3D8A30", "#0D2B1E", "#E8C464", "#5B9BD5", "#C2334D", "#2AA198", "#8E5EA2"];
export const OTHER_COLOR = "#9CA3AF";

/** 1 200 000 → "1,2 mkr", 85 000 → "85 tkr". För axlar och förklaringar. */
export function compactKr(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1_000_000) return `${sign}${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace(".", ",")} mkr`;
  if (a >= 10_000) return `${sign}${Math.round(a / 1000)} tkr`;
  if (a >= 1000) return `${sign}${(a / 1000).toFixed(1).replace(".", ",")} tkr`;
  return `${sign}${Math.round(a)} kr`;
}

export function fullKr(n: number): string {
  return `${Math.round(n).toLocaleString("sv-SE")} kr`;
}

/** Ett "snällt" max för axeln: 1, 2, 2,5 eller 5 gånger en tiopotens. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * pow) return m * pow;
  return 10 * pow;
}

export type BarPart = { name: string; value: number; color: string };
export type Bar = { label: string; parts: BarPart[] };

export function StackedBars({
  bars,
  format = (n) => String(Math.round(n)),
  theme = DARK_CHART,
  height = 200,
  labelEvery = 1,
  empty = "Inget att visa ännu.",
  legend = true,
}: {
  bars: Bar[];
  format?: (n: number) => string;
  theme?: ChartTheme;
  height?: number;
  /** Visa var N:e x-etikett, så att långa serier (t.ex. 50 år) inte blir en röra. */
  labelEvery?: number;
  empty?: string;
  legend?: boolean;
}) {
  const totals = bars.map((b) => b.parts.reduce((s, p) => s + Math.max(0, p.value), 0));
  const maxTotal = Math.max(0, ...totals);
  if (bars.length === 0 || maxTotal <= 0) {
    return <div style={{ padding: "18px 20px 22px", color: theme.muted, fontSize: 18 }}>{empty}</div>;
  }
  const top = niceMax(maxTotal);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);

  // Förklaring: varje färg en gång, i den ordning de först dyker upp.
  const seen = new Map<string, string>();
  for (const b of bars) for (const p of b.parts) if (p.value > 0 && !seen.has(p.name)) seen.set(p.name, p.color);

  const axis: CSSProperties = { fontSize: 13, color: theme.muted, lineHeight: 1 };

  return (
    <div style={{ padding: "6px 20px 18px" }}>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ position: "relative", width: 46, height, flexShrink: 0 }} aria-hidden="true">
          {ticks.map((t, i) => (
            <span key={i} style={{ ...axis, position: "absolute", right: 0, bottom: `calc(${(t / top) * 100}% - 6px)` }}>
              {format(t)}
            </span>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ position: "relative", height, borderBottom: `1px solid ${theme.grid}` }}>
            {ticks.slice(1).map((t, i) => (
              <div key={i} style={{ position: "absolute", left: 0, right: 0, bottom: `${(t / top) * 100}%`, borderTop: `1px solid ${theme.grid}` }} />
            ))}
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", gap: bars.length > 30 ? 1 : 4 }}>
              {bars.map((b, i) => (
                <div
                  key={i}
                  style={{ flex: 1, minWidth: 0, height: `${(totals[i] / top) * 100}%`, display: "flex", flexDirection: "column-reverse", borderRadius: "4px 4px 0 0", overflow: "hidden" }}
                  title={`${b.label}: ${format(totals[i])}`}
                >
                  {b.parts.map((p, j) =>
                    p.value > 0 ? <div key={j} style={{ height: `${(p.value / totals[i]) * 100}%`, background: p.color }} title={`${b.label} · ${p.name}: ${format(p.value)}`} /> : null,
                  )}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: bars.length > 30 ? 1 : 4, marginTop: 6 }}>
            {bars.map((b, i) => (
              <div key={i} style={{ ...axis, flex: 1, minWidth: 0, textAlign: "center", overflow: "visible", whiteSpace: "nowrap" }}>
                {i % labelEvery === 0 ? b.label : ""}
              </div>
            ))}
          </div>
        </div>
      </div>
      {legend && seen.size > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px", marginTop: 14 }}>
          {[...seen.entries()].map(([name, color]) => (
            <span key={name} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 16, color: theme.ink }}>
              <span style={{ width: 14, height: 14, borderRadius: 4, background: color, flexShrink: 0 }} />
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export type Slice = { label: string; value: number; color: string };

export function DonutChart({
  slices,
  total,
  centerSub,
  format = (n) => String(Math.round(n)),
  showPercent = false,
  theme = DARK_CHART,
  empty = "Inget att visa ännu.",
}: {
  slices: Slice[];
  /** Stor siffra i mitten; standard är summan av delarna. */
  total?: string;
  centerSub?: string;
  format?: (n: number) => string;
  /** Skriv procent i förklaringen i stället för belopp. */
  showPercent?: boolean;
  theme?: ChartTheme;
  empty?: string;
}) {
  const parts = slices.filter((s) => s.value > 0);
  const sum = parts.reduce((s, p) => s + p.value, 0);
  if (sum <= 0) return <div style={{ padding: "18px 20px 22px", color: theme.muted, fontSize: 18 }}>{empty}</div>;

  const R = 70;
  const C = 2 * Math.PI * R;
  let acc = 0;

  return (
    <div style={{ padding: "6px 20px 18px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "14px 26px" }}>
      <div style={{ position: "relative", width: 190, height: 190, flexShrink: 0, margin: "0 auto" }}>
        <svg viewBox="0 0 200 200" width="190" height="190" role="img" aria-label="Fördelning">
          <g transform="rotate(-90 100 100)">
            {parts.map((p, i) => {
              const len = (p.value / sum) * C;
              const el = (
                <circle
                  key={i}
                  cx="100"
                  cy="100"
                  r={R}
                  fill="none"
                  stroke={p.color}
                  strokeWidth="30"
                  strokeDasharray={`${Math.max(0, len - (parts.length > 1 ? 1.5 : 0))} ${C}`}
                  strokeDashoffset={-acc}
                >
                  <title>{`${p.label}: ${format(p.value)}`}</title>
                </circle>
              );
              acc += len;
              return el;
            })}
          </g>
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", pointerEvents: "none" }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: theme.ink, lineHeight: 1.1 }}>{total ?? format(sum)}</div>
          {centerSub && <div style={{ fontSize: 14, color: theme.muted, marginTop: 2 }}>{centerSub}</div>}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 200, display: "grid", gap: 8 }}>
        {parts.map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 17, color: theme.ink }}>
            <span style={{ width: 16, height: 16, borderRadius: 5, background: p.color, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>{p.label}</span>
            <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{showPercent ? `${Math.round((p.value / sum) * 100)} %` : format(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
