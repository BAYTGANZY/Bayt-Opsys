import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { canAccess } from "@/lib/permissions";
import {
  deriveIssueStatus,
  deriveInspectionStatus,
  deriveProjectStatus,
  derivePriority,
  LIFECYCLE_OF,
  type DerivedStatus,
} from "@/lib/issue-tokens";
import { inspectionTypeLabel } from "@/lib/inspection-tokens";

const logo = `${import.meta.env.BASE_URL}assets/bayt-logo.png`;
const sketch = `${import.meta.env.BASE_URL}assets/building-sketch-2.png`;

export const Route = createFileRoute("/styrelse")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Översikt — BAYT" }] }),
  component: StyrelsePage,
});

type Kind = "issue" | "inspection" | "project";
type Lifecycle = "vilande" | "oppet" | "avslutat";
type Level = "ok" | "warn" | "bad";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

type Property = { id: string; name: string; address: string | null; image_url: string | null };

type Entry = {
  kind: Kind;
  id: string;
  title: string;
  propertyId: string | null;
  lifecycle: Lifecycle;
  status: DerivedStatus;
  akut: boolean;
  updatedAt: string | null;
  startDate: string | null;
  endDate: string | null;
};

const TABLE: Record<Kind, string> = { issue: "issues", inspection: "inspections", project: "projects" };
const PATH: Record<Kind, string> = { issue: "issues", inspection: "inspections", project: "projects" };
const KIND_LABEL: Record<Kind, string> = { issue: "Felanmälan", inspection: "Kontroll", project: "Projekt" };
const LEVEL_LABEL: Record<Level, string> = { ok: "Under kontroll", warn: "Uppmärksamhet", bad: "Åtgärd krävs" };

const NAV: Array<{ to: string; label: string }> = [
  { to: "/dag-rapport", label: "Dag Rapport" },
  { to: "/fastigheter", label: "Fastigheter" },
  { to: "/issues", label: "Felanmälningar" },
  { to: "/inspections", label: "Besiktningar" },
  { to: "/projects", label: "Projekt" },
  { to: "/loggbok", label: "Loggbok" },
  { to: "/chatt", label: "Chatt" },
  { to: "/installningar", label: "Inställningar" },
];

const dateFmt = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", year: "numeric" });
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? "—" : dateFmt.format(d);
}

function lifecycleFor(kind: Kind, row: Row): Lifecycle {
  const map = LIFECYCLE_OF as Record<string, Lifecycle>;
  if (kind === "issue") return map[String(row.status ?? "")] ?? "vilande";
  if (row.arende_status) return map[String(row.arende_status)] ?? "vilande";
  const legacy = String(row.status ?? "");
  if (kind === "inspection") return legacy === "klar" ? "avslutat" : "oppet";
  return legacy === "klar" || legacy === "avbruten" ? "avslutat" : "oppet";
}

function toEntries(kind: Kind, rows: Row[]): Entry[] {
  return rows.map((row) => {
    let status: DerivedStatus;
    let title: string;
    let akut = false;
    if (kind === "issue") {
      const prio = derivePriority(row.deadline || null, { from: row.created_at });
      akut = prio.key === "akut";
      status = deriveIssueStatus({
        status: row.status,
        priority: prio.key,
        created_at: row.created_at,
        deadline: row.deadline || null,
      });
      title = row.title || "Felanmälan";
    } else if (kind === "inspection") {
      status = deriveInspectionStatus({
        status: row.status ?? null,
        arende_status: row.arende_status ?? null,
        next_due_date: row.next_due_date ?? null,
        last_completed_date: row.last_completed_date ?? null,
        interval_months: row.interval_months ?? null,
      });
      title = inspectionTypeLabel(row.inspection_type);
    } else {
      status = deriveProjectStatus({
        status: row.status ?? null,
        arende_status: row.arende_status ?? null,
        start_date: row.start_date ?? null,
        end_date: row.end_date ?? null,
      });
      title = row.title || "Projekt";
    }
    return {
      kind,
      id: row.id as string,
      title,
      propertyId: (row.property_id as string | null) ?? null,
      lifecycle: lifecycleFor(kind, row),
      status,
      akut,
      updatedAt: (row.updated_at as string | null) ?? (row.created_at as string | null) ?? null,
      startDate: (row.start_date as string | null) ?? null,
      endDate: (row.end_date as string | null) ?? null,
    };
  });
}

