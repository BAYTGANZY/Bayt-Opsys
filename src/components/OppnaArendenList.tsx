import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type ArendeRow = {
  kind: "issue" | "inspection" | "project";
  id: string;
  title: string;
  propertyName: string | null;
  propertyId: string | null;
  deadline: string | null;
  status: string | null;
};

async function loadOppna(): Promise<ArendeRow[]> {
  const [issues, inspections, projects] = await Promise.all([
    supabase
      .from("issues")
      .select("id, title, deadline, status, property_id, properties(name)")
      .in("status", ["pagande", "oppet", "vantar"]),
    supabase
      .from("inspections")
      .select("id, inspection_type, next_due_date, arende_status, property_id, properties(name)")
      .eq("arende_status", "oppet"),
    supabase
      .from("projects")
      .select("id, title, end_date, arende_status, property_id, properties(name)")
      .eq("arende_status", "oppet"),
  ]);

  const rows: ArendeRow[] = [];
  for (const r of (issues.data ?? []) as unknown as Array<{
    id: string; title: string; deadline: string | null; status: string; property_id: string | null; properties: { name: string | null } | null;
  }>) {
    rows.push({ kind: "issue", id: r.id, title: r.title, propertyName: r.properties?.name ?? null, propertyId: r.property_id, deadline: r.deadline, status: r.status });
  }
  for (const r of (inspections.data ?? []) as unknown as Array<{
    id: string; inspection_type: string | null; next_due_date: string | null; arende_status: string | null; property_id: string | null; properties: { name: string | null } | null;
  }>) {
    rows.push({ kind: "inspection", id: r.id, title: r.inspection_type ?? "Besiktning", propertyName: r.properties?.name ?? null, propertyId: r.property_id, deadline: r.next_due_date, status: r.arende_status });
  }
  for (const r of (projects.data ?? []) as unknown as Array<{
    id: string; title: string | null; end_date: string | null; arende_status: string | null; property_id: string | null; properties: { name: string | null } | null;
  }>) {
    rows.push({ kind: "project", id: r.id, title: r.title ?? "Projekt", propertyName: r.properties?.name ?? null, propertyId: r.property_id, deadline: r.end_date, status: r.arende_status });
  }
  return rows;
}

const KIND_LABEL: Record<ArendeRow["kind"], string> = {
  issue: "Felanmälan",
  inspection: "Besiktning",
  project: "Projekt",
};
const KIND_ROUTE: Record<ArendeRow["kind"], (id: string) => string> = {
  issue: (id) => `/issues/${id}`,
  inspection: (id) => `/inspections/${id}`,
  project: (id) => `/projects/${id}`,
};
const KIND_COLOR: Record<ArendeRow["kind"], string> = {
  issue: "#DC2626",
  inspection: "#D4A017",
  project: "#3D8A30",
};

