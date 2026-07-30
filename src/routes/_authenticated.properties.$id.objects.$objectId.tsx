import { deriveInspectionStatus } from "@/lib/issue-tokens";
import { DerivedStatusBadge } from "@/components/DerivedStatusBadge";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { objectTypeLabel, OBJECT_STATUSES, objectStatusMeta } from "@/lib/object-tokens";
import { PRIORITY_BADGE, isOverdue } from "@/lib/issue-tokens";
import { LogbookEntryCard } from "@/components/LogbookEntryCard";
import { LogSelectionBar, useLogSelection } from "@/components/LogSelection";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/properties/$id/objects/$objectId")({
  head: () => ({ meta: [{ title: "Objekt — BAYT" }] }),
  component: ObjectDetail,
});

const C = { border: "#E5E7EB", text: "#1a1a1a", secondary: "#6B7280", primary: "#3D8A30", card: "#fff" };

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ margin: "8px 0 12px", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: C.secondary, fontWeight: 700 }}>
      {children}
    </h3>
  );
}

function ObjectDetail() {
  const { id: propertyId, objectId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();

  const obj = useQuery({
    queryKey: ["property-object", objectId],
    queryFn: async () => {
      const { data } = await supabase.from("property_objects").select("*").eq("id", objectId).maybeSingle();
      return data as any;
    },
  });

  const [status, setStatus] = useState<string>("ok");
  useEffect(() => { if (obj.data?.status) setStatus(obj.data.status); }, [obj.data?.status]);

  const updateStatus = useMutation({
    mutationFn: async (next: string) => {
      const prev = obj.data?.status ?? null;
      if (prev === next) return;
      const { error } = await supabase.from("property_objects").update({ status: next } as any).eq("id", objectId);
      if (error) throw error;
      try {
        const { logEvent } = await import("@/lib/logbook");
        await logEvent({
          event_type: "objekt_status_andring",
          property_id: propertyId,
          property_object_id: objectId,
          description: `${obj.data?.name ?? "Objekt"}: ${objectStatusMeta(prev).label} → ${objectStatusMeta(next).label}`,
          created_by: user?.id ?? null,
        });
      } catch {}
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["property-object", objectId] }),
  });

  const meta = objectStatusMeta(status);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Link to="/properties/$id/objects" params={{ id: propertyId }} style={{ fontSize: 13, color: C.secondary, textDecoration: "none" }}>← Tillbaka till objekt</Link>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: C.secondary }}>
            {obj.data ? objectTypeLabel(obj.data.type) : ""}
          </div>
          <h2 style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 700, color: C.text, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: meta.color, display: "inline-block" }} />
            {obj.data?.name ?? "…"}
          </h2>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.secondary }}>
          Status
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); updateStatus.mutate(e.target.value); }}
            style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, color: C.text, background: "#fff" }}
          >
            {OBJECT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
      </div>

      <div>
        <SectionTitle>Info</SectionTitle>
        <InfoSection obj={obj.data} />
      </div>
      <div>
        <SectionTitle>Felanmälningar</SectionTitle>
        <IssuesSection propertyId={propertyId} objectId={objectId} />
      </div>
      <div>
        <SectionTitle>Besiktningar</SectionTitle>
        <InspectionsSection objectId={objectId} />
      </div>
      <div>
        <SectionTitle>Loggbok</SectionTitle>
        <LogbookSection objectId={objectId} />
      </div>
    </div>
  );
}

function InfoSection({ obj }: { obj: any }) {
  if (!obj) return <div style={{ color: C.secondary }}>Laddar…</div>;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, display: "grid", gap: 10, fontSize: 14 }}>
      <div><b>Typ:</b> {objectTypeLabel(obj.type)}</div>
      <div><b>Status:</b> {objectStatusMeta(obj.status).label}</div>
      <div><b>Lägenhet:</b> {obj.apartment_id ?? "—"}</div>
      {obj.description && <div><b>Beskrivning:</b> {obj.description}</div>}
    </div>
  );
}

