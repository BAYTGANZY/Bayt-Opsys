import { BRAND } from "@/lib/theme";

/**
 * BAYT-symbolen (A med hus i). Ritad som vektor så den är skarp i alla storlekar och har
 * genomskinlig botten. Används som laddningsindikator och i tomma tillstånd, så att plattformen
 * känns som BAYT även där det inte står "BAYT".
 *
 * tone="light": vitt A (för mörka ytor). tone="dark": mörkgrönt A (för ljusa ytor).
 */
export function BaytMark({
  size = 48,
  tone = "light",
  pulse = false,
  label = "BAYT",
}: {
  size?: number;
  tone?: "light" | "dark";
  pulse?: boolean;
  label?: string;
}) {
  const a = tone === "light" ? BRAND.cream : BRAND.dark;
  return (
    <svg
      width={size}
      height={size}
      viewBox="200 255 855 710"
      role="img"
      aria-label={label}
      className={pulse ? "bayt-mark-pulse" : undefined}
    >
      {pulse && (
        <style>{`.bayt-mark-pulse { animation: bayt-mark-pulse 1.6s ease-in-out infinite; transform-origin: center }
        @keyframes bayt-mark-pulse { 0%,100% { opacity: .55; transform: scale(.96) } 50% { opacity: 1; transform: scale(1) } }
        @media (prefers-reduced-motion: reduce) { .bayt-mark-pulse { animation: none } }`}</style>
      )}
      <polygon fill={a} points="627,275 1031,944 892,944 627,493 362,944 222,944" />
      <polygon fill={BRAND.accent} points="627,670 736,779 736,944 517,944 517,779" />
    </svg>
  );
}

/** Helskärmsladdning med symbolen. */
export function BaytLoading({ text = "Laddar…" }: { text?: string }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        background: BRAND.dark,
        color: "#ffffff",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <BaytMark size={72} pulse />
      <div style={{ fontSize: 16, opacity: 0.8 }}>{text}</div>
    </div>
  );
}
