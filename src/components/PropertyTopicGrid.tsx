import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Building02Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { supabase } from "@/lib/supabase";
import { useIsMobile } from "@/hooks/use-mobile";

type Topic = "issues" | "inspections" | "documents" | "contacts" | "projects";

const TOPIC_LABEL: Record<Topic, { subtext: (n: number) => string; subpath: string }> = {
  issues: { subtext: (n) => `${n} öppna felanmälningar`, subpath: "issues" },
  inspections: { subtext: (n) => `${n} aktiva besiktningar`, subpath: "inspections" },
  documents: { subtext: (n) => `${n} dokument`, subpath: "documents" },
  contacts: { subtext: (n) => `${n} kontakter`, subpath: "contacts" },
  projects: { subtext: (n) => `${n} aktiva projekt`, subpath: "projects" },
};

type PropertyRow = {
  id: string;
  name: string;
  address: string | null;
  count: number;
  worstPriority: "akut" | "hog" | "normal" | "lag" | null;
  hasOverdue: boolean;
  soonestDeadline: string | null;
};

const PRIO_COLOR: Record<string, string> = {
  akut: "#DC2626",
  hog: "#D4A017",
  normal: "#5CB84A",
  lag: "#9CA3AF",
};
const PRIO_WEIGHT: Record<string, number> = { akut: 4, hog: 3, normal: 2, lag: 1 };

async function loadTopic(topic: Topic): Promise<PropertyRow[]> {
  const { data: properties } = await supabase
    .from("properties")
    .select("id, name, address")
    .order("name");
  const props = (properties ?? []) as Array<{ id: string; name: string; address: string | null }>;
  if (props.length === 0) return [];

  const map = new Map<string, PropertyRow>(
    props.map((p) => [
      p.id,
      { id: p.id, name: p.name, address: p.address, count: 0, worstPriority: null, hasOverdue: false, soonestDeadline: null },
    ]),
  );

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  if (topic === "issues") {
    const { data } = await supabase
      .from("issues")
      .select("id, property_id, priority, status, deadline")
      .in("status", ["pagande", "oppet", "vantar"]);
    for (const r of (data ?? []) as Array<{ property_id: string | null; priority: string | null; deadline: string | null }>) {
      if (!r.property_id) continue;
      const row = map.get(r.property_id);
      if (!row) continue;
      row.count += 1;
      const pr = (r.priority ?? "normal") as "akut" | "hog" | "normal" | "lag";
      if (!row.worstPriority || PRIO_WEIGHT[pr] > PRIO_WEIGHT[row.worstPriority]) {
        row.worstPriority = pr;
      }
      if (r.deadline) {
        if (!row.soonestDeadline || r.deadline < row.soonestDeadline) row.soonestDeadline = r.deadline;
        if (r.deadline < today) row.hasOverdue = true;
      }
    }
  } else if (topic === "inspections") {
    const { data } = await supabase
      .from("inspections")
      .select("id, property_id, next_due_date, status");
    for (const r of (data ?? []) as Array<{ property_id: string | null; next_due_date: string | null; status: string | null }>) {
      if (!r.property_id) continue;
      const row = map.get(r.property_id);
      if (!row) continue;
      if (r.status === "klar") continue;
      row.count += 1;
      if (r.next_due_date) {
        if (!row.soonestDeadline || r.next_due_date < row.soonestDeadline) row.soonestDeadline = r.next_due_date;
        if (r.next_due_date < today) {
          row.hasOverdue = true;
          row.worstPriority = "akut";
        } else if (!row.worstPriority) {
          row.worstPriority = "normal";
        }
      }
    }
  } else if (topic === "documents") {
    const { data } = await supabase.from("documents").select("id, property_id");
    for (const r of (data ?? []) as Array<{ property_id: string | null }>) {
      if (!r.property_id) continue;
      const row = map.get(r.property_id);
      if (row) row.count += 1;
    }
  } else if (topic === "contacts") {
    const { data } = await supabase.from("contacts").select("id, property_id");
    for (const r of (data ?? []) as Array<{ property_id: string | null }>) {
      if (!r.property_id) continue;
      const row = map.get(r.property_id);
      if (row) row.count += 1;
    }
  } else if (topic === "projects") {
    const { data } = await supabase.from("projects").select("id, property_id, status, end_date");
    for (const r of (data ?? []) as Array<{ property_id: string | null; status: string | null; end_date: string | null }>) {
      if (!r.property_id) continue;
      const row = map.get(r.property_id);
      if (!row) continue;
      if (r.status === "klar" || r.status === "avbruten") continue;
      row.count += 1;
      if (r.end_date) {
        if (!row.soonestDeadline || r.end_date < row.soonestDeadline) row.soonestDeadline = r.end_date;
        if (r.end_date < today) row.hasOverdue = true;
      }
    }
  }

  const arr = Array.from(map.values());
  arr.sort((a, b) => {
    if (a.hasOverdue !== b.hasOverdue) return a.hasOverdue ? -1 : 1;
    const aw = a.worstPriority ? PRIO_WEIGHT[a.worstPriority] : 0;
    const bw = b.worstPriority ? PRIO_WEIGHT[b.worstPriority] : 0;
    if (aw !== bw) return bw - aw;
    if (a.soonestDeadline && b.soonestDeadline) return a.soonestDeadline.localeCompare(b.soonestDeadline);
    if (a.soonestDeadline) return -1;
    if (b.soonestDeadline) return 1;
    return b.count - a.count;
  });
  return arr;
}