function IssuesSection({ propertyId, objectId }: { propertyId: string; objectId: string }) {
  const q = useQuery({
    queryKey: ["object-issues", objectId],
    queryFn: async () => {
      const { data } = await supabase
        .from("issues")
        .select("id, title, status, priority, deadline, created_at")
        .eq("property_object_id", objectId)
        .order("created_at", { ascending: false });
      return (data ?? []) as Array<{ id: string; title: string; status: string; priority: string; deadline: string | null; created_at: string }>;
    },
  });
  if (q.isLoading) return <div style={{ color: C.secondary }}>Laddar…</div>;
  const rows = q.data ?? [];
  if (rows.length === 0) return <div style={{ padding: 24, textAlign: "center", color: C.secondary, border: `1px solid ${C.border}`, borderRadius: 12 }}>Inga felanmälningar</div>;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
      {rows.map((r) => {
        const overdue = isOverdue(r.deadline, r.status);
        const prio = PRIORITY_BADGE[r.priority] ?? PRIORITY_BADGE.normal;
        return (
          <Link key={r.id} to="/properties/$id/issues/$issueId" params={{ id: propertyId, issueId: r.id }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: "1px solid #F3F4F6", textDecoration: "none", color: "inherit" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: prio.color, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{r.title}</div>
              <div style={{ fontSize: 12, color: overdue ? "#DC2626" : C.secondary }}>{r.deadline ? `Deadline ${r.deadline}` : r.status}</div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function InspectionsSection({ objectId }: { objectId: string }) {
  const q = useQuery({
    queryKey: ["object-inspections", objectId],
    queryFn: async () => {
      const { data } = await supabase
        .from("inspections")
        .select("id, inspection_type, status, arende_status, next_due_date, last_completed_date, interval_months")
        .eq("property_object_id", objectId)
        .order("next_due_date", { ascending: true });
      return (data ?? []) as Array<{ id: string; inspection_type: string | null; status: string | null; next_due_date: string | null }>;
    },
  });
  const rows = q.data ?? [];
  if (q.isLoading) return <div style={{ color: C.secondary }}>Laddar…</div>;
  if (rows.length === 0) return <div style={{ padding: 24, textAlign: "center", color: C.secondary, border: `1px solid ${C.border}`, borderRadius: 12 }}>Inga besiktningar</div>;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
      {rows.map((r) => (
        <div key={r.id} style={{ padding: "12px 14px", borderBottom: "1px solid #F3F4F6", fontSize: 14, color: C.text }}>
          <b>{r.inspection_type ?? "Besiktning"}</b> — <DerivedStatusBadge status={deriveInspectionStatus(r)} /> {r.next_due_date ? `· nästa ${r.next_due_date}` : ""}
        </div>
      ))}
    </div>
  );
}

function LogbookSection({ objectId }: { objectId: string }) {
  const q = useQuery({
    queryKey: ["object-logbook", objectId],
    queryFn: async () => {
      const { data } = await supabase
        .from("logbook_entries")
        .select("id, entry_date, created_at, content, event_type, property_id, apartment_id, property_object_id, profiles:created_by(full_name)")
        .eq("property_object_id", objectId)
        .order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });
  const rows = q.data ?? [];
  const selection = useLogSelection(
    rows.map((e) => ({ table: "logbook_entries" as const, id: e.id as string })),
  );

  if (q.isLoading) return <div style={{ color: C.secondary }}>Laddar…</div>;
  if (rows.length === 0) return <div style={{ padding: 24, textAlign: "center", color: C.secondary, border: `1px solid ${C.border}`, borderRadius: 12 }}>Ingen aktivitet</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <LogSelectionBar
        selection={selection}
        invalidateKeys={[
          ["object-logbook", objectId],
          ["property-objects-logs"],
          ["property-timeline"],
          ["all-buildings-loggbok"],
        ]}
      />
      {rows.map((e) => <LogbookEntryCard key={e.id} entry={e} selection={selection} />)}
    </div>
  );
}
