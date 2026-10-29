import { Fragment, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Upload, Trash2, TrendingUp, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { sanitizeStorageName } from "@/lib/storage";
import { COLORS, labelStyle, inputStyle, textareaStyle, primaryBtn } from "@/components/property-tabs";
import {
  CATEGORY_SUGGESTIONS,
  KIND_LABEL,
  STATUS_LABEL,
  costOf,
  kr,
  occurrences,
  type Action,
  type Plan,
  type Occurrence,
} from "@/lib/maintenance";

const BUCKET = "maintenance-files";
const DARK = "#0D2B1E";
const GREEN = "#5CB84A";
const BEIGE = "#F2E3BC";
const RED = "#8B1A2B";
const green = (m: string) => toast.success(m, { style: { background: "#3D8A30", color: "#fff" } });
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Något gick fel");

type Tab = "atgarder" | "ar" | "kategori" | "analys" | "installningar";

const CAT_COLOR: Record<string, string> = {
  Mark: "#F5B731",
  Fasad: "#374151",
  Invändigt: "#F2711C",
  Ventilation: "#0E9594",
  Installationer: "#3FAE5A",
  Tak: "#2DD4BF",
  "17. BRAND och SÄKERHET": "#C026D3",
  Besiktningar: "#A5B4FC",
};
const catColor = (c: string | null) => (c && CAT_COLOR[c]) || "#9CA3AF";

const td: React.CSSProperties = { padding: "11px 8px", fontSize: 14, color: COLORS.text, borderBottom: `1px solid ${COLORS.border}` };

function Chip({ text, tone }: { text: string; tone?: "dark" | "pink" | "green" }) {
  const bg = tone === "dark" ? "#374151" : tone === "pink" ? "#FBD5DC" : "#E8F5E4";
  const fg = tone === "dark" ? "#fff" : tone === "pink" ? RED : "#2E6B24";
  return (
    <span style={{ background: bg, color: fg, borderRadius: 999, padding: "2px 9px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
      {text}
    </span>
  );
}

function summary(plan: Plan, occ: Occurrence[]) {
  const n = plan.end_year - plan.start_year + 1;
  const years = Array.from({ length: n }, (_, i) => plan.start_year + i);
  const byYear = years.map((y) => {
    const rows = occ.filter((o) => o.year === y);
    return {
      year: y,
      inv: rows.filter((r) => r.action.kind === "investering").reduce((s, r) => s + r.cost, 0),
      und: rows.filter((r) => r.action.kind !== "investering").reduce((s, r) => s + r.cost, 0),
    };
  });
  const total = byYear.reduce((s, d) => s + d.inv + d.und, 0);
  const inv = byYear.reduce((s, d) => s + d.inv, 0);
  const perYear = total / n;
  const boa = plan.boa_sqm ? Number(plan.boa_sqm) : null;
  const recommended = Math.round(perYear / 1000) * 1000;
  const peak = byYear.reduce((m, d) => (d.inv + d.und > m.inv + m.und ? d : m), byYear[0]);
  return { n, years, byYear, total, inv, und: total - inv, perYear, boa, recommended, peak };
}

const mkr = (v: number) => `${(v / 1e6).toFixed(Math.abs(v) >= 1e7 ? 0 : 1).replace(".", ",")} mkr`;

// ---------------- Hjälte ----------------
function Hero({ plan, occ, name }: { plan: Plan; occ: Occurrence[]; name: string }) {
  const s = summary(plan, occ);
  const saving = Number(plan.current_annual_savings);
  const short = s.recommended > saving && s.total > 0;
  const big = (label: string, value: string, sub?: string) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9fb79f" }}>{label}</div>
      <div style={{ fontFamily: "Outfit, Inter, system-ui, sans-serif", fontSize: 34, fontWeight: 700, lineHeight: 1.1, margin: "6px 0 2px", color: "#fff" }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: "#b9c8b4" }}>{sub}</div>}
    </div>
  );
  return (
    <div style={{ background: "radial-gradient(ellipse at 20% 0%, #21503f 0%, #0f2a21 55%, #0b1d17 100%)", borderRadius: 18, padding: "24px 26px", color: "#e6efd8" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: GREEN, fontSize: 13, fontWeight: 700 }}>
        <TrendingUp size={16} /> {name} · {plan.start_year}–{plan.end_year}
      </div>
      <div style={{ fontFamily: "Outfit, Inter, system-ui, sans-serif", fontSize: 28, fontWeight: 700, margin: "10px 0 20px", color: "#fff" }}>
        {s.total > 0 ? `${mkr(s.total)} på ${s.n} år.` : "Ingen åtgärd inlagd ännu."}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 20 }}>
        {big("Per år", kr(s.perYear), `${kr(s.inv)} är investeringar`)}
        {big("Per m² och år", s.boa ? `${Math.round(s.perYear / s.boa)} kr` : "—", s.boa ? `${s.boa} m² BOA` : "Boarea saknas")}
        {big("Dyraste år", s.total > 0 ? String(s.peak.year) : "—", s.total > 0 ? kr(s.peak.inv + s.peak.und) : undefined)}
        {big("Avsättning idag", kr(saving), "per år")}
      </div>
      {short && (
        <div style={{ marginTop: 20, background: "rgba(122,20,38,0.45)", border: `1px solid ${RED}`, borderRadius: 12, padding: "12px 14px", display: "flex", gap: 10, alignItems: "flex-start", color: BEIGE }}>
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>
            <strong>Ni sätter av {kr(saving)} per år. Planen kräver i snitt {kr(s.recommended)}.</strong> Skillnaden är {kr(s.recommended - saving)} per år.
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- Huvudvy ----------------
export function MaintenancePlanView({ propertyId, propertyName }: { propertyId: string; propertyName?: string }) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  const isAdmin = profile?.role === "admin";
  const [tab, setTab] = useState<Tab>("atgarder");
  const [withVat, setWithVat] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const planQ = useQuery({
    queryKey: ["mplan", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("maintenance_plans").select("*").eq("property_id", propertyId).maybeSingle();
      if (error) throw error;
      return (data as Plan | null) ?? null;
    },
  });
  const plan = planQ.data ?? null;

  const actionsQ = useQuery({
    queryKey: ["mactions", plan?.id],
    enabled: !!plan,
    queryFn: async () => {
      const { data, error } = await supabase.from("maintenance_actions").select("*").eq("plan_id", plan!.id).order("year");
      if (error) throw error;
      return (data ?? []) as Action[];
    },
  });
  const actions = actionsQ.data ?? [];

  const createPlan = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("maintenance_plans").insert({ property_id: propertyId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mplan", propertyId] }),
    onError: (e) => toast.error(errMsg(e)),
  });

  const allOcc = useMemo(() => (plan ? occurrences(actions, plan, withVat) : []), [actions, plan, withVat]);

  if (planQ.isLoading) return <div style={{ color: COLORS.secondary }}>Laddar…</div>;
  if (!plan) {
    return (
      <div style={{ padding: "40px 16px", textAlign: "center", color: COLORS.secondary }}>
        <div style={{ marginBottom: 14 }}>
          {isAdmin ? "Ingen underhållsplan har lagts upp för den här fastigheten ännu." : "Ingen underhållsplan är tillgänglig för dig."}
        </div>
        {isAdmin && (
          <button style={primaryBtn} onClick={() => createPlan.mutate()} disabled={createPlan.isPending}>
            <Plus size={18} /> Skapa underhållsplan
          </button>
        )}
      </div>
    );
  }

  const fromY = from ? Number(from) : plan.start_year;
  const toY = to ? Number(to) : plan.end_year;
  const needle = q.trim().toLowerCase();
  const matches = (a: Action) =>
    (!cat || a.category === cat) && (!needle || `${a.name} ${a.category ?? ""} ${a.location ?? ""}`.toLowerCase().includes(needle));
  const occ = allOcc.filter((o) => o.year >= fromY && o.year <= toY && matches(o.action));
  const idsInRange = new Set(occ.map((o) => o.action.id));
  const list = actions.filter((a) => matches(a) && idsInRange.has(a.id));
  const categories = [...new Set(actions.map((a) => a.category).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "sv"));
  const openAction = actions.find((a) => a.id === openId) ?? null;

  const pill = (t: Tab, label: string) => (
    <button
      key={t}
      type="button"
      onClick={() => setTab(t)}
      style={{
        height: 36, padding: "0 16px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap", fontSize: 13.5, fontWeight: 700,
        border: `1px solid ${tab === t ? DARK : COLORS.border}`, background: tab === t ? DARK : "#fff", color: tab === t ? "#fff" : COLORS.secondary,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Hero plan={plan} occ={allOcc} name={propertyName ?? plan.name} />

      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
        {pill("atgarder", "Åtgärder")}
        {pill("ar", "Per år")}
        {pill("kategori", "Per kategori")}
        {pill("analys", "Ekonomisk analys")}
        {isAdmin && pill("installningar", "Inställningar")}
      </div>

      {tab !== "analys" && tab !== "installningar" && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input style={{ ...inputStyle, width: 90 }} type="number" placeholder={`Från ${plan.start_year}`} value={from} onChange={(e) => setFrom(e.target.value)} />
          <input style={{ ...inputStyle, width: 90 }} type="number" placeholder={`Till ${plan.end_year}`} value={to} onChange={(e) => setTo(e.target.value)} />
          <select style={{ ...inputStyle, width: 180 }} value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Alla kategorier</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input style={{ ...inputStyle, width: isMobile ? "100%" : 220 }} placeholder="Sök åtgärd…" value={q} onChange={(e) => setQ(e.target.value)} />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: COLORS.text }}>
            <input type="checkbox" checked={withVat} onChange={(e) => setWithVat(e.target.checked)} /> Inkl. moms
          </label>
          {isAdmin && (
            <button style={{ ...primaryBtn, height: 40, marginLeft: "auto" }} onClick={() => setCreating(true)}>
              <Plus size={16} /> Ny åtgärd
            </button>
          )}
        </div>
      )}

      {tab === "atgarder" && (
        list.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: COLORS.secondary }}>
            {actions.length === 0 ? "Inga åtgärder är inlagda ännu." : "Inga åtgärder för det här valet"}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))" }}>
            {list.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setOpenId(a.id)}
                style={{
                  textAlign: "left", cursor: "pointer", background: "#fff", border: `1px solid ${COLORS.border}`, borderLeft: `5px solid ${catColor(a.category)}`,
                  borderRadius: 12, padding: "12px 14px", display: "grid", gap: 6, font: "inherit", color: "inherit",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                  <span style={{ fontFamily: "Outfit, Inter, system-ui, sans-serif", fontSize: 26, fontWeight: 700 }}>{a.year}</span>
                  <span style={{ fontSize: 17, fontWeight: 700 }}>{kr(costOf(a, plan, withVat, a.year))}</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, overflowWrap: "anywhere" }}>{a.name}</div>
                <div style={{ fontSize: 12.5, color: COLORS.secondary }}>
                  {[a.category, a.location, a.interval_years ? `var ${a.interval_years}:e år` : null].filter(Boolean).join(" · ")}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {a.kind === "investering" && <Chip text="Investering" tone="dark" />}
                  {a.status !== "planerad" && <Chip text={STATUS_LABEL[a.status]} tone="green" />}
                  {a.label && <Chip text={a.label} tone="pink" />}
                </div>
              </button>
            ))}
          </div>
        )
      )}

      {tab === "ar" && <PerYear occ={occ} onOpen={setOpenId} />}
      {tab === "kategori" && <PerCategory occ={occ} actions={list} plan={plan} withVat={withVat} onOpen={setOpenId} />}
      {tab === "analys" && <Analysis plan={plan} occ={allOcc} />}
      {tab === "installningar" && isAdmin && <Settings plan={plan} />}

      {(openAction || creating) && (
        <ActionModal
          key={openAction?.id ?? "new"}
          action={openAction}
          plan={plan}
          withVat={withVat}
          onClose={() => {
            setOpenId(null);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

// ---------------- Per år (tidslinje) ----------------
function PerYear({ occ, onOpen }: { occ: Occurrence[]; onOpen: (id: string) => void }) {
  const years = [...new Set(occ.map((o) => o.year))];
  if (years.length === 0) return <div style={{ padding: 40, textAlign: "center", color: COLORS.secondary }}>Inga åtgärder för det här valet</div>;
  const sums = years.map((y) => occ.filter((o) => o.year === y).reduce((s, r) => s + r.cost, 0));
  const avg = sums.reduce((a, b) => a + b, 0) / sums.length;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {years.map((y, i) => {
        const rows = occ.filter((o) => o.year === y);
        const sum = sums[i];
        const hot = sum > avg * 2;
        return (
          <div key={y} style={{ border: `1px solid ${hot ? RED : COLORS.border}`, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ background: hot ? RED : DARK, color: hot ? BEIGE : "#fff", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontFamily: "Outfit, Inter, system-ui, sans-serif", fontSize: 24, fontWeight: 700 }}>{y}</span>
              <span style={{ fontSize: 18, fontWeight: 700 }}>{kr(sum)}</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.action.id}-${r.year}`} style={{ cursor: "pointer" }} onClick={() => onOpen(r.action.id)}>
                      <td style={{ ...td, fontWeight: 600 }}>
                        <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: catColor(r.action.category), marginRight: 8 }} />
                        {r.action.name}
                        {r.action.kind === "investering" && <span style={{ marginLeft: 6 }}><Chip text="Investering" tone="dark" /></span>}
                        {r.action.label && <span style={{ marginLeft: 6 }}><Chip text={r.action.label} tone="pink" /></span>}
                      </td>
                      <td style={td}>{r.action.category ?? "—"}</td>
                      <td style={td}>{r.action.location ?? "—"}</td>
                      <td style={td}>{r.action.interval_years ? `${r.action.interval_years} år` : ""}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{kr(r.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------- Per kategori ----------------
function PerCategory({
  occ, actions, plan, withVat, onOpen,
}: { occ: Occurrence[]; actions: Action[]; plan: Plan; withVat: boolean; onOpen: (id: string) => void }) {
  const cats = [...new Set(actions.map((a) => a.category ?? "Utan kategori"))].sort((a, b) => a.localeCompare(b, "sv"));
  if (cats.length === 0) return <div style={{ padding: 40, textAlign: "center", color: COLORS.secondary }}>Inga åtgärder för det här valet</div>;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {cats.map((c) => {
        const inCat = actions.filter((a) => (a.category ?? "Utan kategori") === c);
        const ids = new Set(inCat.map((a) => a.id));
        const sum = occ.filter((o) => ids.has(o.action.id)).reduce((s, o) => s + o.cost, 0);
        const locs = [...new Set(inCat.map((a) => a.location ?? "Övrigt"))].sort((a, b) => a.localeCompare(b, "sv"));
        return (
          <div key={c} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ background: DARK, color: "#fff", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderLeft: `8px solid ${catColor(c)}` }}>
              <span style={{ fontFamily: "Outfit, Inter, system-ui, sans-serif", fontSize: 20, fontWeight: 700 }}>{c}</span>
              <span style={{ fontSize: 17, fontWeight: 700 }}>{kr(sum)}</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {locs.map((l) => (
                    <Fragment key={l}>
                      <tr>
                        <td colSpan={6} style={{ ...td, background: "#F3F4F6", fontStyle: "italic", fontWeight: 700 }}>{l}</td>
                      </tr>
                      {inCat.filter((a) => (a.location ?? "Övrigt") === l).map((a) => (
                        <tr key={a.id} style={{ cursor: "pointer" }} onClick={() => onOpen(a.id)}>
                          <td style={{ ...td, fontWeight: 600 }}>
                            {a.name}
                            {a.kind === "investering" && <span style={{ marginLeft: 6 }}><Chip text="Investering" tone="dark" /></span>}
                          </td>
                          <td style={td}>{a.year}</td>
                          <td style={td}>{a.interval_years ? `${a.interval_years} år` : "—"}</td>
                          <td style={td}>{a.quantity} {a.unit}</td>
                          <td style={td}>{kr(Number(a.unit_price))}</td>
                          <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{kr(costOf(a, plan, withVat, a.year))}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------- Ekonomisk analys ----------------
function Analysis({ plan, occ }: { plan: Plan; occ: Occurrence[] }) {
  const s = summary(plan, occ);
  let cum = 0;
  const rec: number[] = [];
  const cur: number[] = [];
  s.byYear.forEach((d, i) => {
    cum += d.inv + d.und;
    rec.push(Number(plan.fund_balance) + s.recommended * (i + 1) - cum);
    cur.push(Number(plan.fund_balance) + Number(plan.current_annual_savings) * (i + 1) - cum);
  });
  const kpi = (label: string, value: string) => (
    <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: COLORS.secondary }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12 }}>
        {kpi("Total utgift", kr(s.total))}
        {kpi("Investering", kr(s.inv))}
        {kpi("Underhåll", kr(s.und))}
        {kpi("Rekommenderad avsättning / år", kr(s.recommended))}
        {kpi("Nuvarande avsättning / år", kr(Number(plan.current_annual_savings)))}
        {kpi("Rekommenderad per m²", s.boa ? `${Math.round(s.recommended / s.boa)} kr / m²` : "Boarea saknas")}
      </div>
      <div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Utgifter per år</div>
        <BarChart data={s.byYear} />
        <Legend items={[["Underhåll", "#F5B731"], ["Investering", "#374151"]]} />
      </div>
      <div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Fondsaldo över tid</div>
        <LineChart years={s.years} a={rec} b={cur} />
        <Legend items={[["Vid rekommenderad avsättning", "#F5B731"], ["Vid nuvarande avsättning", "#0D2B1E"]]} />
        <div style={{ fontSize: 12, color: COLORS.secondary, marginTop: 6 }}>
          Beräknat från ingående saldo och årlig avsättning, minus alla åtgärder i planen. Rekommenderad avsättning är planens snittutgift per år.
        </div>
      </div>
    </div>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: COLORS.secondary, marginTop: 6 }}>
      {items.map(([l, c]) => (
        <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, background: c, borderRadius: 2 }} /> {l}
        </span>
      ))}
    </div>
  );
}

function BarChart({ data }: { data: { year: number; inv: number; und: number }[] }) {
  const W = 900, H = 260, L = 56, R = 8, T = 10, B = 28;
  const max = Math.max(1, ...data.map((d) => d.inv + d.und));
  const bw = (W - L - R) / data.length;
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const step = Math.ceil(data.length / 12);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(max * t)} y2={y(max * t)} stroke="#E5E7EB" />
          <text x={L - 6} y={y(max * t) + 4} fontSize="11" textAnchor="end" fill="#6B7280">{mkr(max * t)}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = L + i * bw + bw * 0.15;
        const w = bw * 0.7;
        return (
          <g key={d.year}>
            <title>{`${d.year}: ${kr(d.inv + d.und)}`}</title>
            <rect x={x} y={y(d.und)} width={w} height={Math.max(0, y(0) - y(d.und))} fill="#F5B731" />
            <rect x={x} y={y(d.und + d.inv)} width={w} height={Math.max(0, y(d.und) - y(d.und + d.inv))} fill="#374151" />
            {i % step === 0 && <text x={x + w / 2} y={H - 8} fontSize="11" textAnchor="middle" fill="#6B7280">{d.year}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function LineChart({ years, a, b }: { years: number[]; a: number[]; b: number[] }) {
  const W = 900, H = 260, L = 56, R = 8, T = 10, B = 28;
  const all = [...a, ...b, 0];
  const min = Math.min(...all), max = Math.max(...all, 1);
  const y = (v: number) => T + (H - T - B) * (1 - (v - min) / (max - min || 1));
  const x = (i: number) => L + ((W - L - R) * i) / Math.max(1, years.length - 1);
  const pts = (s: number[]) => s.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const step = Math.ceil(years.length / 12);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
      {[min, 0, max].map((t, k) => (
        <g key={k}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#9CA3AF" : "#E5E7EB"} />
          <text x={L - 6} y={y(t) + 4} fontSize="11" textAnchor="end" fill="#6B7280">{mkr(t)}</text>
        </g>
      ))}
      <polyline points={pts(a)} fill="none" stroke="#F5B731" strokeWidth="2.5" />
      <polyline points={pts(b)} fill="none" stroke="#0D2B1E" strokeWidth="2.5" />
      {years.map((yr, i) =>
        i % step === 0 ? <text key={yr} x={x(i)} y={H - 8} fontSize="11" textAnchor="middle" fill="#6B7280">{yr}</text> : null,
      )}
    </svg>
  );
}

// ---------------- Inställningar + åtkomst (admin) ----------------
function Settings({ plan }: { plan: Plan }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: plan.name, start_year: String(plan.start_year), end_year: String(plan.end_year), vat_rate: String(plan.vat_rate),
    extra_cost_pct: String(plan.extra_cost_pct), annual_increase_pct: String(plan.annual_increase_pct),
    current_annual_savings: String(plan.current_annual_savings), fund_balance: String(plan.fund_balance),
    boa_sqm: plan.boa_sqm == null ? "" : String(plan.boa_sqm), round_to: String(plan.round_to),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("maintenance_plans").update({
        name: f.name.trim() || "Underhållsplan",
        start_year: Number(f.start_year), end_year: Number(f.end_year), vat_rate: Number(f.vat_rate) || 0,
        extra_cost_pct: Number(f.extra_cost_pct) || 0, annual_increase_pct: Number(f.annual_increase_pct) || 0,
        current_annual_savings: Number(f.current_annual_savings) || 0, fund_balance: Number(f.fund_balance) || 0,
        boa_sqm: f.boa_sqm ? Number(f.boa_sqm) : null, round_to: Number(f.round_to) || 1,
      }).eq("id", plan.id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Du saknar behörighet att ändra planen.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mplan", plan.property_id] });
      green("Sparat!");
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("maintenance_plans").delete().eq("id", plan.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mplan", plan.property_id] }),
    onError: (e) => toast.error(errMsg(e)),
  });

  const field = (label: string, k: keyof typeof f, type = "number") => (
    <div style={{ minWidth: 0 }}>
      <label style={labelStyle}>{label}</label>
      <input style={inputStyle} type={type} value={f[k]} onChange={set(k)} />
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 22, maxWidth: 720 }}>
      <div style={{ display: "grid", gap: 14 }}>
        {field("Namn", "name", "text")}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {field("Startår", "start_year")}
          {field("Slutår", "end_year")}
          {field("Moms (%)", "vat_rate")}
          {field("Kostnadstillägg byggherre (%)", "extra_cost_pct")}
          {field("Årlig uppräkning (%)", "annual_increase_pct")}
          {field("Boarea BOA (m²)", "boa_sqm")}
          {field("Nuvarande årlig avsättning (kr)", "current_annual_savings")}
          {field("Saldo i underhållsfond vid start (kr)", "fund_balance")}
          {field("Avrunda belopp till (kr, 1 = ingen)", "round_to")}
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button style={primaryBtn} onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Sparar…" : "Spara inställningar"}
          </button>
          <button
            style={{ ...primaryBtn, background: "#fff", color: COLORS.error, border: `1px solid ${COLORS.error}` }}
            onClick={() => {
              if (window.confirm("Ta bort hela underhållsplanen med alla åtgärder, bilder och kommentarer? Det går inte att ångra.")) remove.mutate();
            }}
          >
            <Trash2 size={16} /> Ta bort planen
          </button>
        </div>
      </div>
      <AccessPane plan={plan} />
    </div>
  );
}

function AccessPane({ plan }: { plan: Plan }) {
  const qc = useQueryClient();
  const peopleQ = useQuery({
    queryKey: ["mp-entreprenorer"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name").eq("role", "entreprenor").order("full_name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; full_name: string | null }>;
    },
  });
  const accessQ = useQuery({
    queryKey: ["mp-access", plan.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("maintenance_plan_access").select("profile_id").eq("plan_id", plan.id);
      if (error) throw error;
      return new Set(((data ?? []) as Array<{ profile_id: string }>).map((r) => r.profile_id));
    },
  });
  const toggle = useMutation({
    mutationFn: async ({ id, on }: { id: string; on: boolean }) => {
      if (on) {
        const { error } = await supabase.from("maintenance_plan_access").insert({ plan_id: plan.id, profile_id: id });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("maintenance_plan_access").delete().eq("plan_id", plan.id).eq("profile_id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mp-access", plan.id] }),
    onError: (e) => toast.error(errMsg(e)),
  });

  const people = peopleQ.data ?? [];
  const has = accessQ.data ?? new Set<string>();
  return (
    <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 18 }}>
      <div style={{ fontFamily: "Outfit, Inter, system-ui, sans-serif", fontSize: 18, fontWeight: 700 }}>Åtkomst för entreprenörer</div>
      <div style={{ fontSize: 13, color: COLORS.secondary, margin: "4px 0 12px" }}>
        Kryssa de entreprenörer som ska få se den här planen. De kan bara läsa. Styrelsen och admin har alltid åtkomst.
      </div>
      {people.length === 0 ? (
        <div style={{ color: COLORS.secondary, fontSize: 14 }}>Inga entreprenörer med konto finns ännu.</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {people.map((p) => (
            <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: `1px solid ${COLORS.border}`, borderRadius: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={has.has(p.id)} onChange={(e) => toggle.mutate({ id: p.id, on: e.target.checked })} disabled={toggle.isPending} />
              <span style={{ fontWeight: 600 }}>{p.full_name ?? "(namn saknas)"}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- Åtgärdsvy ----------------
type ModalTab = "detaljer" | "bilder" | "kommentarer";

function ActionModal({
  action, plan, withVat, onClose,
}: { action: Action | null; plan: Plan; withVat: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const canWrite = isAdmin || profile?.role === "styrelse";
  const [tab, setTab] = useState<ModalTab>("detaljer");
  const [f, setF] = useState({
    name: action?.name ?? "",
    category: action?.category ?? "",
    location: action?.location ?? "",
    year: String(action?.year ?? plan.start_year),
    interval_years: action?.interval_years ? String(action.interval_years) : "",
    prev_year: action?.prev_year ? String(action.prev_year) : "",
    quantity: String(action?.quantity ?? 1),
    unit: action?.unit ?? "st",
    unit_price: String(action?.unit_price ?? 0),
    kind: action?.kind ?? "underhall",
    status: action?.status ?? "planerad",
    label: action?.label ?? "",
    description: action?.description ?? "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });

  const refresh = () => qc.invalidateQueries({ queryKey: ["mactions", plan.id] });

  const save = useMutation({
    mutationFn: async () => {
      if (!f.name.trim()) throw new Error("Namn krävs");
      const payload = {
        name: f.name.trim(), category: f.category.trim() || null, location: f.location.trim() || null,
        year: Number(f.year), interval_years: f.interval_years ? Number(f.interval_years) : null,
        prev_year: f.prev_year ? Number(f.prev_year) : null, quantity: Number(f.quantity) || 1,
        unit: f.unit.trim() || "st", unit_price: Number(f.unit_price) || 0, kind: f.kind, status: f.status,
        label: f.label.trim() || null, description: f.description.trim() || null,
      };
      if (action) {
        const { data, error } = await supabase.from("maintenance_actions").update(payload).eq("id", action.id).select("id");
        if (error) throw error;
        if (!data?.length) throw new Error("Du saknar behörighet att ändra åtgärden.");
      } else {
        const { error } = await supabase.from("maintenance_actions").insert({ ...payload, plan_id: plan.id, property_id: plan.property_id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      refresh();
      green("Sparat!");
      if (!action) onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("maintenance_actions").delete().eq("id", action!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const tabBtn = (t: ModalTab, label: string) => (
    <button
      key={t}
      type="button"
      onClick={() => setTab(t)}
      style={{
        height: 38, padding: "0 14px", border: "none", background: "transparent", cursor: "pointer",
        borderBottom: `3px solid ${tab === t ? COLORS.primary : "transparent"}`,
        color: tab === t ? COLORS.text : COLORS.secondary, fontWeight: 700, fontSize: 14,
      }}
    >
      {label}
    </button>
  );

  const preview = costOf(
    { ...(action ?? ({} as Action)), quantity: Number(f.quantity) || 0, unit_price: Number(f.unit_price) || 0 } as Action,
    plan, withVat, Number(f.year) || plan.start_year,
  );

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: 16 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "min(720px, 100%)", marginTop: 24, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontFamily: "Outfit, Inter, system-ui, sans-serif" }}>{action ? action.name : "Ny åtgärd"}</h2>
          <button type="button" onClick={onClose} aria-label="Stäng" style={{ border: "none", background: "transparent", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>

        {action && (
          <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${COLORS.border}`, margin: "10px 0 14px" }}>
            {tabBtn("detaljer", "Detaljer")}
            {tabBtn("bilder", "Bilder")}
            {tabBtn("kommentarer", "Kommentarer")}
          </div>
        )}

        {(tab === "detaljer" || !action) && (
          <div style={{ display: "grid", gap: 12, marginTop: action ? 0 : 12 }}>
            {isAdmin ? (
              <>
                <div><label style={labelStyle}>Namn</label><input style={inputStyle} value={f.name} onChange={set("name")} /></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Kategori</label>
                    <input style={inputStyle} list="mp-cats" value={f.category} onChange={set("category")} />
                    <datalist id="mp-cats">{CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>
                  </div>
                  <div><label style={labelStyle}>Läge</label><input style={inputStyle} value={f.location} onChange={set("location")} /></div>
                  <div><label style={labelStyle}>År</label><input style={inputStyle} type="number" value={f.year} onChange={set("year")} /></div>
                  <div><label style={labelStyle}>Intervall (år)</label><input style={inputStyle} type="number" value={f.interval_years} onChange={set("interval_years")} /></div>
                  <div><label style={labelStyle}>Föregående år</label><input style={inputStyle} type="number" value={f.prev_year} onChange={set("prev_year")} /></div>
                  <div><label style={labelStyle}>Mängd</label><input style={inputStyle} type="number" value={f.quantity} onChange={set("quantity")} /></div>
                  <div><label style={labelStyle}>Enhet</label><input style={inputStyle} value={f.unit} onChange={set("unit")} /></div>
                  <div><label style={labelStyle}>Styckpris exkl. moms (kr)</label><input style={inputStyle} type="number" value={f.unit_price} onChange={set("unit_price")} /></div>
                  <div>
                    <label style={labelStyle}>Typ</label>
                    <select style={inputStyle} value={f.kind} onChange={set("kind")}>
                      <option value="underhall">Underhåll</option>
                      <option value="investering">Investering</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select style={inputStyle} value={f.status} onChange={set("status")}>
                      <option value="planerad">Planerad</option>
                      <option value="beslutad">Beslutad</option>
                      <option value="genomford">Genomförd</option>
                    </select>
                  </div>
                </div>
                <div><label style={labelStyle}>Märkning</label><input style={inputStyle} value={f.label} onChange={set("label")} placeholder="t.ex. Ta hjälp av projektledare" /></div>
                <div><label style={labelStyle}>Beskrivning</label><textarea style={textareaStyle} rows={5} value={f.description} onChange={set("description")} /></div>
                <div style={{ fontSize: 13, color: COLORS.secondary }}>
                  Per tillfälle {withVat ? "inkl." : "exkl."} moms: <strong>{kr(preview)}</strong>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button style={primaryBtn} onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Sparar…" : "Spara"}</button>
                  {action && (
                    <button
                      style={{ ...primaryBtn, background: "#fff", color: COLORS.error, border: `1px solid ${COLORS.error}` }}
                      onClick={() => {
                        if (window.confirm(`Ta bort "${action.name}"? Det går inte att ångra.`)) remove.mutate();
                      }}
                    >
                      <Trash2 size={16} /> Ta bort
                    </button>
                  )}
                </div>
              </>
            ) : (
              action && (
                <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
                  <div><strong>Kategori:</strong> {action.category ?? "—"} · <strong>Läge:</strong> {action.location ?? "—"}</div>
                  <div><strong>År:</strong> {action.year}{action.interval_years ? `, upprepas var ${action.interval_years}:e år` : ""}</div>
                  <div><strong>Mängd:</strong> {action.quantity} {action.unit} · <strong>Styckpris:</strong> {kr(Number(action.unit_price))} exkl. moms</div>
                  <div><strong>Per tillfälle:</strong> {kr(costOf(action, plan, withVat, action.year))} · <strong>Status:</strong> {STATUS_LABEL[action.status]} · {KIND_LABEL[action.kind]}</div>
                  {action.label && <div><Chip text={action.label} tone="pink" /></div>}
                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55, marginTop: 6 }}>{action.description || "Ingen beskrivning."}</div>
                </div>
              )
            )}
          </div>
        )}

        {action && tab === "bilder" && <ImagesPane action={action} plan={plan} canWrite={canWrite} />}
        {action && tab === "kommentarer" && <CommentsPane action={action} plan={plan} userId={user?.id ?? ""} isAdmin={isAdmin} canWrite={canWrite} />}
      </div>
    </div>
  );
}

function ImagesPane({ action, plan, canWrite }: { action: Action; plan: Plan; canWrite: boolean }) {
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["mimages", action.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("maintenance_images").select("*").eq("action_id", action.id).order("created_at");
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (data ?? []) as any[];
      if (!rows.length) return [];
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(rows.map((r) => r.path), 3600);
      return rows.map((r, i) => ({ ...r, url: signed?.[i]?.signedUrl ?? null }));
    },
  });

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || !user) return;
    setBusy(true);
    try {
      for (const file of files) {
        if (file.size > 15 * 1024 * 1024) throw new Error(`${file.name} är för stor (max 15 MB).`);
        const path = `${plan.property_id}/${action.id}/${crypto.randomUUID()}-${sanitizeStorageName(file.name)}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
        if (upErr) throw new Error(`${file.name}: ${upErr.message}`);
        const { error } = await supabase.from("maintenance_images").insert({
          action_id: action.id, property_id: plan.property_id, path, uploaded_by: user.id,
        });
        if (error) {
          await supabase.storage.from(BUCKET).remove([path]);
          throw error;
        }
      }
      green("Sparat!");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["mimages", action.id] });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function removeImage(img: any) {
    if (!window.confirm("Ta bort bilden? Det går inte att ångra.")) return;
    // Filen tas bort först: lagringsregeln läser raden för att se vem som äger filen.
    const { error: sErr } = await supabase.storage.from(BUCKET).remove([img.path]);
    if (sErr) return void toast.error(sErr.message);
    const { error } = await supabase.from("maintenance_images").delete().eq("id", img.id);
    if (error) return void toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["mimages", action.id] });
  }

  const imgs = q.data ?? [];
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {canWrite && (
        <div>
          <input ref={inputRef} type="file" accept="image/*" multiple onChange={onPick} style={{ display: "none" }} />
          <button style={{ ...primaryBtn, height: 40 }} onClick={() => inputRef.current?.click()} disabled={busy}>
            <Upload size={16} /> {busy ? "Laddar upp…" : "Lägg till bilder"}
          </button>
        </div>
      )}
      {imgs.length === 0 ? (
        <div style={{ color: COLORS.secondary, padding: 20, textAlign: "center" }}>Inga bilder ännu</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {imgs.map((img: any) => (
            <div key={img.id} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: "hidden" }}>
              <a href={img.url ?? undefined} target="_blank" rel="noreferrer">
                {img.url && <img src={img.url} alt="" loading="lazy" style={{ width: "100%", height: 110, objectFit: "cover", display: "block" }} />}
              </a>
              {(isAdmin || img.uploaded_by === user?.id) && (
                <button onClick={() => removeImage(img)} style={{ width: "100%", border: "none", background: "#fff", color: COLORS.error, padding: 6, cursor: "pointer", fontSize: 12 }}>
                  Ta bort
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CommentsPane({ action, plan, userId, isAdmin, canWrite }: { action: Action; plan: Plan; userId: string; isAdmin: boolean; canWrite: boolean }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const q = useQuery({
    queryKey: ["mcomments", action.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("maintenance_comments")
        .select("id, body, created_at, created_by, profiles:created_by(full_name)")
        .eq("action_id", action.id)
        .order("created_at");
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[];
    },
  });
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("maintenance_comments").insert({
        action_id: action.id, property_id: plan.property_id, body: text.trim(), created_by: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["mcomments", action.id] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("maintenance_comments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcomments", action.id] }),
    onError: (e) => toast.error(errMsg(e)),
  });

  const rows = q.data ?? [];
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {rows.length === 0 && <div style={{ color: COLORS.secondary, padding: 12 }}>Inga kommentarer ännu</div>}
      {rows.map((c) => (
        <div key={c.id} style={{ borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <strong>{c.profiles?.full_name ?? "Okänd"}</strong>
            <span style={{ color: COLORS.secondary }}>
              {new Date(c.created_at).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}
              {(isAdmin || c.created_by === userId) && (
                <button onClick={() => del.mutate(c.id)} style={{ border: "none", background: "transparent", color: COLORS.error, cursor: "pointer", marginLeft: 8 }}>
                  Ta bort
                </button>
              )}
            </span>
          </div>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 14, marginTop: 4, overflowWrap: "anywhere" }}>{c.body}</div>
        </div>
      ))}
      {canWrite && (
        <>
          <textarea style={textareaStyle} rows={3} placeholder="Skriv en kommentar…" value={text} onChange={(e) => setText(e.target.value)} />
          <div>
            <button style={{ ...primaryBtn, height: 40 }} disabled={!text.trim() || add.isPending} onClick={() => add.mutate()}>
              {add.isPending ? "Skickar…" : "Skicka"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
