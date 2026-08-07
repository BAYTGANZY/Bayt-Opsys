import { deriveInspectionStatus, ISSUE_CATEGORIES, derivePriority } from "@/lib/issue-tokens";
import { DerivedStatusBadge } from "@/components/DerivedStatusBadge";
import { DerivedPriorityField } from "@/components/DerivedPriorityField";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { objectTypeLabel, OBJECT_STATUSES, objectStatusMeta } from "@/lib/object-tokens";
import { PRIORITY_BADGE, isOverdue } from "@/lib/issue-tokens";
import { INSPECTION_TYPES } from "@/lib/inspection-tokens";
import { FileDropzone } from "@/components/FileDropzone";
import { sanitizeStorageName } from "@/lib/storage";
import { LogbookEntryCard } from "@/components/LogbookEntryCard";
import { LogSelectionBar, useLogSelection } from "@/components/LogSelection";
import { useAuth } from "@/lib/auth";
import { useMyContactId } from "@/hooks/useMyContactId";

export const Route = createFileRoute("/_authenticated/properties/$id/objects/$objectId")({
  head: () => ({ meta: [{ title: "Objekt — BAYT" }] }),
  component: ObjectDetail,
});

const C = { border: "#E5E7EB", text: "#1a1a1a", secondary: "#6B7280", primary: "#3D8A30", card: "#fff", error: "#DC2626" };

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 500, color: C.secondary,
  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: "100%", height: 40, padding: "0 12px",
  border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 14,
  color: C.text, background: C.card, outline: "none", boxSizing: "border-box",
};
const textareaStyle: React.CSSProperties = {
  ...inputStyle, height: "auto", minHeight: 90, padding: 12,
  resize: "vertical", fontFamily: "inherit",
};
const primaryBtn: React.CSSProperties = {
  height: 44, background: C.primary, color: "#fff", borderRadius: 6,
  border: "none", fontSize: 15, fontWeight: 600, cursor: "pointer",
  padding: "0 20px", display: "inline-flex", alignItems: "center", gap: 8,
  textDecoration: "none", whiteSpace: "nowrap",
};

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
        <IssuesSection propertyId={propertyId} objectId={objectId} apartmentId={obj.data?.apartment_id ?? null} />
      </div>
      <div>
        <SectionTitle>Besiktningar</SectionTitle>
        <InspectionsSection propertyId={propertyId} objectId={objectId} apartmentId={obj.data?.apartment_id ?? null} />
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

