import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SectionOverviewPage } from "@/components/SectionOverviewPage";
import { AllBuildingsLoggbok } from "@/components/AllBuildingsLoggbok";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/_authenticated/loggbok")({
  head: () => ({ meta: [{ title: "Loggbok — BAYT" }] }),
  component: LoggbokRoute,
});

const C = { border: "#E5E7EB", secondary: "#6B7280", accent: "#0D2B1E" };

/**
 * Two views over the same data.
 *
 * "Per byggnad" is the original building-picker grid — pick a fastighet, get
 * its loggbok. "Alla byggnader" is the flat, system-wide feed, which is where
 * an admin clears history in bulk instead of visiting every building in turn.
 */
function LoggbokRoute() {
  const isMobile = useIsMobile();
  const [all, setAll] = useState(false);

  const tab = (label: string, active: boolean, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 32, padding: "0 14px", borderRadius: 8, fontSize: 13,
        fontWeight: 600, cursor: "pointer",
        border: `1px solid ${active ? C.accent : C.border}`,
        background: active ? C.accent : "#fff",
        color: active ? "#fff" : C.secondary,
      }}
    >
      {label}
    </button>
  );

  if (!all) {
    return (
      <div>
        <div style={{ padding: isMobile ? "16px 16px 0" : "32px 32px 0", display: "flex", gap: 8 }}>
          {tab("Per byggnad", true, () => setAll(false))}
          {tab("Alla byggnader", false, () => setAll(true))}
        </div>
        <SectionOverviewPage section="logbook" title="Loggbok" />
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? 16 : 32, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", gap: 8 }}>
        {tab("Per byggnad", false, () => setAll(false))}
        {tab("Alla byggnader", true, () => setAll(true))}
      </div>
      <h1 style={{
        fontSize: 24, fontWeight: 700, color: "#1a1a1a", margin: 0,
        fontFamily: "Outfit, Inter, system-ui, sans-serif",
      }}>
        Loggbok — alla byggnader
      </h1>
      <AllBuildingsLoggbok />
    </div>
  );
}
