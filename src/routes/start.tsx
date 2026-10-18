import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DashboardSquare01Icon,
  Building02Icon,
  CalendarCheckIn01Icon,
  Chatting01Icon,
  ViewIcon,
  ArrowRight01Icon,
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
  { to: "/dag-rapport", label: "Dag Rapport", icon: CalendarCheckIn01Icon },
  { to: "/dashboard", label: "Översikt", icon: DashboardSquare01Icon },
  { to: "/chatt", label: "Chatt", icon: Chatting01Icon },
  { to: "/fastigheter", label: "Fastigheter", icon: Building02Icon },
  { to: "/genomgang-av-fastighet", label: "Genomgång av fastighet", icon: ViewIcon },
] as const;

const BG = "#0e1f1a";
const LINE = "rgba(151, 186, 72, 0.18)";
const LIME = "#bcd97a";
const GREEN = "#5CB84A";
const DEEP = "#0D2B1E";
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
    padding: 8px 0 24px;
  }

  /* Desktop: 3 kort på första raden, 2 bredare på andra */
  .start-tiles {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 16px;
    max-width: 620px;
    width: 100%;
    justify-self: center;
    margin-left: 8%;
  }
  .start-tile {
    grid-column: span 2;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: space-between;
    gap: 28px;
    min-height: 150px;
    padding: 20px;
    text-decoration: none;
    color: ${TEXT};
    background: linear-gradient(160deg, rgba(188,217,122,0.12) 0%, rgba(92,184,74,0.03) 100%);
    border: 1px solid rgba(188,217,122,0.22);
    border-radius: 22px;
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(6px);
    transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .start-tile:nth-child(n+4) { grid-column: span 3; }
  .start-tile::before {
    content: "";
    position: absolute;
    top: -40%;
    right: -30%;
    width: 80%;
    height: 120%;
    background: radial-gradient(circle, rgba(92,184,74,0.22) 0%, transparent 65%);
    opacity: 0;
    transition: opacity 0.25s ease;
    pointer-events: none;
  }
  .start-tile:hover {
    transform: translateY(-3px);
    border-color: rgba(92,184,74,0.7);
    box-shadow: 0 14px 32px -14px rgba(92,184,74,0.45);
  }
  .start-tile:hover::before { opacity: 1; }
  .start-tile:active { transform: scale(0.98); }

  .start-tile-icon {
    width: 52px;
    height: 52px;
    border-radius: 16px;
    background: linear-gradient(145deg, ${GREEN} 0%, #3f9a3a 100%);
    color: ${DEEP};
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-shadow: 0 6px 16px -6px rgba(92,184,74,0.7), inset 0 1px 0 rgba(255,255,255,0.25);
  }
  .start-tile-label {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.01em;
    color: ${TEXT};
    line-height: 1.25;
    position: relative;
  }
  .start-tile-arrow {
    position: absolute;
    top: 20px;
    right: 18px;
    color: ${LIME};
    opacity: 0.45;
    transition: opacity 0.2s ease, transform 0.2s ease;
  }
  .start-tile:hover .start-tile-arrow { opacity: 1; transform: translateX(3px); }

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
      padding: 20px 16px 88px;
      position: relative;
      min-height: 100vh;
      min-height: 100dvh;
      overflow-y: auto;
    }
    .start-header { padding-bottom: 14px; margin-bottom: 0; position: relative; z-index: 2; }
    .start-logo { height: 32px; }
    .start-bg-sketch {
      display: block;
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      object-position: center;
      opacity: 0.14;
      pointer-events: none;
      z-index: 0;
    }
    .start-body {
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
      align-items: start;
      justify-items: center;
      position: relative;
      z-index: 1;
      padding: 20px 0 24px;
    }
    .start-tiles {
      display: flex;
      flex-direction: column;
      max-width: 340px;
      width: 100%;
      margin-left: 0;
      justify-self: center;
      gap: 12px;
    }
    .start-tile,
    .start-tile:nth-child(n+4) {
      grid-column: auto;
      flex-direction: row;
      align-items: center;
      justify-content: flex-start;
      gap: 16px;
      min-height: 0;
      padding: 14px 16px;
      border-radius: 18px;
    }
    .start-tile-icon { width: 44px; height: 44px; border-radius: 14px; }
    .start-tile-icon svg { width: 22px; height: 22px; }
    .start-tile-label { flex: 1; font-size: 15px; }
    .start-tile-arrow { position: static; margin-left: auto; opacity: 0.6; }
    .start-right { display: none; }
  }
`;

function StartPage() {
  // Visa bara rutor som rollen faktiskt kommer åt (samma regler som sidomenyn).
  const [role, setRole] =
