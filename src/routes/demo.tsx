import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Image as ImageIcon, Settings as SettingsIcon } from "lucide-react";
const baytLogo = `${import.meta.env.BASE_URL}assets/bayt-logo.png`;
const buildingSketch = `${import.meta.env.BASE_URL}assets/building-sketch-2.png`;

export const Route = createFileRoute("/demo")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "BAYT — Rundtur" },
      { name: "description", content: "Se hur BAYT hanterar ärenden från anmälan till arkiv." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DemoPage,
});

/* ---------- Tokens ---------- */
const T = {
  dark: "#0D2B1E",
  green: "#5CB84A",
  greenDark: "#3D8A30",
  bg: "#F5F1EA",
  card: "#FFFFFF",
  border: "#E5E7EB",
  text: "#1a1a1a",
  muted: "#6B7280",
  red: "#DC2626",
  yellow: "#D4A017",
  overlay: "rgba(13,43,30,0.75)",
  radius: 10,
  headingFont: "Outfit, Inter, system-ui, sans-serif",
  bodyFont: "Inter, system-ui, sans-serif",
};

/* ---------- Mock data ---------- */
type Issue = {
  id: string; title: string; where: string;
  priority: "AKUT" | "HÖG" | "NORMAL" | "LÅG";
  deadlineLabel: string; deadlineDays: number;
  desc: string;
};
const ISSUES: Issue[] = [
  { id: "i1", title: "Vattenläcka under diskbänk", where: "Lgh 1102, Storgatan 4", priority: "AKUT", deadlineLabel: "Åtgärdas senast: idag", deadlineDays: 0, desc: "Vatten läcker från kopplingen under diskbänken. Hyresgäst har stängt av kranen." },
  { id: "i2", title: "Trasig ytterbelysning", where: "Trappuppgång A", priority: "NORMAL", deadlineLabel: "Åtgärdas senast: om 3 dagar", deadlineDays: 3, desc: "Lampa slocknar vid entrén." },
  { id: "i3", title: "Element blir inte varmt", where: "Lgh 0203", priority: "HÖG", deadlineLabel: "Åtgärdas senast: om 2 dagar", deadlineDays: 2, desc: "Element i sovrummet förblir kallt." },
  { id: "i4", title: "Låset i källardörren hakar", where: "Källare, plan -1", priority: "LÅG", deadlineLabel: "Åtgärdas senast: om 10 dagar", deadlineDays: 10, desc: "Nyckel går trögt i låset." },
];

const PRIO_COLOR: Record<Issue["priority"], string> = {
  AKUT: T.red, HÖG: T.red, NORMAL: T.yellow, LÅG: T.green,
};

/* ---------- Step definitions ---------- */
type Screen = "fastighet-card" | "fastighet-meny" | "list" | "detail" | "lagenheter" | "besiktningar" | "oversikt" | "panel";
type Step = {
  screen: Screen;
  panel?: "welcome" | "closing";
  targetKey?: string;
  subTargets?: string[]; // for step 2 photo/priority/deadline cycle
  heading?: string;
  body?: string;
  advanceLabel?: string; // textbox button
  spotlightPadding?: number;
};

