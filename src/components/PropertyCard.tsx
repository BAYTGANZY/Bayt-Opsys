import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PRIORITY_BADGE, PRIORITY_LABEL } from "@/lib/issue-tokens";
const buildingSketch = `${import.meta.env.BASE_URL}assets/building-sketch.png`;

const C = { border: "#E5E7EB" };

const PRIORITY_SHORT: Record<string, string> = {
  lag: "Låg",
  normal: "Normal",
  hog: "Hög",
  akut: "Akut",
};

export type PropertyCardProperty = {
  id: string;
  name: string;
  address: string | null;
  image_url: string | null;
};

export type PropertyCardBadge = {
  count: number;
  /** highest-severity priority among the open items, if any */
  priority: (typeof PRIORITY_LABEL)[number] | null;
};

export function PropertyCard({
  property,
  linkTo,
  linkSearch,
  rightSlot,
  badge,
  cornerBadge,
}: {
  property: PropertyCardProperty;
  linkTo: string;
  /** Search params to carry onto the link target, e.g. so the destination knows where to go back to. */
  linkSearch?: Record<string, string>;
  rightSlot?: ReactNode;
  badge?: PropertyCardBadge;
  /** Overrides the default priority pill with arbitrary content (e.g. a combined StatusDot chip). */
  cornerBadge?: ReactNode;
}) {
  const priorityColor = badge?.priority ? PRIORITY_BADGE[badge.priority].color : "#5CB84A";

  return (
    <div
      style={{
        display: "flex",
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        overflow: "hidden",
        background: "#fff",
        minHeight: 220,
      }}
    >
      <Link
        to={linkTo as never}
        params={{ id: property.id } as never}
        search={linkSearch as never}
        style={{
          position: "relative",
          flex: "1 1 55%",
          minWidth: 0,
          textDecoration: "none",
          background: "linear-gradient(135deg, #E8F2DC 0%, #DCE9CC 100%)",
          display: "block",
        }}
      >
        <img
          src={property.image_url ?? buildingSketch}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: property.image_url ? 1 : 0.85 }}
        />

        {cornerBadge}

        {!cornerBadge && badge && badge.count > 0 && (
          <div
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 12px",
              borderRadius: 999,
              background: "rgba(13,43,30,0.88)",
              fontSize: 12,
              fontWeight: 700,
              color: "#fff",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: priorityColor, flexShrink: 0 }} />
            {badge.count} öppna{badge.priority ? ` · ${PRIORITY_SHORT[badge.priority]}` : ""}
          </div>
        )}

        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "12px 14px",
            background: "linear-gradient(to top, rgba(13,43,30,0.85), rgba(13,43,30,0))",
            color: "#fff",
            fontFamily: "Outfit, Inter, system-ui, sans-serif",
            fontSize: 16,
            fontWeight: 600,
          }}
        >
          {property.name}
          {property.address && (
            <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.85, marginTop: 2 }}>{property.address}</div>
          )}
        </div>
      </Link>
      {rightSlot && (
        <div style={{ flex: "0 0 180px", display: "flex", alignItems: "stretch", borderLeft: `1px solid ${C.border}` }}>
          {rightSlot}
        </div>
      )}
    </div>
  );
}
