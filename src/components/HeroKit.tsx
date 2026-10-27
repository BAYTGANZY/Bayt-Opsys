import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { HeroBell } from "@/components/HomeKit";

const DAY_IMG = `${import.meta.env.BASE_URL}assets/hero-day.jpg`;
const NIGHT_IMG = `${import.meta.env.BASE_URL}assets/hero-night.jpg`;

export type HeroTile = {
  label: string;
  n: number | string;
  tone?: "bad" | "warn" | "good";
  wide?: boolean;
  /** Länk till en sida. */
  to?: string;
  /** Eller scrolla till ett element med detta id på samma sida. */
  anchor?: string;
};
export type HeroNext = {
  to: string;
  label: string;
  title: string;
  sub: string;
  chip?: { text: string; cls: string } | null;
};
export type HeroChip = { id: string; name: string; level: "ok" | "warn" | "bad" };

export const HERO_STYLES = `
  .id-hero {
    position: relative; margin-top: 8px; border-radius: 26px; min-height: 600px;
    background: radial-gradient(ellipse at 30% 45%, #21503f 0%, #0f2a21 55%, #0b1d17 100%);
    border: 1px solid rgba(255,255,255,0.08);
    display: grid; grid-template-columns: minmax(0, 400px) minmax(0, 1fr); grid-template-rows: 1fr; gap: 28px; align-items: start;
    padding: 40px 44px 96px; perspective: 1200px;
  }
  /* Bara bilderna klipps, så att klockans meny kan sticka ut ur hjälten. */
  .id-clip { position: absolute; inset: 0; z-index: 0; overflow: hidden; border-radius: 25px; pointer-events: none; }
  .id-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .id-photo.night { opacity: 0; animation: idDayNight 18s ease-in-out infinite alternate; }
  @keyframes idDayNight { 0%, 25% { opacity: 0; } 75%, 100% { opacity: 1; } }
  .id-shade {
    position: absolute; inset: 0;
    background: linear-gradient(90deg, rgba(8,22,17,0.70) 0%, rgba(8,22,17,0.30) 55%, rgba(8,22,17,0.55) 100%),
                linear-gradient(0deg, rgba(8,22,17,0.85) 0%, rgba(8,22,17,0) 38%);
  }
  .id-col-l { position: relative; z-index: 2; grid-column: 1; grid-row: 1; display: grid; gap: 14px; }
  .id-col-r { position: relative; z-index: 60; grid-column: 2; grid-row: 1; }

  .id-glass {
    background: rgba(14,31,26,0.58); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px);
    border: 1px solid rgba(255,255,255,0.14); border-radius: 22px;
    box-shadow: 0 24px 50px -20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.12);
    transform: perspective(1000px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg));
    transition: transform 0.25s ease-out;
  }
  .id-col-l .id-glass { transform: perspective(1000px) rotateX(calc(var(--rx, 0deg) * -0.8)) rotateY(calc(var(--ry, 0deg) * -0.8)); }

  .id-main { padding: 22px 26px; }
  .id-hello { color: #5CB84A; font-size: 15px; font-weight: 600; margin: 0 0 6px; }
  .id-headline { font-family: Outfit, Inter, system-ui, sans-serif; font-size: 32px; line-height: 1.1; font-weight: 600; margin: 0 0 10px; }
  .id-headline.bad { color: #F2E3BC; }
  .id-sub { font-size: 14.5px; line-height: 1.55; color: #c9d6c3; margin: 0; }

  .id-bellslot { display: flex; justify-content: flex-end; padding-right: 6px; }
  .id-bellslot .hk-herobell { position: static; transform: none; flex-direction: row-reverse; gap: 12px; }
  .id-bellslot .hk-bell-label { display: block; }
  .id-bellslot .hk-bellring { position: relative; }
  .id-bellslot .hk-bellring [role="dialog"] { top: calc(100% + 14px) !important; right: 0 !important; left: auto !important; }
  .id-bellslot .hk-bellring button[aria-label] { width: 72px !important; height: 72px !important; min-width: 72px !important; min-height: 72px !important; }
  .id-bellslot .hk-bellring button[aria-label] svg { width: 34px; height: 34px; }
  .id-bellslot .hk-bellring button[aria-label] > span { min-width: 24px !important; height: 24px !important; font-size: 12px !important; }

  .id-next { padding: 20px 22px; display: block; text-decoration: none; color: inherit; }
  a.id-next:hover { border-color: rgba(92,184,74,0.6); }
  .id-next-label { font-size: 11.5px; letter-spacing: 0.1em; text-transform: uppercase; color: #9fb79f; }
  .id-next-title { font-family: Outfit, Inter, system-ui, sans-serif; font-size: 22px; font-weight: 600; margin: 8px 0 4px; overflow-wrap: anywhere; }
  .id-next-sub { font-size: 13px; color: #b9c8b4; margin-bottom: 12px; }
  .id-next-empty { font-size: 14px; color: #c9d6c3; margin-top: 8px; }

  .id-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .id-tile { padding: 14px 16px; border-radius: 18px; }
  .id-tile.wide { grid-column: span 2; }
  a.id-tile, button.id-tile {
    display: block; text-decoration: none; color: inherit; font: inherit; text-align: left; cursor: pointer;
    -webkit-appearance: none; appearance: none; width: 100%; box-sizing: border-box;
  }
  a.id-tile:hover, button.id-tile:hover { border-color: rgba(92,184,74,0.7); }
  .id-tile-l { font-size: 11px; letter-spacing: 0.07em; text-transform: uppercase; color: #9fb79f; }
  .id-tile-n { font-family: Outfit, Inter, system-ui, sans-serif; font-size: 32px; font-weight: 600; line-height: 1.1; margin-top: 4px; color: #e6efd8; }
  .id-tile.bad { border-color: #8B1A2B; background: rgba(122,20,38,0.5); }
  .id-tile.bad .id-tile-n { color: #F2E3BC; }
  .id-tile.warn .id-tile-n { color: #ffd37a; }
  .id-tile.good .id-tile-n { color: #8be07a; }

  .id-props { position: absolute; left: 44px; right: 44px; bottom: 26px; z-index: 3; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .id-props-label { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #d3e0cf; margin-right: 4px; }
  .id-chip {
    display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 16px; border-radius: 999px; cursor: pointer; font: inherit;
    font-size: 13px; font-weight: 600; color: #e6efd8; background: rgba(14,31,26,0.62); border: 1px solid rgba(255,255,255,0.18);
    -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  }
  .id-chip:hover { border-color: rgba(92,184,74,0.7); }
  .id-chip[aria-pressed="true"] { border-color: #5CB84A; background: rgba(61,138,48,0.5); }
  .id-dot { width: 8px; height: 8px; border-radius: 50%; background: #8be07a; }
  .id-dot.warn { background: #ffd37a; }
  .id-dot.bad { background: #C2334D; }

  @media (max-width: 1100px) {
    .id-hero { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto; padding: 32px 28px 100px; min-height: 0; }
    .id-col-l, .id-col-r { grid-column: 1; grid-row: auto; }
    .id-props { left: 28px; right: 28px; }
  }
  @media (max-width: 768px) {
    /* Utan perspective på hjälten blir "fixed" relativt skärmen, inte hjälten. */
    .id-hero { padding: 24px 14px 110px; border-radius: 20px; perspective: none; }
    .id-clip { border-radius: 19px; }
    .id-main { padding: 20px; }
    .id-headline { font-size: 28px; }
    .id-props { left: 14px; right: 14px; bottom: 16px; }
    .id-glass, .id-col-l .id-glass { transform: none; }
    .id-bellslot .hk-bellring [role="dialog"] {
      position: fixed !important; top: 70px !important; left: 8px !important; right: 8px !important; width: auto !important;
    }
  }
  @media (hover: none), (prefers-reduced-motion: reduce) {
    .id-glass, .id-col-l .id-glass { transform: none !important; transition: none; }
  }
  @media (prefers-reduced-motion: reduce) { .id-photo.night { animation: none; opacity: 0; } }
`;