const STEPS: Step[] = [
  {
    screen: "panel", panel: "welcome",
    heading: "Så här sköter vi er fastighet.",
    body: "Det här är BAYT — systemet vi arbetar i varje dag. På två minuter visar vi vägen ett ärende tar: från anmälan till åtgärd, dokumentation och arkiv.",
    advanceLabel: "Starta rundturen →",
  },
  {
    screen: "fastighet-card", targetKey: "fastighet-card",
    heading: "Er fastighet.",
    body: "Allt som rör er fastighet samlas här — ärenden, lägenheter, besiktningar, objekt och historik.",
    advanceLabel: "Nästa →",
  },
  {
    screen: "fastighet-meny", targetKey: "fastighet-meny",
    heading: "Allt på ett ställe.",
    body: "Härifrån når förvaltaren varje del av er fastighet direkt.",
    advanceLabel: "Nästa →",
  },
  {
    screen: "list", targetKey: "issue-i1",
    heading: "Ett fel har anmälts.",
    body: "Anmälan syns direkt i systemet — med fastighet, lägenhet, bild och beskrivning.",
    advanceLabel: "Nästa →",
  },
  {
    screen: "detail", subTargets: ["detail-photo", "detail-priority", "detail-deadline"],
    heading: "Varje ärende får en prioritet och en deadline.",
    body: "Deadlinen styr sedan hur ärendet följs upp i systemet.",
    advanceLabel: "Nästa →",
  },
  {
    screen: "detail", targetKey: "detail-oppna",
    heading: "Ärendet aktiveras.",
    body: "Ett öppet ärende lyfts in i veckoplaneringen och syns tills det är löst.",
    advanceLabel: "Nästa →",
  },
  {
    screen: "detail", targetKey: "detail-comments",
    heading: "Varje steg loggas.",
    body: "Åtgärder dokumenteras med tid, text och foto — och finns kvar att slå upp senare.",
    advanceLabel: "Nästa →",
  },
  {
    screen: "detail", targetKey: "detail-avsluta",
    heading: "Fastigheten minns.",
    body: "Avslutade ärenden skrivs automatiskt in i fastighetens loggbok — en permanent historik över allt som gjorts.",
    advanceLabel: "Nästa →",
  },
  {
    screen: "lagenheter", targetKey: "lagenheter-objekt",
    heading: "Lägenheter och objekt.",
    body: "Alla lägenheter och gemensamma utrymmen — hiss, tvättrum, förråd, SBA — finns registrerade och kopplade till sin historik.",
    advanceLabel: "Nästa →",
  },
  {
    screen: "besiktningar", targetKey: "besiktningar-lista",
    heading: "Besiktningar och tillsyn.",
    body: "BRF har lagkrav på regelbundna besiktningar. BAYT håller koll på vad som ska göras och när — ingenting missas.",
    advanceLabel: "Nästa →",
  },
  {
    screen: "oversikt", subTargets: ["ov-oppna", "ov-besikt", "ov-projekt"],
    heading: "Helheten.",
    body: "Alla fastigheter på en plats: öppna ärenden, kommande besiktningar, pågående projekt.",
    advanceLabel: "Nästa →",
  },
  {
    screen: "panel", panel: "closing",
    heading: "Omsorg går att spåra.",
    body: "Varje ärende har en deadline, varje åtgärd ett foto, varje beslut en plats i historiken. Det är så vi förvaltar.",
  },
];

