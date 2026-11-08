import { useCallback, useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { homeForRole } from "@/lib/permissions";
import { BRAND } from "@/lib/theme";

/**
 * Fast navigering som följer med när man rullar: en "Start"-knapp tillbaka till rollens
 * startsida, och pilar upp/ned för att hoppa till sidans topp respektive botten.
 *
 * Sitter på alla sidor inne i plattformen — i AppShell (där det är <main data-scroll-root>
 * som rullar) och på de fristående HomeKit-sidorna (där hela fönstret rullar). Samma
 * komponent på båda ställena, så knapparna alltid ser ut och beter sig likadant.
 *
 * Start visas inte på startsidan själv, och inte i mobilläge där det redan finns en
 * mittenknapp i bottenmenyn. Pilarna visas bara när sidan faktiskt går att rulla.
 */

/** Startsida per roll: admin → Start (/dashboard), övriga → sin egen hemsida. */
export function startPathFor(role: string | null | undefined): string {
  return role === "admin" ? "/dashboard" : homeForRole(role);
}

function useIsMobile() {
  const [m, setM] = useState(() => (typeof window === "undefined" ? false : window.innerWidth < 768));
  useEffect(() => {
    const on = () => setM(window.innerWidth < 768);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return m;
}

type Metrics = { top: number; max: number };

function readMetrics(): Metrics {
  const el = document.querySelector<HTMLElement>("[data-scroll-root]");
  if (el) return { top: el.scrollTop, max: el.scrollHeight - el.clientHeight };
  const root = document.documentElement;
  return { top: window.scrollY, max: root.scrollHeight - window.innerHeight };
}

function scrollToY(where: "top" | "bottom") {
  const el = document.querySelector<HTMLElement>("[data-scroll-root]");
  const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const behavior: ScrollBehavior = reduce ? "auto" : "smooth";
  try {
    if (el) el.scrollTo({ top: where === "top" ? 0 : el.scrollHeight, behavior });
    else window.scrollTo({ top: where === "top" ? 0 : document.documentElement.scrollHeight, behavior });
  } catch {
    /* ignoreras */
  }
}

function Arrow({ up }: { up: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={up ? "M5 15l7-7 7 7" : "M5 9l7 7 7-7"} />
    </svg>
  );
}

export function FloatingNav({
  role,
  inShell = false,
}: {
  role: string | null | undefined;
  /** True inne i AppShell (mobil har då alltid bottenmeny med Start i mitten). */
  inShell?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isMobile = useIsMobile();
  const [m, setM] = useState<Metrics>({ top: 0, max: 0 });

  const refresh = useCallback(() => {
    const next = readMetrics();
    setM((p) => (Math.abs(p.top - next.top) < 1 && Math.abs(p.max - next.max) < 1 ? p : next));
  }, []);

  // Rullningsytan kan bytas (ny sida) och innehållet växer när data laddats, så vi lyssnar
  // på både scroll och en lugn kontroll var 0,7:e sekund i stället för att gissa tidpunkter.
  useEffect(() => {
    refresh();
    const el = document.querySelector<HTMLElement>("[data-scroll-root]");
    const target: HTMLElement | Window = el ?? window;
    target.addEventListener("scroll", refresh, { passive: true });
    window.addEventListener("resize", refresh);
    const id = window.setInterval(refresh, 700);
    return () => {
      target.removeEventListener("scroll", refresh);
      window.removeEventListener("resize", refresh);
      window.clearInterval(id);
    };
  }, [pathname, refresh]);

  const start = startPathFor(role);
  // Mobil: AppShell har alltid mittenknapp i bottenmenyn, och admin har den på Översikt.
  const mobileHasBottomBar = inShell || role === "admin";
  const showStart = !!role && pathname !== start && !(isMobile && mobileHasBottomBar);
  const scrollable = m.max > 80;
  const canUp = m.top > 40;
  const canDown = m.max - m.top > 40;
  const bottom = isMobile && mobileHasBottomBar ? 84 : 20;

  if (!showStart && !scrollable) return null;

  return (
    <div className="fn-root" style={{ bottom }} role="navigation" aria-label="Snabbnavigering">
      <style>{FN_STYLES}</style>
      {showStart && (
        <Link to={start as never} className="fn-start" title="Till Start" aria-label="Till Start">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 11l8-7 8 7M6 10v10h12V10" />
          </svg>
          <span>Start</span>
        </Link>
      )}
      {scrollable && (
        <div className="fn-arrows">
          <button type="button" className="fn-arrow" onClick={() => scrollToY("top")} disabled={!canUp} aria-label="Upp till toppen av sidan" title="Upp">
            <Arrow up />
          </button>
          <button type="button" className="fn-arrow" onClick={() => scrollToY("bottom")} disabled={!canDown} aria-label="Ner till botten av sidan" title="Ner">
            <Arrow up={false} />
          </button>
        </div>
      )}
    </div>
  );
}

const FN_STYLES = `
  .fn-root { position: fixed; right: 20px; z-index: 40; display: flex; align-items: center; gap: 10px; pointer-events: none; }
  .fn-root > * { pointer-events: auto; }
  .fn-start, .fn-arrow {
    background: ${BRAND.dark}; color: #fff; border: 1px solid rgba(255,255,255,0.22);
    box-shadow: 0 8px 22px -8px rgba(0,0,0,0.55); cursor: pointer; font-family: inherit;
  }
  .fn-start { display: inline-flex; align-items: center; gap: 8px; height: 52px; padding: 0 20px; border-radius: 26px; font-size: 18px; font-weight: 600; text-decoration: none; }
  .fn-start:hover, .fn-arrow:hover:not(:disabled) { background: ${BRAND.primary}; border-color: ${BRAND.accent}; }
  .fn-arrows { display: flex; flex-direction: column; gap: 8px; }
  .fn-arrow { width: 52px; height: 52px; border-radius: 50%; display: flex; align-items: center; justify-content: center; padding: 0; }
  .fn-arrow:disabled { opacity: 0.35; cursor: default; }
  .fn-start:focus-visible, .fn-arrow:focus-visible { outline: 3px solid ${BRAND.gold}; outline-offset: 2px; }
  @media (max-width: 768px) {
    .fn-root { right: 12px; }
    .fn-start { height: 48px; padding: 0 16px; font-size: 17px; }
    .fn-arrow { width: 48px; height: 48px; }
  }
  @media print { .fn-root { display: none; } }
`;