function IssuesSection({ propertyId, objectId, apartmentId }: { propertyId: string; objectId: string; apartmentId: string | null }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [cause, setCause] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [deadline, setDeadline] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Bara mina ärenden: issues has no RLS narrowing, so an entreprenör only
  // reaching this object via has_object_assignment() would otherwise still
  // see every other entreprenör's felanmälningar raised against it.
  const { contactId, isEntreprenor } = useMyContactId();

  const q = useQuery({
    queryKey: ["object-issues", objectId, isEntreprenor ? contactId : null],
    enabled: !isEntreprenor || contactId !== undefined,
    queryFn: async () => {
      let query = supabase
        .from("issues")
        .select("id, title, status, priority, deadline, created_at")
        .eq("property_object_id", objectId)
        .order("created_at", { ascending: false });
      if (isEntreprenor) query = query.eq("assigned_contact_id", contactId ?? "__none__");
      const { data } = await query;
      return (data ?? []) as Array<{ id: string; title: string; status: string; priority: string; deadline: string | null; created_at: string }>;
    },
  });

  // Prioritet väljs inte här heller — deadline sätter den, samma regel som apartment-formuläret.
  const derivedPriority = derivePriority(deadline || null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !user) { setError("Rubrik krävs"); return; }
    setSaving(true);
    try {
      const combined = [
        cause.trim() ? `Orsak: ${cause.trim()}` : "",
        description.trim(),
      ].filter(Boolean).join("\n\n") || null;
      const { data: inserted, error: insErr } = await supabase.from("issues").insert({
        property_object_id: objectId,
        apartment_id: apartmentId,
        property_id: propertyId,
        title: title.trim(),
        description: combined,
        category: category || null,
        priority: derivedPriority.key,
        deadline: deadline || null,
        status: "ny",
        created_by: user.id,
      }).select("id").single();
      if (insErr) throw insErr;
      const issueId = inserted!.id as string;
      const fileFailures: string[] = [];
      for (const file of files) {
        const path = `issues/${issueId}/${Date.now()}-${sanitizeStorageName(file.name)}`;
        const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
        if (upErr) { fileFailures.push(`${file.name}: ${upErr.message}`); continue; }
        const { data: pub } = supabase.storage.from("documents").getPublicUrl(path);
        const { error: imgErr } = await supabase.from("issue_images").insert({ issue_id: issueId, url: pub.publicUrl, uploaded_by: user.id });
        if (imgErr) fileFailures.push(`${file.name}: ${imgErr.message}`);
      }
      if (fileFailures.length) {
        toast.error(`Felanmälan skapades, men ${fileFailures.length === 1 ? "en fil" : `${fileFailures.length} filer`} kunde inte laddas upp: ${fileFailures.join("; ")}`);
      } else {
        toast.success("Sparat!", { style: { background: "#3D8A30", color: "#fff" } });
      }
      qc.invalidateQueries({ queryKey: ["object-issues", objectId] });
      navigate({ to: "/properties/$id/issues/$issueId", params: { id: propertyId, issueId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara");
      setSaving(false);
    }
  }

  const rows = q.data ?? [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={() => setShowForm((v) => !v)} style={primaryBtn}><Plus size={18} /> Ny felanmälan</button>
      </div>
      {showForm && (
        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, padding: 16, border: `1px solid ${C.border}`, borderRadius: 8, background: "#fafbfc" }}>
          <div><label style={labelStyle}>Rubrik *</label><input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
          <div><label style={labelStyle}>Orsak / fri text</label><input style={inputStyle} value={cause} onChange={(e) => setCause(e.target.value)} placeholder="Kort orsak…" /></div>
          <div><label style={labelStyle}>Beskrivning / fritext</label><textarea style={textareaStyle} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div>
            <label style={labelStyle}>Kategori</label>
            <select style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">— Välj kategori —</option>
              {ISSUE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><label style={labelStyle}>Deadline</label><input type="date" style={inputStyle} value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>
          <DerivedPriorityField priority={derivedPriority} labelStyle={labelStyle} reasonColor={C.secondary} />
          <div style={{ minWidth: 0 }}>
            <label style={labelStyle}>Bilder/filer</label>
            <FileDropzone
              files={files}
              onAdd={(picked) => setFiles((prev) => [...prev, ...picked])}
              onRemove={(i) => setFiles((prev) => prev.filter((_, k) => k !== i))}
            />
          </div>
          {error && <div style={{ color: C.error, fontSize: 13 }}>{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}>{saving ? "Sparar…" : "Spara felanmälan"}</button>
            <button type="button" onClick={() => setShowForm(false)} style={{ ...primaryBtn, background: "#ebebeb", color: C.text }}>Avbryt</button>
          </div>
          <div style={{ fontSize: 12, color: C.secondary }}>Ansvarig entreprenör väljs på felanmälans egen sida efter att den skapats.</div>
        </form>
      )}
      {q.isLoading ? <div style={{ color: C.secondary }}>Laddar…</div> : rows.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: C.secondary, border: `1px solid ${C.border}`, borderRadius: 12 }}>Inga felanmälningar</div>
      ) : (
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
      )}
    </div>
  );
}