export function ArendeListItem({ row }: { row: ArendeRow }) {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = row.deadline && row.deadline < today;
  return (
    <Link
      to={KIND_ROUTE[row.kind](row.id)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        borderBottom: "1px solid #F3F4F6",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <span
        aria-hidden
        style={{ width: 8, height: 8, borderRadius: "50%", background: KIND_COLOR[row.kind], flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.title}
        </div>
        <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
          {KIND_LABEL[row.kind]}
          {row.propertyName ? ` · ${row.propertyName}` : ""}
          {row.deadline ? (
            <>
              {" · "}
              <span style={{ color: overdue ? "#DC2626" : "#6B7280" }}>Deadline {row.deadline}</span>
            </>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export function OppnaArendenList() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["oppna-arenden"],
    queryFn: loadOppna,
  });

  const sorted = [...data].sort((a, b) => {
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return a.title.localeCompare(b.title);
  });

  return (
    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #EEF0F2", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "Outfit, Inter, system-ui, sans-serif", fontSize: 16, fontWeight: 600, color: "#1F2A37" }}>Öppna ärenden</div>
        <div style={{ fontSize: 12, color: "#8A94A0", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {sorted.length}
        </div>
      </div>
      {isLoading ? (
        <div style={{ padding: 24, color: "#6B7280", fontSize: 14 }}>Laddar…</div>
      ) : sorted.length === 0 ? (
        <div style={{ padding: 24, color: "#6B7280", fontSize: 14 }}>Inga öppna ärenden</div>
      ) : (
        sorted.map((r) => <ArendeListItem key={`${r.kind}-${r.id}`} row={r} />)
      )}
    </div>
  );
}

export function VeckansArendenSection() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["veckans-arenden"],
    queryFn: async (): Promise<ArendeRow[]> => {
      const today = new Date();
      const in7 = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);
      const todayS = today.toISOString().slice(0, 10);

      // Closed errands must never resurface here — the date-window branch of the
      // .or() would otherwise match avslutade items whose deadline is this week.
      const [issues, inspections, projects] = await Promise.all([
        supabase
          .from("issues")
          .select("id, title, deadline, status, property_id, properties(name)")
          .not("status", "in", "(klar,fakturerad,stangd,avslutat)")
          .or(`status.in.(pagande,oppet,vantar),and(deadline.gte.${todayS},deadline.lte.${in7})`),
        supabase
          .from("inspections")
          .select("id, inspection_type, next_due_date, arende_status, property_id, properties(name)")
          .or("arende_status.is.null,arende_status.neq.avslutat")
          .or(`arende_status.eq.oppet,and(next_due_date.gte.${todayS},next_due_date.lte.${in7})`),
        supabase
          .from("projects")
          .select("id, title, end_date, arende_status, property_id, properties(name)")
          .or("arende_status.is.null,arende_status.neq.avslutat")
          .or(`arende_status.eq.oppet,and(end_date.gte.${todayS},end_date.lte.${in7})`),
      ]);

      const rows: ArendeRow[] = [];
      for (const r of (issues.data ?? []) as unknown as Array<{ id: string; title: string; deadline: string | null; status: string; property_id: string | null; properties: { name: string | null } | null }>) {
        rows.push({ kind: "issue", id: r.id, title: r.title, propertyName: r.properties?.name ?? null, propertyId: r.property_id, deadline: r.deadline, status: r.status });
      }
      for (const r of (inspections.data ?? []) as unknown as Array<{ id: string; inspection_type: string | null; next_due_date: string | null; arende_status: string | null; property_id: string | null; properties: { name: string | null } | null }>) {
        rows.push({ kind: "inspection", id: r.id, title: r.inspection_type ?? "Besiktning", propertyName: r.properties?.name ?? null, propertyId: r.property_id, deadline: r.next_due_date, status: r.arende_status });
      }
      for (const r of (projects.data ?? []) as unknown as Array<{ id: string; title: string | null; end_date: string | null; arende_status: string | null; property_id: string | null; properties: { name: string | null } | null }>) {
        rows.push({ kind: "project", id: r.id, title: r.title ?? "Projekt", propertyName: r.properties?.name ?? null, propertyId: r.property_id, deadline: r.end_date, status: r.arende_status });
      }
      return rows;
    },
  });

  const buckets = new Map<string, ArendeRow[]>();
  const noDeadline: ArendeRow[] = [];
  for (const r of data) {
    if (!r.deadline) noDeadline.push(r);
    else {
      if (!buckets.has(r.deadline)) buckets.set(r.deadline, []);
      buckets.get(r.deadline)!.push(r);
    }
  }
  const sortedKeys = Array.from(buckets.keys()).sort();
  const fmtDay = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    const days = ["Söndag", "Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag"];
    return `${days[d.getDay()]} ${iso}`;
  };

  return (
    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #EEF0F2" }}>
        <div style={{ fontFamily: "Outfit, Inter, system-ui, sans-serif", fontSize: 16, fontWeight: 600, color: "#1F2A37" }}>Veckans ärenden</div>
        <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>Öppna ärenden och deadlines inom 7 dagar</div>
      </div>
      {isLoading ? (
        <div style={{ padding: 24, color: "#6B7280", fontSize: 14 }}>Laddar…</div>
      ) : data.length === 0 ? (
        <div style={{ padding: 24, color: "#6B7280", fontSize: 14 }}>Inget planerat den här veckan</div>
      ) : (
        <div>
          {sortedKeys.map((day) => (
            <div key={day}>
              <div style={{ padding: "10px 16px", background: "#F9FAFB", fontSize: 12, color: "#6B7280", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                {fmtDay(day)}
              </div>
              {buckets.get(day)!.map((r) => <ArendeListItem key={`${r.kind}-${r.id}`} row={r} />)}
            </div>
          ))}
          {noDeadline.length > 0 && (
            <div>
              <div style={{ padding: "10px 16px", background: "#F9FAFB", fontSize: 12, color: "#6B7280", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Utan deadline
              </div>
              {noDeadline.map((r) => <ArendeListItem key={`${r.kind}-${r.id}`} row={r} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