export function PropertyTopicGrid({ topic, title }: { topic: Topic; title: string }) {
  const isMobile = useIsMobile();
  const [q, setQ] = useState("");
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["topic-grid", topic],
    queryFn: () => loadTopic(topic),
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(s) || (r.address ?? "").toLowerCase().includes(s));
  }, [rows, q]);

  const tcfg = TOPIC_LABEL[topic];

  return (
    <div style={{ padding: isMobile ? 16 : 32, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>{title}</h1>
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

      {isLoading ? (
        <div style={{ color: "#6B7280" }}>Laddar…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 48, textAlign: "center", color: "#6B7280" }}>Inga fastigheter</div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))",
          }}
        >
          {filtered.map((r) => (
            <Link
              key={r.id}
              to={`/properties/${r.id}/${tcfg.subpath}` as never}
              style={{
                position: "relative",
                background: "#fff",
                border: "1px solid #E5E7EB",
                borderRadius: 12,
                padding: 16,
                textDecoration: "none",
                color: "inherit",
                display: "flex",
                flexDirection: "column",
                gap: 12,
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              <div
                style={{
                  height: 96,
                  borderRadius: 8,
                  background: "linear-gradient(135deg, #E8F2DC 0%, #DCE9CC 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#3D8A30",
                }}
              >
                <HugeiconsIcon icon={Building02Icon} size={40} />
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.name}
                  </div>
                  <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>{tcfg.subtext(r.count)}</div>
                  {r.soonestDeadline && (
                    <div style={{ fontSize: 12, color: r.hasOverdue ? "#DC2626" : "#6B7280", marginTop: 4 }}>
                      {r.hasOverdue ? "Försenat: " : "Nästa: "}{r.soonestDeadline}
                    </div>
                  )}
                </div>
                {r.worstPriority && (
                  <PriorityDot color={PRIO_COLOR[r.worstPriority]} pulse={r.hasOverdue} />
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function PriorityDot({ color, pulse }: { color: string; pulse: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        position: "relative",
        display: "inline-block",
        width: 12, height: 12, borderRadius: "50%", background: color, flexShrink: 0,
        marginTop: 4,
      }}
    >
      {pulse && (
        <span
          style={{
            position: "absolute", inset: -4, borderRadius: "50%",
            border: `2px solid ${color}`, animation: "bayt-sonar 1.4s ease-out infinite",
          }}
        />
      )}
    </span>
  );
}