/* ---------- Component ---------- */
function DemoPage() {
  const [step, setStep] = useState(0);
  const [sub, setSub] = useState(0);
  // demo state that persists across steps
  const [i1Status, setI1Status] = useState<"ny" | "oppet" | "avslutat">("ny");
  const [logbookAdded, setLogbookAdded] = useState(false);
  const [fade, setFade] = useState(1);

  const cur = STEPS[step];
  const totalSteps = STEPS.length;

  // reset sub when step changes; run screen fade
  const prevScreenRef = useRef<Screen>(cur.screen);
  useEffect(() => {
    setSub(0);
    if (prevScreenRef.current !== cur.screen) {
      setFade(0);
      const t = setTimeout(() => setFade(1), 200);
      prevScreenRef.current = cur.screen;
      return () => clearTimeout(t);
    }
  }, [step, cur.screen]);

  // Active target key for spotlight
  const activeTargetKey = cur.subTargets ? cur.subTargets[sub] : cur.targetKey;

  const goNext = () => {
    // handle the detail-avsluta press, which also flips status & adds logbook entry
    if (cur.targetKey === "detail-avsluta" && i1Status === "oppet") {
      setI1Status("avslutat");
      setLogbookAdded(true);
    }
    if (cur.targetKey === "detail-oppna" && i1Status === "ny") setI1Status("oppet");
    setStep((s) => Math.min(s + 1, totalSteps - 1));
  };
  const goBack = () => setStep((s) => Math.max(s - 1, 0));
  const skip = () => setStep(totalSteps - 1);
  const restart = () => {
    setStep(0); setSub(0); setI1Status("ny"); setLogbookAdded(false);
  };

  const advanceTextbox = () => {
    if (cur.subTargets && sub < cur.subTargets.length - 1) {
      setSub(sub + 1);
      return;
    }
    goNext();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: T.bg, overflow: "hidden",
      fontFamily: T.bodyFont, color: T.text,
    }}>
      <style>{`
        @keyframes bayt-pulse-glow {
          0%,100% { box-shadow: 0 0 0 3px rgba(92,184,74,0.55), 0 0 22px 6px rgba(92,184,74,0.35); }
          50%     { box-shadow: 0 0 0 6px rgba(92,184,74,0.35), 0 0 32px 12px rgba(92,184,74,0.55); }
        }
        @keyframes bayt-fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .bayt-scroll::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Progress bar */}
      <TopBar
        step={step}
        total={totalSteps}
        onSkip={skip}
        onBack={goBack}
      />

      {/* Screen area */}
      <div style={{
        position: "absolute",
        top: 56, left: 0, right: 0, bottom: 0,
        opacity: fade, transition: "opacity 200ms ease",
      }}>
        <div className="bayt-scroll" style={{
          position: "absolute", inset: 0, overflowY: "auto", overflowX: "hidden",
          WebkitOverflowScrolling: "touch",
        }}>
          {cur.screen === "fastighet-card" && <FastighetCardScreen />}
          {cur.screen === "fastighet-meny" && <FastighetMenuScreen />}
          {cur.screen === "list" && <ListScreen i1Status={i1Status} />}
          {cur.screen === "detail" && (
            <DetailScreen status={i1Status} logbookAdded={logbookAdded} highlightComments={activeTargetKey === "detail-comments"} />
          )}
          {cur.screen === "lagenheter" && <LagenheterScreen />}
          {cur.screen === "besiktningar" && <BesiktningarScreen />}
          {cur.screen === "oversikt" && <OversiktScreen />}
          {cur.screen === "panel" && cur.panel === "welcome" && <WelcomePanel />}
          {cur.screen === "panel" && cur.panel === "closing" && (
            <ClosingPanel onRestart={restart} />
          )}
        </div>
      </div>

      {/* Spotlight + shade overlay */}
      {activeTargetKey && (
        <Spotlight
          targetKey={activeTargetKey}
          padding={cur.spotlightPadding ?? 8}
          pulseGlow
        />
      )}

      {/* Full-screen shade with no cutout when panel step (welcome/closing/flow) */}
      {!activeTargetKey && cur.screen !== "panel" && (
        <div style={{ position: "absolute", inset: 0, background: T.overlay, pointerEvents: "auto" }} />
      )}

      {/* Textbox (skip on panel screens which use their own UI) */}
      {cur.screen !== "panel" && cur.heading && (
        <TourTextbox
          heading={cur.heading}
          body={cur.body ?? ""}
          advanceLabel={cur.advanceLabel}
          onAdvance={cur.advanceLabel ? advanceTextbox : undefined}
        />
      )}

      {/* Welcome panel primary CTA */}
      {cur.screen === "panel" && cur.panel === "welcome" && (
        <WelcomeActions heading={cur.heading!} body={cur.body!} onStart={goNext} />
      )}
      {cur.screen === "panel" && cur.panel === "closing" && (
        <ClosingActions heading={cur.heading!} body={cur.body!} onRestart={restart} />
      )}
    </div>
  );
}

/* ---------- Top bar ---------- */
function TopBar({ step, total, onSkip, onBack }: { step: number; total: number; onSkip: () => void; onBack: () => void }) {
  const pct = ((step) / (total - 1)) * 100;
  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, height: 56,
      background: "rgba(255,255,255,0.96)", borderBottom: `1px solid ${T.border}`,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 12px", zIndex: 60,
    }}>
      <button type="button" onClick={onBack} disabled={step === 0}
        style={{ background: "transparent", border: "none", fontSize: 13, color: T.muted, cursor: step === 0 ? "default" : "pointer", opacity: step === 0 ? 0.35 : 1, padding: 6 }}>
        ← Tillbaka
      </button>
      <div style={{ flex: 1, margin: "0 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, letterSpacing: "0.05em" }}>
          Steg {step + 1} av {total}
        </div>
        <div style={{ width: "100%", maxWidth: 220, height: 3, background: "#E5E7EB", borderRadius: 999, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: T.green, transition: "width 400ms ease" }} />
        </div>
      </div>
      <button type="button" onClick={onSkip}
        style={{ background: "transparent", border: "none", fontSize: 13, color: T.muted, cursor: "pointer", padding: 6 }}>
        Hoppa över
      </button>
    </div>
  );
}

/* ---------- Spotlight ---------- */
function Spotlight({ targetKey, padding, pulseGlow }: { targetKey: string; padding: number; pulseGlow?: boolean }) {
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const prevTargetRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${targetKey}"]`);
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      setRect({ x: r.left - padding, y: r.top - padding, w: r.width + padding * 2, h: r.height + padding * 2 });
    };
    measure();
    const raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    const el = document.querySelector<HTMLElement>(`[data-tour="${targetKey}"]`);
    if (el) {
      ro.observe(el);
      // Scroll the target to vertical center when the target key changes
      if (prevTargetRef.current !== targetKey) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        prevTargetRef.current = targetKey;
      }
    }
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [targetKey, padding]);

  if (!rect) {
    return <div style={{ position: "absolute", inset: 0, background: T.overlay, zIndex: 50 }} />;
  }

  return (
    <>
      {/* Overlay held together by a single element with a giant box-shadow */}
      <div
        style={{
          position: "fixed",
          left: rect.x, top: rect.y, width: rect.w, height: rect.h,
          borderRadius: 14,
          boxShadow: `0 0 0 9999px ${T.overlay}`,
          transition: "left 400ms cubic-bezier(.4,0,.2,1), top 400ms cubic-bezier(.4,0,.2,1), width 400ms cubic-bezier(.4,0,.2,1), height 400ms cubic-bezier(.4,0,.2,1)",
          zIndex: 50,
          pointerEvents: "none",
        }}
      />
      {/* Pulse glow highlight (non-interactive — navigation is via the Next button) */}
      <div
        style={{
          position: "fixed",
          left: rect.x, top: rect.y, width: rect.w, height: rect.h,
          borderRadius: 14,
          pointerEvents: "none",
          zIndex: 55,
          animation: pulseGlow ? "bayt-pulse-glow 1.6s ease-in-out infinite" : undefined,
          transition: "left 400ms cubic-bezier(.4,0,.2,1), top 400ms cubic-bezier(.4,0,.2,1), width 400ms cubic-bezier(.4,0,.2,1), height 400ms cubic-bezier(.4,0,.2,1)",
        }}
      />
    </>
  );
}

