import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { supabase } from "@/lib/supabase";
import { useIsMobile } from "@/hooks/use-mobile";
import { useScopedProperties } from "@/hooks/useVisibleProperties";
import { useMyArendeScope } from "@/hooks/useMyContactId";
import { StatusDot } from "./StatusDot";
const buildingSketch = `${import.meta.env.BASE_URL}assets/building-sketch.png`;

export type SectionKey = "apartments" | "issues" | "inspections" | "projects" | "documents" | "logbook";

const DOT_SECTIONS = new Set<SectionKey>(["issues", "inspections", "projects"]);

const SECTION_LABEL: Record<SectionKey, string> = {
  apartments: "Lägenheter",
  issues: "Felanmälan",
  inspections: "Besiktningar",
  projects: "Projekt",
  documents: "Dokument",
  logbook: "Loggbok",
};

type PropertyRow = { id: string; name: string; address: string | null; image_url: string | null };

type BuildingStat = {
  count: number;
  unviewedCount: number;
  earliestDeadline: string | null;
};

const PROPERTY_COLUMNS = "id, name, address, image_url";

/**
 * Per-building counts for the cards.
 *
 * `filterContactId` (useMyArendeScope) narrows every ärendetyp to the signed-in
 * entreprenör's own assignments. Without it a card counted every ärende in the
 * building while the list inside showed only theirs — the number contradicted
 * the page and leaked how much other work exists there.
 * Lägenheter/Dokument/Loggbok are not ärenden and carry no assignment, so they
 * are left as-is; the buildings themselves are already scoped by RLS.
 */
async function loadStats(
  section: SectionKey,
  filterContactId: string | null,
): Promise<Record<string, BuildingStat>> {
  const stats: Record<string, BuildingStat> = {};
  const bump = (id: string) => {
    if (!stats[id]) stats[id] = { count: 0, unviewedCount: 0, earliestDeadline: null };
    return stats[id];
  };
  // Plain <T> on purpose: an F-bounded constraint (T extends { eq(...): T })
  // makes tsc recursively instantiate supabase's builder generics and die with
  // TS2589. The cast is runtime-identical — eq() returns the same builder.
  const scoped = <T,>(builder: T): T =>
    filterContactId
      ? ((builder as { eq(col: string, val: string): unknown }).eq("assigned_contact_id", filterContactId) as T)
      : builder;

  if (section === "issues") {
    const { data } = await scoped(
      supabase
        .from("issues")
        .select("property_id, deadline, viewed_at, status")
        .not("status", "in", "(klar,fakturerad,stangd,avslutat)"),
    );
    for (const r of (data ?? []) as Array<{ property_id: string | null; deadline: string | null; viewed_at: string | null }>) {
      if (!r.property_id) continue;
      const s = bump(r.property_id);
      s.count += 1;
      if (!r.viewed_at) {
        s.unviewedCount += 1;
        if (r.deadline && (!s.earliestDeadline || r.deadline < s.earliestDeadline)) {
          s.earliestDeadline = r.deadline;
        }
      }
    }
  } else if (section === "inspections") {
    const { data } = await scoped(
      supabase
        .from("inspections")
        .select("property_id, next_due_date, viewed_at, status, arende_status"),
    );
    for (const r of (data ?? []) as Array<{ property_id: string | null; next_due_date: string | null; viewed_at: string | null; status: string | null; arende_status: string | null }>) {
      if (!r.property_id) continue;
      if (r.status === "klar" || r.arende_status === "avslutat") continue;
      const s = bump(r.property_id);
      s.count += 1;
      if (!r.viewed_at) {
        s.unviewedCount += 1;
        if (r.next_due_date && (!s.earliestDeadline || r.next_due_date < s.earliestDeadline)) {
          s.earliestDeadline = r.next_due_date;
        }
      }
    }
  } else if (section === "projects") {
    const { data } = await scoped(
      supabase
        .from("projects")
        .select("property_id, end_date, viewed_at, status, arende_status"),
    );
    for (const r of (data ?? []) as Array<{ property_id: string | null; end_date: string | null; viewed_at: string | null; status: string | null; arende_status: string | null }>) {
      if (!r.property_id) continue;
      if (r.status === "klar" || r.status === "avbruten" || r.arende_status === "avslutat") continue;
      const s = bump(r.property_id);
      s.count += 1;
      if (!r.viewed_at) {
        s.unviewedCount += 1;
        if (r.end_date && (!s.earliestDeadline || r.end_date < s.earliestDeadline)) {
          s.earliestDeadline = r.end_date;
        }
      }
    }
  } else if (section === "apartments") {
    const { data } = await supabase.from("apartments").select("property_id");
    for (const r of (data ?? []) as Array<{ property_id: string | null }>) {
      if (!r.property_id) continue;
      bump(r.property_id).count += 1;
    }
  } else if (section === "documents") {
    const { data } = await supabase.from("documents").select("property_id");
    for (const r of (data ?? []) as Array<{ property_id: string | null }>) {
      if (!r.property_id) continue;
      bump(r.property_id).count += 1;
    }
  } else if (section === "logbook") {
    const { data } = await supabase.from("logbook_entries").select("property_id");
    for (const r of (data ?? []) as Array<{ property_id: string | null }>) {
      if (!r.property_id) continue;
      bump(r.property_id).count += 1;
    }
  }

  return stats;
}

