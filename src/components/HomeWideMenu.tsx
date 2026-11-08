import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { GridViewIcon, Settings01Icon } from "@hugeicons/core-free-icons";
import { supabase } from "@/lib/supabase";
import { Screensaver } from "@/components/Screensaver";
import { sectionsForRole, type NavItem } from "@/components/AppShell";
import { useFavorites } from "@/hooks/useFavorites";

const whiteLogo = `${import.meta.env.BASE_URL}assets/bayt-logo.png`;

function Star({ on, size = 20 }: { on: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill={on ? "#5CB84A" : "none"} stroke={on ? "#5CB84A" : "#7a9476"} strokeWidth={1.7} strokeLinejoin="round">
      <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
    </svg>
  );
}

/**
 * Toppmeny i bredd för Översikt: samma innehåll som vänstermenyn (sidor, grupper och
 * stjärnor) men utlagt på tvären, i sidans mörkgröna stil. Under den ligger favoriterna
 * som stora knappar. Bara sidor rollen får öppna visas.
 */
export function HomeWideMenu({
  role,
  name,
  roleLabel,
  logoTo,
  compact = false,
}: {
  role: string | null | undefined;
  name: string | null;
  roleLabel: string;
  logoTo: string;
  /** Utan sidmeny: bara logga, användare och favoriter. Navigeringen sker via favoriterna och den fasta Start-knappen. */
  compact?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { routes, toggle, isFavorite } = useFavorites();
  const sections = sectionsForRole(role);
  const allowed = sections.flatMap((s) => s.items);
  const favItems = routes.map((r) => allowed.find((i) => i.to === r)).filter((i): i is NavItem => !!i);

  const [openKey, setOpenKey] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!openKey) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenKey(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenKey(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openKey]);

  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");

  return (
    <div className="hk-top wm-root">
      <style>{WIDE_MENU_STYLES}</style>
      <Screensaver />
      <div className="wm-top" ref={ref}>
        <Link to={logoTo as never} className="wm-logolink" title="Till Start" aria-label="Till Start">
          <img src={whiteLogo} alt="BAYT" className="wm-logo" />
        </Link>

        {compact && <div className="wm-nav" />}
        {!compact && (
        <nav className="wm-nav" aria-label="Meny">
          {sections.map((section, i) =>
            section.label ? (
              <div className="wm-group" key={section.label}>
                <button
                  type="button"
                  className={`wm-btn${section.items.some((it) => isActive(it.to)) ? " active" : ""}`}
                  aria-expanded={openKey === section.label}
                  onClick={() => setOpenKey((k) => (k === section.label ? null : section.label!))}
                >
                  {section.label} <span aria-hidden="true">▾</span>
                </button>
                {openKey === section.label && (
                  <div className="wm-pop" role="menu">
                    {section.items.map((item) => (
                      <div className="wm-pop-row" key={item.to}>
                        <Link to={item.to as never} className={isActive(item.to) ? "on" : ""} onClick={() => setOpenKey(null)} role="menuitem">
                          <HugeiconsIcon icon={item.icon} size={22} />
                          <span>{item.label}</span>
                        </Link>
                        <button
                          type="button"
                          className="wm-star"
                          onClick={() => toggle(item.to)}
                          aria-pressed={isFavorite(item.to)}
                          aria-label={isFavorite(item.to) ? `Ta bort ${item.label} från favoriter` : `Lägg till ${item.label} i favoriter`}
                          title={isFavorite(item.to) ? "Ta bort från favoriter" : "Lägg till i favoriter"}
                        >
                          <Star on={isFavorite(item.to)} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="wm-first" key={i}>
                {section.items.map((item) => (
                  <Link key={item.to} to={item.to as never} className={`wm-link${isActive(item.to) ? " active" : ""}`}>
                    {item.label}
                  </Link>
                ))}
              </div>
            ),
          )}
        </nav>
        )}

        <div className="wm-user">
          <div className="wm-user-name">
            {name ?? ""}
            <div className="wm-user-role">{roleLabel}</div>
          </div>
          <button
            type="button"
            className="wm-out"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/login";
            }}
          >
            Logga ut
          </button>
        </div>
      </div>

      {role === "admin" && (
        <nav className="wm-bottom" aria-label="Snabbmeny">
          <span className="wm-bottom-spacer" />
          <Link to={"/dashboard" as never} className="wm-bottom-center">
            <span className="wm-bottom-circle">
              <HugeiconsIcon icon={GridViewIcon} size={26} color="#FFFFFF" />
            </span>
            <span className="wm-bottom-label">Start</span>
          </Link>
          <Link to={"/installningar" as never} className="wm-bottom-side">
            <HugeiconsIcon icon={Settings01Icon} size={20} />
            <span>Inställn.</span>
          </Link>
        </nav>
      )}

      <div className="wm-favs" aria-label="Favoriter">
        <span className="wm-favs-label">
          <Star on size={22} /> Favoriter
        </span>
        {favItems.length === 0 ? (
          <span className="wm-favs-empty">
            {compact
              ? "Tryck på stjärnan vid en sida i menyn på Start så får du en knapp här."
              : "Öppna en meny ovan och tryck på stjärnan vid en sida så får du en knapp här."}
          </span>
        ) : (
          favItems.map((item) => (
            <Link key={item.to} to={item.to as never} className="wm-fav">
              <HugeiconsIcon icon={item.icon} size={24} />
              <span>{item.label}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

const WIDE_MENU_STYLES = `
  .hk-top.wm-root { display: block; padding: 0; gap: 0; }
  .wm-top { display: flex; align-items: center; gap: 18px; padding: 22px 0 12px; position: relative; z-index: 50; }
  .wm-logolink { display: inline-flex; flex-shrink: 0; text-decoration: none; }
  .wm-logo { height: 40px; width: auto; display: block; }
  .wm-nav { display: flex; align-items: center; gap: 2px; flex: 1; min-width: 0; flex-wrap: wrap; }
  .wm-first { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; }
  .wm-link, .wm-btn { padding: 10px 14px; border-radius: 10px; font: inherit; font-size: 20px; text-decoration: none; color: #b9ccb5; white-space: nowrap; background: transparent; border: none; cursor: pointer; }
  .wm-link:hover, .wm-btn:hover, .wm-btn[aria-expanded="true"] { color: #fff; background: rgba(255,255,255,0.08); }
  .wm-link.active, .wm-btn.active { color: #fff; box-shadow: inset 0 -3px 0 #5CB84A; border-radius: 10px 10px 0 0; }
  .wm-group { position: relative; }
  .wm-pop {
    position: absolute; top: calc(100% + 8px); left: 0; min-width: 300px; padding: 8px; z-index: 300;
    background: rgba(14,31,26,0.97); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
    border: 1px solid rgba(255,255,255,0.14); border-radius: 16px; box-shadow: 0 20px 44px -16px rgba(0,0,0,0.75);
    display: grid; gap: 2px;
  }
  .wm-pop-row { display: flex; align-items: stretch; border-radius: 10px; }
  .wm-pop-row:hover { background: rgba(92,184,74,0.14); }
  .wm-pop-row a { flex: 1; display: flex; align-items: center; gap: 12px; padding: 12px 14px; font-size: 20px; text-decoration: none; color: #d9e6d3; min-width: 0; }
  .wm-pop-row a.on { color: #fff; font-weight: 600; }
  .wm-star { background: transparent; border: none; cursor: pointer; padding: 0 14px; display: flex; align-items: center; }
  .wm-user { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
  .wm-user-name { font-size: 18px; color: #c9d6c3; text-align: right; line-height: 1.25; }
  .wm-user-role { font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; color: #7a9476; }
  .wm-out { height: 44px; padding: 0 16px; border-radius: 8px; font-size: 18px; cursor: pointer; font-family: inherit; background: transparent; color: #b9ccb5; border: 1px solid rgba(151,186,72,0.25); }
  .wm-out:hover { color: #fff; border-color: rgba(92,184,74,0.6); }

  .wm-favs { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 4px 0 8px; position: relative; z-index: 10; }
  .wm-favs-label { display: inline-flex; align-items: center; gap: 8px; font-size: 20px; font-weight: 600; color: #e6efd8; margin-right: 4px; }
  .wm-favs-empty { font-size: 18px; color: #8aa38a; }
  .wm-fav { display: inline-flex; align-items: center; gap: 12px; min-height: 60px; padding: 0 22px; border-radius: 16px; font-size: 21px; font-weight: 600; text-decoration: none; color: #e6efd8; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); }
  .wm-fav:hover { border-color: rgba(92,184,74,0.8); color: #fff; background: rgba(92,184,74,0.14); }

  @media (max-width: 1100px) {
    .wm-user-name { display: none; }
  }
  .wm-bottom { display: none; }
  @media (max-width: 768px) {
    .hk-page { padding-bottom: 100px; }
    .wm-bottom { display: flex; align-items: stretch; position: fixed; left: 0; right: 0; bottom: 0; height: 64px; z-index: 45; background: #0b1d17; border-top: 1px solid rgba(255,255,255,0.12); }
    .wm-bottom-spacer { flex: 1; }
    .wm-bottom-center { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-decoration: none; position: relative; color: #e6efd8; }
    .wm-bottom-circle { position: absolute; top: -22px; width: 56px; height: 56px; border-radius: 50%; background: #5CB84A; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 16px rgba(0,0,0,0.4); border: 4px solid #0b1d17; }
    .wm-bottom-label { font-size: 10px; font-weight: 600; margin-top: 36px; }
    .wm-bottom-side { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; text-decoration: none; color: #8aa38a; font-size: 10px; font-weight: 600; }
    .wm-top { flex-wrap: wrap; gap: 10px; padding-top: 16px; }
    .wm-logo { height: 30px; }
    .wm-nav { order: 3; flex-basis: 100%; }
    .wm-link, .wm-btn { font-size: 18px; padding: 9px 11px; }
    .wm-user { margin-left: auto; }
    .wm-pop { min-width: min(300px, 86vw); }
    .wm-fav { min-height: 54px; font-size: 19px; padding: 0 16px; }
  }
`;
