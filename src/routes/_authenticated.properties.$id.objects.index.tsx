import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useIsMobile } from "@/hooks/use-mobile";
import { objectTypeLabel, objectStatusMeta } from "@/lib/object-tokens";
import { LogbookEntryCard } from "@/components/LogbookEntryCard";
import { LogSelectionBar, useLogSelection } from "@/components/LogSelection";

export const Route = createFileRoute("/_authenticated/properties/$id/objects/")({
  head: () => ({ meta: [{ title: "Objekt — BAYT" }] }),
  component: ObjectsIndex,
});

type Obj = {
  id: string; name: string; type: string; status: string | null; apartment_id: string | null;
};

const C = { card: "#fff", border: "#E5E7EB", text: "#1a1a1a", secondary: "#6B7280", primary: "#3D8A30", green: "#5CB84A" };
const PRIO_WEIGHT: Record<string, number> = { akut: 4, hog: 3, normal: 2, lag: 1 };

function ObjectsIndex() {
  const { id: propertyId } = Route.useParams();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [view, setView] = useState<"prio" | "logg">("prio");

  const objectsQ = useQuery({
    queryKey: ["property-objects", propertyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("property_objects")
        .select("id, name, type, status, apartment_id")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false });
      return (data ?? []) as Obj[];
    },
  });

  const issuesQ = useQuery({
    queryKey: ["property-objects-issues", propertyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("issues")
        .select("id, title, priority, status, deadline, property_object_id, created_at")
        .eq("property_id", propertyId)
        .in("status", ["pagande", "oppet", "vantar"]);
      return (data ?? []) as Array<{ id: string; title: string; priority: string; status: string; deadline: string | null; property_object_id: string | null; created_at: string }>;
    },
  });

  const logsQ = useQuery({
    queryKey: ["property-objects-logs", propertyId],
    enabled: view === "logg",
    queryFn: async () => {
      const { data } = await supabase
        .from("logbook_entries")
        .select("id, entry_date, created_at, content, event_type, property_id, apartment_id, property_object_id, profiles:created_by(full_name)")
        .eq("property_id", propertyId)
        .not("property_object_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as any[];
    },
  });

  const logSelection = useLogSelection(
    (logsQ.data ?? []).map((e) => ({ table: "logbook_entries" as const, id: e.id as string })),
  );

  const objectsWithMeta = useMemo(() => {
    const map = new Map<string, { issues: number; worst: string | null }>();
    for (const i of issuesQ.data ?? []) {
      if (!i.property_object_id) continue;
      const cur = map.get(i.property_object_id) ?? { issues: 0, worst: null };
      cur.issues += 1;
      const w = cur.worst ? PRIO_WEIGHT[cur.worst] : 0;
      const p = PRIO_WEIGHT[i.priority ?? "normal"] ?? 0;
      if (p > w) cur.worst = i.priority;
      map.set(i.property_object_id, cur);
    }
    const list = (objectsQ.data ?? []).map((o) => ({ ...o, ...(map.get(o.id) ?? { issues: 0, worst: null }) }));
    list.sort((a, b) => {
      const aw = a.worst ? PRIO_WEIGHT[a.worst] : 0;
      const bw = b.worst ? PRIO_WEIGHT[b.worst] : 0;
      if (aw !== bw) return bw - aw;
      return b.issues - a.issues;
    });
    return list;
  }, [objectsQ.data, issuesQ.data]);

  const openCount = (issuesQ.data ?? []).filter((i) => i.property_object_id).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: isMobile ? 0 : 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text, whiteSpace: "nowrap" }}>Objekt</h2>
          <div style={{ fontSize: 12, color: C.secondary, marginTop: 4, whiteSpace: "nowrap" }}>
            {openCount} öppna felanmälningar · {objectsWithMeta.length} objekt
          </div>
        </div>

        <div style={{ display: "inline-flex", border: `1px solid ${C.border}`, borderRadius: 999, padding: 4, background: "#fff", flexShrink: 0 }}>
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
      </div>

      {view === "prio" ? (
        objectsWithMeta.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: C.secondary, border: `1px solid ${C.border}`, borderRadius: 12 }}>Inga objekt ännu</div>
        ) : (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            {objectsWithMeta.map((o) => {
              const sm = objectStatusMeta(o.status);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => navigate({ to: "/properties/$id/objects/$objectId", params: { id: propertyId, objectId: o.id } })}
                  style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "14px 16px", border: "none", background: "transparent", borderBottom: `1px solid #F3F4F6`, cursor: "pointer", textAlign: "left" }}
                >
                  <span title={sm.label} style={{ width: 12, height: 12, borderRadius: "50%", background: sm.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{o.name}</div>
                    <div style={{ fontSize: 12, color: C.secondary, marginTop: 2 }}>{objectTypeLabel(o.type)} · {sm.label}</div>
                  </div>
                  <div style={{ fontSize: 12, color: o.issues > 0 ? "#DC2626" : C.secondary, fontWeight: 600 }}>
                    {o.issues > 0 ? `${o.issues} öppna` : "0"}
                  </div>
                </button>
              );
            })}
          </div>
        )
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(logsQ.data ?? []).length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: C.secondary, border: `1px solid ${C.border}`, borderRadius: 12 }}>Ingen aktivitet ännu</div>
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
              {(logsQ.data ?? []).map((e) => (
                <LogbookEntryCard key={e.id} entry={e} selection={logSelection} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
