import { Link } from "@tanstack/react-router";
import { HeroBell } from "@/components/HomeKit";

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

/**
 * Startsidornas hjälte: bara text, inga bilder.
 * BAYT-uttrycket kommer från guldlinjen överst, den korta färgstaplen på varje ruta
 * och den svaga takkonturen i hörnet (samma form som A:et i loggan).
 * Allt under hjälten (rubriker, paneler, fastighetskort) får samma språk via reglerna längst ned.
 */
export const HERO_STYLES = `
  .id-hero {
    position: relative; margin-top: 8px; border-radius: 24px; padding: 34px 38px 30px;
    background: linear-gradient(160deg, #163a2d 0%, #0f2a21 55%, #0b1d17 100%);
    border: 1px solid rgba(255,255,255,0.08); border-top: 3px solid #E8C464;
    display: grid; gap: 22px;
  }
  /* Takkontur i hörnet. Dekoration, bara linjer. */
  .id-roof { position: absolute; right: 0; top: 0; width: 380px; height: 230px; pointer-events: none; overflow: hidden; border-radius: 0 24px 0 0; }
  .id-roof svg { position: absolute; right: 64px; top: 14px; width: 262px; height: auto; }

  .id-top { position: relative; z-index: 60; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 24px; align-items: start; }
  .id-hello { display: inline-flex; align-items: center; gap: 10px; color: #E8C464; font-size: 19.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; margin: 0 0 12px; }
  .id-hello::before { content: ""; width: 26px; height: 2px; background: #E8C464; border-radius: 2px; }
  .id-headline { font-family: Outfit, Inter, system-ui, sans-serif; font-size: 55px; line-height: 1.05; font-weight: 600; margin: 0 0 12px; color: #f2f7ec; letter-spacing: -0.01em; }
  .id-headline.bad { color: #F2E3BC; }
  .id-sub { font-size: 24px; line-height: 1.55; color: #bccdb6; margin: 0; max-width: 860px; }

  .id-bellslot { display: flex; justify-content: flex-end; }
  .id-bellslot .hk-herobell { position: static; transform: none; flex-direction: row-reverse; gap: 12px; }
  .id-bellslot .hk-bell-label { display: block; }
  .id-bellslot .hk-bellring { position: relative; }
  .id-bellslot .hk-bellring [role="dialog"] { top: calc(100% + 14px) !important; right: 0 !important; left: auto !important; }
  .id-bellslot .hk-bellring button[aria-label] { width: 64px !important; height: 64px !important; min-width: 64px !important; min-height: 64px !important; }
  .id-bellslot .hk-bellring button[aria-label] svg { width: 30px; height: 30px; }
  .id-bellslot .hk-bellring button[aria-label] > span { min-width: 22px !important; height: 22px !important; font-size: 17px !important; }

  .id-next {
    position: relative; z-index: 2; display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
    padding: 16px 20px 16px 22px; border-radius: 16px; text-decoration: none; color: inherit;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-left: 4px solid #E8C464;
  }
  a.id-next:hover { border-color: rgba(232,196,100,0.6); border-left-color: #E8C464; background: rgba(255,255,255,0.07); }
  .id-next.empty { border-left-color: #5CB84A; }
  .id-next-label { flex: 0 0 150px; font-size: 17px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #E8C464; }
  .id-next.empty .id-next-label { color: #8be07a; }
  .id-next-body { flex: 1; min-width: 200px; }
  .id-next-title { font-family: Outfit, Inter, system-ui, sans-serif; font-size: 30px; font-weight: 600; overflow-wrap: anywhere; }
  .id-next-sub { font-size: 19.5px; color: #a9bda5; margin-top: 2px; }
  .id-next-empty { font-size: 22.5px; color: #c9d6c3; }
  .id-next-go { color: #E8C464; font-size: 30px; line-height: 1; }

  .id-tiles { position: relative; z-index: 2; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
  .id-tile {
    position: relative; padding: 20px 18px 16px; border-radius: 16px; overflow: hidden;
    background: rgba(255,255,255,0.045); border: 1px solid rgba(255,255,255,0.09);
    --accent: #5CB84A;
  }
  .id-tile::before { content: ""; position: absolute; left: 18px; top: 0; width: 34px; height: 3px; border-radius: 0 0 3px 3px; background: var(--accent); }
  a.id-tile, button.id-tile {
    display: block; text-decoration: none; color: inherit; font: inherit; text-align: left; cursor: pointer;
    -webkit-appearance: none; appearance: none; width: 100%; box-sizing: border-box;
  }
  a.id-tile::after, button.id-tile::after { content: "→"; position: absolute; right: 16px; top: 16px; font-size: 24px; color: #9fb79f; opacity: 0.55; transition: transform 0.15s ease, opacity 0.15s ease; }
  a.id-tile:hover, button.id-tile:hover { border-color: rgba(92,184,74,0.7); background: rgba(255,255,255,0.07); }
  a.id-tile:hover::after, button.id-tile:hover::after { opacity: 1; transform: translateX(3px); color: #fff; }
  .id-tile-l { font-size: 16.5px; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase; color: #9fb79f; padding-right: 26px; min-height: 44px; line-height: 22px; }
  .id-tile-n { font-family: Outfit, Inter, system-ui, sans-serif; font-size: 53px; font-weight: 600; line-height: 1; margin-top: 12px; color: #eaf2df; }
  .id-tile.bad { --accent: #E0566F; border-color: #8B1A2B; background: rgba(122,20,38,0.34); }
  .id-tile.bad .id-tile-n { color: #F8E9C8; }
  .id-tile.warn { --accent: #FFD37A; }
  .id-tile.warn .id-tile-n { color: #ffd37a; }
  .id-tile.good { --accent: #8be07a; }
  .id-tile.good .id-tile-n { color: #8be07a; }

  .id-props { position: relative; z-index: 2; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; padding-top: 18px; border-top: 1px solid rgba(255,255,255,0.08); }
  .id-props-label { font-size: 17px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #9fb79f; margin-right: 6px; }
  .id-chip {
    display: inline-flex; align-items: center; gap: 10px; height: 46px; padding: 0 20px; border-radius: 999px; cursor: pointer; font: inherit;
    font-size: 19.5px; font-weight: 600; color: #dbe8d4; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.14);
  }
  .id-chip:hover { border-color: rgba(92,184,74,0.7); color: #fff; }
  .id-chip[aria-pressed="true"] { border-color: #E8C464; background: rgba(232,196,100,0.14); color: #fff; }
  .id-dot { width: 8px; height: 8px; border-radius: 50%; background: #8be07a; }
  .id-dot.warn { background: #ffd37a; }
  .id-dot.bad { background: #E0566F; }

  /* ---------- Resten av startsidan i samma språk ---------- */
  .hk-h2 { display: flex; align-items: center; gap: 12px; letter-spacing: -0.005em; }
  .hk-h2::before { content: ""; width: 4px; height: 22px; border-radius: 2px; background: #E8C464; flex-shrink: 0; }
  .hk-panel { border-radius: 18px; background: rgba(255,255,255,0.045); border: 1px solid rgba(255,255,255,0.09); border-top: 3px solid rgba(92,184,74,0.55); padding: 2px 0 6px; }
  .hk-panel-title { display: flex; align-items: center; gap: 10px; font-family: Outfit, Inter, system-ui, sans-serif; font-size: 25.5px; font-weight: 600; }
  .hk-row { border-top-color: rgba(255,255,255,0.07); }
  .hk-prop { border-radius: 16px; border-left: 4px solid rgba(92,184,74,0.55); }
  .hk-prop[aria-pressed="true"] { border-color: #E8C464; box-shadow: 0 0 0 1px rgba(232,196,100,0.5); }
  .hk-action { background: rgba(255,255,255,0.05); }

  @media (max-width: 1100px) {
    .id-hero { padding: 28px 26px 26px; }
    .id-headline { font-size: 45.5px; }
    .id-roof { width: 260px; }
  }
  @media (max-width: 768px) {
    .id-hero { padding: 22px 16px 20px; border-radius: 20px; gap: 16px; }
    .id-top { grid-template-columns: minmax(0, 1fr); gap: 14px; }
    .id-bellslot { justify-content: flex-start; order: -1; }
    .id-bellslot .hk-herobell { flex-direction: row; }
    .id-headline { font-size: 34.5px; }
    .id-sub { font-size: 16.5px; }
    .id-next-label { flex-basis: 100%; }
    .id-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .id-tile { padding: 18px 14px 14px; }
    .id-tile-n { font-size: 39px; }
    .id-roof { display: none; }
    .id-bellslot .hk-bellring [role="dialog"] {
      position: fixed !important; top: 70px !important; left: 8px !important; right: 8px !important; width: auto !important;
    }
  }
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
  return (
    <>
      <style>{HERO_STYLES}</style>
      <section className="id-hero">
        <div className="id-roof" aria-hidden="true">
          <svg viewBox="0 0 300 242" fill="none">
            <polygon points="150,0 300,242 247,242 150,82 54,242 0,242" fill="rgba(251,246,236,0.17)" />
            <polygon points="150,126 194,174 194,238 107,238 107,174" fill="rgba(92,184,74,0.55)" />
          </svg>
        </div>

        <div className="id-top">
          <div>
            <p className="id-hello">{hello}</p>
            <h1 className={`id-headline${bad ? " bad" : ""}`}>{loading ? "Hämtar läget…" : headline}</h1>
            <p className="id-sub">{loading ? "" : sub}</p>
          </div>
          <div className="id-bellslot">
            <HeroBell />
          </div>
        </div>

        {next ? (
          <Link to={next.to as never} className="id-next">
            <div className="id-next-label">{next.label}</div>
            <div className="id-next-body">
              <div className="id-next-title">{next.title}</div>
              <div className="id-next-sub">{next.sub}</div>
            </div>
            {next.chip && <span className={`hk-chip ${next.chip.cls}`}>{next.chip.text}</span>}
            <span className="id-next-go" aria-hidden="true">
              →
            </span>
          </Link>
        ) : (
          <div className="id-next empty">
            <div className="id-next-label">Nästa upp</div>
            <div className="id-next-body">
              <div className="id-next-empty">{emptyNext}</div>
            </div>
          </div>
        )}

        <div className="id-tiles">
          {tiles.map((t) => {
            const cls = `id-tile${t.tone ? ` ${t.tone}` : ""}`;
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
