import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUpDown, ArrowDown, ArrowUp, ArrowDownAZ, ArrowDownZA } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/lib/supabase";
import { PropertySectionButtons } from "@/components/PropertySectionButtons";
import { SortFilterControls, NEXT_SORT_MODE, type SortMode } from "@/components/SortFilterControls";
import { PropertyCard } from "@/components/PropertyCard";
import { useScopedProperties } from "@/hooks/useVisibleProperties";
import { useMyArendeScope } from "@/hooks/useMyContactId";
import { deriveObjectStatus, OBJECT_STATUS_SORT_RANK, type ObjectHealthStatus } from "@/lib/object-tokens";
import type { ArendeForStatus, BesiktningForStatus, ProjektForStatus } from "@/lib/issue-tokens";

type Property = {
  id: string;
  name: string;
  address: string | null;
  designation: string | null;
  unit_count: number | null;
  image_url: string | null;
  created_at: string | null;
  created_by: string | null;
};

const PROPERTY_COLUMNS =
  "id, name, address, designation, unit_count, image_url, created_at, created_by";

export const Route = createFileRoute("/_authenticated/fastigheter/")({
  head: () => ({ meta: [{ title: "Fastigheter — BAYT" }] }),
  component: PropertiesPage,
});

const C = {
  border: "#E5E7EB",
  secondary: "#6B7280",
  text: "#1a1a1a",
  dark: "#0D2B1E",
  green: "#5CB84A",
};

// Namn-sort: 0 = av (styrs av Nyast/Äldst/Mina), 1 = A–Ö, 2 = Ö–A. Tredje
// tryck loopar tillbaka till av.
type NameSortMode = 0 | 1 | 2;
// Status-sort (angelägenhet): 0 = av, 1 = mest akut/brådskande först, 2 =
// minst akut sist. Tredje tryck loopar tillbaka till av.
type StatusSortMode = 0 | 1 | 2;

type IssueRow = ArendeForStatus & { property_id: string | null };
type InspectionRow = BesiktningForStatus & { property_id: string | null };
type ProjectRow = ProjektForStatus & { property_id: string | null };

type PropertyArenden = {
  issuesByProperty: Map<string, IssueRow[]>;
  inspectionsByProperty: Map<string, InspectionRow[]>;
  projectsByProperty: Map<string, ProjectRow[]>;
};

function groupByPropertyId<T extends { property_id: string | null }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.property_id) continue;
    const arr = map.get(row.property_id);
    if (arr) arr.push(row);
    else map.set(row.property_id, [row]);
  }
  return map;
}

/**
 * Per-building ärende data for the status-sort, batched in one round for every
 * visible fastighet — same shape as loadOpenIssueBadges (IssuesPropertyOverview)
 * / loadCombinedOppnaStats (OppnaArendenOverview), not one query per card.
 * `filterContactId` (useMyArendeScope) scopes an entreprenör to only their own
 * assigned ärenden — PropertySectionButtons.loadUrgency does not do this, don't
 * copy that gap here.
 */
async function loadPropertyArenden(filterContactId: string | null): Promise<PropertyArenden> {
  // Plain <T> on purpose: an F-bounded constraint makes tsc recursively
  // instantiate supabase's builder generics and die with TS2589. The cast is
  // runtime-identical — eq() returns the same builder. (Same pattern as
  // loadCombinedOppnaStats in OppnaArendenOverview.tsx.)
  const scoped = <T,>(builder: T): T =>
    filterContactId
      ? ((builder as { eq(col: string, val: string): unknown }).eq("assigned_contact_id", filterContactId) as T)
      : builder;

  const [issues, inspections, projects] = await Promise.all([
    scoped(
      supabase
        .from("issues")
        .select("property_id, priority, status, deadline, created_at")
        .not("status", "in", "(klar,fakturerad,stangd,avslutat)"),
    ),
    scoped(
      supabase
        .from("inspections")
        .select("property_id, arende_status, status, next_due_date, last_completed_date, interval_months")
        .or("arende_status.is.null,arende_status.neq.avslutat")
        .or("status.is.null,status.neq.klar"),
    ),
    scoped(
      supabase
        .from("projects")
        .select("property_id, arende_status, status, end_date")
        .or("arende_status.is.null,arende_status.neq.avslutat")
        .or("status.is.null,and(status.neq.klar,status.neq.avbruten)"),
    ),
  ]);

  return {
    issuesByProperty: groupByPropertyId((issues.data ?? []) as IssueRow[]),
    inspectionsByProperty: groupByPropertyId((inspections.data ?? []) as InspectionRow[]),
    projectsByProperty: groupByPropertyId((projects.data ?? []) as ProjectRow[]),
  };
}

