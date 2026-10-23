const S = 36;
const C = 0.866;

type Pt = [number, number];
const P = (x: number, y: number, z: number): Pt => [(x - y) * C * S, (x + y) * 0.5 * S - z * S];
const pts = (a: Pt[]) => a.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
const quad = (x: number, y: number, z: number, ux: number, uy: number, uz: number, vx: number, vy: number, vz: number) =>
  pts([P(x, y, z), P(x + ux, y + uy, z + uz), P(x + ux + vx, y + uy + vy, z + uz + vz), P(x + vx, y + vy, z + vz)]);

const hash = (a: number, b: number, s: number) => Math.abs((a * 73856093) ^ (b * 19349663) ^ (s * 83492791)) % 100;

function Windows({
  kind,
  fixed,
  a0,
  a1,
  cols,
  z0,
  rows,
  seed,
}: {
  kind: "x" | "y";
  fixed: number;
  a0: number;
  a1: number;
  cols: number;
  z0: number;
  rows: number;
  seed: number;
}) {
  const w = (a1 - a0) / cols;
  const m = 0.2;
  const out: JSX.Element[] = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const a = a0 + i * w + m;
      const len = w - 2 * m;
      const z = z0 + j + 0.2;
      const h = hash(i, j, seed);
      const lit = h < 42;
      const points = kind === "y" ? quad(a, fixed, z, len, 0, 0, 0, 0, 0.6) : quad(fixed, a, z, 0, len, 0, 0, 0, 0.6);
      out.push(
        <polygon
          key={`${kind}-${seed}-${i}-${j}`}
          points={points}
          fill={lit ? "url(#b3-lit)" : "url(#b3-glass)"}
          className={lit ? "b3-lit" : undefined}
          style={lit ? { animationDelay: `${(h % 9) * 0.7}s`, animationDuration: `${4 + (h % 5)}s` } : undefined}
        />,
      );
    }
  }
  return <>{out}</>;
}

function Tree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  const [bx, by] = P(x, y, 0);
  const h = 34 * s;
  return (
    <g>
      <ellipse cx={bx} cy={by + 2} rx={22 * s} ry={9 * s} fill="rgba(0,0,0,0.25)" />
      <line x1={bx} y1={by} x2={bx} y2={by - h * 0.7} stroke="#4a3a2a" strokeWidth={4 * s} strokeLinecap="round" />
      <ellipse cx={bx} cy={by - h} rx={20 * s} ry={22 * s} fill="#2f7d45" />
      <ellipse cx={bx - 6 * s} cy={by - h - 6 * s} rx={13 * s} ry={14 * s} fill="#46a35a" />
      <ellipse cx={bx + 8 * s} cy={by - h + 4 * s} rx={11 * s} ry={12 * s} fill="#256b3a" />
    </g>
  );
}

function Pin({ x, y, z, label }: { x: number; y: number; z: number; label: string }) {
  const [px, py] = P(x, y, z);
  const w = label.length * 7 + 20;
  return (
    <g>
      <circle cx={px} cy={py} r={9} className="b3-ring" />
      <circle cx={px} cy={py} r={6} fill="#5CB84A" stroke="#fff" strokeWidth={2} />
      <rect x={px + 12} y={py - 12} width={w} height={24} rx={12} fill="rgba(11,29,23,0.85)" stroke="rgba(255,255,255,0.35)" />
      <text x={px + 12 + w / 2} y={py + 4} textAnchor="middle" fontSize={12} fontWeight={600} fill="#e6efd8" fontFamily="Inter, system-ui, sans-serif">
        {label}
      </text>
    </g>
  );
}

const CSS = `
  .b3-wrap { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
  .b3-svg { width: 100%; height: 100%; max-height: 100%; overflow: visible; }
  .b3-float { animation: b3Float 7s ease-in-out infinite; }
  @keyframes b3Float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
  .b3-lit { animation-name: b3Twinkle; animation-iteration-count: infinite; animation-timing-function: ease-in-out; }
  @keyframes b3Twinkle { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
  .b3-ring { fill: rgba(92,184,74,0.35); transform-box: fill-box; transform-origin: center; animation: b3Ring 2.4s ease-out infinite; }
  @keyframes b3Ring { 0% { transform: scale(1); opacity: 0.9; } 100% { transform: scale(3.2); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .b3-float, .b3-lit, .b3-ring { animation: none; } }
`;

