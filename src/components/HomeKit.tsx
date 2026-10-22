import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { canAccess } from "@/lib/permissions";

// BAYT-ordet som vektorgrafik (ljusgrön toning + glöd), uppmätt från originalloggan.
const WORD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="90 720 1760 490">
<defs>
<linearGradient id="l" gradientUnits="userSpaceOnUse" x1="0" y1="783" x2="0" y2="1152"><stop offset="0" stop-color="#7fe08a"/><stop offset="1" stop-color="#2f9a48"/></linearGradient>
<linearGradient id="h" gradientUnits="userSpaceOnUse" x1="0" y1="1005" x2="0" y2="1152"><stop offset="0" stop-color="#a6f58f"/><stop offset="1" stop-color="#4fc243"/></linearGradient>
<filter id="g" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="14"/></filter>
<g id="w">
<path fill-rule="evenodd" d="M150,783 H380 C470,783 505,830 505,880 C505,915 485,945 458,957 C500,970 525,1010 525,1050 C525,1110 480,1152 390,1152 H150 Z M220,848 H370 C415,848 432,865 432,890 C432,915 412,932 370,932 H220 Z M220,993 H385 C430,993 448,1015 448,1040 C448,1068 428,1090 380,1090 H220 Z"/>
<polygon points="543,1152 797,783 1047,1152 962,1152 797,908 627,1152"/>
<polygon points="968,783 1055,783 1199,943 1343,783 1430,783 1237,1005 1237,1152 1160,1152 1160,1005"/>
<rect x="1448" y="783" width="332" height="65"/>
<rect x="1580" y="848" width="70" height="304"/>
</g>
</defs>
<use href="#w" fill="#3fae5a" opacity="0.45" filter="url(#g)"/>
<use href="#w" fill="url(#l)"/>
<polygon points="740,1152 740,1075 796,1005 852,1075 852,1152" fill="url(#h)"/>
</svg>`;

export const homeLogo = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(WORD_SVG)}`;
// Hjältens bild: hela ordet BAYT (pulserar via CSS).
export const homeSketch = homeLogo;

export type Kind = "issue" | "inspection" | "project";

export const KIND_LABEL: Record<Kind, string> = { issue: "Felanmälan", inspection: "Kontroll", project: "Projekt" };
export const KIND_PATH: Record<Kind, string> = { issue: "issues", inspection: "inspections", project: "projects" };

const dateFmt = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", year: "numeric" });
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? "—" : dateFmt.format(d);
}

export function daysChip(daysLeft: number | null | undefined): { text: string; cls: string } {
  if (daysLeft == null) return { text: "Ingen tidsgräns", cls: "hk-chip-muted" };
  if (daysLeft < 0) return { text: `${-daysLeft} ${-daysLeft === 1 ? "dag" : "dagar"} försenad`, cls: "hk-chip-bad" };
  if (daysLeft === 0) return { text: "Idag", cls: "hk-chip-warn" };
  if (daysLeft <= 7) return { text: `${daysLeft} ${daysLeft === 1 ? "dag" : "dagar"}`, cls: "hk-chip-warn" };
  return { text: `${daysLeft} dagar`, cls: "hk-chip-ok" };
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 10) return "God morgon";
  if (h < 18) return "God dag";
  return "God kväll";
}

export function useHomeUser() {
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [name, setName] = useState<string | null>(null);
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
  return { role, name };
}

