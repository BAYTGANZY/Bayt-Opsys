import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { LIFECYCLE_OF } from "@/lib/issue-tokens";

// ---------- design tokens ----------
const T = {
  bg: "#EAECEF",
  card: "#FFFFFF",
  border: "#E5E7EB",
  divider: "#EEF0F2",
  text: "#1F2A37",
  secondary: "#6B7684",
  label: "#8A94A0",
  accent: "#4F7E2B",
  red: "#C63D2E",
  amber: "#D4951F",
  gray: "#9AA3AD",
  shadow: "0 1px 3px rgba(20,30,45,.06), 0 12px 28px rgba(20,30,45,.05)",
  radius: 16,
  outfit: "'Outfit', system-ui, sans-serif",
  body: "'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
};

// ---------- helpers ----------
function startOfDay(d: Date) {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
}
function daysAgo(n: number) {
  const d = startOfDay(new Date()); d.setDate(d.getDate() - n); return d;
}
function fmtTimestamp(d: Date) {
  const days = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"];
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${days[d.getDay()]} ${dd}/${mm} · ${hh}:${mi}`;
}

type Issue = { id: string; status: string; priority: string; created_at: string };

type Stats = {
  openTickets: number;
  newTicketsThisWeek: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
  ticketsLast7Days: number[];

  totalActiveReports: number;
  newReportsThisWeek: number;
  vilandeReports: number;
  openReports: number;
  resolvedReports: number;
  reportsLast7Days: number[];

  upcomingInspections: number;
  nextInspectionDate: string | null;
  activeProjects: number;
  activeProjectsTarget: number;

  propertyCount: number;
  apartmentCount: number;
  documentCount: number;
};

const EMPTY: Stats = {
  openTickets: 0, newTicketsThisWeek: 0, highPriority: 0, mediumPriority: 0, lowPriority: 0,
  ticketsLast7Days: [0, 0, 0, 0, 0, 0, 0],
  totalActiveReports: 0, newReportsThisWeek: 0, vilandeReports: 0, openReports: 0, resolvedReports: 0,
  reportsLast7Days: [0, 0, 0, 0, 0, 0, 0],
  upcomingInspections: 0, nextInspectionDate: null, activeProjects: 0, activeProjectsTarget: 10,
  propertyCount: 0, apartmentCount: 0, documentCount: 0,
};

// Buckets follow LIFECYCLE_OF — 'oppet' includes all three writer values
// (pagande from admin Aktivera, oppet from OppnaArendeButton, vantar), and
// 'ny' is vilande, not öppen. Unknown statuses fall back to vilande, same as
// deriveIssueStatus does.
const lifecycleOf = (status: string) => LIFECYCLE_OF[status] ?? "vilande";

async function loadStats(): Promise<Stats> {
  const weekAgo = daysAgo(6);
  const today = startOfDay(new Date());
  const in30 = new Date(today); in30.setDate(in30.getDate() + 30);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const [issuesRes, inspRes, projRes, propRes, aptRes, docRes] = await Promise.all([
    supabase.from("issues").select("id, status, priority, created_at"),
    supabase.from("inspections")
      .select("id, next_due_date")
      .gte("next_due_date", iso(today))
      .lte("next_due_date", iso(in30))
      .order("next_due_date", { ascending: true }),
    supabase.from("projects").select("id, status").eq("status", "aktiv"),
    supabase.from("properties").select("*", { count: "exact", head: true } as never),
    supabase.from("apartments").select("*", { count: "exact", head: true } as never),
    supabase.from("documents").select("*", { count: "exact", head: true } as never),
  ]);

  const issues = (issuesRes.data ?? []) as Issue[];
  const active = issues.filter((i) => lifecycleOf(i.status) !== "avslutat");
  const vilande = issues.filter((i) => lifecycleOf(i.status) === "vilande");
  const open = issues.filter((i) => lifecycleOf(i.status) === "oppet");
  const resolved = issues.filter((i) => lifecycleOf(i.status) === "avslutat");

  // tickets = urgent active tickets (akut + hog) — "kräver åtgärd"
  const urgent = active.filter((i) => i.priority === "akut" || i.priority === "hog");
  const high = urgent.length;
  const medium = active.filter((i) => i.priority === "normal").length;
  const low = active.filter((i) => i.priority === "lag").length;

  function bucket7(arr: Issue[]) {
    const buckets = [0, 0, 0, 0, 0, 0, 0];
    arr.forEach((i) => {
      const c = new Date(i.created_at);
      const diff = Math.floor((today.getTime() - startOfDay(c).getTime()) / 86400000);
      if (diff >= 0 && diff <= 6) buckets[6 - diff] += 1;
    });
    return buckets;
  }

  return {
    openTickets: urgent.length,
    newTicketsThisWeek: urgent.filter((i) => new Date(i.created_at) >= weekAgo).length,
    highPriority: high,
    mediumPriority: medium,
    lowPriority: low,
    ticketsLast7Days: bucket7(urgent),

    totalActiveReports: active.length,
    newReportsThisWeek: active.filter((i) => new Date(i.created_at) >= weekAgo).length,
    vilandeReports: vilande.length,
    openReports: open.length,
    resolvedReports: resolved.length,
    reportsLast7Days: bucket7(active),

    upcomingInspections: inspRes.data?.length ?? 0,
    nextInspectionDate: inspRes.data?.[0]?.next_due_date ?? null,
    activeProjects: projRes.data?.length ?? 0,
    activeProjectsTarget: 10,

    propertyCount: propRes.count ?? 0,
    apartmentCount: aptRes.count ?? 0,
    documentCount: docRes.count ?? 0,
  };
}

// ---------- bar chart ----------
function BarChart({ data, palette }: { data: number[]; palette: "red" | "amber" }) {
  const max = Math.max(1, ...data);
  const colors = palette === "red"
    ? ["#FCE4E0", "#F6B8AE", "#EE8C7E", "#E36A57", "#D55139", "#C63D2E", "#A82E22"]
    : ["#FBE9C9", "#F4D293", "#ECB85F", "#E1A435", "#D4951F", "#B97D14", "#9A660E"];
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 90, width: "100%" }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div
            style={{
              width: "100%",
              height: `${Math.max(6, (v / max) * 80)}px`,
              background: colors[Math.min(6, Math.floor((v / max) * 6))] ?? colors[0],
              borderRadius: 4,
              transition: "height 240ms ease",
            }}
          />
        </div>
      ))}
    </div>
  );
}

// ---------- main component ----------
export function OversiktDashboard() {
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [now, setNow] = useState(new Date());
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    loadStats().then(setStats).catch(() => setStats(EMPTY));
    const t = setInterval(() => setNow(new Date()), 60_000);
    const mql = window.matchMedia("(max-width: 768px)");
    const sync = () => setIsMobile(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => { clearInterval(t); mql.removeEventListener("change", sync); };
  }, []);

  const total = Math.max(1, stats.vilandeReports + stats.openReports + stats.resolvedReports);
  const segRed = (stats.vilandeReports / total) * 100;
  const segAmber = (stats.openReports / total) * 100;
  const segGray = 100 - segRed - segAmber;
  const projPct = Math.min(100, (stats.activeProjects / Math.max(1, stats.activeProjectsTarget)) * 100);

  const cardStyle: React.CSSProperties = {
    background: T.card,
    border: `1px solid ${T.border}`,
    borderRadius: T.radius,
    boxShadow: T.shadow,
    padding: 22,
  };

  return (
    <div style={{
      background: T.bg,
      fontFamily: T.body,
      color: T.text,
      padding: isMobile ? "20px 16px" : "28px 30px",
      display: "flex", flexDirection: "column", gap: 20,
      minHeight: "100%",
    }}>
      {/* Row 0 — title */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: T.outfit, fontWeight: 600, fontSize: 26, margin: 0, color: T.text }}>Översikt</h1>
        <div style={{ color: T.secondary, fontSize: 13 }}>{fmtTimestamp(now)}</div>
      </div>

      {/* Row 1 — hero cards */}
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 20 }}>
        {/* HERO 1 — Öppna ärenden */}
        <HeroCard
          title="Öppna ärenden"
          rightLabel="Kräver åtgärd"
          rightColor={T.red}
          bigNumber={stats.openTickets}
          bigColor={T.red}
          delta={`+${stats.newTicketsThisWeek} denna vecka`}
          deltaColor={T.red}
          subtext="ärenden att hantera"
          isMobile={isMobile}
          rightPanelLabel="Senaste 7 dagar"
          rightPanelChart={<BarChart data={stats.ticketsLast7Days} palette="red" />}
          mobileShowChart={false}
          breakdown={
            <div style={{ fontSize: 13, color: T.secondary, marginTop: 14, lineHeight: 1.7 }}>
              <span style={{ color: T.red, fontWeight: 600 }}>{stats.highPriority} hög</span>
              <span style={{ color: T.label, margin: "0 8px" }}>·</span>
              <span style={{ color: T.amber, fontWeight: 600 }}>{stats.mediumPriority} medel</span>
              <span style={{ color: T.label, margin: "0 8px" }}>·</span>
              <span style={{ color: T.gray, fontWeight: 600 }}>{stats.lowPriority} låg</span>
            </div>
          }
          link={{ to: "/oppna-arenden", label: "Visa alla ärenden →" }}
        />

        {/* HERO 2 — Felanmälan */}
        <HeroCard
          title="Felanmälan"
          rightLabel={`${stats.openReports} öppna`}
          rightColor={T.amber}
          bigNumber={stats.totalActiveReports}
          bigColor={T.amber}
          delta={`+${stats.newReportsThisWeek} denna vecka`}
          deltaColor={T.amber}
          subtext="aktiva felanmälningar"
          isMobile={isMobile}
          rightPanelLabel="Senaste 7 dagar"
          rightPanelChart={<BarChart data={stats.reportsLast7Days} palette="amber" />}
          mobileShowChart={true}
          breakdown={
            <div style={{ fontSize: 13, color: T.secondary, marginTop: 14, lineHeight: 1.7 }}>
              <span style={{ color: T.red, fontWeight: 600 }}>{stats.vilandeReports} nya</span>
              <span style={{ color: T.label, margin: "0 8px" }}>·</span>
              <span style={{ color: T.amber, fontWeight: 600 }}>{stats.openReports} öppna</span>
              <span style={{ color: T.label, margin: "0 8px" }}>·</span>
              <span style={{ color: T.gray, fontWeight: 600 }}>{stats.resolvedReports} avslutade</span>
            </div>
          }
          link={{ to: "/felanmalningar", label: "Visa alla →" }}
        />
      </div>

      {/* Row 2 — three small cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1.4fr",
        gap: 16,
      }}>
        {/* Besiktningar */}
        <Link
          to="/inspections"
          style={{
            ...cardStyle,
            display: "block",
            textDecoration: "none",
            color: "inherit",
            cursor: "pointer",
            transition: "box-shadow 0.15s, border-color 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = T.accent;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = T.border;
          }}
        >
          <div style={labelStyle()}>BESIKTNINGAR</div>
          <div style={smallNumberStyle()}>{stats.upcomingInspections}</div>
          <div style={{ color: T.secondary, fontSize: 13, marginTop: 6 }}>
            {stats.nextInspectionDate ? `Nästa: ${stats.nextInspectionDate}` : "Inga inbokade"}
          </div>
        </Link>

        {/* Aktiva projekt */}
        <Link
          to="/projects"
          style={{
            ...cardStyle,
            display: "block",
            textDecoration: "none",
            color: "inherit",
            cursor: "pointer",
            transition: "box-shadow 0.15s, border-color 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = T.accent;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = T.border;
          }}
        >
          <div style={labelStyle()}>AKTIVA PROJEKT</div>
          <div style={smallNumberStyle()}>{stats.activeProjects}</div>
          <div style={{ height: 4, background: T.divider, borderRadius: 3, marginTop: 12, overflow: "hidden" }}>
            <div style={{ width: `${projPct}%`, height: "100%", background: T.accent, borderRadius: 3, transition: "width 300ms" }} />
          </div>
          <div style={{ color: T.secondary, fontSize: 13, marginTop: 8 }}>
            {stats.activeProjects} av {stats.activeProjectsTarget} mål
          </div>
        </Link>

        {/* Aktiva felanmälningar */}
        <Link
          to="/issues"
          style={{
            ...cardStyle,
            gridColumn: isMobile ? "1 / -1" : "auto",
            display: "block",
            textDecoration: "none",
            color: "inherit",
            cursor: "pointer",
            transition: "box-shadow 0.15s, border-color 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = T.accent;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = T.border;
          }}
        >
          <div style={labelStyle()}>AKTIVA FELANMÄLNINGAR</div>
          <div style={smallNumberStyle()}>{stats.vilandeReports + stats.openReports + stats.resolvedReports}</div>
          <div style={{ display: "flex", height: 5, borderRadius: 3, overflow: "hidden", marginTop: 12, background: T.divider }}>
            <div style={{ width: `${segRed}%`, background: T.red }} />
            <div style={{ width: `${segAmber}%`, background: T.amber }} />
            <div style={{ width: `${segGray}%`, background: T.gray }} />
          </div>
          <div style={{ color: T.secondary, fontSize: 13, marginTop: 8 }}>
            {stats.vilandeReports} nya · {stats.openReports} öppna · {stats.resolvedReports} avslutade
          </div>
        </Link>
      </div>

      {/* Row 3 — Bestånd strip */}
      <div style={{ ...cardStyle, padding: "16px 22px" }}>
        <div style={{ ...labelStyle(), marginBottom: 12 }}>BESTÅND · ÄNDRAS SÄLLAN</div>
        <div style={{
          display: "flex", gap: 0, flexWrap: "wrap",
        }}>
          <BestandItem label="Fastigheter" value={stats.propertyCount} to="/fastigheter" first />
          <BestandItem label="Lägenheter" value={stats.apartmentCount} to="/apartments" />
          <BestandItem label="Dokument" value={stats.documentCount} to="/dokument" />
        </div>
      </div>
    </div>
  );
}

// ---------- subcomponents ----------
function HeroCard(props: {
  title: string;
  rightLabel: string;
  rightColor: string;
  bigNumber: number;
  bigColor: string;
  delta: string;
  deltaColor: string;
  subtext: string;
  isMobile: boolean;
  rightPanelLabel: string;
  rightPanelChart: React.ReactNode;
  mobileShowChart: boolean;
  breakdown: React.ReactNode;
  link: { to: string; label: string };
}) {
  const card: React.CSSProperties = {
    flex: 1,
    background: T.card,
    border: `1px solid ${T.border}`,
    borderRadius: T.radius,
    boxShadow: T.shadow,
    padding: 24,
    display: "flex",
    gap: 20,
    minWidth: 0,
  };
  return (
    <div style={card}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ fontFamily: T.outfit, fontWeight: 600, fontSize: 16, color: T.text }}>{props.title}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: props.rightColor }}>{props.rightLabel}</div>
        </div>
        <div style={{
          fontFamily: T.outfit, fontWeight: 600,
          fontSize: props.isMobile ? 64 : 84,
          color: props.bigColor, lineHeight: 1, marginTop: 8,
        }}>
          {props.bigNumber}
        </div>
        <div style={{ marginTop: 6 }}>
          <span style={{ color: props.deltaColor, fontWeight: 700, fontSize: 13 }}>{props.delta}</span>
          <span style={{ color: T.secondary, fontSize: 13, marginLeft: 8 }}>{props.subtext}</span>
        </div>

        {/* On mobile Felanmälan, show chart instead of breakdown */}
        {props.isMobile && props.mobileShowChart ? (
          <div style={{ marginTop: 16 }}>
            <div style={{ ...labelStyle(), marginBottom: 8 }}>{props.rightPanelLabel}</div>
            {props.rightPanelChart}
          </div>
        ) : (
          props.breakdown
        )}

        <div style={{ marginTop: "auto", paddingTop: 16 }}>
          <Link to={props.link.to} style={accentLink()}>{props.link.label}</Link>
        </div>
      </div>

      {/* Right panel — desktop only */}
      {!props.isMobile && (
        <div style={{ width: 160, borderLeft: `1px solid ${T.divider}`, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={labelStyle()}>{props.rightPanelLabel}</div>
          {props.rightPanelChart}
        </div>
      )}
    </div>
  );
}

function BestandItem({ label, value, to, first }: { label: string; value: number; to: string; first?: boolean }) {
  return (
    <div style={{
      flex: 1, minWidth: 180,
      padding: "4px 24px",
      borderLeft: first ? "none" : `1px solid ${T.divider}`,
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ color: T.label, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: T.mono, fontWeight: 600, fontSize: 24, color: T.text }}>{value}</div>
      <Link to={to} style={{ ...accentLink(), marginTop: 2 }}>Visa →</Link>
    </div>
  );
}

function labelStyle(): React.CSSProperties {
  return {
    fontSize: 10, color: T.label, fontWeight: 600,
    letterSpacing: "0.12em", textTransform: "uppercase",
  };
}
function smallNumberStyle(): React.CSSProperties {
  return { fontFamily: T.outfit, fontWeight: 600, fontSize: 38, color: T.text, marginTop: 10, lineHeight: 1.1 };
}
function accentLink(): React.CSSProperties {
  return { color: T.accent, fontSize: 13, fontWeight: 600, textDecoration: "none", display: "inline-block" };
}


