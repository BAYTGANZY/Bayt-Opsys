import { createFileRoute, Link, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Upload, Download } from "lucide-react";
import { FileDropzone } from "@/components/FileDropzone";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  APARTMENT_STATUSES,
  DUPLICATE_APARTMENT_MESSAGE,
  isDuplicateApartmentError,
  normalizeApartmentNumber,
  normalizeTrappa,
  TRAPPA_PLACEHOLDER,
} from "@/lib/apartment-tokens";
import { EditableSelect } from "@/components/EditableSelect";
import { DeleteButton } from "@/components/DeleteButton";
import {
  LogSelectCheckbox, LogSelectionBar, useLogSelection, type LogTable, type LogTarget,
} from "@/components/LogSelection";
import { ApartmentAuditTimeline } from "@/components/ApartmentAuditTimeline";
import { useRecordScopeGuard } from "@/hooks/useRecordScopeGuard";
import { useMyArendeScope } from "@/hooks/useMyContactId";
import { canEdit } from "@/lib/permissions";
import {
  PRIORITY_BADGE,
  ISSUE_CATEGORIES,
  deriveIssueStatus,
  deriveInspectionStatus,
  derivePriority,
} from "@/lib/issue-tokens";
import { DerivedStatusBadge } from "@/components/DerivedStatusBadge";
import { DerivedPriorityField } from "@/components/DerivedPriorityField";
import { sanitizeStorageName } from "@/lib/storage";
import { INSPECTION_TYPES, inspectionTypeLabel } from "@/lib/inspection-tokens";
import { objectTypeLabel, objectStatusMeta } from "@/lib/object-tokens";

export const Route = createFileRoute("/_authenticated/apartments/$id")({
  head: () => ({ meta: [{ title: "Lägenhet — BAYT" }] }),
  component: ApartmentDetailPage,
});

const C = {
  bg: "#FFFFFF", card: "#ffffff", border: "#E5E7EB",
  primary: "#3D8A30", accent: "#5CB84A", secondary: "#6B7280",
  text: "#1a1a1a", error: "#DC2626",
};

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
const th: React.CSSProperties = {
  textAlign: "left", padding: "12px 8px", fontSize: 12, fontWeight: 500,
  color: C.secondary, textTransform: "uppercase", letterSpacing: "0.08em",
  borderBottom: `1px solid ${C.border}`,
};
const td: React.CSSProperties = {
  padding: "14px 8px", color: C.text, borderBottom: `1px solid ${C.border}`, fontSize: 14,
};

const DOC_CATEGORIES = ["avtal", "protokoll", "ritningar", "forsakringar", "garantier", "offerter", "driftinstruktioner", "besiktningsprotokoll", "ovrigt"];

function Badge({ value, map }: { value: string | null; map: Record<string, { bg: string; color: string; border?: string }> }) {
  if (!value) return <span style={{ color: C.secondary }}>—</span>;
  const s = map[value] ?? { bg: "#FFFFFF", color: "#6B7280" };
  return (
    <span style={{
      background: s.bg, color: s.color, border: s.border ? `1px solid ${s.border}` : undefined,
      padding: "4px 10px", borderRadius: 4, fontSize: 12, fontWeight: 600,
      display: "inline-block", textTransform: "lowercase",
    }}>{value}</span>
  );
}

function formatSwedishDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" });
}
function formatBytes(n: number | null) {
  if (!n && n !== 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

const TABS = [
  { key: "tidslinje", label: "Tidslinje" },
  { key: "info", label: "Info" },
  { key: "felanmalningar", label: "Felanmälningar" },
  { key: "besiktningar", label: "Besiktningar" },
  { key: "dokument", label: "Dokument" },
  { key: "loggbok", label: "Loggbok" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

type Apartment = {
  id: string;
  property_id: string | null;
  apartment_number: string;
  trappa: string | null;
  floor: number | null;
  area_sqm: number | null;
  status: string | null;
  tenant_name: string | null;
  tenant_phone: string | null;
  tenant_email: string | null;
  move_in_date: string | null;
  move_out_date: string | null;
  notes: string | null;
};

export function ApartmentDetailPage({ idOverride }: { idOverride?: string } = {}) {
  const params = useParams({ strict: false }) as { id?: string; apartmentId?: string };
  const id = idOverride ?? (params.apartmentId ?? params.id!);
  // Embedded = rendered inside PropertyShell (property-scoped route), which
  // already provides its own back link + breadcrumb + building header.
  const embedded = !!idOverride;
  const isMobile = useIsMobile();
  const search = useRouterState({ select: (s) => s.location.search as { tab?: string; from?: string } });
  const tab: TabKey = (TABS.some((x) => x.key === search.tab) ? (search.tab as TabKey) : "tidslinje");
  // ?from= is set by pages that link here (e.g. an entreprenör hopping over from
  // a besiktning) so Tillbaka returns to where they came from, not the fastighet.
  // In-app paths only — anything else falls back to the default back link.
  const fromPath = typeof search.from === "string" && search.from.startsWith("/") ? search.from : null;



  const { data: apt, isLoading } = useQuery({
    queryKey: ["apartment", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("apartments")
        .select("*, properties(id, name)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Apartment & { properties: { id: string; name: string } | null };
    },
  });

  const propertyId = apt?.property_id ?? null;

  // Reachable by URL. Styrelse is scoped to the building; an entreprenör is
  // scoped tighter still — only apartments where they hold an ärende.
  useRecordScopeGuard({
    propertyId,
    apartmentId: id,
    loading: isLoading,
    redirectTo: "/apartments",
  });
  const propertyName = apt?.properties?.name ?? "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: "Inter, system-ui, sans-serif" }}>
      {!embedded && (
        fromPath ? (
          <Link to={fromPath as never} style={{
            display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13,
            color: C.secondary, textDecoration: "none", width: "fit-content",
          }}>
            <ArrowLeft size={16} /> Tillbaka
          </Link>
        ) : propertyId ? (
          <Link to="/properties/$id" params={{ id: propertyId }} style={{
            display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13,
            color: C.secondary, textDecoration: "none", width: "fit-content",
          }}>
            <ArrowLeft size={16} /> Tillbaka till {propertyName || "fastighet"}
          </Link>
        ) : (
          <Link to="/apartments" style={{
            display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13,
            color: C.secondary, textDecoration: "none", width: "fit-content",
          }}>
            <ArrowLeft size={16} /> Tillbaka till lägenheter
          </Link>
        )
      )}

      <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0 }}>
        {isLoading ? "Laddar…" : `${apt?.apartment_number ?? ""}${propertyName ? ` — ${propertyName}` : ""}`}
      </h1>




      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 8, padding: isMobile ? 16 : 24,
      }}>
        {tab === "tidslinje" && apt && <TimelineTab apartmentId={id} />}
        {tab === "info" && apt && <InfoTab apt={apt} isMobile={isMobile} />}
        {tab === "felanmalningar" && apt && <IssuesTab apartmentId={id} propertyId={propertyId} />}
        {tab === "besiktningar" && apt && <InspectionsTab apartmentId={id} propertyId={propertyId} />}
        {tab === "dokument" && apt && <DocumentsTab apartmentId={id} propertyId={propertyId} />}
        {tab === "loggbok" && apt && <LogbookTab apartmentId={id} propertyId={propertyId} />}
      </div>
    </div>
  );
}

// ============== TAB 1: TIMELINE ==============
type TimelineEvent = {
  key: string;
  kind: "issue" | "inspection" | "log";
  kindLabel: string;
  color: string;
  date: string | null;
  title: string;
  meta: string | null;
  linkId: string | null;
};

const KIND_COLOR = {
  issue: "#E07B35",
  inspection: "#3D8A30",
  log: "#9CA3AF",
} as const;

/** Which table a Tidslinje row actually lives in — a felanmälan/besiktning
 *  event is the ärende itself, not a log row, so removing it removes the
 *  ärende. LogSelectionBar says so in the confirm dialog before it runs. */
const KIND_TABLE: Record<TimelineEvent["kind"], LogTable> = {
  issue: "issues",
  inspection: "inspections",
  log: "logbook_entries",
};

/** Timeline keys are "<prefix>-<uuid>"; the row id is everything after the dash. */
function timelineTarget(e: TimelineEvent): LogTarget {
  return { table: KIND_TABLE[e.kind], id: e.key.slice(2) };
}

