function Dot({ color, pulse, size }: { color: string; pulse: boolean; size: number }) {
  return (
    <span
      aria-hidden
      style={{
        position: "relative",
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
      }}
    >
      {pulse && (
        <span
          style={{
            position: "absolute",
            inset: -4,
            borderRadius: "50%",
            border: `2px solid ${color}`,
            animation: "bayt-sonar 1.4s ease-out infinite",
          }}
        />
      )}
    </span>
  );
}

/**
 * StatusDot — urgency indicator based on nearest deadline.
 *
 * Rules:
 * - unviewedCount == 0 → render nothing
 * - overdue (deadline < today)  → red + pulsing radar
 * - ≤ 5 days                    → static red
 * - ≤ 10 days                   → yellow
 * - ≤ 15 days                   → green
 * - > 15 days or no deadline    → green (still-unviewed indicator)
 */
export function StatusDot({
  deadline,
  unviewedCount,
  size = 10,
}: {
  deadline: string | Date | null | undefined;
  unviewedCount: number;
  size?: number;
}) {
  if (!unviewedCount || unviewedCount <= 0) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  let color = "#5CB84A"; // green
  let pulse = false;

  if (deadline) {
    const d = typeof deadline === "string" ? new Date(deadline) : deadline;
    if (!isNaN(d.getTime())) {
      const dayMs = 86400000;
      const days = Math.floor((d.getTime() - today) / dayMs);
      if (days < 0) {
        color = "#DC2626";
        pulse = true;
      } else if (days <= 5) {
        color = "#DC2626";
      } else if (days <= 10) {
        color = "#D4A017";
      } else {
        color = "#5CB84A";
      }
    }
  }

  return <Dot color={color} pulse={pulse} size={size} />;
}

/**
 * OpenAgeDot — urgency indicator based on how long an ärende has sat open
 * (vilande → oppet), not on its deadline. Used where a list is already
 * scoped to "öppna ärenden" and the deadline-driven StatusDot rule doesn't
 * apply.
 *
 * Rules (days since it became oppet):
 * - 0–2 dygn  → green
 * - 3–5 dygn  → yellow
 * - 6–8 dygn  → red
 * - 9+ dygn   → red, pulsing radar
 */
export function OpenAgeDot({
  openedAt,
  size = 10,
}: {
  openedAt: string | Date | null | undefined;
  size?: number;
}) {
  if (!openedAt) return null;
  const opened = typeof openedAt === "string" ? new Date(openedAt) : openedAt;
  if (isNaN(opened.getTime())) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const openedDay = new Date(opened.getFullYear(), opened.getMonth(), opened.getDate()).getTime();
  const days = Math.floor((today - openedDay) / 86400000);

  let color = "#5CB84A"; // green
  let pulse = false;
  if (days >= 9) {
    color = "#DC2626";
    pulse = true;
  } else if (days >= 6) {
    color = "#DC2626";
  } else if (days >= 3) {
    color = "#D4A017";
  }

  return <Dot color={color} pulse={pulse} size={size} />;
}
