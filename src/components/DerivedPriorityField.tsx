import type { DerivedPriority } from "@/lib/issue-tokens";

/**
 * Prioritet, läst aldrig vald. Samma förhållande till `derivePriority` som
 * DerivedStatusBadge har till derive*Status: allt som visar en härledd
 * prioritet går genom den här, så en "Akut" ser likadan ut överallt.
 */
export function DerivedPriorityBadge({ priority }: { priority: DerivedPriority }) {
  return (
    <span
      title={priority.reason}
      style={{
        color: priority.color,
        background: priority.bg,
        fontSize: 13,
        fontWeight: 600,
        display: "inline-block",
        whiteSpace: "nowrap",
      }}
    >
      {priority.label}
    </span>
  );
}

/** Badge + förklaringen under — detaljsidans presentation, där dropdownen satt. */
export function DerivedPriorityField({
  label = "Prioritet (härledd)",
  priority,
  labelStyle,
  reasonColor = "#6B7280",
}: {
  label?: string;
  priority: DerivedPriority;
  labelStyle: React.CSSProperties;
  reasonColor?: string;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", minHeight: 40 }}>
        <DerivedPriorityBadge priority={priority} />
      </div>
      <div style={{ fontSize: 12, color: reasonColor, marginTop: 6, lineHeight: 1.4 }}>
        {priority.reason}
      </div>
    </div>
  );
}
