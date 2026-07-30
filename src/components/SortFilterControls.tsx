import { RefreshCw, Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/lib/auth";

const C = { dark: "#0D2B1E", green: "#5CB84A" };

export type SortMode = "newest" | "oldest" | "mine";

export const SORT_LABEL: Record<SortMode, string> = {
  newest: "Nyast först",
  oldest: "Äldst först",
  mine: "Senaste",
};

export const NEXT_SORT_MODE: Record<SortMode, SortMode> = {
  newest: "oldest",
  oldest: "mine",
  mine: "newest",
};

/** Sorts a list the same way the Fastigheter page does: newest/oldest by
 *  created_at, or "mine" (filtered to the current user's own rows, newest first). */
export function sortByMode<T extends { created_at?: string | null; created_by?: string | null }>(
  list: T[],
  mode: SortMode,
  userId: string | null | undefined,
): T[] {
  const items = [...list];
  if (mode === "mine") {
    const mine = items.filter((x) => x.created_by && userId && x.created_by === userId);
    mine.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    return mine;
  }
  items.sort((a, b) => {
    const av = a.created_at ?? "";
    const bv = b.created_at ?? "";
    return mode === "newest" ? bv.localeCompare(av) : av.localeCompare(bv);
  });
  return items;
}

export function SortFilterControls({
  mode,
  onCycle,
  compact,
}: {
  mode: SortMode;
  onCycle: () => void;
  compact?: boolean;
}) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span
        title={SORT_LABEL[mode]}
        style={{
          display: "inline-flex",
          alignItems: "center",
          height: compact ? 32 : 38,
          padding: compact ? "0 12px" : "0 14px",
          borderRadius: 999,
          background: "#F0F7EE",
          color: C.dark,
          border: `1px solid ${C.green}`,
          fontSize: compact ? 12 : 13,
          fontWeight: 600,
          fontFamily: "Outfit, Inter, system-ui, sans-serif",
          whiteSpace: "nowrap",
        }}
      >
        {SORT_LABEL[mode]}
      </span>
      <button
        type="button"
        onClick={onCycle}
        aria-label="Växla filter"
        title="Växla filter"
        style={{
          width: compact ? 32 : 38,
          height: compact ? 32 : 38,
          borderRadius: "50%",
          background: C.dark,
          color: "#fff",
          border: "none",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <RefreshCw size={compact ? 15 : 17} />
      </button>
    </div>
  );
}

/** The "+ Ny X" pill button, matching the Fastigheter page's "+ Ny fastighet" button exactly. */
export const sectionPillBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "10px 20px",
  background: C.green,
  color: "#fff",
  borderRadius: 999,
  textDecoration: "none",
  border: "none",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
  fontFamily: "Outfit, Inter, system-ui, sans-serif",
  whiteSpace: "nowrap",
};

/** The section header row: "<Titel>" + filter chip + "+ Ny X" button — the
 *  Fastigheter page's top-half, reused for any property-scoped section list.
 *  All three parts shrink together on mobile (shorter label, compact filter,
 *  smaller pill) so they always stay on one row — never wraps, never breaks
 *  layout; a horizontal scroll is the last-resort safety net, not the plan. */
export function SectionHeaderRow({
  title,
  mode,
  onCycle,
  controls,
  actionLabel,
  actionShortLabel,
  onAction,
  actionTo,
  actionToParams,
}: {
  title: string;
  /** Default control: the sort chip + cycle button. Give both, or neither. */
  mode?: SortMode;
  onCycle?: () => void;
  /** Section-specific control rendered instead of the sort chip (e.g. the
   *  projekt status filter). Wins over mode/onCycle if both are passed. */
  controls?: React.ReactNode;
  /** Full button label, e.g. "Ny lägenhet" (desktop). */
  actionLabel: string;
  /** Shown on mobile instead — defaults to "Ny". */
  actionShortLabel?: string;
  /** Provide either onAction (button, e.g. toggles an inline form)... */
  onAction?: () => void;
  /** ...or actionTo (renders a Link instead, e.g. navigates to /new). */
  actionTo?: string;
  actionToParams?: Record<string, string>;
}) {
  const isMobile = useIsMobile();
  const label = isMobile ? (actionShortLabel ?? "Ny") : actionLabel;
  const btnStyle: React.CSSProperties = {
    ...sectionPillBtnStyle,
    ...(isMobile ? { padding: "8px 14px", fontSize: 13, gap: 4 } : {}),
  };
  const iconSize = isMobile ? 14 : 16;

  // Creating is admin-only, so every section's "Ny …" action is hidden for other
  // roles — otherwise the button is visible but bounces off the route guard.
  const { profile } = useAuth();
  const canCreate = profile?.role === "admin";

  const button = !canCreate ? null : actionTo ? (
    <Link to={actionTo as never} params={actionToParams as never} style={btnStyle}>
      <Plus size={iconSize} /> {label}
    </Link>
  ) : (
    <button type="button" onClick={onAction} style={btnStyle}>
      <Plus size={iconSize} /> {label}
    </button>
  );

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 20,
        gap: isMobile ? 8 : 12,
        flexWrap: "nowrap",
        overflowX: isMobile ? "auto" : "visible",
      }}
    >
      <h2
        style={{
          fontSize: isMobile ? 17 : 22,
          fontWeight: 700,
          color: "#1a1a1a",
          margin: 0,
          fontFamily: "Outfit, Inter, system-ui, sans-serif",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {title}
      </h2>
      <div style={{ display: "inline-flex", alignItems: "center", gap: isMobile ? 6 : 12, flexShrink: 0 }}>
        {controls ?? (mode !== undefined && onCycle ? <SortFilterControls mode={mode} onCycle={onCycle} compact={isMobile} /> : null)}
        {button}
      </div>
    </div>
  );
}