function TimelineTab({ apartmentId }: { apartmentId: string }) {
  const navigate = useNavigate();
  // An entreprenör's feed is their own ärenden only — one assignment must not
  // hand them the unit's whole felanmälningshistorik (see useMyArendeScope).
  const { filterContactId, ready } = useMyArendeScope();

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["timeline", "apartment", apartmentId, filterContactId],
    enabled: ready,
    queryFn: async () => {
      let issuesQ = supabase
        .from("issues")
        .select("id, title, status, priority, category, deadline, created_at")
        .eq("apartment_id", apartmentId);
      let inspectionsQ = supabase
        .from("inspections")
        .select("id, inspection_type, status, arende_status, inspector, last_completed_date, next_due_date, interval_months, created_at")
        .eq("apartment_id", apartmentId);
      if (filterContactId) {
        issuesQ = issuesQ.eq("assigned_contact_id", filterContactId);
        inspectionsQ = inspectionsQ.eq("assigned_contact_id", filterContactId);
      }

      const [issuesRes, inspectionsRes, logbookRes] = await Promise.all([
        issuesQ,
        inspectionsQ,
        supabase
          .from("logbook_entries")
          .select("id, content, entry_date, created_at")
          .eq("apartment_id", apartmentId),
      ]);

      const list: TimelineEvent[] = [];

      for (const r of (issuesRes.data ?? []) as any[]) {
        list.push({
          key: `i-${r.id}`,
          kind: "issue",
          kindLabel: "Felanmälan",
          color: KIND_COLOR.issue,
          date: r.created_at,
          title: r.title,
          meta: [r.category, `status: ${deriveIssueStatus(r).label}`, r.priority && `prioritet: ${r.priority}`]
            .filter(Boolean)
            .join(" · ") || null,
          linkId: r.id,
        });
      }
      for (const r of (inspectionsRes.data ?? []) as any[]) {
        list.push({
          key: `b-${r.id}`,
          kind: "inspection",
          kindLabel: "Besiktning",
          color: KIND_COLOR.inspection,
          date: r.last_completed_date ?? r.created_at,
          title: r.inspection_type ?? "Besiktning",
          meta: [r.inspector, `status: ${deriveInspectionStatus(r).label}`].filter(Boolean).join(" · ") || null,
          linkId: r.id,
        });
      }
      for (const r of (logbookRes.data ?? []) as any[]) {
        list.push({
          key: `l-${r.id}`,
          kind: "log",
          kindLabel: "Loggbok",
          color: KIND_COLOR.log,
          date: r.entry_date ?? r.created_at,
          title: r.content,
          meta: null,
          linkId: null,
        });
      }

      list.sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
      return list;
    },
  });

  const selection = useLogSelection(events.map(timelineTarget));

  if (isLoading) return <div style={{ color: C.secondary }}>Laddar…</div>;
  if (events.length === 0) {
    return (
      <div style={{ padding: "48px 16px", textAlign: "center", color: C.secondary, fontSize: 14 }}>
        Ingen aktivitet ännu. Felanmälningar, besiktningar och loggboksanteckningar för den här
        lägenheten visas här.
      </div>
    );
  }

  function open(e: TimelineEvent) {
    if (!e.linkId) return;
    if (e.kind === "issue") navigate({ to: "/issues/$id", params: { id: e.linkId } });
    if (e.kind === "inspection") navigate({ to: "/inspections/$id", params: { id: e.linkId } });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <LogSelectionBar
        selection={selection}
        invalidateKeys={[
          ["timeline", "apartment", apartmentId],
          ["logbook", "apartment", apartmentId],
          ["issues"], ["inspections"], ["oppna-arenden"],
          ["audit", "apartment", apartmentId],
        ]}
        style={{ marginBottom: 12 }}
      />

      {events.map((e, i) => {
        const isLast = i === events.length - 1;
        return (
          <div
            key={e.key}
            onClick={() => open(e)}
            style={{
              display: "flex",
              gap: 14,
              cursor: e.linkId ? "pointer" : "default",
              alignItems: "stretch",
            }}
          >
            <LogSelectCheckbox selection={selection} target={timelineTarget(e)} style={{ marginTop: 6 }} />

            {/* Rail */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 12, flexShrink: 0 }}>
              <span style={{
                width: 10, height: 10, borderRadius: "50%", background: e.color,
                marginTop: 6, flexShrink: 0,
              }} />
              {!isLast && <span style={{ flex: 1, width: 1, background: C.border, marginTop: 4 }} />}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? 0 : 20 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: e.color, letterSpacing: "0.04em" }}>
                  {e.kindLabel}
                </span>
                <span style={{ fontSize: 12, color: C.secondary }}>{formatSwedishDate(e.date)}</span>
              </div>
              <div style={{ fontSize: 14, color: C.text, fontWeight: 500, marginTop: 2, whiteSpace: "pre-wrap" }}>
                {e.title}
              </div>
              {e.meta && (
                <div style={{ fontSize: 12, color: C.secondary, marginTop: 2 }}>{e.meta}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============== TAB 2: INFO ==============
function InfoTab({ apt, isMobile }: { apt: Apartment; isMobile: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { profile } = useAuth();
  // Styrelse and entreprenör see everything about the unit but may not change
  // it. Until now this form had no role gate at all, so a read-only styrelse
  // could edit and even delete apartments.
  const readOnly = !canEdit(profile?.role);
  const [apartmentNumber, setApartmentNumber] = useState(apt.apartment_number ?? "");
  const [trappa, setTrappa] = useState(apt.trappa ?? "");
  const [floor, setFloor] = useState(apt.floor?.toString() ?? "");
  const [areaSqm, setAreaSqm] = useState(apt.area_sqm?.toString() ?? "");
  const [status, setStatus] = useState(apt.status ?? "Ledig");
  const [tenantName, setTenantName] = useState(apt.tenant_name ?? "");
  const [tenantPhone, setTenantPhone] = useState(apt.tenant_phone ?? "");
  const [tenantEmail, setTenantEmail] = useState(apt.tenant_email ?? "");
  const [moveInDate, setMoveInDate] = useState(apt.move_in_date ?? "");
  const [moveOutDate, setMoveOutDate] = useState(apt.move_out_date ?? "");
  const [notes, setNotes] = useState(apt.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setApartmentNumber(apt.apartment_number ?? "");
    setTrappa(apt.trappa ?? "");
    setFloor(apt.floor?.toString() ?? "");
    setAreaSqm(apt.area_sqm?.toString() ?? "");
    setStatus(apt.status ?? "Ledig");
    setTenantName(apt.tenant_name ?? "");
    setTenantPhone(apt.tenant_phone ?? "");
    setTenantEmail(apt.tenant_email ?? "");
    setMoveInDate(apt.move_in_date ?? "");
    setMoveOutDate(apt.move_out_date ?? "");
    setNotes(apt.notes ?? "");
  }, [apt]);

  const [renameGuard, setRenameGuard] = useState<{ objects: { id: string; name: string | null; type: string }[] } | null>(null);

  async function performSave(detachObjects: boolean) {
    if (detachObjects) {
      await supabase.from("property_objects").update({ apartment_id: null } as any).eq("apartment_id", apt.id);
    }
    const { error } = await supabase.from("apartments").update({
      apartment_number: normalizeApartmentNumber(apartmentNumber),
      trappa: normalizeTrappa(trappa),
      floor: floor ? parseInt(floor, 10) : null,
      area_sqm: areaSqm ? parseFloat(areaSqm) : null,
      status,
      tenant_name: tenantName.trim() || null,
      tenant_phone: tenantPhone.trim() || null,
      tenant_email: tenantEmail.trim() || null,
      move_in_date: moveInDate || null,
      move_out_date: moveOutDate || null,
      notes: notes.trim() || null,
    }).eq("id", apt.id);
    if (error) throw error;
  }

  const save = useMutation({
    mutationFn: async () => {
      const numberChanged = apartmentNumber.trim() !== (apt.apartment_number ?? "");
      if (numberChanged) {
        const { data: linked } = await supabase
          .from("property_objects")
          .select("id, name, type")
          .eq("apartment_id", apt.id);
        const list = (linked ?? []) as { id: string; name: string | null; type: string }[];
        if (list.length > 0) {
          setRenameGuard({ objects: list });
          return;
        }
      }
      await performSave(false);
    },
    onSuccess: () => {
      if (renameGuard) return;
      qc.invalidateQueries({ queryKey: ["apartment", apt.id] });
      qc.invalidateQueries({ queryKey: ["apartments"] });
      toast.success("Sparat!", { style: { background: "#3D8A30", color: "#fff" } });
      setError(null);
    },
    onError: (e: any) =>
      setError(isDuplicateApartmentError(e) ? DUPLICATE_APARTMENT_MESSAGE : e.message ?? "Kunde inte spara"),
  });

  async function resolveRename(keep: boolean) {
    try {
      await performSave(!keep);
      setRenameGuard(null);
      qc.invalidateQueries({ queryKey: ["apartment", apt.id] });
      qc.invalidateQueries({ queryKey: ["apartments"] });
      toast.success("Sparat!");
    } catch (e: any) {
      setError(isDuplicateApartmentError(e) ? DUPLICATE_APARTMENT_MESSAGE : e.message ?? "Kunde inte spara");
      setRenameGuard(null);
    }
  }

  return (
    <>
      <form
      onSubmit={(e) => {
        e.preventDefault();
        // Both parts of the apartment's identity are required — see normalizeTrappa.
        if (!apartmentNumber.trim() || !trappa.trim()) {
          setError("Lägenhetsnummer och trappa krävs");
          return;
        }
        save.mutate();
      }}
      style={{ display: "grid", gap: 16, maxWidth: 720 }}
    >
      {/* A <fieldset disabled> switches off every control inside it, including
          ones added later. Listing `disabled` on each input instead would go
          stale the first time someone adds a field and forgets. */}
      <fieldset
        disabled={readOnly}
        style={{ display: "grid", gap: 16, border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
      <div>
        <label style={labelStyle}>Lägenhetsnummer *</label>
        <input
          style={inputStyle}
          inputMode="numeric"
          pattern="[0-9]*"
          value={apartmentNumber}
          onChange={(e) => setApartmentNumber(normalizeApartmentNumber(e.target.value))}
          placeholder="1102"
          required
        />
      </div>
      <div>
        <label style={labelStyle}>Trappa *</label>
        <input
          style={inputStyle}
          value={trappa}
          onChange={(e) => setTrappa(normalizeTrappa(e.target.value))}
          placeholder={TRAPPA_PLACEHOLDER}
          required
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        <div><label style={labelStyle}>Våning</label><input type="number" style={inputStyle} value={floor} onChange={(e) => setFloor(e.target.value)} /></div>
        <div><label style={labelStyle}>Yta (m²)</label><input type="number" step="0.1" style={inputStyle} value={areaSqm} onChange={(e) => setAreaSqm(e.target.value)} /></div>
      </div>
      <div>
        <label style={labelStyle}>Status</label>
        <EditableSelect value={status} onChange={setStatus} options={APARTMENT_STATUSES} style={inputStyle} placeholder="Skriv eller välj status" />
      </div>
      <div><label style={labelStyle}>Hyresgäst</label><input style={inputStyle} value={tenantName} onChange={(e) => setTenantName(e.target.value)} /></div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        <div><label style={labelStyle}>Telefon</label><input style={inputStyle} value={tenantPhone} onChange={(e) => setTenantPhone(e.target.value)} /></div>
        <div><label style={labelStyle}>E-post</label><input type="email" style={inputStyle} value={tenantEmail} onChange={(e) => setTenantEmail(e.target.value)} /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        <div><label style={labelStyle}>Inflytt</label><input type="date" style={inputStyle} value={moveInDate} onChange={(e) => setMoveInDate(e.target.value)} /></div>
        <div><label style={labelStyle}>Utflytt</label><input type="date" style={inputStyle} value={moveOutDate} onChange={(e) => setMoveOutDate(e.target.value)} /></div>
      </div>
      <div><label style={labelStyle}>Anteckningar</label><textarea style={textareaStyle} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </fieldset>

      {error && <div style={{ color: C.error, fontSize: 14 }}>{error}</div>}
      {readOnly ? (
        <div style={{ fontSize: 13, color: C.secondary }}>
          Du har läsbehörighet till den här lägenheten.
        </div>
      ) : (
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button type="submit" disabled={save.isPending} style={{ ...primaryBtn, opacity: save.isPending ? 0.7 : 1 }}>
            {save.isPending ? "Sparar…" : "Spara ändringar"}
          </button>
          <DeleteButton
            table="apartments"
            id={apt.id}
            label={`lägenhet ${apartmentNumber || ""}`.trim()}
            variant="full"
            invalidateKeys={[["apartments"]]}
            onDeleted={() => navigate({ to: "/apartments" })}
          />
        </div>
      )}

      {renameGuard && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, maxWidth: 480, width: "100%" }}>
            <h3 style={{ marginTop: 0, fontSize: 18 }}>Kopplade objekt</h3>
            <p style={{ fontSize: 14, color: "#374151" }}>
              Är <strong>{renameGuard.objects.map((o) => o.name || objectTypeLabel(o.type)).join(", ")}</strong> fortfarande kopplade till lägenhet <strong>{apartmentNumber}</strong>?
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 20 }}>
              <button type="button" onClick={() => resolveRename(false)} style={{ ...primaryBtn, background: "#fff", color: "#374151", border: "1px solid #D1D5DB" }}>Nej, koppla bort</button>
              <button type="button" onClick={() => resolveRename(true)} style={primaryBtn}>Ja, behåll</button>
            </div>
          </div>
        </div>
      )}
      </form>

      {/* Kopplade objekt sits OUTSIDE the <form> too, same reasoning as
          Historik below — "Koppla bort" is a button of its own. */}
      <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${C.border}`, maxWidth: 720 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: "0 0 2px" }}>Kopplade objekt</h2>
        <div style={{ fontSize: 13, color: C.secondary, marginBottom: 16 }}>Hiss, förråd eller annat objekt kopplat till lägenheten</div>
        <LinkedObjects apartmentId={apt.id} propertyId={apt.property_id} readOnly={readOnly} />
      </div>

      {/* Historik sits OUTSIDE the <form> on purpose: its filter chips are
          buttons, and a stray button inside a form submits it. */}
      <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${C.border}`, maxWidth: 720 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: "0 0 2px" }}>Historik</h2>
        <div style={{ fontSize: 13, color: C.secondary, marginBottom: 16 }}>Vem gjorde vad och när</div>
        <ApartmentAuditTimeline apartmentId={apt.id} />
      </div>
    </>
  );
}

