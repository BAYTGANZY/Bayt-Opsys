import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DashboardSquare01Icon,
  Building02Icon,
  DoorOpenIcon,
  AlertCircleIcon,
  ClipboardCheckIcon,
  Briefcase01Icon,
  File02Icon,
  UserGroupIcon,
  BookOpen01Icon,
  Package01Icon,
} from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { canAccess } from "@/lib/permissions";
const baytLogo = `${import.meta.env.BASE_URL}assets/bayt-logo.png`;
const buildingSketch = `${import.meta.env.BASE_URL}assets/building-sketch-2.png`;

export const Route = createFileRoute("/start")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Snabbåtkomst — BAYT" }] }),
  component: StartPage,
});

const TILES = [
  { to: "/dashboard", label: "Dashboard", icon: DashboardSquare01Icon },
  { to: "/fastigheter", label: "Fastigheter", icon: Building02Icon },
  { to: "/apartments", label: "Lägenheter", icon: DoorOpenIcon },
  { to: "/issues", label: "Felanmälningar", icon: AlertCircleIcon },
  { to: "/inspections", label: "Besiktningar", icon: ClipboardCheckIcon },
  { to: "/projects", label: "Projekt", icon: Briefcase01Icon },
  { to: "/objects", label: "Objekt", icon: Package01Icon },
  { to: "/dokument", label: "Dokument", icon: File02Icon },
  { to: "/contacts", label: "Kontakter", icon: UserGroupIcon },
  { to: "/loggbok", label: "Loggbok", icon: BookOpen01Icon },
] as const;

const BG = "#0e1f1a";
const LINE = "rgba(151, 186, 72, 0.18)";
const ACCENT = "#bcd97a";
const TEXT = "#e6efd8";
const MUTED = "#7a9476";

const STYLES = `
  .start-page {
    min-height: 100vh;
    background: radial-gradient(ellipse at top, #15332c 0%, ${BG} 70%);
    color: ${TEXT};
    font-family: Inter, system-ui, sans-serif;
    display: flex;
    flex-direction: column;
    padding: 32px 40px;
  }
  .start-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid ${LINE};
    padding-bottom: 20px;
    margin-bottom: 32px;
  }
  .start-logo { height: 40px; }
  .start-logout {
    background: transparent;
    border: 1px solid ${LINE};
    color: ${MUTED};
    padding: 8px 14px;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    letter-spacing: 0.04em;
  }
  .start-body {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 48px;
    align-items: center;
  }
  .start-tiles {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    max-width: 560px;
    width: 100%;
    justify-self: center;
    margin-left: 8%;
  }
  .start-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 32px 16px;
    text-decoration: none;
    color: ${TEXT};
    background: transparent;
    border: 1.5px solid ${ACCENT};
    border-radius: 16px;
    transition: background 0.15s ease;
    min-height: 160px;
  }
  .start-tile:hover { background: rgba(188, 217, 122, 0.05); }
  .start-tile-icon {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    border: 1.5px solid ${ACCENT};
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${ACCENT};
    flex-shrink: 0;
  }
  .start-tile-label {
    font-size: 14px;
    letter-spacing: 0.03em;
    color: ${TEXT};
    text-align: center;
    line-height: 1.25;
  }
  .start-right {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  }
  .start-sketch {
    max-width: 100%;
    max-height: 500px;
    opacity: 0.85;
    filter: drop-shadow(0 8px 24px rgba(0,0,0,0.4));
  }
  .start-bg-sketch { display: none; }


  @media (max-width: 768px) {
    .start-page {
      padding: 20px 16px;
      position: relative;
      overflow: hidden;
      height: 100vh;
    }
    .start-header { padding-bottom: 14px; margin-bottom: 0; position: relative; z-index: 2; }
    .start-logo { height: 32px; }
    .start-bg-sketch {
      display: block;
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      object-position: center;
      opacity: 0.18;
      pointer-events: none;
      z-index: 0;
    }
    .start-body {
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
      align-items: center;
      justify-items: center;
      position: relative;
      z-index: 1;
    }
    .start-tiles {
      display: flex;
      flex-direction: column;
      grid-template-columns: none;
      max-width: 220px;
      margin-left: 0;
      justify-self: center;
      gap: 4px;
    }
    .start-tile {
      flex-direction: row;
      justify-content: flex-start;
      gap: 14px;
      padding: 10px 14px;
      min-height: 0;
      border: 1.5px solid ${ACCENT} !important;
      border-radius: 10px;
      background: transparent;
    }
    .start-tile-icon { width: 36px; height: 36px; border-width: 1px; }
    .start-tile-icon svg { width: 18px; height: 18px; }
    .start-tile-label {
      font-size: 13px;
      letter-spacing: 0.02em;
      text-align: left;
    }
    .start-right { display: none; }
  }
`;

function StartPage() {
  // Only show tiles this role can actually reach (same rules as the sidebar).
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.session.user.id)
        .maybeSingle();
      setRole((p?.role as string | undefined) ?? null);
    });
  }, []);

  const tiles = TILES.filter((t) => canAccess(role, t.to));

  return (
    <>
      <style>{STYLES}</style>
      <div className="start-page">
        <img src={buildingSketch} alt="" className="start-bg-sketch" aria-hidden />

        <div className="start-header">
          <img src={baytLogo} alt="BAYT" className="start-logo" />
          <button
            className="start-logout"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/login";
            }}
          >
            Logga ut
          </button>
        </div>

        <div className="start-body">
          <div className="start-tiles">
            {tiles.map((tile) => {
              return (
                <Link
                  key={tile.to}
                  to={tile.to}
                  className="start-tile"
                >
                  <div className="start-tile-icon">
                    <HugeiconsIcon icon={tile.icon} size={30} strokeWidth={1.5} />
                  </div>
                  <div className="start-tile-label">{tile.label}</div>
                </Link>
              );
            })}
          </div>

          <div className="start-right">
            <img src={buildingSketch} alt="" className="start-sketch" />
          </div>
        </div>
      </div>
    </>
  );
}