const isActive = (e: Entry) => e.lifecycle !== "avslutat";
const isOverdue = (e: Entry) => isActive(e) && e.status.daysLeft != null && e.status.daysLeft < 0;

function levelOf(entries: Entry[]): Level {
  const active = entries.filter(isActive);
  if (active.some((e) => isOverdue(e) || e.akut)) return "bad";
  if (active.some((e) => e.kind === "inspection" && e.status.daysLeft != null && e.status.daysLeft <= 30)) return "warn";
  return "ok";
}

function timeProgress(e: Entry): number | null {
  if (!e.startDate || !e.endDate) return null;
  const s = new Date(`${e.startDate}T00:00:00`).getTime();
  const en = new Date(`${e.endDate}T00:00:00`).getTime();
  if (!(en > s)) return null;
  return Math.max(0, Math.min(100, Math.round(((Date.now() - s) / (en - s)) * 100)));
}

function daysChip(daysLeft: number | null): { text: string; cls: string } {
  if (daysLeft == null) return { text: "Ingen tidsgräns", cls: "sv-chip-muted" };
  if (daysLeft < 0) return { text: `${-daysLeft} ${-daysLeft === 1 ? "dag" : "dagar"} försenad`, cls: "sv-chip-bad" };
  if (daysLeft === 0) return { text: "Idag", cls: "sv-chip-warn" };
  if (daysLeft <= 30) return { text: `${daysLeft} dagar`, cls: "sv-chip-warn" };
  return { text: `${daysLeft} dagar`, cls: "sv-chip-ok" };
}

