import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Search01Icon,
  Download01Icon,
  MoreHorizontalIcon,
  Add01Icon,
} from "@hugeicons/core-free-icons";
import { useIsMobile } from "@/hooks/use-mobile";

type IconType = typeof Search01Icon;

export type ListShellProps = {
  title: string;
  icon?: IconType;
  cardTitle?: string;
  action?: {
    to?: string;
    onClick?: () => void;
    label: string;
    icon?: IconType;
  };
  filters?: ReactNode;
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  };
  onExport?: () => void;
  children: ReactNode;
};

const C = {
  card: "#ffffff",
  border: "#E5E7EB",
  text: "#1a1a1a",
  secondary: "#6B7280",
  primary: "#3D8A30",
  rowAlt: "#F7F8F6",
};

export function ListShell({
  title,
  icon,
  cardTitle,
  action,
  filters,
  search,
  onExport,
  children,
}: ListShellProps) {
  const isMobile = useIsMobile();

  return (
    <div style={{ padding: isMobile ? 16 : 32 }}>
      {/* Page header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0 }}>
          {title}
        </h1>
        {action &&
          (action.to ? (
            <Link
              to={action.to}
              style={primaryBtnStyle}
            >
              <HugeiconsIcon icon={action.icon ?? Add01Icon} size={16} />
              {action.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              style={primaryBtnStyle}
            >
              <HugeiconsIcon icon={action.icon ?? Add01Icon} size={16} />
              {action.label}
            </button>
          ))}
      </div>

      {/* Filters card */}
      {filters && (
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
            padding: 16,
            marginBottom: 16,
          }}
        >
          {filters}
        </div>
      )}

      {/* Main list card */}
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          overflow: "hidden",
        }}
      >
        {/* Card toolbar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "16px 20px",
            borderBottom: `1px solid ${C.border}`,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: C.secondary,
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            {icon && <HugeiconsIcon icon={icon} size={16} />}
            <span>{cardTitle ?? title}</span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            {search && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  border: `1px solid ${C.border}`,
                  borderRadius: 999,
                  padding: "0 14px",
                  height: 36,
                  background: "#ffffff",
                  width: isMobile ? "100%" : 260,
                  color: C.secondary,
                }}
              >
                <HugeiconsIcon icon={Search01Icon} size={14} />
                <input
                  value={search.value}
                  onChange={(e) => search.onChange(e.target.value)}
                  placeholder={search.placeholder ?? "Sök…"}
                  style={{
                    flex: 1,
                    border: "none",
                    outline: "none",
                    fontSize: 13,
                    background: "transparent",
                    color: C.text,
                    minWidth: 0,
                  }}
                />
              </div>
            )}
            {onExport && (
              <button
                type="button"
                onClick={onExport}
                title="Exportera CSV"
                style={{
                  height: 36,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0 14px",
                  border: `1px solid ${C.border}`,
                  borderRadius: 999,
                  background: "#ffffff",
                  color: C.text,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                <HugeiconsIcon icon={Download01Icon} size={14} />
                Exportera
              </button>
            )}
            <button
              type="button"
              aria-label="Mer"
              style={{
                width: 36,
                height: 36,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: `1px solid ${C.border}`,
                borderRadius: 999,
                background: "#ffffff",
                color: C.secondary,
                cursor: "pointer",
              }}
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} size={16} />
            </button>
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}

const primaryBtnStyle: React.CSSProperties = {
  height: 40,
  background: C.primary,
  color: "#ffffff",
  borderRadius: 999,
  padding: "0 18px",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontSize: 14,
  fontWeight: 600,
  textDecoration: "none",
  border: "none",
  cursor: "pointer",
};

/** Helper to download a CSV from rows. */
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const escape = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csv = [headers, ...rows].map((r) => r.map(escape).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
