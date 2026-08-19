import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, ArrowUpDown, ArrowDown, ArrowUp, ArrowDownAZ, Filter, Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { OBJECT_TYPES, objectTypeLabel, deriveObjectStatus, OBJECT_STATUS_SORT_RANK, type ObjectHealthStatus } from "@/lib/object-tokens";
import { LIFECYCLE_OF, type ArendeForStatus, type BesiktningForStatus, type ProjektForStatus } from "@/lib/issue-tokens";
import { LogbookEntryCard } from "@/components/LogbookEntryCard";
import { LogSelectionBar, useLogSelection } from "@/components/LogSelection";
import { LoggbokFilterBar, loggbokEmptyText, useLoggbokFilter } from "@/components/LoggbokFilterBar";
import { actionKindOf } from "@/lib/logbook";
import { useMyContactId } from "@/hooks/useMyContactId";

export const Route = createFileRoute("/_authenticated/properties/$id/objects/")({
  head: () => ({ meta: [{ title: "Objekt — BAYT" }] }),
  component: ObjectsIndex,
});

type Obj = {
  id: string; name: string | null; type: string; apartment_id: string | null;
};

const C = { card: "#fff", border: "#E5E7EB", text: "#1a1a1a", secondary: "#6B7280", primary: "#3D8A30", green: "#5CB84A" };
const PRIO_WEIGHT: Record<string, number> = { akut: 4, hog: 3, normal: 2, lag: 1 };

// Namn-sort: 0 = av (default, prio-baserad ordning), 1 = nummer högst→lägst,
// 2 = nummer lägst→högst, 3 = alfabetisk. Fjärde tryck loopar tillbaka till 1.
type NameSortMode = 0 | 1 | 2 | 3;

// Status-sort: 0 = av, 1 = mest akut → minst akut (försenad/brådskande först),
// 2 = minst akut → mest akut. Tredje tryck loopar tillbaka till 1.
type StatusSortMode = 0 | 1 | 2;

// Ärende-sort: 0 = av, 1 = flest → färst relaterade ärenden, 2 = färst → flest.
// Tredje tryck loopar tillbaka till 1.
type IssuesSortMode = 0 | 1 | 2;

function displayObjName(o: { name: string | null; type: string }): string {
  return o.name || objectTypeLabel(o.type);
}