export function Building3D() {
  return (
    <div className="b3-wrap" aria-hidden="true">
      <style>{CSS}</style>
      <svg className="b3-svg" viewBox="-340 -330 680 670" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="b3-faceL" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f1f4f2" />
            <stop offset="1" stopColor="#cfd6d2" />
          </linearGradient>
          <linearGradient id="b3-faceR" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d4dad6" />
            <stop offset="1" stopColor="#a9b4ae" />
          </linearGradient>
          <linearGradient id="b3-glass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2b5a55" />
            <stop offset="1" stopColor="#0f2824" />
          </linearGradient>
          <linearGradient id="b3-lit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffe6a8" />
            <stop offset="1" stopColor="#f1b657" />
          </linearGradient>
          <linearGradient id="b3-lawn" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3f8f4f" />
            <stop offset="1" stopColor="#25603a" />
          </linearGradient>
          <filter id="b3-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
        </defs>

        <g className="b3-float">
          {/* Mark */}
          <polygon points={quad(-1.5, 8.5, -0.5, 9.5, 0, 0, 0, 0, 0.5)} fill="#173b2b" />
          <polygon points={quad(8, -1.5, -0.5, 0, 10, 0, 0, 0, 0.5)} fill="#0f2a1f" />
          <polygon points={quad(-1.5, -1.5, 0, 9.5, 0, 0, 0, 10, 0)} fill="url(#b3-lawn)" />
          <ellipse cx={0} cy={110} rx={190} ry={60} fill="rgba(0,0,0,0.30)" filter="url(#b3-blur)" />

          {/* Träd bakom */}
          <Tree x={-1} y={0.8} s={0.95} />
          <Tree x={1.5} y={-1} s={1} />
          <Tree x={7.2} y={-0.8} s={1.05} />

          {/* Huvudbyggnad A: x 0..6, y 0..4, höjd 8 */}
          <polygon points={quad(0, 4, 0, 6, 0, 0, 0, 0, 8)} fill="url(#b3-faceL)" />
          <polygon points={quad(6, 0, 0, 0, 4, 0, 0, 0, 8)} fill="url(#b3-faceR)" />
          <polygon points={quad(0, 0, 8, 6, 0, 0, 0, 4, 0)} fill="#f7f9f8" />
          <polygon points={quad(0.5, 0.5, 8, 5, 0, 0, 0, 3, 0)} fill="#e3e8e5" />
          {/* Takkant */}
          <polygon points={quad(0, 4, 7.7, 6, 0, 0, 0, 0, 0.3)} fill="#1f4a3c" />
          <polygon points={quad(6, 0, 7.7, 0, 4, 0, 0, 0, 0.3)} fill="#163a2e" />
          {/* Tekniskt tak */}
          <polygon points={quad(1.5, 1.2, 8, 2, 0, 0, 0, 1.6, 0)} fill="#cdd5d1" />
          <polygon points={quad(1.5, 2.8, 8, 2, 0, 0, 0, 0, 0.8)} fill="#dfe5e2" />
          <polygon points={quad(3.5, 1.2, 8, 0, 1.6, 0, 0, 0, 0.8)} fill="#b9c3be" />
          <polygon points={quad(1.5, 1.2, 8.8, 2, 0, 0, 0, 1.6, 0)} fill="#eef2f0" />

          <Windows kind="y" fixed={4} a0={0} a1={6} cols={6} z0={3} rows={5} seed={1} />
          <Windows kind="x" fixed={6} a0={0} a1={4} cols={4} z0={0} rows={8} seed={2} />

          {/* Lägre flygel B: x 0..6, y 4..7, höjd 3 */}
          <polygon points={quad(0, 7, 0, 6, 0, 0, 0, 0, 3)} fill="url(#b3-faceL)" />
          <polygon points={quad(6, 4, 0, 0, 3, 0, 0, 0, 3)} fill="url(#b3-faceR)" />
          <polygon points={quad(0, 4, 3, 6, 0, 0, 0, 3, 0)} fill="#6fae62" />
          <polygon points={quad(0.3, 4.3, 3, 5.4, 0, 0, 0, 2.4, 0)} fill="#4f9a4a" />
          <polygon points={quad(0, 7, 3, 6, 0, 0, 0, 0, 0.35)} fill="#1f4a3c" />
          <polygon points={quad(6, 4, 3, 0, 3, 0, 0, 0, 0.35)} fill="#163a2e" />
          <Windows kind="y" fixed={7} a0={0} a1={6} cols={6} z0={0} rows={3} seed={3} />
          <Windows kind="x" fixed={6} a0={4} a1={7} cols={3} z0={0} rows={3} seed={4} />

          {/* Växter på terrassen */}
          {[
            [1, 5.2],
            [2.4, 6.2],
            [4.2, 5],
            [5.2, 6.1],
          ].map(([x, y], i) => {
            const [px, py] = P(x, y, 3.4);
            return (
              <g key={i}>
                <ellipse cx={px} cy={py} rx={9} ry={9} fill="#2f7d45" />
                <ellipse cx={px - 2} cy={py - 3} rx={6} ry={6} fill="#4cae62" />
              </g>
            );
          })}

          {/* Träd framför */}
          <Tree x={7.6} y={3.2} s={1.1} />
          <Tree x={7.6} y={7.2} s={1} />
          <Tree x={-1} y={7.6} s={0.95} />
          <Tree x={-1} y={3.4} s={0.9} />

          <Pin x={3} y={2} z={9.6} label="Tak" />
          <Pin x={6.1} y={2} z={4.5} label="Hiss" />
        </g>
      </svg>
    </div>
  );
}