/* ---------- Textbox ---------- */
function TourTextbox({ heading, body, advanceLabel, onAdvance }: {
  heading: string; body: string; advanceLabel?: string; onAdvance?: () => void;
}) {
  return (
    <div style={{
      position: "fixed", left: 12, right: 12, bottom: 16, zIndex: 70,
      background: T.card, borderRadius: T.radius,
      boxShadow: "0 20px 60px rgba(0,0,0,0.35), 0 0 0 1px rgba(92,184,74,0.15)",
      padding: 16,
      animation: "bayt-fade-in 260ms ease-out",
    }}>
      <h2 style={{ margin: 0, fontFamily: T.headingFont, fontSize: 17, fontWeight: 700, color: T.dark }}>{heading}</h2>
      <p style={{ margin: "8px 0 0", fontSize: 14, color: "#374151", lineHeight: 1.45 }}>{body}</p>
      {advanceLabel && onAdvance && (
        <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
          <button type="button" onClick={onAdvance}
            style={{
              height: 40, padding: "0 18px", background: T.green, color: "#fff",
              border: "none", borderRadius: T.radius, fontFamily: T.headingFont,
              fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}>
            {advanceLabel}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- Screens ---------- */
function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ padding: "16px 16px 8px" }}>
      <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>BRF Storgatan 4</div>
      <h1 style={{ margin: "4px 0 0", fontFamily: T.headingFont, fontSize: 22, fontWeight: 700, color: T.dark }}>{title}</h1>
      {subtitle && <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>{subtitle}</div>}
    </div>
  );
}

function ListScreen({ i1Status }: { i1Status: string }) {
  return (
    <div style={{ paddingBottom: 240 }}>
      <PageHeader title="Felanmälningar" subtitle={`${ISSUES.length} aktiva`} />
      <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        {ISSUES.map((i) => (
          <div key={i.id} data-tour={`issue-${i.id}`}
            style={{
              background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius,
              padding: 14, display: "flex", gap: 12, alignItems: "flex-start",
            }}>
            <span style={{
              width: 10, height: 10, borderRadius: "50%",
              background: PRIO_COLOR[i.priority], flexShrink: 0, marginTop: 5,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontFamily: T.headingFont, fontSize: 15, fontWeight: 600, color: T.dark }}>{i.title}</div>
              </div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{i.where}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                  color: PRIO_COLOR[i.priority], border: `1px solid ${PRIO_COLOR[i.priority]}`,
                  padding: "2px 6px", borderRadius: 4,
                }}>{i.priority}</span>
                <span style={{ fontSize: 12, color: T.muted }}>{i.deadlineLabel}</span>
                {i.id === "i1" && i1Status !== "ny" && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: i1Status === "oppet" ? T.green : T.muted, padding: "2px 6px", borderRadius: 4 }}>
                    {i1Status === "oppet" ? "ÖPPET" : "AVSLUTAT"}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailScreen({ status, logbookAdded, highlightComments }: { status: string; logbookAdded: boolean; highlightComments: boolean }) {
  const issue = ISSUES[0];
  const statusLabel = status === "ny" ? "Ny" : status === "oppet" ? "Öppet" : "Avslutat";
  const statusColor = status === "ny" ? T.muted : status === "oppet" ? T.green : "#4B5563";
  return (
    <div style={{ paddingBottom: 260 }}>
      <PageHeader title={issue.title} subtitle={issue.where} />
      <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Photo */}
        <div data-tour="detail-photo" style={{
          height: 180, borderRadius: T.radius, overflow: "hidden",
          background: "linear-gradient(135deg,#1a3a2e,#0D2B1E)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontFamily: T.headingFont, fontSize: 13,
          border: `1px solid ${T.border}`,
        }}>
          <div style={{ textAlign: "center", opacity: 0.85 }}>
            <ImageIcon size={34} strokeWidth={1.5} color="#fff" style={{ display: "inline-block" }} />
            <div style={{ marginTop: 4 }}>Bild från anmälare</div>
          </div>
        </div>
        {/* Priority */}
        <div data-tour="detail-priority" style={{
          background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius,
          padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ fontSize: 12, color: T.muted, fontWeight: 600, letterSpacing: "0.05em" }}>PRIORITET</div>
          <div style={{ fontFamily: T.headingFont, fontWeight: 700, color: T.red }}>AKUT — omedelbar åtgärd</div>
        </div>
        {/* Deadline */}
        <div data-tour="detail-deadline" style={{
          background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius,
          padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ fontSize: 12, color: T.muted, fontWeight: 600, letterSpacing: "0.05em" }}>DEADLINE</div>
          <div style={{ fontFamily: T.headingFont, fontWeight: 700, color: T.red }}>Åtgärdas senast: idag</div>
        </div>
        {/* Description */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: 12 }}>
          <div style={{ fontSize: 12, color: T.muted, fontWeight: 600, letterSpacing: "0.05em", marginBottom: 6 }}>BESKRIVNING</div>
          <div style={{ fontSize: 14, color: T.text }}>{issue.desc}</div>
        </div>
        {/* Status + actions */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{
            fontSize: 12, fontWeight: 700, letterSpacing: "0.05em",
            color: "#fff", background: statusColor, padding: "4px 10px", borderRadius: 999,
            transition: "background 300ms ease",
          }}>Status: {statusLabel}</span>
          {status === "ny" && (
            <button data-tour="detail-oppna" type="button" style={{
              height: 40, padding: "0 18px", background: T.green, color: "#fff",
              border: "none", borderRadius: T.radius, fontFamily: T.headingFont,
              fontSize: 14, fontWeight: 700, cursor: "pointer",
            }}>Öppna</button>
          )}
          {status === "oppet" && (
            <button data-tour="detail-avsluta" type="button" style={{
              height: 40, padding: "0 18px", background: T.dark, color: "#fff",
              border: "none", borderRadius: T.radius, fontFamily: T.headingFont,
              fontSize: 14, fontWeight: 700, cursor: "pointer",
            }}>Avsluta ärende</button>
          )}
        </div>

        {/* Comments */}
        <div data-tour="detail-comments" style={{
          background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius,
          padding: 12, display: "flex", flexDirection: "column", gap: 10,
          outline: highlightComments ? `2px solid ${T.green}` : "none",
          transition: "outline 300ms ease",
        }}>
          <div style={{ fontSize: 12, color: T.muted, fontWeight: 600, letterSpacing: "0.05em" }}>LOGG</div>
          <CommentRow time="10:12" author="Erik, förvaltare" text="Rörmokare bokad, anländer 14:00" />
          <CommentRow time="15:03" author="Erik, förvaltare" text="Läckan åtgärdad, ny koppling monterad" photo />
          {logbookAdded && (
            <CommentRow time="15:04" author="System" text="Felanmälan avslutad: Vattenläcka Lgh 1102" system />
          )}
        </div>
      </div>
    </div>
  );
}

function CommentRow({ time, author, text, photo, system }: { time: string; author: string; text: string; photo?: boolean; system?: boolean }) {
  return (
    <div style={{
      display: "flex", gap: 10, padding: 10, background: system ? "#F0F7EE" : "#F9FAFB",
      borderRadius: 8, border: system ? `1px solid ${T.green}` : `1px solid ${T.border}`,
    }}>
      <div style={{ minWidth: 44, fontSize: 11, color: T.muted, fontWeight: 600 }}>{time}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>{author}</div>
        <div style={{ fontSize: 14, color: T.text, marginTop: 2 }}>{text}</div>
        {photo && (
          <div style={{
            marginTop: 6, height: 90, borderRadius: 6, background: "linear-gradient(135deg,#1a3a2e,#0D2B1E)",
            display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
          }}><SettingsIcon size={26} strokeWidth={1.75} /></div>
        )}
      </div>
    </div>
  );
}

function FastighetCardScreen() {
  return (
    <div style={{ paddingBottom: 260 }}>
      <PageHeader title="Fastigheter" />
      <div style={{ padding: "8px 12px" }}>
        <div
          data-tour="fastighet-card"
          style={{
            background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius,
            overflow: "hidden", display: "flex", height: 140, cursor: "pointer",
          }}
        >
          <div style={{ position: "relative", width: "45%", flexShrink: 0 }}>
            <img src={buildingSketch} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <div style={{
              position: "absolute", left: 0, right: 0, bottom: 0, padding: "8px 10px",
              background: "linear-gradient(0deg, rgba(13,43,30,0.85), transparent)",
              color: "#fff", fontFamily: T.headingFont, fontSize: 13, fontWeight: 700,
            }}>
              BRF Storgatan 4
            </div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, padding: 8, justifyContent: "center" }}>
            {["Lägenheter", "Felanmälan", "Besiktningar", "Projekt", "Dokument", "Loggbok"].map((label) => (
              <div key={label} style={{
                fontSize: 11, fontWeight: 600, color: T.muted, background: "#F9FAFB",
                border: `1px solid ${T.border}`, borderRadius: 6, padding: "4px 8px",
              }}>
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FastighetMenuScreen() {
  const items = [
    { label: "Lägenheter", hint: "12 registrerade" },
    { label: "Felanmälan", hint: "4 aktiva" },
    { label: "Besiktningar", hint: "2 kommande" },
    { label: "Projekt", hint: "1 pågående" },
    { label: "Dokument", hint: "18 filer" },
    { label: "Loggbok", hint: "Full historik" },
  ];
  return (
    <div style={{ paddingBottom: 260 }}>
      <PageHeader title="BRF Storgatan 4" subtitle="Välj ett område" />
      <div data-tour="fastighet-meny" style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((it) => (
          <div key={it.label} style={{
            background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius,
            padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div style={{ fontFamily: T.headingFont, fontSize: 15, fontWeight: 600, color: T.dark }}>{it.label}</div>
            <div style={{ fontSize: 12, color: T.muted }}>{it.hint}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OversiktScreen() {
  const kpis = [
    { key: "ov-oppna", label: "Öppna ärenden", value: 7, hint: "3 akuta", color: T.red },
    { key: "ov-besikt", label: "Besiktningar", value: 2, hint: "nästa: fre 10 juli", color: T.yellow },
    { key: "ov-projekt", label: "Aktiva projekt", value: 1, hint: "Stambyte etapp 2", color: T.green },
  ];
  return (
    <div style={{ paddingBottom: 260 }}>
      <PageHeader title="Översikt" subtitle="BRF Storgatan 4" />
      <div style={{ padding: "8px 12px", display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
        {kpis.map((k) => (
          <div key={k.key} data-tour={k.key} style={{
            background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius,
            padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <div style={{ fontSize: 12, color: T.muted, fontWeight: 600, letterSpacing: "0.05em" }}>{k.label.toUpperCase()}</div>
              <div style={{ fontFamily: T.headingFont, fontSize: 32, fontWeight: 700, color: T.dark, marginTop: 4 }}>{k.value}</div>
              <div style={{ fontSize: 12, color: k.color, fontWeight: 600, marginTop: 2 }}>{k.hint}</div>
            </div>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: k.color, opacity: 0.15 }} />
          </div>
        ))}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: 16 }}>
          <div style={{ fontSize: 12, color: T.muted, fontWeight: 600, letterSpacing: "0.05em" }}>SENAST I LOGGBOKEN</div>
          <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", fontSize: 13, color: T.text }}>
            <li style={{ padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>Felanmälan avslutad: Vattenläcka Lgh 1102</li>
            <li style={{ padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>Besiktning bokad: Tak, fre 10 juli</li>
            <li style={{ padding: "6px 0" }}>Projekt uppdaterat: Stambyte etapp 2</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function LagenheterScreen() {
  const apartments = [
    { name: "Lgh 1101", tag: "Uthyrd" },
    { name: "Lgh 1102", tag: "Uthyrd" },
    { name: "Lgh 1103", tag: "Vakant" },
  ];
  const objects = [
    { name: "Hiss", status: "OK", color: T.green },
    { name: "Tvättrum", status: "Behöver tillsyn", color: T.yellow },
  ];
  return (
    <div style={{ paddingBottom: 260 }}>
      <PageHeader title="Lägenheter & objekt" subtitle="BRF Storgatan 4" />
      <div data-tour="lagenheter-objekt" style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 8 }}>LÄGENHETER</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {apartments.map((a) => (
              <div key={a.name} style={{
                background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius,
                padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div style={{ fontFamily: T.headingFont, fontSize: 14, fontWeight: 600, color: T.dark }}>{a.name}</div>
                <div style={{ fontSize: 12, color: T.muted }}>{a.tag}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 8 }}>OBJEKT</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {objects.map((o) => (
              <div key={o.name} style={{
                background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius,
                padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div style={{ fontFamily: T.headingFont, fontSize: 14, fontWeight: 600, color: T.dark }}>{o.name}</div>
                <span style={{ fontSize: 11, fontWeight: 700, color: o.color }}>{o.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BesiktningarScreen() {
  const items = [
    { type: "OVK-besiktning", last: "1 mar 2024", next: "1 mar 2026" },
    { type: "Hissbesiktning", last: "15 jan 2025", next: "15 jan 2027" },
  ];
  return (
    <div style={{ paddingBottom: 260 }}>
      <PageHeader title="Besiktningar & tillsyn" subtitle="BRF Storgatan 4" />
      <div data-tour="besiktningar-lista" style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((b) => (
          <div key={b.type} style={{
            background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: 14,
          }}>
            <div style={{ fontFamily: T.headingFont, fontSize: 14, fontWeight: 600, color: T.dark }}>{b.type}</div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>Senast utförd: {b.last}</div>
            <div style={{ fontSize: 12, color: T.green, fontWeight: 600, marginTop: 2 }}>Nästa: {b.next}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Panel screens ---------- */
function WelcomePanel() {
  return (
    <div style={{
      position: "absolute", inset: 0, background: T.dark,
      display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
    }}>
      <img src={buildingSketch} alt="" style={{
        position: "absolute", inset: 0, width: "100%", height: "100%",
        objectFit: "cover", objectPosition: "60% 40%", opacity: 0.14, filter: "blur(1px)",
      }} />
    </div>
  );
}

function WelcomeActions({ heading, body, onStart }: { heading: string; body: string; onStart: () => void }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 70, display: "flex",
      alignItems: "center", justifyContent: "center", padding: 24, pointerEvents: "none",
    }}>
      <div style={{
        maxWidth: 360, textAlign: "center", pointerEvents: "auto",
        animation: "bayt-fade-in 400ms ease-out",
      }}>
        <img src={baytLogo} alt="BAYT" style={{ height: 40, margin: "0 auto 20px", display: "block" }} />
        <h1 style={{ margin: 0, color: "#fff", fontFamily: T.headingFont, fontSize: 26, fontWeight: 700, lineHeight: 1.2 }}>
          {heading}
        </h1>
        <p style={{ margin: "14px 0 24px", color: "rgba(255,255,255,0.85)", fontSize: 15, lineHeight: 1.5 }}>
          {body}
        </p>
        <button type="button" onClick={onStart}
          style={{
            height: 52, padding: "0 26px", background: T.green, color: "#fff",
            border: "none", borderRadius: T.radius, fontFamily: T.headingFont,
            fontSize: 16, fontWeight: 700, cursor: "pointer",
            animation: "bayt-pulse-glow 1.6s ease-in-out infinite",
          }}>
          Starta rundturen →
        </button>
      </div>
    </div>
  );
}

function ClosingPanel({ onRestart }: { onRestart: () => void }) {
  return (
    <div style={{
      position: "absolute", inset: 0, background: T.dark,
      display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
    }}>
      <img src={buildingSketch} alt="" style={{
        position: "absolute", inset: 0, width: "100%", height: "100%",
        objectFit: "cover", objectPosition: "60% 40%", opacity: 0.14,
      }} />
    </div>
  );
}

function ClosingActions({ heading, body, onRestart }: { heading: string; body: string; onRestart: () => void }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 70, display: "flex",
      alignItems: "center", justifyContent: "center", padding: 24, pointerEvents: "none",
    }}>
      <div style={{
        maxWidth: 380, textAlign: "center", pointerEvents: "auto",
        animation: "bayt-fade-in 400ms ease-out",
      }}>
        <img src={baytLogo} alt="BAYT" style={{ display: "block", height: 34, width: "auto", margin: "0 auto 18px" }} />
        <h1 style={{ margin: 0, color: "#fff", fontFamily: T.headingFont, fontSize: 26, fontWeight: 700, lineHeight: 1.2 }}>
          {heading}
        </h1>
        <p style={{ margin: "14px 0 8px", color: "rgba(255,255,255,0.9)", fontSize: 15, lineHeight: 1.55 }}>
          {body}
        </p>
        <p style={{ margin: "0 0 22px", color: "rgba(255,255,255,0.75)", fontSize: 14, fontStyle: "italic" }}>
          Frågor? Vi visar gärna mer.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <a href="mailto:info@bayt.se?subject=Intresseanm%C3%A4lan%20BAYT&body=Hej%20BAYT%2C%0A%0A"
            target="_top"
            rel="noopener"
            onClick={(e) => {
              e.preventDefault();
              const url = "mailto:info@bayt.se?subject=Intresseanm%C3%A4lan%20BAYT&body=Hej%20BAYT%2C%0A%0A";
              try { (window.top ?? window).location.href = url; }
              catch { window.location.href = url; }
            }}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              height: 48, background: T.green, color: "#fff", textDecoration: "none",
              borderRadius: T.radius, fontFamily: T.headingFont, fontSize: 15, fontWeight: 700,
              cursor: "pointer",
            }}>
            Kontakta oss
          </a>
          <button type="button" onClick={onRestart}
            style={{
              height: 44, background: "transparent", color: "#fff",
              border: "1px solid rgba(255,255,255,0.35)", borderRadius: T.radius,
              fontFamily: T.headingFont, fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}>
            Starta om rundturen
          </button>
        </div>
      </div>
    </div>
  );
}