// Tar det första sammanhängande sifferblocket i namnet, läst vänster till
// höger — "Skåp 12 34" ger 12. Namn utan siffra ger null och behandlas som
// +Infinity vid sortering, vilket automatiskt placerar dem överst vid
// högst→lägst och underst vid lägst→högst.
function extractFirstNumber(text: string): number | null {
  const m = text.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

// Semicolon delimiter (not comma) so it opens correctly in one click in
// Swedish-locale Excel, where comma is the decimal separator and Excel's
// CSV import otherwise treats the whole row as one column.
function csvCell(value: string): string {
  return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function downloadObjectsCsv(propertyId: string, rows: Array<{ o: { name: string | null; type: string }; statusLabel: string; issues: number }>) {
  const header = ["Namn", "Typ", "Status", "Relaterade ärenden"];
  const lines = [header, ...rows.map(({ o, statusLabel, issues }) => [
    displayObjName(o), objectTypeLabel(o.type), statusLabel, String(issues),
  ])].map((cols) => cols.map(csvCell).join(";"));
  // Leading BOM tells Excel the file is UTF-8, so å/ä/ö survive.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `objekt-${propertyId}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function groupByObjectId<T extends { property_object_id: string | null }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.property_object_id) continue;
    const arr = map.get(row.property_object_id);
    if (arr) arr.push(row);
    else map.set(row.property_object_id, [row]);
  }
  return map;
}

function ObjectsIndex() {
  const { id: propertyId } = Route.useParams();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [view, setView] = useState<"prio" | "logg">("prio");
  const [nameSortMode, setNameSortMode] = useState<NameSortMode>(0);
  const cycleNameSort = () => {
    setStatusSortMode(0);
    setIssuesSortMode(0);
    setNameSortMode((m) => (m === 0 ? 1 : m === 1 ? 2 : m === 2 ? 3 : 1));
  };
  // Status-sort, namn-sort och ärende-sort styr samma radordning, så bara en
  // av dem är aktiv åt gången — att slå på en annan nollar de övriga.
  const [statusSortMode, setStatusSortMode] = useState<StatusSortMode>(0);
  const cycleStatusSort = () => {
    setNameSortMode(0);
    setIssuesSortMode(0);
    setStatusSortMode((m) => (m === 0 ? 1 : m === 1 ? 2 : 1));
  };
  const [issuesSortMode, setIssuesSortMode] = useState<IssuesSortMode>(0);
  const cycleIssuesSort = () => {
    setNameSortMode(0);
    setStatusSortMode(0);
    setIssuesSortMode((m) => (m === 0 ? 1 : m === 1 ? 2 : 1));
  };
  // Typ-filter: null = av (alla typer). Knappen cyklar genom de typer som
  // faktiskt förekommer bland objekten, i OBJECT_TYPES-ordning, och loopar
  // tillbaka till av efter den sista.
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  // Bara mina ärenden: issues has no RLS narrowing (any login can read every
  // row), so an entreprenör's badge counts must be filtered client-side to
  // their own assignment — same "?? __none__" pattern as property-tabs.tsx.
  // objectsQ itself needs no such filter: property_objects' RLS already
  // returns only objects that role can see.
  const { contactId, isEntreprenor } = useMyContactId();
  const { profile } = useAuth();
  const mayEdit = canEdit(profile?.role);

  const objectsQ = useQuery({
    queryKey: ["property-objects", propertyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("property_objects")
        .select("id, name, type, apartment_id")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false });
      return (data ?? []) as Obj[];
    },
  });

  // Unfiltered by status (unlike the old "öppna" fetch): a "ny" (not yet
  // öppnad) felanmälan is still an unresolved problem for the objektets
  // härledda status, even though it doesn't count toward the "N öppna" badge.
  const issuesQ = useQuery({
    queryKey: ["property-objects-issues", propertyId, isEntreprenor ? contactId : null],
    enabled: !isEntreprenor || contactId !== undefined,
    queryFn: async () => {
      let q = supabase
        .from("issues")
        .select("id, priority, status, deadline, created_at, property_object_id")
        .eq("property_id", propertyId);
      if (isEntreprenor) q = q.eq("assigned_contact_id", contactId ?? "__none__");
      const { data } = await q;
      return (data ?? []) as Array<{ id: string; priority: string; status: string; deadline: string | null; created_at: string; property_object_id: string | null }>;
    },
  });

  const inspectionsQ = useQuery({
    queryKey: ["property-objects-inspections", propertyId, isEntreprenor ? contactId : null],
    enabled: !isEntreprenor || contactId !== undefined,
    queryFn: async () => {
      let q = supabase
        .from("inspections")
        .select("id, arende_status, status, next_due_date, last_completed_date, interval_months, property_object_id")
        .eq("property_id", propertyId)
        .not("property_object_id", "is", null);
      if (isEntreprenor) q = q.eq("assigned_contact_id", contactId ?? "__none__");
      const { data } = await q;
      return (data ?? []) as Array<BesiktningForStatus & { id: string; property_object_id: string | null }>;
    },
  });

  const projectsQ = useQuery({
    queryKey: ["property-objects-projects", propertyId, isEntreprenor ? contactId : null],
    enabled: !isEntreprenor || contactId !== undefined,
    queryFn: async () => {
      let q = supabase
        .from("projects")
        .select("id, arende_status, status, end_date, property_object_id")
        .eq("property_id", propertyId)
        .not("property_object_id", "is", null);
      if (isEntreprenor) q = q.eq("assigned_contact_id", contactId ?? "__none__");
      const { data } = await q;
      return (data ?? []) as Array<ProjektForStatus & { id: string; property_object_id: string | null }>;
    },
  });

  const logsQ = useQuery({
    queryKey: ["property-objects-logs", propertyId],
    enabled: view === "logg",
    queryFn: async () => {
      const { data } = await supabase
        .from("logbook_entries")
        .select("id, entry_date, created_at, content, event_type, created_by, property_id, apartment_id, property_object_id, profiles:created_by(full_name)")
        .eq("property_id", propertyId)
        .not("property_object_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as any[];
    },
  });

  // Objektloggen only ever lists logbook_entries, so no Källa control — it
  // would be a single permanently-selected option pretending to be a choice.
  const { rows: logRows, filters: logFilters } = useLoggbokFilter(logsQ.data ?? [], (e: any) => ({
    source: "log",
    actionKind: actionKindOf(e.event_type, e.content),
    actorId: e.created_by ?? null,
    actorName: e.profiles?.full_name ?? null,
    date: e.created_at ?? e.entry_date ?? "",
    text: `${e.content ?? ""} ${e.profiles?.full_name ?? ""}`,
  }));

  const logSelection = useLogSelection(
    logRows.map((e) => ({ table: "logbook_entries" as const, id: e.id as string })),
  );

  const presentTypes = useMemo(() => {
    const types = new Set((objectsQ.data ?? []).map((o) => o.type));
    return OBJECT_TYPES.filter((t) => types.has(t.value)).map((t) => t.value as string);
  }, [objectsQ.data]);

  const cycleTypeFilter = () => {
    if (presentTypes.length === 0) return;
    if (typeFilter === null) { setTypeFilter(presentTypes[0]); return; }
    const idx = presentTypes.indexOf(typeFilter);
    const next = idx + 1;
    setTypeFilter(next >= presentTypes.length ? null : presentTypes[next]);
  };

  const objectsWithMeta = useMemo(() => {
    const issuesByObj = groupByObjectId(issuesQ.data ?? []);
    const inspectionsByObj = groupByObjectId(inspectionsQ.data ?? []);
    const projectsByObj = groupByObjectId(projectsQ.data ?? []);

    // "N öppna" badge keeps its old meaning: only lifecycle oppet, not a
    // freshly-inkommen "ny" felanmälan nobody has looked at yet.
    const map = new Map<string, { issues: number; worst: string | null }>();
    for (const i of issuesQ.data ?? []) {
      if (!i.property_object_id || LIFECYCLE_OF[i.status ?? ""] !== "oppet") continue;
      const cur = map.get(i.property_object_id) ?? { issues: 0, worst: null };
      cur.issues += 1;
      const w = cur.worst ? PRIO_WEIGHT[cur.worst] : 0;
      const p = PRIO_WEIGHT[i.priority ?? "normal"] ?? 0;
      if (p > w) cur.worst = i.priority;
      map.set(i.property_object_id, cur);
    }

    const list = (objectsQ.data ?? [])
      .filter((o) => !typeFilter || o.type === typeFilter)
      .map((o) => {
      const health = deriveObjectStatus({
        issues: issuesByObj.get(o.id) ?? [],
        inspections: inspectionsByObj.get(o.id) ?? [],
        projects: projectsByObj.get(o.id) ?? [],
      });
      return { ...o, ...(map.get(o.id) ?? { issues: 0, worst: null }), health };
    });

    if (statusSortMode === 1 || statusSortMode === 2) {
      list.sort((a, b) => {
        const aw = OBJECT_STATUS_SORT_RANK[a.health.key];
        const bw = OBJECT_STATUS_SORT_RANK[b.health.key];
        if (aw !== bw) return statusSortMode === 1 ? bw - aw : aw - bw;
        return displayObjName(a).localeCompare(displayObjName(b), "sv");
      });
    } else if (issuesSortMode === 1 || issuesSortMode === 2) {
      list.sort((a, b) => {
        if (a.issues !== b.issues) return issuesSortMode === 1 ? b.issues - a.issues : a.issues - b.issues;
        return displayObjName(a).localeCompare(displayObjName(b), "sv");
      });
    } else if (nameSortMode === 1 || nameSortMode === 2) {
      list.sort((a, b) => {
        const aNum = extractFirstNumber(displayObjName(a)) ?? Infinity;
        const bNum = extractFirstNumber(displayObjName(b)) ?? Infinity;
        if (aNum !== bNum) return nameSortMode === 1 ? bNum - aNum : aNum - bNum;
        return displayObjName(a).localeCompare(displayObjName(b), "sv");
      });
    } else if (nameSortMode === 3) {
      list.sort((a, b) => displayObjName(a).localeCompare(displayObjName(b), "sv"));
    } else {
      list.sort((a, b) => {
        const aw = a.worst ? PRIO_WEIGHT[a.worst] : 0;
        const bw = b.worst ? PRIO_WEIGHT[b.worst] : 0;
        if (aw !== bw) return bw - aw;
        return b.issues - a.issues;
      });
    }
    return list;
  }, [objectsQ.data, issuesQ.data, inspectionsQ.data, projectsQ.data, nameSortMode, statusSortMode, issuesSortMode, typeFilter]);

  const openCount = (issuesQ.data ?? []).filter((i) => i.property_object_id && LIFECYCLE_OF[i.status ?? ""] === "oppet").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: isMobile ? 0 : 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text, whiteSpace: "nowrap" }}>Objekt</h2>
          <div style={{ fontSize: 12, color: C.secondary, marginTop: 4, whiteSpace: "nowrap" }}>
            {openCount} öppna felanmälningar · {objectsWithMeta.length} objekt
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{ display: "inline-flex", border: `1px solid ${C.border}`, borderRadius: 999, padding: 4, background: "#fff" }}>
            {[{ k: "prio", l: "Prio" }, { k: "logg", l: "Loggbok" }].map((o) => (
              <button
                key={o.k}
                type="button"
                onClick={() => setView(o.k as "prio" | "logg")}
                style={{
                  padding: "6px 14px", borderRadius: 999, border: "none",
                  background: view === o.k ? C.primary : "transparent",
                  color: view === o.k ? "#fff" : C.text, fontWeight: 600, fontSize: 13, cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {o.l}
              </button>
            ))}
          </div>
          {objectsWithMeta.length > 0 && (
            <button
              type="button"
              onClick={() => downloadObjectsCsv(propertyId, objectsWithMeta.map((o) => ({ o, statusLabel: o.health.label, issues: o.issues })))}
              title="Ladda ner som CSV (Excel/Sheets)"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                height: 36, padding: "0 14px", background: "#fff", color: C.text,
                border: `1px solid ${C.border}`, borderRadius: 999, fontSize: 13, fontWeight: 600,
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              <Download size={16} /> Ladda ner
            </button>
          )}
          {mayEdit && (
            <Link
              to="/properties/$id/objects/new"
              params={{ id: propertyId }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                height: 36, padding: "0 16px", background: C.primary, color: "#fff",
                borderRadius: 999, textDecoration: "none", fontSize: 13, fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              <Plus size={16} /> Nytt objekt
            </Link>
          )}
        </div>
      </div>

      {view === "prio" ? (
        objectsWithMeta.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: C.secondary, border: `1px solid ${C.border}`, borderRadius: 12 }}>Inga objekt ännu</div>
        ) : (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            {isMobile ? (
              <div style={{ display: "flex", gap: 8, padding: "10px 16px", borderBottom: `1px solid ${C.border}`, background: "#FAFAFA" }}>
                <button
                  type="button"
                  onClick={cycleNameSort}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "center",
                    height: 32, padding: "0 10px", borderRadius: 8, border: `1px solid ${C.border}`,
                    background: "#fff", color: nameSortMode === 0 ? C.secondary : C.primary,
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  {nameSortMode === 1 ? (
                    <ArrowDown size={13} />
                  ) : nameSortMode === 2 ? (
                    <ArrowUp size={13} />
                  ) : nameSortMode === 3 ? (
                    <ArrowDownAZ size={13} />
                  ) : (
                    <ArrowUpDown size={13} />
                  )}
                  {nameSortMode === 1 ? "Nummer ↓" : nameSortMode === 2 ? "Nummer ↑" : nameSortMode === 3 ? "A–Ö" : "Sortera"}
                </button>
                <button
                  type="button"
                  onClick={cycleTypeFilter}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "center",
                    height: 32, padding: "0 10px", borderRadius: 8, border: `1px solid ${C.border}`,
                    background: "#fff", color: typeFilter ? C.primary : C.secondary,
                    fontSize: 12, fontWeight: 600, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >
                  <Filter size={13} style={{ flexShrink: 0 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {typeFilter ? objectTypeLabel(typeFilter) : "Alla typer"}
                  </span>
                </button>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "20px minmax(0, 2fr) minmax(0, 1.2fr) minmax(0, 1fr) 130px",
                  gap: 12, alignItems: "center", padding: "10px 16px",
                  borderBottom: `1px solid ${C.border}`, background: "#FAFAFA",
                }}
              >
                <span />
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.secondary, textTransform: "uppercase", letterSpacing: 0.4 }}>Namn</span>
                  <button
                    type="button"
                    onClick={cycleNameSort}
                    title={
                      nameSortMode === 1
                        ? "Sorterad: nummer högst → lägst"
                        : nameSortMode === 2
                          ? "Sorterad: nummer lägst → högst"
                          : nameSortMode === 3
                            ? "Sorterad: alfabetisk"
                            : "Sortera på namn"
                    }
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 18, height: 18, padding: 0, border: "none", background: "transparent",
                      color: nameSortMode === 0 ? C.secondary : C.primary, cursor: "pointer",
                    }}
                  >
                    {nameSortMode === 1 ? (
                      <ArrowDown size={13} />
                    ) : nameSortMode === 2 ? (
                      <ArrowUp size={13} />
                    ) : nameSortMode === 3 ? (
                      <ArrowDownAZ size={13} />
                    ) : (
                      <ArrowUpDown size={13} />
                    )}
                  </button>
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.secondary, textTransform: "uppercase", letterSpacing: 0.4 }}>Typ</span>
                  <button
                    type="button"
                    onClick={cycleTypeFilter}
                    title={typeFilter ? `Filtrerad: ${objectTypeLabel(typeFilter)}` : "Filtrera på typ"}
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 18, height: 18, padding: 0, border: "none", background: "transparent",
                      color: typeFilter ? C.primary : C.secondary, cursor: "pointer",
                    }}
                  >
                    <Filter size={13} />
                  </button>
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.secondary, textTransform: "uppercase", letterSpacing: 0.4 }}>Status</span>
                  <button
                    type="button"
                    onClick={cycleStatusSort}
                    title={
                      statusSortMode === 1
                        ? "Sorterad: mest akut → minst akut"
                        : statusSortMode === 2
                          ? "Sorterad: minst akut → mest akut"
                          : "Sortera på angelägenhet"
                    }
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 18, height: 18, padding: 0, border: "none", background: "transparent",
                      color: statusSortMode === 0 ? C.secondary : C.primary, cursor: "pointer",
                    }}
                  >
                    {statusSortMode === 1 ? (
                      <ArrowDown size={13} />
                    ) : statusSortMode === 2 ? (
                      <ArrowUp size={13} />
                    ) : (
                      <ArrowUpDown size={13} />
                    )}
                  </button>
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.secondary, textTransform: "uppercase", letterSpacing: 0.4, textAlign: "right" }}>Relaterade ärenden</span>
                  <button
                    type="button"
                    onClick={cycleIssuesSort}
                    title={
                      issuesSortMode === 1
                        ? "Sorterad: flest → färst"
                        : issuesSortMode === 2
                          ? "Sorterad: färst → flest"
                          : "Sortera på antal relaterade ärenden"
                    }
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 18, height: 18, padding: 0, border: "none", background: "transparent",
                      color: issuesSortMode === 0 ? C.secondary : C.primary, cursor: "pointer",
                    }}
                  >
                    {issuesSortMode === 1 ? (
                      <ArrowDown size={13} />
                    ) : issuesSortMode === 2 ? (
                      <ArrowUp size={13} />
                    ) : (
                      <ArrowUpDown size={13} />
                    )}
                  </button>
                </span>
              </div>
            )}
            {objectsWithMeta.map((o) => {
              const sm: ObjectHealthStatus = o.health;
              if (isMobile) {
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => navigate({ to: "/properties/$id/objects/$objectId", params: { id: propertyId, objectId: o.id } })}
                    style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "14px 16px", border: "none", background: "transparent", borderBottom: `1px solid #F3F4F6`, cursor: "pointer", textAlign: "left" }}
                  >
                    <span title={sm.reason} style={{ width: 12, height: 12, borderRadius: "50%", background: sm.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {o.name || objectTypeLabel(o.type)}
                      </div>
                      <div style={{ fontSize: 12, color: C.secondary, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={sm.reason}>
                        {objectTypeLabel(o.type)} · <span style={{ fontWeight: 600, color: sm.color }}>{sm.label}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: o.issues > 0 ? "#DC2626" : C.secondary, fontWeight: 600, flexShrink: 0 }}>
                      {o.issues > 0 ? `${o.issues} öppna` : "0"}
                    </div>
                  </button>
                );
              }
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => navigate({ to: "/properties/$id/objects/$objectId", params: { id: propertyId, objectId: o.id } })}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "20px minmax(0, 2fr) minmax(0, 1.2fr) minmax(0, 1fr) 130px",
                    gap: 12, alignItems: "center", width: "100%", padding: "14px 16px",
                    border: "none", background: "transparent", borderBottom: `1px solid #F3F4F6`, cursor: "pointer", textAlign: "left",
                  }}
                >
                  <span title={sm.reason} style={{ width: 12, height: 12, borderRadius: "50%", background: sm.color, flexShrink: 0 }} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {o.name || objectTypeLabel(o.type)}
                  </div>
                  <div style={{ fontSize: 13, color: C.secondary, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {objectTypeLabel(o.type)}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: sm.color, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={sm.reason}>
                    {sm.label}
                  </div>
                  <div style={{ fontSize: 12, color: o.issues > 0 ? "#DC2626" : C.secondary, fontWeight: 600, textAlign: "right" }}>
                    {o.issues}
                  </div>
                </button>
              );
            })}
          </div>
        )
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <LoggbokFilterBar filters={logFilters} searchPlaceholder="Sök i objektloggen…" />
          {logRows.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: C.secondary, border: `1px solid ${C.border}`, borderRadius: 12 }}>
              {loggbokEmptyText(logFilters.active, "Ingen aktivitet ännu")}
            </div>
          ) : (
            <>
              <LogSelectionBar
                selection={logSelection}
                invalidateKeys={[
                  ["property-objects-logs", propertyId],
                  ["object-logbook"],
                  ["property-timeline", propertyId],
                  ["all-buildings-loggbok"],
                ]}
              />
              {logRows.map((e) => (
                <LogbookEntryCard key={e.id} entry={e} selection={logSelection} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