function LinkedObjects({ apartmentId, propertyId, readOnly }: { apartmentId: string; propertyId: string | null; readOnly: boolean }) {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["apartment-linked-objects", apartmentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("property_objects")
        .select("id, name, type, status")
        .eq("apartment_id", apartmentId)
        .order("name");
      return (data ?? []) as Array<{ id: string; name: string | null; type: string; status: string | null }>;
    },
  });

  const unlink = useMutation({
    mutationFn: async (objectId: string) => {
      const { error } = await supabase.from("property_objects").update({ apartment_id: null } as any).eq("id", objectId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Objektet kopplades bort", { style: { background: "#3D8A30", color: "#fff" } });
      qc.invalidateQueries({ queryKey: ["apartment-linked-objects", apartmentId] });
      qc.invalidateQueries({ queryKey: ["property-object"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Kunde inte koppla bort"),
  });

  const rows = q.data ?? [];
  if (q.isLoading) return <div style={{ color: C.secondary, fontSize: 13 }}>Laddar…</div>;
  if (rows.length === 0) return <div style={{ color: C.secondary, fontSize: 13 }}>Inga kopplade objekt</div>;

  return (
    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
      {rows.map((o) => {
        const meta = objectStatusMeta(o.status);
        return (
          <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: "1px solid #F3F4F6" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: meta.color, flexShrink: 0 }} />
            <Link
              to="/properties/$id/objects/$objectId"
              params={{ id: propertyId ?? "", objectId: o.id }}
              style={{ flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{o.name || objectTypeLabel(o.type)}</div>
              <div style={{ fontSize: 12, color: C.secondary }}>{objectTypeLabel(o.type)} · {meta.label}</div>
            </Link>
            {!readOnly && (
              <button
                type="button"
                onClick={() => unlink.mutate(o.id)}
                disabled={unlink.isPending}
                style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 12px", fontSize: 12, color: C.secondary, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                Koppla bort
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============== TAB 2: ISSUES ==============
function IssuesTab({ apartmentId, propertyId }: { apartmentId: string; propertyId: string | null }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  // Entreprenör: only felanmälningar assigned to them, whatever the status.
  const { filterContactId, ready } = useMyArendeScope();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [cause, setCause] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [deadline, setDeadline] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ["issues", "apartment", apartmentId, filterContactId],
    enabled: ready,
    queryFn: async () => {
      let q = supabase
        .from("issues")
        .select("id, title, status, priority, category, deadline, created_at")
        .eq("apartment_id", apartmentId)
        .order("created_at", { ascending: false });
      if (filterContactId) q = q.eq("assigned_contact_id", filterContactId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Prioritet väljs inte här heller — deadline sätter den.
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
      // The felanmälan is already created — report file failures, don't swallow them.
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
      qc.invalidateQueries({ queryKey: ["issues", "apartment", apartmentId] });
      navigate({ to: "/issues/$id", params: { id: issueId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara");
      setSaving(false);
    }
  }

  const priorityBadgeStyleMap = PRIORITY_BADGE;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={() => setShowForm((v) => !v)} style={primaryBtn}>
          <Plus size={18} /> Ny felanmälan
        </button>
      </div>
      {showForm && (
        <form onSubmit={onSubmit} style={{
          display: "grid", gap: 12, padding: 16,
          border: `1px solid ${C.border}`, borderRadius: 8, background: "#fafbfc",
        }}>
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
          <div>
            <label style={labelStyle}>Deadline</label>
            <input type="date" style={inputStyle} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
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
        </form>
      )}
      {isLoading ? <div style={{ color: C.secondary }}>Laddar…</div> : data.length === 0 ? (
        <div style={{ padding: "48px 16px", textAlign: "center", color: C.secondary, fontSize: 14 }}>Inga felanmälningar ännu</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={th}>Rubrik</th><th style={th}>Kategori</th><th style={th}>Status</th><th style={th}>Prioritet</th><th style={th}>Skapad</th>
            </tr></thead>
            <tbody>
              {data.map((r: any) => (
                <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => navigate({ to: "/issues/$id", params: { id: r.id } })}>
                  <td style={{ ...td, fontWeight: 600 }}>{r.title}</td>
                  <td style={td}>{r.category ?? "—"}</td>
                  <td style={td}>{(() => {
                    const d = deriveIssueStatus(r);
                    return <span title={d.reason} style={{ color: d.color, fontWeight: 600, whiteSpace: "nowrap" }}>{d.label}</span>;
                  })()}</td>
                  <td style={td}><Badge value={r.priority} map={priorityBadgeStyleMap} /></td>
                  <td style={{ ...td, color: C.secondary }}>{formatSwedishDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============== TAB 3: INSPECTIONS ==============
function InspectionsTab({ apartmentId, propertyId }: { apartmentId: string; propertyId: string | null }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  // Entreprenör: only besiktningar assigned to them, whatever the status.
  const { filterContactId, ready } = useMyArendeScope();
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState("sba");
  const [inspector, setInspector] = useState("");
  const [lastCompleted, setLastCompleted] = useState("");
  const [interval, setInterval] = useState("12");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ["inspections", "apartment", apartmentId, filterContactId],
    enabled: ready,
    queryFn: async () => {
      let q = supabase
        .from("inspections")
        .select("id, inspection_type, inspector, last_completed_date, next_due_date, status, arende_status, interval_months")
        .eq("apartment_id", apartmentId)
        .order("next_due_date", { ascending: true, nullsFirst: false });
      if (filterContactId) q = q.eq("assigned_contact_id", filterContactId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
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
      qc.invalidateQueries({ queryKey: ["inspections", "apartment", apartmentId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
        </form>
      )}
      {isLoading ? <div style={{ color: C.secondary }}>Laddar…</div> : data.length === 0 ? (
        <div style={{ padding: "48px 16px", textAlign: "center", color: C.secondary, fontSize: 14 }}>Inga besiktningar ännu</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={th}>Typ</th><th style={th}>Besiktningsman</th><th style={th}>Senast</th><th style={th}>Nästa</th><th style={th}>Status</th>
            </tr></thead>
            <tbody>
              {data.map((r: any) => (
                <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => navigate({ to: "/inspections/$id", params: { id: r.id } })}>
                  <td style={{ ...td, fontWeight: 600 }}>{inspectionTypeLabel(r.inspection_type)}</td>
                  <td style={td}>{r.inspector ?? "—"}</td>
                  <td style={td}>{formatSwedishDate(r.last_completed_date)}</td>
                  <td style={td}>{formatSwedishDate(r.next_due_date)}</td>
                  <td style={td}>
                    <DerivedStatusBadge status={deriveInspectionStatus(r)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============== TAB 4: DOCUMENTS ==============
function DocumentsTab({ apartmentId, propertyId }: { apartmentId: string; propertyId: string | null }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["documents", "apartment", apartmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, name, category, file_size, file_url, created_at")
        .eq("apartment_id", apartmentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!files.length || !user) { setError("Välj minst en fil"); return; }
    setUploading(true);
    try {
      for (const file of files) {
        const path = `${Date.now()}-${sanitizeStorageName(file.name)}`;
        const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("documents").getPublicUrl(path);
        const { error: insErr } = await supabase.from("documents").insert({
          apartment_id: apartmentId,
          property_id: propertyId,
          name: file.name,
          category: category || null,
          file_url: pub.publicUrl,
          file_type: file.type || null,
          file_size: file.size,
          uploaded_by: user.id,
        });
        if (insErr) throw insErr;
      }
      toast.success("Sparat!", { style: { background: "#3D8A30", color: "#fff" } });
      setFiles([]); setCategory("");
      qc.invalidateQueries({ queryKey: ["documents", "apartment", apartmentId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte ladda upp");
    } finally {
      setUploading(false);
    }
  }

  async function download(url: string, name: string) {
    const bucket = "documents";
    try {
      const marker = `/object/public/${bucket}/`;
      const idx = url.indexOf(marker);
      if (idx === -1) {
        console.warn("[download] url does not match bucket", { bucket, url });
        window.open(url, "_blank");
        return;
      }
      const path = url.substring(idx + marker.length);
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600, { download: true });
      if (error) {
        console.error("[download] signed URL error", { bucket, path, error });
        throw error;
      }
      const a = document.createElement("a");
      a.href = data.signedUrl; a.download = name; a.click();
    } catch (e) {
      console.error("[download] fallback to public url", { bucket, url, error: e });
      window.open(url, "_blank");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <form onSubmit={onUpload} style={{
        display: "grid", gap: 12, padding: 16,
        border: `1px solid ${C.border}`, borderRadius: 8, background: "#fafbfc",
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Kategori</label>
            <select style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">— Välj —</option>
              {DOC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 0 }}>
            <label style={labelStyle}>Filer</label>
            <FileDropzone
              files={files}
              onAdd={(picked) => setFiles((prev) => [...prev, ...picked])}
              onRemove={(i) => setFiles((prev) => prev.filter((_, k) => k !== i))}
            />
          </div>
        </div>
        {error && <div style={{ color: C.error, fontSize: 13 }}>{error}</div>}
        <button type="submit" disabled={uploading} style={{ ...primaryBtn, width: "fit-content", opacity: uploading ? 0.7 : 1 }}>
          <Upload size={18} /> {uploading ? "Laddar upp…" : "Ladda upp"}
        </button>
      </form>

      {isLoading ? <div style={{ color: C.secondary }}>Laddar…</div> : data.length === 0 ? (
        <div style={{ padding: "48px 16px", textAlign: "center", color: C.secondary, fontSize: 14 }}>Inga dokument ännu</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={th}>Namn</th><th style={th}>Kategori</th><th style={th}>Storlek</th><th style={th}></th>
            </tr></thead>
            <tbody>
              {data.map((r: any) => (
                <tr key={r.id}>
                  <td style={{ ...td, fontWeight: 600 }}>{r.name}</td>
                  <td style={td}>{r.category ?? "—"}</td>
                  <td style={td}>{formatBytes(r.file_size)}</td>
                  <td style={td}>
                    <button onClick={() => download(r.file_url, r.name)} style={{
                      background: "transparent", border: "none", color: C.primary,
                      cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4,
                    }}>
                      <Download size={18} /> Ladda ner
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============== TAB 5: LOGBOOK ==============
function LogbookTab({ apartmentId, propertyId }: { apartmentId: string; propertyId: string | null }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["logbook", "apartment", apartmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("logbook_entries")
        .select("id, content, entry_date, created_at, created_by, profiles:created_by(full_name)")
        .eq("apartment_id", apartmentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Inte inloggad");
      if (!content.trim()) throw new Error("Anteckning krävs");
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await supabase.from("logbook_entries").insert({
        apartment_id: apartmentId,
        property_id: propertyId,
        content: content.trim(),
        entry_date: today,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setContent(""); setError(null);
      qc.invalidateQueries({ queryKey: ["logbook", "apartment", apartmentId] });
      toast.success("Sparat!", { style: { background: "#3D8A30", color: "#fff" } });
    },
    onError: (e: any) => setError(e.message),
  });

  const selection = useLogSelection(
    (data as any[]).map((e) => ({ table: "logbook_entries" as const, id: e.id as string })),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <form
        onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
        style={{ display: "grid", gap: 12, padding: 16, border: `1px solid ${C.border}`, borderRadius: 8, background: "#fafbfc" }}
      >
        <div>
          <label style={labelStyle}>Anteckning *</label>
          <textarea style={textareaStyle} rows={3} value={content} onChange={(e) => setContent(e.target.value)} required />
        </div>
        {error && <div style={{ color: C.error, fontSize: 13 }}>{error}</div>}
        <button type="submit" disabled={mutation.isPending} style={{ ...primaryBtn, width: "fit-content", opacity: mutation.isPending ? 0.7 : 1 }}>
          {mutation.isPending ? "Sparar…" : "Lägg till anteckning"}
        </button>
      </form>

      {isLoading ? <div style={{ color: C.secondary }}>Laddar…</div> : data.length === 0 ? (
        <div style={{ padding: "48px 16px", textAlign: "center", color: C.secondary, fontSize: 14 }}>Inga anteckningar ännu</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <LogSelectionBar
            selection={selection}
            invalidateKeys={[
              ["logbook", "apartment", apartmentId],
              ["timeline", "apartment", apartmentId],
              ["property-timeline"],
              ["all-buildings-loggbok"],
            ]}
          />

          {data.map((e: any) => (
            <div key={e.id} style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: 16,
              display: "flex", alignItems: "flex-start", gap: 10,
            }}>
              <LogSelectCheckbox
                selection={selection}
                target={{ table: "logbook_entries", id: e.id }}
                style={{ marginTop: 3 }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, color: C.text, whiteSpace: "pre-wrap" }}>{e.content}</div>
                <div style={{ fontSize: 12, color: C.secondary, marginTop: 8 }}>
                  {e.profiles?.full_name ?? "—"} · {formatSwedishDate(e.entry_date ?? e.created_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