export function TopBar({
  role,
  name,
  items,
  roleLabel,
}: {
  role: string | null | undefined;
  name: string | null;
  items: Array<{ to: string; label: string }>;
  roleLabel: string;
}) {
  const nav = items.filter((n) => canAccess(role, n.to));
  return (
    <div className="hk-top">
      <img src={homeLogo} alt="BAYT" className="hk-logo" />
      <nav className="hk-nav" aria-label="Meny">
        {nav.map((n) => (
          <Link key={n.to} to={n.to as never}>
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="hk-user">
        <div className="hk-user-name">
          {name ?? ""}
          <div className="hk-user-role">{roleLabel}</div>
        </div>
        <button
          type="button"
          className="hk-out"
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = "/login";
          }}
        >
          Logga ut
        </button>
      </div>
    </div>
  );
}

export function Panel({
  title,
  to,
  children,
}: {
  title: string;
  to?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="hk-panel">
      <div className="hk-panel-head">
        <div className="hk-panel-title">{title}</div>
        {to && (
          <Link to={to as never} className="hk-link">
            Visa alla
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

export function Row({
  to,
  title,
  sub,
  right,
}: {
  to: string;
  title: string;
  sub: string;
  right: React.ReactNode;
}) {
  return (
    <Link to={to as never} className="hk-row">
      <div className="hk-row-main">
        <div className="hk-row-title">{title}</div>
        <div className="hk-row-sub">{sub}</div>
      </div>
      <div className="hk-row-right">{right}</div>
    </Link>
  );
}

export const HOME_STYLES = `
  .hk-page {
    min-height: 100vh; min-height: 100dvh; box-sizing: border-box; max-width: 100vw; overflow-x: hidden;
    background: radial-gradient(ellipse at top, #15332c 0%, #0b1d17 70%);
    color: #e6efd8; font-family: Inter, system-ui, sans-serif; padding: 0 0 56px;
  }
  .hk-wrap { max-width: 1240px; margin: 0 auto; padding: 0 32px; }
  .hk-top { display: flex; align-items: center; gap: 20px; padding: 22px 0 14px; }
  .hk-logo { height: 44px; width: auto; display: block; flex-shrink: 0; }
  .hk-nav { display: flex; gap: 4px; flex: 1; overflow-x: auto; scrollbar-width: none; }
  .hk-nav::-webkit-scrollbar { display: none; }
  .hk-nav a { padding: 8px 12px; border-radius: 8px; font-size: 13.5px; text-decoration: none; color: #9fb79f; white-space: nowrap; }
  .hk-nav a:hover { color: #fff; background: rgba(255,255,255,0.06); }
  .hk-user { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
  .hk-user-name { font-size: 13px; color: #c9d6c3; text-align: right; line-height: 1.25; }
  .hk-user-role { font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: #7a9476; }
  .hk-out { height: 36px; padding: 0 12px; border-radius: 8px; font-size: 12.5px; cursor: pointer; font-family: inherit; background: transparent; color: #9fb79f; border: 1px solid rgba(151,186,72,0.2); }
  .hk-out:hover { color: #fff; border-color: rgba(92,184,74,0.6); }

  .hk-hero { position: relative; border-radius: 22px; overflow: hidden; margin-top: 8px; min-height: 250px; display: flex; align-items: flex-end; }
  .hk-hero-img {
    position: absolute; right: 56px; top: 50%; width: 40%; max-width: 480px; height: auto; z-index: 1;
    pointer-events: none; transform-origin: center; transform: translateY(-50%);
    animation: hkBeat 2.4s ease-in-out infinite;
  }
  @keyframes hkBeat {
    0%   { transform: translateY(-50%) scale(1);    filter: drop-shadow(0 0 10px rgba(80,200,100,0.30)) brightness(1); }
    12%  { transform: translateY(-50%) scale(1.05); filter: drop-shadow(0 0 30px rgba(110,240,130,0.75)) brightness(1.25); }
    24%  { transform: translateY(-50%) scale(1.01); filter: drop-shadow(0 0 14px rgba(80,200,100,0.40)) brightness(1.05); }
    38%  { transform: translateY(-50%) scale(1.07); filter: drop-shadow(0 0 40px rgba(130,255,140,0.90)) brightness(1.35); }
    60%  { transform: translateY(-50%) scale(1);    filter: drop-shadow(0 0 12px rgba(80,200,100,0.30)) brightness(1); }
    100% { transform: translateY(-50%) scale(1);    filter: drop-shadow(0 0 10px rgba(80,200,100,0.30)) brightness(1); }
  }
  @media (prefers-reduced-motion: reduce) { .hk-hero-img { animation: none; } }
  .hk-hero::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(11,29,23,0.9) 0%, rgba(11,29,23,0.35) 45%, rgba(11,29,23,0) 65%); }
  .hk-hero-body { position: relative; z-index: 2; padding: 38px 44px; max-width: 780px; }
  .hk-hello { color: #5CB84A; font-size: 17px; font-weight: 600; margin: 0 0 8px; }
  .hk-headline { font-family: Outfit, Inter, system-ui, sans-serif; font-size: 42px; line-height: 1.1; font-weight: 600; margin: 0 0 12px; }
  .hk-headline.bad { color: #ffb4b4; }
  .hk-sub { font-size: 15.5px; line-height: 1.55; color: #c3d1bd; margin: 0; }

  .hk-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
  .hk-action { display: inline-flex; align-items: center; height: 40px; padding: 0 16px; border-radius: 999px; font-size: 13.5px; font-weight: 600; text-decoration: none; color: #e6efd8; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); }
  .hk-action:hover { border-color: rgba(92,184,74,0.7); color: #fff; }
  .hk-action.primary { background: #3D8A30; border-color: #3D8A30; color: #fff; }

  .hk-kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px; margin-top: 16px; }
  .hk-kpis.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .hk-kpi { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); border-radius: 16px; padding: 18px 18px 16px; }
  .hk-kpi-label { font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: #8aa38a; }
  .hk-kpi-n { font-family: Outfit, Inter, system-ui, sans-serif; font-size: 40px; font-weight: 600; line-height: 1.1; margin: 8px 0 4px; }
  .hk-kpi-sub { font-size: 12.5px; color: #8aa38a; }
  .hk-kpi.bad { border-color: rgba(255,120,120,0.4); background: rgba(255,90,90,0.08); }
  .hk-kpi.bad .hk-kpi-n { color: #ffb4b4; }
  .hk-kpi.warn { border-color: rgba(255,200,90,0.4); background: rgba(210,150,20,0.08); }
  .hk-kpi.warn .hk-kpi-n { color: #ffd37a; }
  .hk-kpi.good .hk-kpi-n { color: #8be07a; }

  .hk-h2 { font-family: Outfit, Inter, system-ui, sans-serif; font-size: 20px; font-weight: 600; margin: 34px 0 14px; }
  .hk-link { font-size: 13px; font-weight: 500; color: #5CB84A; text-decoration: none; font-family: Inter, system-ui, sans-serif; }
  .hk-link:hover { text-decoration: underline; }

  .hk-props { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
  .hk-prop { text-align: left; font: inherit; color: #fff; cursor: pointer; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); padding: 16px 18px; display: block; }
  .hk-prop:hover { border-color: rgba(92,184,74,0.7); }
  .hk-prop[aria-pressed="true"] { border-color: #5CB84A; box-shadow: 0 0 0 2px rgba(92,184,74,0.4); }
  .hk-prop-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .hk-prop-name { font-family: Outfit, Inter, system-ui, sans-serif; font-size: 17px; font-weight: 600; }
  .hk-prop-stats { display: flex; gap: 14px; margin-top: 10px; font-size: 12.5px; color: #b9c8b4; flex-wrap: wrap; }
  .hk-badge { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border-radius: 999px; font-size: 11.5px; font-weight: 600; white-space: nowrap; }
  .hk-badge::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
  .hk-badge.ok { color: #8be07a; background: rgba(61,138,48,0.35); }
  .hk-badge.warn { color: #ffd37a; background: rgba(210,150,20,0.3); }
  .hk-badge.bad { color: #ffb4b4; background: rgba(220,60,60,0.35); }
  .hk-filter { display: flex; align-items: center; gap: 10px; margin: 0 0 12px; font-size: 13.5px; color: #c3d1bd; flex-wrap: wrap; }
  .hk-filter button { height: 30px; padding: 0 12px; border-radius: 999px; border: 1px solid rgba(92,184,74,0.5); background: rgba(92,184,74,0.12); color: #cfe9c8; cursor: pointer; font: inherit; font-size: 12.5px; }

  .hk-cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
  .hk-panel { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); border-radius: 18px; padding: 6px 0; min-width: 0; }
  .hk-panel-head { padding: 14px 18px 10px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .hk-panel-title { font-size: 15px; font-weight: 600; }
  .hk-empty { padding: 18px; color: #8aa38a; font-size: 14px; }
  .hk-row { display: flex; align-items: center; gap: 14px; padding: 13px 18px; text-decoration: none; color: inherit; border-top: 1px solid rgba(255,255,255,0.06); }
  .hk-row:hover { background: rgba(255,255,255,0.05); }
  .hk-row-main { flex: 1; min-width: 0; }
  .hk-row-title { font-size: 14.5px; font-weight: 600; overflow-wrap: anywhere; }
  .hk-row-sub { font-size: 12.5px; color: #8aa38a; margin-top: 2px; }
  .hk-row-right { flex-shrink: 0; text-align: right; display: grid; gap: 6px; justify-items: end; }
  .hk-chip { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
  .hk-chip-bad { color: #ffb4b4; background: rgba(220,60,60,0.22); }
  .hk-chip-warn { color: #ffd37a; background: rgba(210,150,20,0.2); }
  .hk-chip-ok { color: #8be07a; background: rgba(61,138,48,0.25); }
  .hk-chip-muted { color: #8aa38a; background: rgba(255,255,255,0.06); }
  .hk-note { margin-top: 26px; font-size: 12.5px; color: #6f8a70; line-height: 1.5; }

  @media (max-width: 1100px) {
    .hk-kpis, .hk-kpis.four { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .hk-headline { font-size: 34px; }
    .hk-hero-img { width: 44%; right: 32px; }
  }
  @media (max-width: 860px) { .hk-cols { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 768px) {
    .hk-wrap { padding: 0 14px; }
    .hk-top { flex-wrap: wrap; gap: 10px; padding-top: 16px; }
    .hk-logo { height: 34px; }
    .hk-nav { order: 3; flex-basis: 100%; }
    .hk-user { margin-left: auto; }
    .hk-user-name { display: none; }
    .hk-hero { min-height: 220px; border-radius: 18px; }
    .hk-hero-img { width: 70%; right: 16px; opacity: 0.35; }
    .hk-hero-body { padding: 26px 22px; }
    .hk-headline { font-size: 28px; }
    .hk-sub { font-size: 14px; }
    .hk-kpis, .hk-kpis.four { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .hk-kpi { padding: 14px; }
    .hk-kpi-n { font-size: 32px; }
    .hk-row { flex-wrap: wrap; padding: 12px 14px; }
    .hk-row-right { width: 100%; grid-auto-flow: column; justify-content: space-between; justify-items: start; }
  }
`;
