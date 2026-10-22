import { useEffect, useRef, useState } from "react";

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

const LOGO_SRC = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(WORD_SVG)}`;
const ASPECT = 1760 / 490;
const DEFAULT_SECONDS = 300; // 5 minuter

// För test: lägg ?ss=10 efter adressen så startar den efter 10 sekunder.
function idleSeconds(): number {
  try {
    const v = new URLSearchParams(window.location.search).get("ss");
    const n = v ? Number(v) : NaN;
    if (n >= 5 && n <= 3600) return n;
  } catch {
    /* ignoreras */
  }
  return DEFAULT_SECONDS;
}

const STYLES = `
  .ss-overlay {
    position: fixed; inset: 0; z-index: 9999; background: #050f0b; overflow: hidden; cursor: none;
    animation: ssFade 0.9s ease both;
  }
  @keyframes ssFade { from { opacity: 0; } to { opacity: 1; } }
  .ss-box { position: absolute; left: 0; top: 0; will-change: transform; }
  .ss-logo { display: block; width: 100%; height: auto; animation: ssBeat 4s ease-in-out infinite; transform-origin: center; }
  @keyframes ssBeat {
    0%   { transform: scale(1);     filter: drop-shadow(0 0 10px rgba(80,200,100,0.30)) brightness(1); }
    14%  { transform: scale(1.04);  filter: drop-shadow(0 0 26px rgba(110,240,130,0.65)) brightness(1.2); }
    28%  { transform: scale(1.01);  filter: drop-shadow(0 0 14px rgba(80,200,100,0.35)) brightness(1.05); }
    42%  { transform: scale(1.05);  filter: drop-shadow(0 0 34px rgba(130,255,140,0.8)) brightness(1.3); }
    68%  { transform: scale(1);     filter: drop-shadow(0 0 10px rgba(80,200,100,0.30)) brightness(1); }
    100% { transform: scale(1);     filter: drop-shadow(0 0 10px rgba(80,200,100,0.30)) brightness(1); }
  }
  @media (prefers-reduced-motion: reduce) { .ss-logo { animation: none; } }
`;

const WAKE_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "wheel", "scroll", "pointerdown"] as const;

export function Screensaver() {
  const [active, setActive] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const activatedAt = useRef(0);

  // Väntar på inaktivitet.
  useEffect(() => {
    const ms = idleSeconds() * 1000;
    let timer: ReturnType<typeof setTimeout>;

    const start = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // Aldrig under Fastighetspresentation.
        if (window.location.pathname.includes("fastighetspresentation")) {
          start();
          return;
        }
        activatedAt.current = Date.now();
        setActive(true);
      }, ms);
    };

    const onActivity = () => {
      if (active) {
        // Liten marginal så att skärmsläckaren inte stängs av sin egen start.
        if (Date.now() - activatedAt.current > 600) setActive(false);
        return;
      }
      start();
    };

    start();
    WAKE_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => {
      clearTimeout(timer);
      WAKE_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [active]);

  // Låter loggan glida runt och studsa mjukt mot kanterna.
  useEffect(() => {
    if (!active) return;
    const el = boxRef.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const W = Math.min(460, window.innerWidth * 0.6);
    const H = W / ASPECT;
    el.style.width = `${W}px`;

    let x = Math.max(0, (window.innerWidth - W) / 2);
    let y = Math.max(0, (window.innerHeight - H) / 2);
    el.style.transform = `translate(${x}px, ${y}px)`;
    if (reduce) return;

    x = Math.random() * Math.max(1, window.innerWidth - W);
    y = Math.random() * Math.max(1, window.innerHeight - H);
    let vx = 90;
    let vy = 65;
    let last = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const maxX = Math.max(0, window.innerWidth - W);
      const maxY = Math.max(0, window.innerHeight - H);
      x += vx * dt;
      y += vy * dt;
      if (x <= 0) {
        x = 0;
        vx = Math.abs(vx);
      } else if (x >= maxX) {
        x = maxX;
        vx = -Math.abs(vx);
      }
      if (y <= 0) {
        y = 0;
        vy = Math.abs(vy);
      } else if (y >= maxY) {
        y = maxY;
        vy = -Math.abs(vy);
      }
      el.style.transform = `translate(${x}px, ${y}px)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  if (!active) return null;
  return (
    <>
      <style>{STYLES}</style>
      <div className="ss-overlay" aria-hidden="true">
        <div className="ss-box" ref={boxRef}>
          <img src={LOGO_SRC} alt="" className="ss-logo" />
        </div>
      </div>
    </>
  );
}