const STYLES = `
  .sv-page {
    min-height: 100vh; min-height: 100dvh; box-sizing: border-box; max-width: 100vw; overflow-x: hidden;
    background: radial-gradient(ellipse at top, #15332c 0%, #0b1d17 70%);
    color: #e6efd8; font-family: Inter, system-ui, sans-serif; padding: 0 0 56px;
  }
  .sv-wrap { max-width: 1240px; margin: 0 auto; padding: 0 32px; }
  .sv-top { display: flex; align-items: center; gap: 20px; padding: 22px 0 14px; }
  .sv-logo { height: 36px; display: block; flex-shrink: 0; }
  .sv-nav { display: flex; gap: 4px; flex: 1; overflow-x: auto; scrollbar-width: none; }
  .sv-nav::-webkit-scrollbar { display: none; }
  .sv-nav a {
    padding: 8px 12px; border-radius: 8px; font-size: 13.5px; text-decoration: none; color: #9fb79f; white-space: nowrap;
  }
  .sv-nav a:hover { color: #fff; background: rgba(255,255,255,0.06); }
  .sv-user { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
  .sv-user-name { font-size: 13px; color: #c9d6c3; text-align: right; line-height: 1.25; }
  .sv-user-role { font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: #7a9476; }
  .sv-out {
    height: 36px; padding: 0 12px; border-radius: 8px; font-size: 12.5px; cursor: pointer; font-family: inherit;
    background: transparent; color: #9fb79f; border: 1px solid rgba(151,186,72,0.2);
  }
  .sv-out:hover { color: #fff; border-color: rgba(92,184,74,0.6); }

  .sv-hero { position: relative; border-radius: 22px; overflow: hidden; margin-top: 8px; min-height: 270px; display: flex; align-items: flex-end; }
  .sv-hero-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .sv-hero-img.sv-sketch { object-fit: contain; object-position: right center; opacity: 0.35; }
  .sv-hero::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(11,29,23,0.96) 0%, rgba(11,29,23,0.78) 45%, rgba(11,29,23,0.25) 100%); }
  .sv-hero-body { position: relative; z-index: 1; padding: 40px 44px; max-width: 760px; }
  .sv-hello { color: #5CB84A; font-size: 17px; font-weight: 600; margin: 0 0 8px; }
  .sv-headline { font-family: Outfit, Inter, system-ui, sans-serif; font-size: 44px; line-height: 1.1; font-weight: 600; margin: 0 0 14px; }
  .sv-headline.bad { color: #ffb4b4; }
  .sv-sub { font-size: 15.5px; line-height: 1.55; color: #c3d1bd; margin: 0; }

  .sv-kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px; margin-top: 16px; }
  .sv-kpi { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); border-radius: 16px; padding: 18px 18px 16px; }
  .sv-kpi-label { font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: #8aa38a; }
  .sv-kpi-n { font-family: Outfit, Inter, system-ui, sans-serif; font-size: 40px; font-weight: 600; line-height: 1.1; margin: 8px 0 4px; }
  .sv-kpi-sub { font-size: 12.5px; color: #8aa38a; }
  .sv-kpi.bad { border-color: rgba(255,120,120,0.4); background: rgba(255,90,90,0.08); }
  .sv-kpi.bad .sv-kpi-n { color: #ffb4b4; }
  .sv-kpi.good .sv-kpi-n { color: #8be07a; }

  .sv-h2 { font-family: Outfit, Inter, system-ui, sans-serif; font-size: 20px; font-weight: 600; margin: 34px 0 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .sv-link { font-size: 13px; font-weight: 500; color: #5CB84A; text-decoration: none; font-family: Inter, system-ui, sans-serif; }
  .sv-link:hover { text-decoration: underline; }

  .sv-props { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
  .sv-prop {
    position: relative; text-align: left; font: inherit; color: #fff; cursor: pointer; border-radius: 18px; overflow: hidden;
    border: 1px solid rgba(255,255,255,0.1); background: #0d2b1e; padding: 0; aspect-ratio: 16 / 10; display: block;
    transition: transform 0.15s ease, border-color 0.15s ease;
  }
  .sv-prop:hover { transform: translateY(-2px); border-color: rgba(92,184,74,0.7); }
  .sv-prop[aria-pressed="true"] { border-color: #5CB84A; box-shadow: 0 0 0 2px rgba(92,184,74,0.45); }
  .sv-prop img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .sv-prop img.sv-sketch { object-fit: contain; opacity: 0.35; padding: 12px; }
  .sv-prop::after { content: ""; position: absolute; inset: 0; background: linear-gradient(to top, rgba(8,22,17,0.95) 0%, rgba(8,22,17,0.15) 60%, rgba(8,22,17,0.45) 100%); }
  .sv-prop-badge { position: absolute; top: 12px; right: 12px; z-index: 2; }
  .sv-prop-body { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2; padding: 14px 16px; }
  .sv-prop-name { font-family: Outfit, Inter, system-ui, sans-serif; font-size: 18px; font-weight: 600; }
  .sv-prop-addr { font-size: 12.5px; color: #b9c8b4; margin-top: 2px; }
  .sv-prop-stats { display: flex; gap: 14px; margin-top: 10px; font-size: 12.5px; color: #d3e0cf; flex-wrap: wrap; }

  .sv-badge { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 999px; font-size: 12px; font-weight: 600; backdrop-filter: blur(4px); }
  .sv-badge::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
  .sv-badge.ok { color: #8be07a; background: rgba(61,138,48,0.35); }
  .sv-badge.warn { color: #ffd37a; background: rgba(210,150,20,0.3); }
  .sv-badge.bad { color: #ffb4b4; background: rgba(220,60,60,0.35); }

  .sv-filter { display: flex; align-items: center; gap: 10px; margin: 0 0 4px; font-size: 13.5px; color: #c3d1bd; flex-wrap: wrap; }
  .sv-filter button { height: 30px; padding: 0 12px; border-radius: 999px; border: 1px solid rgba(92,184,74,0.5); background: rgba(92,184,74,0.12); color: #cfe9c8; cursor: pointer; font: inherit; font-size: 12.5px; }

  .sv-cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
  .sv-panel { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); border-radius: 18px; padding: 6px 0; min-width: 0; }
  .sv-panel-head { padding: 14px 18px 10px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .sv-panel-title { font-size: 15px; font-weight: 600; }
  .sv-empty { padding: 18px; color: #8aa38a; font-size: 14px; }
  .sv-row {
    display: flex; align-items: center; gap: 14px; padding: 13px 18px; text-decoration: none; color: inherit;
    border-top: 1px solid rgba(255,255,255,0.06);
  }
  a.sv-row:hover { background: rgba(255,255,255,0.05); }
  .sv-row-main { flex: 1; min-width: 0; }
  .sv-row-title { font-size: 14.5px; font-weight: 600; overflow-wrap: anywhere; }
  .sv-row-sub { font-size: 12.5px; color: #8aa38a; margin-top: 2px; }
  .sv-row-right { flex-shrink: 0; text-align: right; display: grid; gap: 6px; justify-items: end; }
  .sv-chip { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
  .sv-chip-bad { color: #ffb4b4; background: rgba(220,60,60,0.22); }
  .sv-chip-warn { color: #ffd37a; background: rgba(210,150,20,0.2); }
  .sv-chip-ok { color: #8be07a; background: rgba(61,138,48,0.25); }
  .sv-chip-muted { color: #8aa38a; background: rgba(255,255,255,0.06); }
  .sv-bar { width: 120px; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.1); overflow: hidden; }
  .sv-bar > div { height: 100%; background: #5CB84A; }
  .sv-note { margin-top: 26px; font-size: 12.5px; color: #6f8a70; line-height: 1.5; }

  @media (max-width: 1100px) {
    .sv-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .sv-headline { font-size: 36px; }
  }
  @media (max-width: 860px) {
    .sv-cols { grid-template-columns: minmax(0, 1fr); }
  }
  @media (max-width: 768px) {
    .sv-wrap { padding: 0 14px; }
    .sv-top { flex-wrap: wrap; gap: 10px; padding-top: 16px; }
    .sv-logo { height: 30px; }
    .sv-nav { order: 3; flex-basis: 100%; }
    .sv-user { margin-left: auto; }
    .sv-user-name { display: none; }
    .sv-hero { min-height: 240px; border-radius: 18px; }
    .sv-hero-body { padding: 26px 22px; }
    .sv-headline { font-size: 28px; }
    .sv-sub { font-size: 14px; }
    .sv-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .sv-kpi { padding: 14px; }
    .sv-kpi-n { font-size: 32px; }
    .sv-row { flex-wrap: wrap; padding: 12px 14px; }
    .sv-row-right { width: 100%; grid-auto-flow: column; justify-content: space-between; justify-items: start; }
    .sv-bar { width: 90px; }
  }
`;

