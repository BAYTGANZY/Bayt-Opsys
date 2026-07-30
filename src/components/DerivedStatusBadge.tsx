import type { DerivedStatus } from "@/lib/issue-tokens";

/**
 * The one way a derived status is drawn. Every ärendetyp — felanmälan,
 * besiktning, projekt — renders through this, so a "Försenad" looks identical
 * wherever it appears and the `reason` is always one hover away.
 *
 * `size="row"` is the compact form for table cells; "field" is the taller form
 * used where a status dropdown used to sit on a detail page.
 */
export function DerivedStatusBadge({
  status,
  size = "row",
}: {
  status: DerivedStatus;
  size?: "row" | "field";
}) {
  return (
    <span
      title={status.reason}
      style={{
        background: status.bg,
        color: status.color,
        padding: size === "field" ? "6px 12px" : "4px 10px",
        borderRadius: size === "field" ? 6 : 4,
        fontSize: size === "field" ? 13 : 12,
        fontWeight: 600,
        display: "inline-block",
        whiteSpace: "nowrap",
      }}
    >
      {status.label}
    </span>
  );
}

/** Badge + the Swedish explanation under it — the detail-page presentation. */
export function DerivedStatusField({
  label = "Status (härledd)",
  status,
  labelStyle,
  reasonColor = "#6B7280",
}: {
  label?: string;
  status: DerivedStatus;
  labelStyle: React.CSSProperties;
  reasonColor?: string;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", minHeight: 40 }}>
        <DerivedStatusBadge status={status} size="field" />
      </div>
      <div style={{ fontSize: 12, color: reasonColor, marginTop: 6, lineHeight: 1.4 }}>
        {status.reason}
      </div>
    </div>
  );
}