/** The label + circular cycle button pair, matching SortFilterControls' shape
 *  but toggleable (has an "off" state), used for the namn/angelägenhet axes. */
function ToggleSortControl({
  label,
  onCycle,
  active,
  icon,
  compact,
}: {
  label: string;
  onCycle: () => void;
  active: boolean;
  icon: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          height: compact ? 32 : 38,
          padding: compact ? "0 12px" : "0 14px",
          borderRadius: 999,
          background: active ? "#F0F7EE" : "#fff",
          color: active ? C.dark : C.secondary,
          border: `1px solid ${active ? C.green : C.border}`,
          fontSize: compact ? 12 : 13,
          fontWeight: 600,
          fontFamily: "Outfit, Inter, system-ui, sans-serif",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={onCycle}
        aria-label={label}
        title={label}
        style={{
          width: compact ? 32 : 38,
          height: compact ? 32 : 38,
          borderRadius: "50%",
          background: active ? C.dark : "#fff",
          color: active ? "#fff" : C.secondary,
          border: active ? "none" : `1px solid ${C.border}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        {icon}
      </button>
    </div>
  );
}

function PropertiesPage() {
  const isMobile = useIsMobile();
  const { user, profile } = useAuth();
  const canCreate = profile?.role === "admin";
  const { properties, allowedIds, isLoading } = useScopedProperties<Property>(PROPERTY_COLUMNS);
  const [mode, setMode] = useState<SortMode>("newest");
  const [nameSortMode, setNameSortMode] = useState<NameSortMode>(0);
  const [statusSortMode, setStatusSortMode] = useState<StatusSortMode>(0);

  // Namn-sort, status-sort och Nyast/Äldst/Mina styr samma radordning, så bara
  // en av dem är aktiv åt gången — att slå på en annan nollar de övriga.
  const cycleDateSort = () => {
    setNameSortMode(0);
    setStatusSortMode(0);
    setMode((m) => NEXT_SORT_MODE[m]);
  };
  const cycleNameSort = () => {
    setStatusSortMode(0);
    setNameSortMode((m) => (m === 0 ? 1 : m === 1 ? 2 : 0));
  };
  const cycleStatusSort = () => {
    setNameSortMode(0);
    setStatusSortMode((m) => (m === 0 ? 1 : m === 1 ? 2 : 0));
  };
  const dateSortActive = nameSortMode === 0 && statusSortMode === 0;

  const { filterContactId, ready } = useMyArendeScope();
  const arendeQ = useQuery({
    queryKey: ["properties-arende-status", filterContactId],
    enabled: ready,
    queryFn: () => loadPropertyArenden(filterContactId),
  });

  const visibleProperties = useMemo(
    () => (allowedIds === null ? properties : properties.filter((p) => allowedIds.has(p.id))),
    [properties, allowedIds],
  );

  const healthByProperty = useMemo(() => {
    const map = new Map<string, ObjectHealthStatus>();
    const data = arendeQ.data;
    for (const p of visibleProperties) {
      map.set(
        p.id,
        deriveObjectStatus({
          issues: data?.issuesByProperty.get(p.id) ?? [],
          inspections: data?.inspectionsByProperty.get(p.id) ?? [],
          projects: data?.projectsByProperty.get(p.id) ?? [],
        }),
      );
    }
    return map;
  }, [arendeQ.data, visibleProperties]);

  const sorted = useMemo(() => {
    const list = [...visibleProperties];
    if (statusSortMode === 1 || statusSortMode === 2) {
      list.sort((a, b) => {
        const aw = OBJECT_STATUS_SORT_RANK[healthByProperty.get(a.id)?.key ?? "ok"];
        const bw = OBJECT_STATUS_SORT_RANK[healthByProperty.get(b.id)?.key ?? "ok"];
        if (aw !== bw) return statusSortMode === 1 ? bw - aw : aw - bw;
        return a.name.localeCompare(b.name, "sv");
      });
      return list;
    }
    if (nameSortMode === 1 || nameSortMode === 2) {
      list.sort((a, b) => (nameSortMode === 1 ? a.name.localeCompare(b.name, "sv") : b.name.localeCompare(a.name, "sv")));
      return list;
    }
    if (mode === "mine") {
      const mine = list.filter((p) => p.created_by && user?.id && p.created_by === user.id);
      mine.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
      return mine;
    }
    list.sort((a, b) => {
      const av = a.created_at ?? "";
      const bv = b.created_at ?? "";
      return mode === "newest" ? bv.localeCompare(av) : av.localeCompare(bv);
    });
    return list;
  }, [visibleProperties, mode, user?.id, nameSortMode, statusSortMode, healthByProperty]);

  const nameSortControl = (
    <ToggleSortControl
      label={nameSortMode === 1 ? "A–Ö" : nameSortMode === 2 ? "Ö–A" : "Namn"}
      onCycle={cycleNameSort}
      active={nameSortMode !== 0}
      compact={isMobile}
      icon={
        nameSortMode === 1 ? (
          <ArrowDownAZ size={isMobile ? 15 : 17} />
        ) : nameSortMode === 2 ? (
          <ArrowDownZA size={isMobile ? 15 : 17} />
        ) : (
          <ArrowUpDown size={isMobile ? 15 : 17} />
        )
      }
    />
  );

  const statusSortControl = (
    <ToggleSortControl
      label={statusSortMode === 1 ? "Mest akut" : statusSortMode === 2 ? "Minst akut" : "Angelägenhet"}
      onCycle={cycleStatusSort}
      active={statusSortMode !== 0}
      compact={isMobile}
      icon={
        statusSortMode === 1 ? (
          <ArrowDown size={isMobile ? 15 : 17} />
        ) : statusSortMode === 2 ? (
          <ArrowUp size={isMobile ? 15 : 17} />
        ) : (
          <ArrowUpDown size={isMobile ? 15 : 17} />
        )
      }
    />
  );

  const loading = isLoading || arendeQ.isLoading;

  const grid = loading ? (
    <div style={{ padding: 24, color: C.secondary }}>Laddar…</div>
  ) : sorted.length === 0 ? (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        padding: "40px 0",
        color: C.secondary,
        fontSize: 14,
      }}
    >
      <HugeiconsIcon icon={Building02Icon} size={28} />
      <span>
        {mode === "mine" && nameSortMode === 0 && statusSortMode === 0
          ? "Du har inte lagt till några fastigheter än"
          : "Inga fastigheter hittades"}
      </span>
    </div>
  ) : (
    <div
      style={{
        display: "grid",
        gap: 16,
        gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(420px, 1fr))",
      }}
    >
      {sorted.map((p) => {
        const health = healthByProperty.get(p.id);
        return (
          <PropertyCard
            key={p.id}
            property={p}
            linkTo="/fastigheter/$id"
            rightSlot={<PropertySectionButtons propertyId={p.id} />}
            cornerBadge={
              health && (
                <div
                  title={health.reason}
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
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: health.color, flexShrink: 0 }} />
                  {health.label}
                </div>
              )
            }
          />
        );
      })}
    </div>
  );

  if (isMobile) {
    return (
      <div style={{ padding: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
          }}
        >
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: C.text,
              margin: 0,
              fontFamily: "Outfit, Inter, system-ui, sans-serif",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            Fastigheter
          </h1>
          {canCreate && (
            <Link
              to="/properties/new"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                background: C.green,
                color: "#fff",
                borderRadius: 999,
                textDecoration: "none",
                fontSize: 13,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              + Ny
            </Link>
          )}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 10,
            marginBottom: 12,
            flexWrap: "nowrap",
            overflowX: "auto",
          }}
        >
          {nameSortControl}
          {statusSortControl}
          <div style={{ opacity: dateSortActive ? 1 : 0.45 }}>
            <SortFilterControls mode={mode} onCycle={cycleDateSort} compact />
          </div>
        </div>
        {grid}
      </div>
    );
  }

  return (
    <div style={{ padding: 32 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: C.text,
            margin: 0,
            fontFamily: "Outfit, Inter, system-ui, sans-serif",
          }}
        >
          Fastigheter
        </h1>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
          {nameSortControl}
          {statusSortControl}
          <div style={{ opacity: dateSortActive ? 1 : 0.45 }}>
            <SortFilterControls mode={mode} onCycle={cycleDateSort} />
          </div>
          {canCreate && (
            <Link
              to="/properties/new"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 20px",
                background: C.green,
                color: "#fff",
                borderRadius: 999,
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "Outfit, Inter, system-ui, sans-serif",
              }}
            >
              + Ny fastighet
            </Link>
          )}
        </div>
      </div>
      {grid}
    </div>
  );
}