function Panel({
  title,
  to,
  children,
}: {
  title: string;
  to?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="sv-panel">
      <div className="sv-panel-head">
        <div className="sv-panel-title">{title}</div>
        {to && (
          <Link to={to as never} className="sv-link">
            Visa alla
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

function EntryRow({
  e,
  propName,
  right,
}: {
  e: Entry;
  propName: string;
  right: React.ReactNode;
}) {
  return (
    <Link to={`/${PATH[e.kind]}/${e.id}` as never} className="sv-row">
      <div className="sv-row-main">
        <div className="sv-row-title">{e.title}</div>
        <div className="sv-row-sub">
          {KIND_LABEL[e.kind]} · {propName}
        </div>
      </div>
      <div className="sv-row-right">{right}</div>
    </Link>
  );
}

function StyrelsePage() {
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [name, setName] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        setRole(null);
        return;
      }
      const { data: p } = await supabase
        .from("profiles")
        .select("role, full_name")
        .eq("id", data.session.user.id)
        .maybeSingle();
      setRole((p?.role as string | undefined) ?? null);
      setName((p?.full_name as string | undefined) ?? null);
    });
  }, []);

  const allowed = role === "styrelse" || role === "admin";

  const propsQ = useQuery({
    queryKey: ["sv-properties"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id, name, address, image_url").order("name");
      if (error) throw error;
      return (data ?? []) as Property[];
    },
  });

  const kindQ = (kind: Kind) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuery({
      queryKey: ["sv-items", kind],
      enabled: allowed,
      queryFn: async () => {
        const { data, error } = await supabase.from(TABLE[kind]).select("*");
        if (error) throw error;
        return toEntries(kind, (data ?? []) as Row[]);
      },
    });
  const issuesQ = kindQ("issue");
  const inspectionsQ = kindQ("inspection");
  const projectsQ = kindQ("project");

  const properties = propsQ.data ?? [];
  const propMap = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties]);
  const propName = (id: string | null) => (id ? propMap.get(id)?.name ?? "—" : "—");

  const all = useMemo(
    () =>
      [...(issuesQ.data ?? []), ...(inspectionsQ.data ?? []), ...(projectsQ.data ?? [])].filter(
        (e) => e.propertyId && propMap.has(e.propertyId),
      ),
    [issuesQ.data, inspectionsQ.data, projectsQ.data, propMap],
  );
  const scoped = useMemo(() => (sel ? all.filter((e) => e.propertyId === sel) : all), [all, sel]);

  const loading = propsQ.isLoading || issuesQ.isLoading || inspectionsQ.isLoading || projectsQ.isLoading;

  const perProperty = useMemo(
    () =>
      properties.map((p) => {
        const entries = all.filter((e) => e.propertyId === p.id);
        const active = entries.filter(isActive);
        const nextInspection = active
          .filter((e) => e.kind === "inspection" && e.status.dueDate)
          .sort((a, b) => (a.status.dueDate ?? "").localeCompare(b.status.dueDate ?? ""))[0];
        return {
          property: p,
          level: levelOf(entries),
          activeCount: active.filter((e) => e.kind !== "project").length,
          projectCount: active.filter((e) => e.kind === "project").length,
          nextDue: nextInspection?.status.dueDate ?? null,
        };
      }),
    [properties, all],
  );

  const active = scoped.filter(isActive);
  const needsAttention = active
    .filter((e) => isOverdue(e) || e.akut)
    .sort((a, b) => (a.status.daysLeft ?? 9999) - (b.status.daysLeft ?? 9999));
  const overdueCount = active.filter(isOverdue).length;
  const upcoming = active
    .filter((e) => e.kind === "inspection" && e.status.dueDate)
    .sort((a, b) => (a.status.dueDate ?? "").localeCompare(b.status.dueDate ?? ""));
  const upcoming90 = upcoming.filter((e) => e.status.daysLeft != null && e.status.daysLeft >= 0 && e.status.daysLeft <= 90);
  const projects = active.filter((e) => e.kind === "project");
  const cutoff = Date.now() - 30 * 86400000;
  const resolved = scoped
    .filter((e) => e.lifecycle === "avslutat" && e.updatedAt && new Date(e.updatedAt).getTime() >= cutoff)
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  const openIssues = active.filter((e) => e.kind === "issue");

  const selectedProp = sel ? propMap.get(sel) ?? null : null;
  const heroProp = selectedProp ?? properties.find((p) => p.image_url) ?? null;
  const heroImg = heroProp?.image_url ?? null;

  const firstName = name?.trim().split(/\s+/)[0] ?? "";
  const headline =
    needsAttention.length > 0
      ? `${needsAttention.length} ${needsAttention.length === 1 ? "sak kräver" : "saker kräver"} din uppmärksamhet.`
      : "Allt är under kontroll.";
  const subline = (() => {
    const parts: string[] = [];
    const n = selectedProp ? 1 : properties.length;
    parts.push(selectedProp ? selectedProp.name : `${n} ${n === 1 ? "fastighet" : "fastigheter"}`);
    parts.push(`${openIssues.length} ${openIssues.length === 1 ? "öppen felanmälan" : "öppna felanmälningar"}`);
    parts.push(`${projects.length} ${projects.length === 1 ? "pågående projekt" : "pågående projekt"}`);
    if (upcoming90.length > 0) parts.push(`${upcoming90.length} ${upcoming90.length === 1 ? "kontroll" : "kontroller"} de närmaste 90 dagarna`);
    return parts.join(" · ");
  })();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const nav = NAV.filter((n) => canAccess(role, n.to));

  return (
    <>
      <style>{STYLES}</style>
      <div className="sv-page">
        <div className="sv-wrap">
          <div className="sv-top">
            <img src={logo} alt="BAYT" className="sv-logo" />
            <nav className="sv-nav" aria-label="Meny">
              {nav.map((n) => (
                <Link key={n.to} to={n.to as never}>
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="sv-user">
              <div className="sv-user-name">
                {name ?? ""}
                <div className="sv-user-role">{role === "styrelse" ? "Styrelse" : role === "admin" ? "Förhandsvisning" : ""}</div>
              </div>
              <button type="button" className="sv-out" onClick={handleLogout}>
                Logga ut
              </button>
            </div>
          </div>

          {role === undefined && <div className="sv-empty">Laddar…</div>}

          {role !== undefined && !allowed && (
            <div className="sv-empty">
              Den här sidan är till för styrelse och fastighetsägare.{" "}
              <Link to={"/start" as never} className="sv-link">
                Till startsidan
              </Link>
            </div>
          )}

          {allowed && !loading && properties.length === 0 && (
            <div className="sv-empty">Inga fastigheter är kopplade till ditt konto ännu. Kontakta förvaltaren.</div>
          )}

          {allowed && properties.length > 0 && (
            <>
              <section className="sv-hero">
                {heroImg ? (
                  <img src={heroImg} alt="" className="sv-hero-img" />
                ) : (
                  <img src={sketch} alt="" className="sv-hero-img sv-sketch" />
                )}
                <div className="sv-hero-body">
                  <p className="sv-hello">Välkommen{firstName ? `, ${firstName}` : ""}</p>
                  <h1 className={`sv-headline${needsAttention.length > 0 ? " bad" : ""}`}>{loading ? "Hämtar läget…" : headline}</h1>
                  <p className="sv-sub">{loading ? "" : subline}</p>
                </div>
              </section>

              <div className="sv-kpis">
                <div className="sv-kpi">
                  <div className="sv-kpi-label">Fastigheter</div>
                  <div className="sv-kpi-n">{selectedProp ? 1 : properties.length}</div>
                  <div className="sv-kpi-sub">{selectedProp ? selectedProp.name : "I din portfölj"}</div>
                </div>
                <div className={`sv-kpi${overdueCount > 0 ? " bad" : ""}`}>
                  <div className="sv-kpi-label">Öppna felanmälningar</div>
                  <div className="sv-kpi-n">{openIssues.length}</div>
                  <div className="sv-kpi-sub">
                    {overdueCount > 0 ? `${overdueCount} försenade` : "Inga försenade"}
                  </div>
                </div>
                <div className="sv-kpi">
                  <div className="sv-kpi-label">Pågående projekt</div>
                  <div className="sv-kpi-n">{projects.length}</div>
                  <div className="sv-kpi-sub">Aktiva just nu</div>
                </div>
                <div className="sv-kpi">
                  <div className="sv-kpi-label">Kommande kontroller</div>
                  <div className="sv-kpi-n">{upcoming90.length}</div>
                  <div className="sv-kpi-sub">Inom 90 dagar</div>
                </div>
                <div className="sv-kpi good">
                  <div className="sv-kpi-label">Avklarat</div>
                  <div className="sv-kpi-n">{resolved.length}</div>
                  <div className="sv-kpi-sub">Senaste 30 dagarna</div>
                </div>
              </div>

              <h2 className="sv-h2">Fastighetsöversikt</h2>
              {selectedProp && (
                <div className="sv-filter">
                  <span>Visar bara {selectedProp.name}.</span>
                  <button type="button" onClick={() => setSel(null)}>
                    Visa alla fastigheter
                  </button>
                </div>
              )}
              <div className="sv-props">
                {perProperty.map(({ property: p, level, activeCount, projectCount, nextDue }) => (
                  <button
                    key={p.id}
                    type="button"
                    className="sv-prop"
                    aria-pressed={sel === p.id}
                    onClick={() => setSel((cur) => (cur === p.id ? null : p.id))}
                  >
                    {p.image_url ? <img src={p.image_url} alt="" /> : <img src={sketch} alt="" className="sv-sketch" />}
                    <span className="sv-prop-badge">
                      <span className={`sv-badge ${level}`}>{LEVEL_LABEL[level]}</span>
                    </span>
                    <span className="sv-prop-body">
                      <div className="sv-prop-name">{p.name}</div>
                      {p.address && <div className="sv-prop-addr">{p.address}</div>}
                      <div className="sv-prop-stats">
                        <span>{activeCount} aktiva ärenden</span>
                        <span>{projectCount} projekt</span>
                        <span>Nästa kontroll: {nextDue ? fmtDate(nextDue) : "—"}</span>
                      </div>
                    </span>
                  </button>
                ))}
              </div>

              <h2 className="sv-h2">Läget just nu</h2>
              <div className="sv-cols">
                <Panel title="Kräver uppmärksamhet" to="/issues">
                  {needsAttention.length === 0 && <div className="sv-empty">Inget är försenat eller akut. 👍</div>}
                  {needsAttention.slice(0, 8).map((e) => {
                    const chip = e.akut && !isOverdue(e) ? { text: "Akut", cls: "sv-chip-bad" } : daysChip(e.status.daysLeft);
                    return (
                      <EntryRow
                        key={`${e.kind}-${e.id}`}
                        e={e}
                        propName={propName(e.propertyId)}
                        right={<span className={`sv-chip ${chip.cls}`}>{chip.text}</span>}
                      />
                    );
                  })}
                </Panel>

                <Panel title="Kommande kontroller" to="/inspections">
                  {upcoming.length === 0 && <div className="sv-empty">Inga kontroller är planerade.</div>}
                  {upcoming.slice(0, 8).map((e) => {
                    const chip = daysChip(e.status.daysLeft);
                    return (
                      <EntryRow
                        key={`${e.kind}-${e.id}`}
                        e={e}
                        propName={propName(e.propertyId)}
                        right={
                          <>
                            <span className="sv-row-sub" style={{ margin: 0 }}>
                              {fmtDate(e.status.dueDate)}
                            </span>
                            <span className={`sv-chip ${chip.cls}`}>{chip.text}</span>
                          </>
                        }
                      />
                    );
                  })}
                </Panel>

                <Panel title="Pågående projekt" to="/projects">
                  {projects.length === 0 && <div className="sv-empty">Inga projekt pågår just nu.</div>}
                  {projects.slice(0, 8).map((e) => {
                    const pct = timeProgress(e);
                    return (
                      <EntryRow
                        key={`${e.kind}-${e.id}`}
                        e={e}
                        propName={propName(e.propertyId)}
                        right={
                          pct == null ? (
                            <span className="sv-chip sv-chip-muted">Ingen tidplan</span>
                          ) : (
                            <>
                              <span className="sv-row-sub" style={{ margin: 0 }}>
                                Klart {fmtDate(e.endDate)}
                              </span>
                              <span className="sv-bar" title={`${pct}% av tiden har gått`}>
                                <div style={{ width: `${pct}%` }} />
                              </span>
                            </>
                          )
                        }
                      />
                    );
                  })}
                </Panel>

                <Panel title="Avklarat senaste 30 dagarna">
                  {resolved.length === 0 && <div className="sv-empty">Inget avslutat den senaste månaden.</div>}
                  {resolved.slice(0, 8).map((e) => (
                    <EntryRow
                      key={`${e.kind}-${e.id}`}
                      e={e}
                      propName={propName(e.propertyId)}
                      right={
                        <>
                          <span className="sv-chip sv-chip-ok">Avslutad</span>
                          <span className="sv-row-sub" style={{ margin: 0 }}>
                            {fmtDate(e.updatedAt)}
                          </span>
                        </>
                      }
                    />
                  ))}
                </Panel>
              </div>

              <p className="sv-note">
                Siffrorna hämtas direkt ur portalen. Projektens stapel visar hur stor del av tidplanen som har gått,
                och "avklarat" räknar ärenden som avslutats eller senast ändrats de senaste 30 dagarna.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
