import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatSwedishLongDate } from "@/components/PropertyTimeline";
import {
  LogSelectCheckbox, LogSelectionBar, useLogSelection,
  type LogTable, type LogTarget,
} from "@/components/LogSelection";

const C = {
  card: "#ffffff", border: "#E5E7EB", secondary: "#6B7280", text: "#1a1a1a",
  accent: "#0D2B1E",
};

/**
 * Every log event in the system, across every building, in one list.
 *
 * Same merge as the per-fastighet loggbok (PropertyLoggbokWithComments) —
 * loggboksposter plus the besiktningar and projekt the feed derives events
 * from — but unscoped, so an admin can clear history in bulk without walking
 * into each building. Rows carry the building name because that is the only
 * thing distinguishing two otherwise identical entries here.
 *
 * Not role-gated in the query: RLS already limits what each role can read, and
 * the delete toolbar renders for admin only.
 */

type Kind = "log" | "inspection" | "project";

type Row = {
  key: string;
  kind: Kind;
  id: string;
  date: string;
  title: string;
  propertyId: string | null;
  propertyName: string;
};

const KIND_TABLE: Record<Kind, LogTable> = {
  log: "logbook_entries",
  inspection: "inspections",
  project: "projects",
};

const KIND_LABEL: Record<Kind, string> = {
  log: "Loggbok",
  inspection: "Besiktning",
  project: "Projekt",
};

const KIND_COLOR: Record<Kind, string> = {
  log: "#9CA3AF",
  inspection: "#3D8A30",
  project: "#E07B35",
};

const FILTERS: ReadonlyArray<{ key: "alla" | Kind; label: string }> = [
  { key: "alla", label: "Alla" },
  { key: "log", label: "Loggbok" },
  { key: "inspection", label: "Besiktningar" },
  { key: "project", label: "Projekt" },
];

function target(r: Row): LogTarget {
  return { table: KIND_TABLE[r.kind], id: r.id };
}

async function loadAll(): Promise<Row[]> {
  const [props, logs, insp, projs] = await Promise.all([
    supabase.from("properties").select("id, name"),
    supabase
      .from("logbook_entries")
      .select("id, content, entry_date, created_at, property_id")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("inspections")
      .select("id, inspection_type, last_completed_date, property_id")
      .not("last_completed_date", "is", null),
    supabase.from("projects").select("id, title, start_date, end_date, property_id"),
  ]);

  const nameOf = new Map<string, string>();
  for (const p of (props.data ?? []) as Array<{ id: string; name: string | null }>) {
    nameOf.set(p.id, p.name ?? "Okänd fastighet");
  }
  const name = (id: string | null) => (id ? nameOf.get(id) ?? "Okänd fastighet" : "Ingen fastighet");

  const rows: Row[] = [];

  for (const r of (logs.data ?? []) as any[]) {
    const when = r.created_at ?? r.entry_date;
    if (!when) continue;
    const text = String(r.content ?? "").trim();
    rows.push({
      key: `l-${r.id}`, kind: "log", id: r.id, date: when,
      title: text.length > 120 ? `${text.slice(0, 120)}…` : text || "Loggbokspost",
      propertyId: r.property_id, propertyName: name(r.property_id),
    });
  }
  for (const r of (insp.data ?? []) as any[]) {
    if (!r.last_completed_date) continue;
    rows.push({
      key: `i-${r.id}`, kind: "inspection", id: r.id, date: r.last_completed_date,
      title: `${r.inspection_type ?? "Besiktning"} besiktigad`,
      propertyId: r.property_id, propertyName: name(r.property_id),
    });
  }
  for (const r of (projs.data ?? []) as any[]) {
    const d = r.end_date ?? r.start_date;
    if (!d) continue;
    rows.push({
      key: `p-${r.id}`, kind: "project", id: r.id, date: d,
      title: r.title ?? "Projekt",
      propertyId: r.property_id, propertyName: name(r.property_id),
    });
  }

  rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  return rows;
}

export function AllBuildingsLoggbok() {
  const isMobile = useIsMobile();
  const [kind, setKind] = useState<"alla" | Kind>("alla");
  const [q, setQ] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["all-buildings-loggbok"],
    queryFn: loadAll,
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (kind !== "alla" && r.kind !== kind) return false;
      if (!s) return true;
      return r.title.toLowerCase().includes(s) || r.propertyName.toLowerCase().includes(s);
    });
  }, [rows, kind, q]);

  // Selection tracks the filtered rows, so "Välj alla" means "everything I can
  // currently see" — never rows hidden behind a chip or the search box.
  const selection = useLogSelection(filtered.map(target));

  const years = useMemo(() => {
    const out: { year: number; items: Row[] }[] = [];
    for (const r of filtered) {
      const y = new Date(r.date).getFullYear();
      const last = out[out.length - 1];
      if (last && last.year === y) last.items.push(r);
      else out.push({ year: y, items: [r] });
    }
    return out;
  }, [filtered]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {FILTERS.map((f) => {
          const active = kind === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setKind(f.key)}
              style={{
                height: 30, padding: "0 12px", borderRadius: 8, fontSize: 12.5,
                fontWeight: 600, cursor: "pointer",
                border: `1px solid ${active ? C.accent : C.border}`,
                background: active ? C.accent : C.card,
                color: active ? "#fff" : C.secondary,
              }}
            >
              {f.label}
            </button>
          );
        })}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Sök i loggboken…"
          style={{
            height: 30, padding: "0 12px", borderRadius: 999, fontSize: 13,
            border: `1px solid ${C.border}`, outline: "none", background: C.card,
            color: C.text, minWidth: 0, flex: isMobile ? "1 1 100%" : "0 1 240px",
            boxSizing: "border-box",
          }}
        />
      </div>

      <LogSelectionBar
        selection={selection}
        invalidateKeys={[
          ["all-buildings-loggbok"],
          ["property-timeline"],
          ["property-loggbok-comments"],
          ["logbook"],
          ["section-overview-stats", "logbook"],
          ["inspections"], ["projects"], ["oppna-arenden"],
        ]}
      />

      {isLoading ? (
        <div style={{ color: C.secondary }}>Laddar…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: "48px 16px", textAlign: "center", color: C.secondary, fontSize: 14 }}>
          Ingen aktivitet
        </div>
      ) : (
        years.map((g) => (
          <div key={g.year}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 10 }}>{g.year}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {g.items.map((r) => (
                <div
                  key={r.key}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    border: `1px solid ${C.border}`, borderRadius: 8,
                    padding: 12, background: C.card,
                  }}
                >
                  <LogSelectCheckbox selection={selection} target={target(r)} style={{ marginTop: 3 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: KIND_COLOR[r.kind], letterSpacing: "0.04em" }}>
                        {KIND_LABEL[r.kind]}
                      </span>
                      <span style={{ fontSize: 12, color: C.secondary }}>{r.propertyName}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginTop: 2, whiteSpace: "pre-wrap" }}>
                      {r.title}
                    </div>
                    <div style={{ fontSize: 12, color: C.secondary, marginTop: 2 }}>
                      {formatSwedishLongDate(r.date)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