function InspectionsSection({ propertyId, objectId, apartmentId }: { propertyId: string; objectId: string; apartmentId: string | null }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState("sba");
  const [inspector, setInspector] = useState("");
  const [lastCompleted, setLastCompleted] = useState("");
  const [interval, setInterval] = useState("12");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { contactId, isEntreprenor } = useMyContactId();

  const q = useQuery({
    queryKey: ["object-inspections", objectId, isEntreprenor ? contactId : null],
    enabled: !isEntreprenor || contactId !== undefined,
    queryFn: async () => {
      let query = supabase
        .from("inspections")
        .select("id, inspection_type, status, arende_status, next_due_date, last_completed_date, interval_months")
        .eq("property_object_id", objectId)
        .order("next_due_date", { ascending: true });
      if (isEntreprenor) query = query.eq("assigned_contact_id", contactId ?? "__none__");
      const { data } = await query;
      return (data ?? []) as Array<{ id: string; inspection_type: string | null; status: string | null; next_due_date: string | null }>;
    },
  });

  function computeNextDue(): string | null {
    if (!lastCompleted) return null;
    const months = parseInt(interval || "0", 10);
    if (!months) return null;
    const d = new Date(lastCompleted);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 10);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!user) return;
    setSaving(true);
    try {
      const nextDue = computeNextDue();
      const { error: insErr } = await supabase.from("inspections").insert({
        property_object_id: objectId,
        apartment_id: apartmentId,
        property_id: propertyId,
        inspection_type: type,
        inspector: inspector.trim() || null,
        last_completed_date: lastCompleted || null,
        next_due_date: nextDue,
        interval_months: interval ? parseInt(interval, 10) : null,
        notes: notes.trim() || null,
        created_by: user.id,
      });
      if (insErr) throw insErr;
      toast.success("Sparat!", { style: { background: "#3D8A30", color: "#fff" } });
      setShowForm(false);
      setType("sba"); setInspector(""); setLastCompleted(""); setInterval("12"); setNotes("");
      qc.invalidateQueries({ queryKey: ["object-inspections", objectId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara");
    } finally {
      setSaving(false);
    }
  }

  const rows = q.data ?? [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={() => setShowForm((v) => !v)} style={primaryBtn}><Plus size={18} /> Ny besiktning</button>
      </div>
      {showForm && (
        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, padding: 16, border: `1px solid ${C.border}`, borderRadius: 8, background: "#fafbfc" }}>
          <div>
            <label style={labelStyle}>Typ</label>
            <select style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>
              {INSPECTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div><label style={labelStyle}>Besiktningsman</label><input style={inputStyle} value={inspector} onChange={(e) => setInspector(e.target.value)} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={labelStyle}>Senast genomförd</label><input type="date" style={inputStyle} value={lastCompleted} onChange={(e) => setLastCompleted(e.target.value)} /></div>
            <div><label style={labelStyle}>Intervall (månader)</label><input type="number" style={inputStyle} value={interval} onChange={(e) => setInterval(e.target.value)} /></div>
          </div>
          <div><label style={labelStyle}>Anteckningar</label><textarea style={textareaStyle} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          {error && <div style={{ color: C.error, fontSize: 13 }}>{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}>{saving ? "Sparar…" : "Spara besiktning"}</button>
            <button type="button" onClick={() => setShowForm(false)} style={{ ...primaryBtn, background: "#ebebeb", color: C.text }}>Avbryt</button>
          </div>
          <div style={{ fontSize: 12, color: C.secondary }}>Ansvarig entreprenör väljs på besiktningens egen sida efter att den skapats.</div>
        </form>
      )}
      {q.isLoading ? <div style={{ color: C.secondary }}>Laddar…</div> : rows.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: C.secondary, border: `1px solid ${C.border}`, borderRadius: 12 }}>Inga besiktningar</div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          {rows.map((r) => (
            <Link key={r.id} to="/properties/$id/inspections/$inspectionId" params={{ id: propertyId, inspectionId: r.id }} style={{ display: "block", padding: "12px 14px", borderBottom: "1px solid #F3F4F6", fontSize: 14, color: C.text, textDecoration: "none" }}>
              <b>{r.inspection_type ?? "Besiktning"}</b> — <DerivedStatusBadge status={deriveInspectionStatus(r)} /> {r.next_due_date ? `· nästa ${r.next_due_date}` : ""}
            </Link>
          ))}
        </div>
      )}
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
