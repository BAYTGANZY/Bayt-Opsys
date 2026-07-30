import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowUp01Icon, Clock01Icon } from "@hugeicons/core-free-icons";
import { PRIORITY_BADGE } from "@/lib/issue-tokens";

export type SortMode = "prio-old" | "prio-new" | "recent";

export const SORT_MODES: SortMode[] = ["prio-old", "prio-new", "recent"];

export const SORT_LABEL: Record<SortMode, string> = {
  "prio-old": "Prioritet · äldst först",
  "prio-new": "Prioritet · nyast först",
  recent: "Senast skapad",
};

const PRIO_WEIGHT: Record<string, number> = { akut: 4, hog: 3, normal: 2, lag: 1 };

export function sortByMode<T extends { priority?: string | null; created_at?: string | null }>(
  rows: T[],
  mode: SortMode,
): T[] {
  const copy = [...rows];
  if (mode === "recent") {
    copy.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    return copy;
  }
  copy.sort((a, b) => {
    const pa = PRIO_WEIGHT[a.priority ?? "normal"] ?? 0;
    const pb = PRIO_WEIGHT[b.priority ?? "normal"] ?? 0;
    if (pb !== pa) return pb - pa;
    const da = a.created_at ?? "";
    const db = b.created_at ?? "";
    return mode === "prio-old" ? da.localeCompare(db) : db.localeCompare(da);
  });
  return copy;
}

function modeDotColor(mode: SortMode): string {
  if (mode === "prio-old") return PRIORITY_BADGE.akut.color;
  if (mode === "prio-new") return PRIORITY_BADGE.hog.color;
  return PRIORITY_BADGE.normal.color;
}

export function SortArrow({ mode, onChange }: { mode: SortMode; onChange: (m: SortMode) => void }) {
  const next = () => {
    const i = SORT_MODES.indexOf(mode);
    onChange(SORT_MODES[(i + 1) % SORT_MODES.length]);
  };
  const icon = mode === "prio-old" ? ArrowDown01Icon : mode === "prio-new" ? ArrowUp01Icon : Clock01Icon;
  return (
    <button
      type="button"
      onClick={next}
      title={SORT_LABEL[mode]}
      aria-label={`Sortering: ${SORT_LABEL[mode]}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        height: 36,
        padding: "0 12px",
        border: "1px solid #E5E7EB",
        background: "#ffffff",
        borderRadius: 999,
        cursor: "pointer",
        fontSize: 13,
        color: "#1a1a1a",
        fontFamily: "inherit",
      }}
    >
      <HugeiconsIcon icon={icon} size={16} />
      <span style={{ color: "#6B7280" }}>{SORT_LABEL[mode]}</span>
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: modeDotColor(mode),
        }}
      />
    </button>
  );
}
