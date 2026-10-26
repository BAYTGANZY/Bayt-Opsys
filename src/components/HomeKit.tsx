import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { canAccess } from "@/lib/permissions";
import { Screensaver } from "@/components/Screensaver";
import { NotificationsProvider } from "@/lib/notifications";
import { NotificationBell } from "@/components/NotificationCenter";
import { useIsMobile } from "@/hooks/use-mobile";

// Behålls för bakåtkompatibilitet: sidorna kan fortfarande importera dessa.
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
export const homeSketch = homeLogo;

// Den vita loggan som används uppe till vänster (samma som på styrelsevyn).
const whiteLogo = `${import.meta.env.BASE_URL}assets/bayt-logo.png`;

// Dessa val ligger alltid synliga i menyn. Resten hamnar under "Mer" när menyn är lång.
const PRIMARY_NAV = new Set(["/dag-rapport", "/fastigheter", "/issues", "/inspections", "/projects", "/chatt"]);

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

/** Stor klocka i hjälten. Samma klocka som i appens ram; leverantören läggs här eftersom startsidorna ligger utanför ramen.
 *  Klockan äger själv sina realtime-prenumerationer, så inga hooks anropas här (annars krockar kanalerna). */
export function HeroBell() {
  const isMobile = useIsMobile();
  return (
    <NotificationsProvider>
      <div className="hk-herobell">
        <div className="hk-bellring">
          <NotificationBell isMobile={isMobile} />
        </div>
        <div className="hk-bell-label">Notiser</div>
      </div>
    </NotificationsProvider>
  );
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
  const split = nav.length > 7;
  const primary = split ? nav.filter((n) => PRIMARY_NAV.has(n.to)) : nav;
  const more = split ? nav.filter((n) => !PRIMARY_NAV.has(n.to)) : [];

  const [open, setOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <Screensaver />
      <div className="hk-top">
        <Link to={"/start" as never} className="hk-logolink" title="Till Hem" aria-label="Till Hem">
          <img src={whiteLogo} alt="BAYT" className="hk-logo" />
        </Link>
        <div className="hk-navwrap">
          <nav className="hk-nav" aria-label="Meny">
            <Link to={"/start" as never}>Hem</Link>
            {primary.map((n) => (
              <Link key={n.to} to={n.to as never}>
                {n.label}
              </Link>
            ))}
          </nav>
          {more.length > 0 && (
            <div className="hk-more" ref={moreRef}>
              <button type="button" className="hk-more-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
                Mer <span aria-hidden="true">▾</span>
              </button>
              {open && (
                <div className="hk-more-pop" role="menu">
                  {more.map((n) => (
                    <Link key={n.to} to={n.to as never} onClick={() => setOpen(false)} role="menuitem">
                      {n.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
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
    </>
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

  /* Dator och iPad: toppraden ligger kvar överst, allt under den centreras lodrätt. */
  @media (min-width: 769px) {
    .hk-wrap { display: flex; flex-direction: column; min-height: calc(100vh - 56px); min-height: calc(100dvh - 56px); }
    .hk-wrap > .hk-top { flex: none; margin-bottom: 8px; }
    .hk-wrap > .hk-top ~ * { flex: none; }
    .hk-wrap > .hk-top + * { margin-top: auto !important; }
    .hk-wrap > :last-child:not(.hk-top) { margin-bottom: auto; }
  }

  .hk-top { display: flex; align-items: center; gap: 18px; padding: 22px 0 14px; position: relative; z-index: 50; }
  .hk-logolink { display: inline-flex; flex-shrink: 0; text-decoration: none; }
  .hk-logo { height: 36px; width: auto; display: block; flex-shrink: 0; }
  .hk-navwrap { display: flex; align-items: center; gap: 2px; flex: 1; min-width: 0; }
  .hk-nav { display: flex; gap: 0; min-width: 0; overflow-x: auto; scrollbar-width: none; }
  .hk-nav::-webkit-scrollbar { display: none; }
  .hk-nav a { padding: 8px 10px; border-radius: 8px; font-size: 13.5px; text-decoration: none; color: #9fb79f; white-space: nowrap; flex-shrink: 0; }
  .hk-nav a:hover { color: #fff; background: rgba(255,255,255,0.06); }

  .hk-more { position: relative; flex-shrink: 0; }
  .hk-more-btn { padding: 8px 10px; border-radius: 8px; border: none; background: transparent; font: inherit; font-size: 13.5px; color: #9fb79f; cursor: pointer; white-space: nowrap; }
  .hk-more-btn:hover, .hk-more-btn[aria-expanded="true"] { color: #fff; background: rgba(255,255,255,0.08); }
  .hk-more-pop {
    position: absolute; top: calc(100% + 8px); left: 0; min-width: 190px; padding: 6px; z-index: 300;
    background: rgba(14,31,26,0.96); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
    border: 1px solid rgba(255,255,255,0.14); border-radius: 14px; box-shadow: 0 20px 44px -16px rgba(0,0,0,0.75);
    display: grid; gap: 2px;
  }
  .hk-more-pop a { padding: 10px 12px; border-radius: 9px; font-size: 14px; text-decoration: none; color: #d9e6d3; }
  .hk-more-pop a:hover { background: rgba(92,184,74,0.16); color: #fff; }

  .hk-user { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
  .hk-user-name { font-size: 13px; color: #c9d6c3; text-align: right; line-height: 1.25; }
  .hk-user-role { font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: #7a9476; }
  .hk-out { height: 36px; padding: 0 12px; border-radius: 8px; font-size: 12.5px; cursor: pointer; font-family: inherit; background: transparent; color: #9fb79f; border: 1px solid rgba(151,186,72,0.2); }
  .hk-out:hover { color: #fff; border-color: rgba(92,184,74,0.6); }

  .hk-hero { position: relative; border-radius: 22px; overflow: visible; margin-top: 8px; min-height: 220px; display: flex; align-items: center; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); }
  .hk-hero-img { display: none; }
  .hk-hero-body { position: relative; z-index: 2; padding: 38px 44px; max-width: calc(100% - 260px); }
  .hk-hello { color: #5CB84A; font-size: 17px; font-weight: 600; margin: 0 0 8px; }
  .hk-headline { font-family: Outfit, Inter, system-ui, sans-serif; font-size: 42px; line-height: 1.1; font-weight: 600; margin: 0 0 12px; }
  .hk-headline.bad { color: #F2E3BC; }
  .hk-sub { font-size: 15.5px; line-height: 1.55; color: #c3d1bd; margin: 0; }

  /* Stor klocka i hjälten */
  .hk-herobell { position: absolute; right: 56px; top: 50%; transform: translateY(-50%); z-index: 5; display: flex; flex-direction: column; align-items: center; gap: 14px; }
  .hk-bell-label { font-size: 13px; letter-spacing: 0.04em; color: #9fb79f; text-align: center; }
  .hk-bellring button[aria-label] {
    width: 112px !important; height: 112px !important; min-width: 112px !important; min-height: 112px !important; padding: 0 !important;
    border-radius: 50% !important; border: 1px solid rgba(127,224,138,0.38) !important;
    background: radial-gradient(circle at 30% 25%, rgba(127,224,138,0.24), rgba(255,255,255,0.04) 70%) !important;
    color: #c4f2c6 !important;
    box-shadow: 0 0 0 9px rgba(92,184,74,0.06), 0 0 0 20px rgba(92,184,74,0.03), 0 22px 44px -14px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.18) !important;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  .hk-bellring button[aria-label]:hover { transform: scale(1.04); box-shadow: 0 0 0 9px rgba(92,184,74,0.12), 0 0 0 20px rgba(92,184,74,0.05), 0 26px 50px -14px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.22) !important; }
  .hk-bellring button[aria-label] svg { width: 52px; height: 52px; }
  .hk-bellring button[aria-label] > span {
    top: 4px !important; right: 4px !important; min-width: 28px !important; height: 28px !important; border-radius: 999px !important;
    font-size: 14px !important; border: 3px solid #0b1d17 !important; padding: 0 5px !important;
  }
  .hk-bellring [role="dialog"] { top: calc(100% + 16px) !important; right: 0 !important; z-index: 200 !important; }

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
  .hk-kpi.bad { border-color: #8B1A2B; background: rgba(122,20,38,0.30); }
  .hk-kpi.bad .hk-kpi-n { color: #F2E3BC; }
  .hk-kpi.bad .hk-kpi-sub { color: #d9c7a0; }
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
  .hk-badge.bad { color: #F5E6C4; background: #7A1426; }
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
  .hk-chip-bad { color: #F5E6C4; background: #7A1426; }
  .hk-chip-warn { color: #ffd37a; background: rgba(210,150,20,0.2); }
  .hk-chip-ok { color: #8be07a; background: rgba(61,138,48,0.25); }
  .hk-chip-muted { color: #8aa38a; background: rgba(255,255,255,0.06); }
  .hk-note { margin-top: 26px; font-size: 12.5px; color: #6f8a70; line-height: 1.5; }

  @media (max-width: 1100px) {
    .hk-kpis, .hk-kpis.four { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .hk-headline { font-size: 34px; }
    .hk-herobell { right: 36px; }
  }
  @media (max-width: 860px) { .hk-cols { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 768px) {
    .hk-wrap { padding: 0 14px; }
    .hk-top { flex-wrap: wrap; gap: 10px; padding-top: 16px; }
    .hk-logo { height: 30px; }
    .hk-navwrap { order: 3; flex-basis: 100%; }
    .hk-nav { flex: 1; }
    .hk-more-pop { left: auto; right: 0; }
    .hk-user { margin-left: auto; }
    .hk-user-name { display: none; }
    .hk-hero { min-height: 190px; border-radius: 18px; }
    .hk-hero-body { padding: 26px 22px; max-width: calc(100% - 120px); }
    .hk-headline { font-size: 26px; }
    .hk-sub { font-size: 14px; }
    .hk-herobell { right: 16px; gap: 10px; }
    .hk-bell-label { font-size: 11.5px; max-width: 90px; }
    .hk-bellring button[aria-label] { width: 80px !important; height: 80px !important; min-width: 80px !important; min-height: 80px !important; }
    .hk-bellring button[aria-label] svg { width: 38px; height: 38px; }
    .hk-bellring button[aria-label] > span { min-width: 24px !important; height: 24px !important; font-size: 12px !important; }
    .hk-kpis, .hk-kpis.four { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .hk-kpi { padding: 14px; }
    .hk-kpi-n { font-size: 32px; }
    .hk-row { flex-wrap: wrap; padding: 12px 14px; }
    .hk-row-right { width: 100%; grid-auto-flow: column; justify-content: space-between; justify-items: start; }
  }
`;