function scrollToId(id: string) {
  try {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    /* ignoreras */
  }
}

export function Hero({
  hello,
  headline,
  bad,
  sub,
  loading,
  next,
  emptyNext,
  tiles,
  chips,
  chipsLabel = "Fastigheter",
  selected,
  onSelect,
}: {
  hello: string;
  headline: string;
  bad?: boolean;
  sub: string;
  loading?: boolean;
  next: HeroNext | null;
  emptyNext: string;
  tiles: HeroTile[];
  chips?: HeroChip[];
  chipsLabel?: string;
  selected?: string | null;
  onSelect?: (id: string) => void;
}) {
  const [noDay, setNoDay] = useState(false);
  const [noNight, setNoNight] = useState(false);
  const ref = useRef<HTMLElement | null>(null);

  const onMove = (e: React.MouseEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--ry", `${(x * 7).toFixed(2)}deg`);
    el.style.setProperty("--rx", `${(-y * 6).toFixed(2)}deg`);
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--rx", "0deg");
  };

  return (
    <>
      <style>{HERO_STYLES}</style>
      <section ref={ref} className="id-hero" onMouseMove={onMove} onMouseLeave={onLeave}>
        <div className="id-clip" aria-hidden="true">
          {!noDay && <img src={DAY_IMG} alt="" className="id-photo" onError={() => setNoDay(true)} />}
          {!noNight && <img src={NIGHT_IMG} alt="" className="id-photo night" onError={() => setNoNight(true)} />}
          <div className="id-shade" />
        </div>

        <div className="id-col-l">
          <div className="id-glass id-main">
            <p className="id-hello">{hello}</p>
            <h1 className={`id-headline${bad ? " bad" : ""}`}>{loading ? "Hämtar läget…" : headline}</h1>
            <p className="id-sub">{loading ? "" : sub}</p>
          </div>

          {next ? (
            <Link to={next.to as never} className="id-glass id-next">
              <div className="id-next-label">{next.label}</div>
              <div className="id-next-title">{next.title}</div>
              <div className="id-next-sub">{next.sub}</div>
              {next.chip && <span className={`hk-chip ${next.chip.cls}`}>{next.chip.text}</span>}
            </Link>
          ) : (
            <div className="id-glass id-next">
              <div className="id-next-label">Nästa upp</div>
              <div className="id-next-empty">{emptyNext}</div>
            </div>
          )}

          <div className="id-tiles">
            {tiles.map((t) => {
              const cls = `id-glass id-tile${t.tone ? ` ${t.tone}` : ""}${t.wide ? " wide" : ""}`;
              const inner = (
                <>
                  <div className="id-tile-l">{t.label}</div>
                  <div className="id-tile-n">{t.n}</div>
                </>
              );
              if (t.to) {
                return (
                  <Link key={t.label} to={t.to as never} className={cls}>
                    {inner}
                  </Link>
                );
              }
              if (t.anchor) {
                return (
                  <button key={t.label} type="button" className={cls} onClick={() => scrollToId(t.anchor!)}>
                    {inner}
                  </button>
                );
              }
              return (
                <div key={t.label} className={cls}>
                  {inner}
                </div>
              );
            })}
          </div>
        </div>

        <div className="id-col-r">
          <div className="id-bellslot">
            <HeroBell />
          </div>
        </div>

        {chips && chips.length > 0 && (
          <div className="id-props">
            <span className="id-props-label">{chipsLabel}</span>
            {chips.map((c) => (
              <button key={c.id} type="button" className="id-chip" aria-pressed={selected === c.id} onClick={() => onSelect?.(c.id)}>
                <span className={`id-dot ${c.level === "ok" ? "" : c.level}`} />
                {c.name}
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