export function SectionPropertyCard({
  property,
  section,
  stat,
}: {
  property: PropertyRow;
  section: SectionKey;
  stat: BuildingStat;
}) {
  const label = SECTION_LABEL[section];
  return (
    <Link
      to={`/properties/${property.id}/${section}` as never}
      style={{
        position: "relative",
        display: "block",
        borderRadius: 18,
        overflow: "hidden",
        background: "#0D2B1E",
        textDecoration: "none",
        color: "#fff",
        aspectRatio: "4 / 3",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        border: "1px solid #E5E7EB",
      }}
    >
      <img
        src={property.image_url ?? buildingSketch}
        alt=""
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
      />

      {/* Top title */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          padding: "14px 16px",
          background: "linear-gradient(to bottom, rgba(13,43,30,0.85), rgba(13,43,30,0))",
          fontFamily: "Outfit, Inter, system-ui, sans-serif",
          fontSize: 18,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {property.name}
        </span>
        {DOT_SECTIONS.has(section) && (
          <StatusDot deadline={stat.earliestDeadline} unviewedCount={stat.unviewedCount} size={12} />
        )}
      </div>
      {/* Bottom bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "10px 14px",
          background: "linear-gradient(to top, rgba(13,43,30,0.9), rgba(13,43,30,0))",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: "0.02em",
        }}
      >
        <span style={{ opacity: 0.95 }}>
          {label} — {stat.count}
        </span>
        <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
      </div>
    </Link>
  );
}

export function SectionOverviewPage({ section, title }: { section: SectionKey; title: string }) {
  const isMobile = useIsMobile();
  const [q, setQ] = useState("");
  // Scope buildings to the role — styrelse sees only attached buildings, an
  // entreprenör only buildings where they have work, admin sees everything.
  const { properties, allowedIds, isLoading: pLoading } = useScopedProperties<PropertyRow>(PROPERTY_COLUMNS);
  const { filterContactId, ready } = useMyArendeScope();
  const { data: stats = {}, isLoading: sLoading } = useQuery({
    queryKey: ["section-overview-stats", section, filterContactId],
    enabled: ready,
    queryFn: () => loadStats(section, filterContactId),
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const visible = allowedIds === null ? properties : properties.filter((p) => allowedIds.has(p.id));
    const rows = visible.map((p) => ({
      property: p,
      stat: stats[p.id] ?? { count: 0, unviewedCount: 0, earliestDeadline: null },
    }));
    if (!s) return rows;
    return rows.filter(
      (r) => r.property.name.toLowerCase().includes(s) || (r.property.address ?? "").toLowerCase().includes(s),
    );
  }, [properties, stats, q, allowedIds]);

  const loading = pLoading || sLoading;

  return (
    <div style={{ padding: isMobile ? 16 : 32, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1a1a1a", margin: 0, fontFamily: "Outfit, Inter, system-ui, sans-serif" }}>
          {title}
        </h1>
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8,
            border: "1px solid #E5E7EB", borderRadius: 999, padding: "0 14px",
            height: 36, background: "#fff", color: "#6B7280", minWidth: isMobile ? "100%" : 240,
          }}
        >
          <HugeiconsIcon icon={Search01Icon} size={14} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Sök fastighet…"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13, minWidth: 0, color: "#1a1a1a" }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ color: "#6B7280" }}>Laddar…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 48, textAlign: "center", color: "#6B7280" }}>Inga fastigheter</div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))",
          }}
        >
          {filtered.map(({ property, stat }) => (
            <SectionPropertyCard key={property.id} property={property} section={section} stat={stat} />
          ))}
        </div>
      )}
    </div>
  );
}
