import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, createContext, useContext } from "react";
import { Plus, Upload, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMyContactId } from "@/hooks/useMyContactId";
import { SectionHeaderRow, sortByMode, NEXT_SORT_MODE, type SortMode } from "@/components/SortFilterControls";
import {
  APARTMENT_STATUSES,
  DUPLICATE_APARTMENT_MESSAGE,
  isDuplicateApartmentError,
  normalizeApartmentNumber,
  normalizeTrappa,
  TRAPPA_PLACEHOLDER,
} from "@/lib/apartment-tokens";
import { EditableSelect } from "@/components/EditableSelect";
import { canEdit } from "@/lib/permissions";
import { useMyAssignedApartmentIds } from "@/hooks/useMyAssignedApartmentIds";
import {
  deriveIssueStatus,
  deriveInspectionStatus,
  deriveProjectStatus,
  deriveActionStatus,
  LIFECYCLE_OF,
  type ArendeForStatus,
} from "@/lib/issue-tokens";
import { DerivedStatusBadge } from "@/components/DerivedStatusBadge";

// ---- shared design tokens (kept identical to original property page) ----
export const COLORS = {
  bg: "#FFFFFF",
  card: "#ffffff",
  border: "#E5E7EB",
  primary: "#3D8A30",
  accent: "#5CB84A",
  secondary: "#6B7280",
  text: "#1a1a1a",
  error: "#DC2626",
};

export const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 500,
  color: COLORS.secondary,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 6,
};

export const inputStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  height: 40,
  padding: "0 12px",
  border: `1px solid ${COLORS.border}`,
  borderRadius: 6,
  fontSize: 14,
  color: COLORS.text,
  outline: "none",
  background: COLORS.card,
  boxSizing: "border-box",
};

export const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  height: "auto",
  minHeight: 80,
  padding: 12,
  resize: "vertical",
  fontFamily: "Inter, system-ui, sans-serif",
};

export const primaryBtn: React.CSSProperties = {
  height: 44,
  background: COLORS.primary,
  color: "#ffffff",
  borderRadius: 6,
  border: "none",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
  padding: "0 20px",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 8px",
  fontSize: 12,
  fontWeight: 500,
  color: COLORS.secondary,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  borderBottom: `1px solid ${COLORS.border}`,
};

const td: React.CSSProperties = {
  padding: "14px 8px",
  color: COLORS.text,
  borderBottom: `1px solid ${COLORS.border}`,
  fontSize: 14,
};

const priorityBadge: Record<string, React.CSSProperties> = {
  lag: { background: "#FFFFFF", color: "#6B7280" },
  normal: { background: "#e8f0d8", color: "#2E6B24" },
  hog: { background: "#fff3cd", color: "#856404" },
  akut: { background: "#fde8e8", color: "#DC2626" },
};
const apartmentStatusBadge: Record<string, React.CSSProperties> = {
  Uthyrd: { background: "#e8f0d8", color: "#2E6B24" },
  Ledig: { background: "#E8F5E4", color: "#3D8A30" },
  Renovering: { background: "#fff3cd", color: "#856404" },
  Reserverad: { background: "#ebebeb", color: "#555555" },
};

function Badge({ value, map }: { value: string | null; map: Record<string, React.CSSProperties> }) {
  if (!value) return <span style={{ color: COLORS.secondary }}>—</span>;
  const s = map[value] ?? { background: "#FFFFFF", color: "#6B7280" };
  return (
    <span style={{ ...s, padding: "4px 10px", borderRadius: 4, fontSize: 12, fontWeight: 600, display: "inline-block", textTransform: "lowercase" }}>
      {value}
    </span>
  );
}

function Empty({ label }: { label: string }) {
  return <div style={{ padding: "48px 16px", textAlign: "center", color: COLORS.secondary, fontSize: 14 }}>Inga {label} ännu</div>;
}

function formatBytes(n: number | null) {
  if (!n && n !== 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function formatSwedishDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function formatSEK(n: number | null) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(n);
}

// ============== Property Context ==============
type PropertyCtx = { property: any; propertyId: string };
const PropertyContext = createContext<PropertyCtx | null>(null);
export function PropertyProvider({ value, children }: { value: PropertyCtx; children: React.ReactNode }) {
  return <PropertyContext.Provider value={value}>{children}</PropertyContext.Provider>;
}
export function useProperty(): PropertyCtx {
  const ctx = useContext(PropertyContext);
  if (!ctx) throw new Error("useProperty must be used inside PropertyProvider");
  return ctx;
}

// ============== TAB: APARTMENTS ==============
export function ApartmentsTab({ propertyId }: { propertyId: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  const isMobile = useIsMobile();
  const { apartmentIds, isEntreprenor } = useMyAssignedApartmentIds();
  const mayEdit = canEdit(profile?.role);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<SortMode>("newest");
  const [form, setForm] = useState({
    apartment_number: "", trappa: "", floor: "", area_sqm: "", status: "Ledig",
    tenant_name: "", tenant_phone: "", tenant_email: "",
    move_in_date: "", move_out_date: "", notes: "",
  });

  const { data = [], isLoading } = useQuery({
    queryKey: ["apartments", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("apartments")
        .select("id, apartment_number, trappa, floor, area_sqm, status, tenant_name, tenant_phone, created_at, created_by")
        .eq("property_id", propertyId);
      if (error) throw error;
      return data ?? [];
    },
  });

  // An entreprenör may only see units they hold an ärende in — never the
  // building's full roster, which carries tenant names and phone numbers.
  const visible = useMemo(() => {
    if (!isEntreprenor) return data;
    if (!apartmentIds) return [];
    return (data as any[]).filter((a) => apartmentIds.has(a.id));
  }, [data, isEntreprenor, apartmentIds]);

  const sorted = useMemo(() => sortByMode(visible, mode, user?.id), [visible, mode, user?.id]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Inte inloggad");
      // Number + trappa together identify the unit — neither may be blank, or
      // /felanmalan can never connect a resident to this apartment.
      if (!form.apartment_number.trim() || !form.trappa.trim()) {
        throw new Error("Lägenhetsnummer och trappa krävs");
      }
      const { error } = await supabase.from("apartments").insert({
        property_id: propertyId,
        apartment_number: normalizeApartmentNumber(form.apartment_number),
        trappa: normalizeTrappa(form.trappa),
        floor: form.floor ? parseInt(form.floor, 10) : null,
        area_sqm: form.area_sqm ? parseFloat(form.area_sqm) : null,
        status: form.status,
        tenant_name: form.tenant_name.trim() || null,
        tenant_phone: form.tenant_phone.trim() || null,
        tenant_email: form.tenant_email.trim() || null,
        move_in_date: form.move_in_date || null,
        move_out_date: form.move_out_date || null,
        notes: form.notes.trim() || null,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setShowForm(false);
      setError("");
      setForm({ apartment_number: "", trappa: "", floor: "", area_sqm: "", status: "vakant", tenant_name: "", tenant_phone: "", tenant_email: "", move_in_date: "", move_out_date: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["apartments", propertyId] });
      toast.success("Sparat!", { style: { background: "#3D8A30", color: "#fff" } });
    },
    onError: (e: any) => setError(isDuplicateApartmentError(e) ? DUPLICATE_APARTMENT_MESSAGE : e.message),
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionHeaderRow
        title="Lägenheter"
        mode={mode}
        onCycle={() => setMode((m) => NEXT_SORT_MODE[m])}
        actionLabel="Ny lägenhet"
        onAction={() => setShowForm((v) => !v)}
      />
      {/* SectionHeaderRow already hides the "Ny lägenhet" button for non-admins,
          so showForm can't normally be set — but the create form must not exist
          for a read-only role even if some future path flips that flag. */}
      {mayEdit && showForm && (
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} style={{ display: "grid", gap: 16, maxWidth: 720 }}>
          <div>
            <label style={labelStyle}>Lägenhetsnummer *</label>
            <input style={inputStyle} inputMode="numeric" pattern="[0-9]*" placeholder="1102" value={form.apartment_number} onChange={(e) => setForm({ ...form, apartment_number: normalizeApartmentNumber(e.target.value) })} required />
          </div>
          <div>
            <label style={labelStyle}>Trappa *</label>
            <input style={inputStyle} placeholder={TRAPPA_PLACEHOLDER} value={form.trappa} onChange={(e) => setForm({ ...form, trappa: normalizeTrappa(e.target.value) })} required />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
            <div><label style={labelStyle}>Våning</label><input type="number" style={inputStyle} value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} /></div>
            <div><label style={labelStyle}>Yta (kvm)</label><input type="number" step="0.1" style={inputStyle} value={form.area_sqm} onChange={(e) => setForm({ ...form, area_sqm: e.target.value })} /></div>
          </div>
          <div>
            <label style={labelStyle}>Status</label>
            <EditableSelect value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={APARTMENT_STATUSES} style={inputStyle} placeholder="Skriv eller välj status" />
          </div>
          <div><label style={labelStyle}>Hyresgäst namn</label><input style={inputStyle} value={form.tenant_name} onChange={(e) => setForm({ ...form, tenant_name: e.target.value })} /></div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
            <div><label style={labelStyle}>Telefon</label><input style={inputStyle} value={form.tenant_phone} onChange={(e) => setForm({ ...form, tenant_phone: e.target.value })} /></div>
            <div><label style={labelStyle}>E-post</label><input type="email" style={inputStyle} value={form.tenant_email} onChange={(e) => setForm({ ...form, tenant_email: e.target.value })} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
            <div><label style={labelStyle}>Inflyttningsdatum</label><input type="date" style={inputStyle} value={form.move_in_date} onChange={(e) => setForm({ ...form, move_in_date: e.target.value })} /></div>
            <div><label style={labelStyle}>Utflyttningsdatum</label><input type="date" style={inputStyle} value={form.move_out_date} onChange={(e) => setForm({ ...form, move_out_date: e.target.value })} /></div>
          </div>
          <div><label style={labelStyle}>Anteckningar</label><textarea style={textareaStyle} rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          {error && <div style={{ color: COLORS.error, fontSize: 13 }}>{error}</div>}
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button type="submit" disabled={mutation.isPending} style={{ ...primaryBtn, opacity: mutation.isPending ? 0.7 : 1 }}>{mutation.isPending ? "Sparar…" : "Spara lägenhet"}</button>
            <button type="button" onClick={() => setShowForm(false)} style={{ ...primaryBtn, background: "#ebebeb", color: COLORS.text }}>Avbryt</button>
          </div>
        </form>
      )}
      {isLoading ? <div style={{ color: COLORS.secondary }}>Laddar…</div> : sorted.length === 0 ? <Empty label="lägenheter" /> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Lgh nr</th><th style={th}>Trappa</th><th style={th}>Våning</th><th style={th}>Yta</th><th style={th}>Status</th><th style={th}>Hyresgäst</th><th style={th}>Telefon</th></tr></thead>
            <tbody>
              {sorted.map((a: any) => (
                <tr key={a.id} style={{ cursor: "pointer" }} onClick={() => navigate({ to: "/properties/$id/apartments/$apartmentId", params: { id: propertyId, apartmentId: a.id }, search: { tab: "info" } })}>
                  <td style={{ ...td, fontWeight: 600 }}>{a.apartment_number}</td>
                  {/* Legacy rows predating the required-trappa rule can't be matched by
                      /felanmalan — flag them so they get filled in. */}
                  <td style={td}>
                    {a.trappa
                      ? <span style={{ fontWeight: 600 }}>{a.trappa}</span>
                      : <span style={{ color: COLORS.error, fontWeight: 600 }}>Saknas</span>}
                  </td>
                  <td style={td}>{a.floor ?? "—"}</td>
                  <td style={td}>{a.area_sqm ? `${a.area_sqm} kvm` : "—"}</td>
                  <td style={td}><Badge value={a.status} map={apartmentStatusBadge} /></td>
                  <td style={td}>{a.tenant_name ?? "—"}</td>
                  <td style={td}>{a.tenant_phone ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============== shared ärende queries + öppet/avslutat split ==============
// One query per ärendetabell, shared by the section tab (active rows) and the
// Avslutade page (closed rows, /properties/:id/avslutat). Both views filter the
// same fetched set with the predicates below, so an ärende always sits in
// exactly one of the two lists. Closedness comes off the derived status — the
// same rule every badge renders — never a hand-rolled column check.

export function usePropertyIssues(propertyId: string) {
  // Entreprenörer only ever see errands assigned to them.
  const { contactId, isEntreprenor } = useMyContactId();
  return useQuery({
    queryKey: ["issues", propertyId, isEntreprenor ? contactId : null],
    enabled: !isEntreprenor || contactId !== undefined,
    queryFn: async () => {
      let q = supabase.from("issues").select("id, title, status, priority, deadline, created_at, created_by").eq("property_id", propertyId);
      if (isEntreprenor) q = q.eq("assigned_contact_id", contactId ?? "__none__");
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePropertyInspections(propertyId: string) {
  const { contactId, isEntreprenor } = useMyContactId();
  return useQuery({
    queryKey: ["inspections", propertyId, isEntreprenor ? contactId : null],
    enabled: !isEntreprenor || contactId !== undefined,
    queryFn: async () => {
      let q = supabase.from("inspections").select("id, inspection_type, inspector, last_completed_date, next_due_date, interval_months, status, arende_status, created_at, created_by").eq("property_id", propertyId);
      if (isEntreprenor) q = q.eq("assigned_contact_id", contactId ?? "__none__");
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePropertyProjects(propertyId: string) {
  const { contactId, isEntreprenor } = useMyContactId();
  return useQuery({
    queryKey: ["projects", propertyId, isEntreprenor ? contactId : null],
    enabled: !isEntreprenor || contactId !== undefined,
    queryFn: async () => {
      let q = supabase.from("projects").select("id, title, status, arende_status, budget, start_date, end_date, created_at, created_by").eq("property_id", propertyId);
      if (isEntreprenor) q = q.eq("assigned_contact_id", contactId ?? "__none__");
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export const isClosedIssue = (r: any) => deriveIssueStatus(r as ArendeForStatus).key === "avslutat";
export const isClosedInspection = (r: any) => deriveInspectionStatus(r).key === "avslutat";
// Ett avbrutet projekt är lika färdigt som ett avslutat — båda räknas som stängda.
// Defined off projectBucket (the shared ärende-status switch's filter rule) so
// the tab's Avslutade läge and the /avslutat-sidan split projekt on the same line.
export const isClosedProject = (r: any) => projectBucket(r) === "avslutade";

// ============== ÄRENDE STATUS SWITCH (shared: issues / inspections / projects) ==============
// Alla / Öppna / Avslutade / Vilande — samma fyra lägen på alla tre ärendetyper,
// härledda ur den delade vilande→oppet→avslutat-livscykeln (LIFECYCLE_OF).
export type ArendeStatusFilter = "alla" | "oppna" | "avslutade" | "vilande";

function arendeFilters(topic: string): Array<{ key: ArendeStatusFilter; label: string; shortLabel: string }> {
  return [
    { key: "alla", label: "Alla", shortLabel: "Alla" },
    { key: "oppna", label: `Öppna ${topic}`, shortLabel: "Öppna" },
    { key: "avslutade", label: `Avslutade ${topic}`, shortLabel: "Avslutade" },
    { key: "vilande", label: `Vilande ${topic}`, shortLabel: "Vilande" },
  ];
}

function lifecycleBucket(lifecycle: "vilande" | "oppet" | "avslutat"): Exclude<ArendeStatusFilter, "alla"> {
  return lifecycle === "avslutat" ? "avslutade" : lifecycle === "oppet" ? "oppna" : "vilande";
}

function issueBucket(r: any): Exclude<ArendeStatusFilter, "alla"> {
  return lifecycleBucket(LIFECYCLE_OF[r.status ?? ""] ?? "vilande");
}

function inspectionBucket(r: any): Exclude<ArendeStatusFilter, "alla"> {
  // Legacy rows predate arende_status — mirrors deriveInspectionStatus's fallback.
  const lifecycle = r.arende_status ? (LIFECYCLE_OF[r.arende_status] ?? "vilande") : r.status === "klar" ? "avslutat" : "oppet";
  return lifecycleBucket(lifecycle);
}

/** Which tab a projekt sorts under. Avbrutet folds into Avslutade — an avbrutet
 *  projekt is just as done as an avslutat one (see isClosedProject). Pausat
 *  stays Öppna: pausad is a human pause on active work, not a return to vilande. */
function projectBucket(r: any): Exclude<ArendeStatusFilter, "alla"> {
  if (r.status === "avbruten") return "avslutade";
  const lifecycle = r.arende_status ? (LIFECYCLE_OF[r.arende_status] ?? "vilande") : r.status === "klar" ? "avslutat" : "oppet";
  if (lifecycle === "avslutat") return "avslutade";
  if (r.status === "pausad") return "oppna";
  return lifecycleBucket(lifecycle);
}

function ArendeStatusSwitch({ value, onChange, topic }: { value: ArendeStatusFilter; onChange: (v: ArendeStatusFilter) => void; topic: string }) {
  const isMobile = useIsMobile();
  const filters = arendeFilters(topic);
  const idx = filters.findIndex((f) => f.key === value);
  const pad = 3;
  return (
    <div
      role="tablist"
      aria-label={`Filtrera ${topic} på status`}
      style={{
        position: "relative",
        display: "inline-grid",
        gridTemplateColumns: `repeat(${filters.length}, 1fr)`,
        padding: pad,
        background: "#F0F7EE",
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        flexShrink: 0,
      }}
    >
      {/* One pill sliding under the labels — equal 1fr columns, so each step is
       *  exactly one pill-width and translateX(index·100%) lands on the tab. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: pad,
          bottom: pad,
          left: pad,
          width: `calc((100% - ${pad * 2}px) / ${filters.length})`,
          borderRadius: 9,
          background: "#0D2B1E",
          boxShadow: "0 1px 3px rgba(13, 43, 30, 0.35)",
          transform: `translateX(${idx * 100}%)`,
          transition: "transform 220ms cubic-bezier(0.33, 1, 0.68, 1)",
        }}
      />
      {filters.map((f) => {
        const active = f.key === value;
        return (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(f.key)}
            style={{
              position: "relative",
              zIndex: 1,
              height: isMobile ? 28 : 32,
              padding: isMobile ? "0 10px" : "0 14px",
              border: "none",
              background: "transparent",
              borderRadius: 9,
              cursor: "pointer",
              fontSize: isMobile ? 12 : 13,
              fontWeight: 600,
              fontFamily: "Outfit, Inter, system-ui, sans-serif",
              color: active ? "#fff" : "#3D8A30",
              transition: "color 180ms ease",
              whiteSpace: "nowrap",
            }}
          >
            {isMobile ? f.shortLabel : f.label}
          </button>
        );
      })}
    </div>
  );
}

// ============== TAB: ISSUES ==============
export function IssuesTab({ propertyId, initialFilter }: { propertyId: string; initialFilter?: ArendeStatusFilter }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<SortMode>("newest");
  const [filter, setFilter] = useState<ArendeStatusFilter>(initialFilter ?? "alla");
  const { data = [], isLoading } = usePropertyIssues(propertyId);

  const filtered = useMemo(() => (filter === "alla" ? (data as any[]) : (data as any[]).filter((r) => issueBucket(r) === filter)), [data, filter]);
  const sorted = useMemo(() => sortByMode(filtered, mode, user?.id), [filtered, mode, user?.id]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionHeaderRow
        title="Felanmälningar"
        mode={mode}
        onCycle={() => setMode((m) => NEXT_SORT_MODE[m])}
        actionLabel="Ny felanmälan"
        actionTo="/properties/$id/issues/new"
        actionToParams={{ id: propertyId }}
      />
      <div style={{ overflowX: "auto", display: "flex", justifyContent: "center" }}>
        <ArendeStatusSwitch value={filter} onChange={setFilter} topic="felanmälningar" />
      </div>
      {isLoading ? <div style={{ color: COLORS.secondary }}>Laddar…</div> : sorted.length === 0 ? <Empty label="felanmälningar" /> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Titel</th><th style={th}>Status</th><th style={th}>Prioritet</th><th style={th}>Skapad</th></tr></thead>
            <tbody>
              {sorted.map((r: any) => (
                <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => navigate({ to: "/properties/$id/issues/$issueId", params: { id: propertyId, issueId: r.id } })}>
                  <td style={{ ...td, fontWeight: 600 }}>{r.title}</td>
                  <td style={td}><DerivedStatusBadge status={deriveIssueStatus(r as ArendeForStatus)} /></td>
                  <td style={td}><Badge value={r.priority} map={priorityBadge} /></td>
                  <td style={{ ...td, color: COLORS.secondary }}>{formatSwedishDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============== TAB: ACTIONS ==============
export function ActionsTab({ propertyId }: { propertyId: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  // Ingen tilldelad-input: assigned_to är en uuid-FK mot profiles, så fritext
  // knäckte inserten. Riktig entreprenörsväljare kommer med Supabase-uppgiften.
  const [form, setForm] = useState({ title: "", description: "", due_date: "" });
  const [error, setError] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["actions", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("actions").select("id, title, status, due_date, assigned_to, profiles:assigned_to(full_name)").eq("property_id", propertyId).order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Inte inloggad");
      const { error } = await supabase.from("actions").insert({
        property_id: propertyId, title: form.title.trim(), description: form.description.trim() || null,
        due_date: form.due_date || null, created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setShowForm(false); setForm({ title: "", description: "", due_date: "" }); setError("");
      qc.invalidateQueries({ queryKey: ["actions", propertyId] });
    },
    onError: (e: any) => setError(e.message),
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={() => setShowForm((v) => !v)} style={primaryBtn}><Plus size={18} /> Ny åtgärd</button>
      </div>
      {showForm && (
        <form onSubmit={(e) => { e.preventDefault(); if (!form.title.trim()) { setError("Titel krävs"); return; } mutation.mutate(); }} style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, border: `1px solid ${COLORS.border}`, borderRadius: 6 }}>
          <div><label style={labelStyle}>Titel *</label><input style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></div>
          <div><label style={labelStyle}>Beskrivning</label><textarea style={textareaStyle} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div><label style={labelStyle}>Förfallodatum</label><input style={inputStyle} type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
          {error && <div style={{ color: COLORS.error, fontSize: 13 }}>{error}</div>}
          <button type="submit" style={primaryBtn} disabled={mutation.isPending}>{mutation.isPending ? "Sparar…" : "Spara åtgärd"}</button>
        </form>
      )}
      {isLoading ? <div style={{ color: COLORS.secondary }}>Laddar…</div> : data.length === 0 ? <Empty label="åtgärder" /> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Titel</th><th style={th}>Status</th><th style={th}>Förfaller</th><th style={th}>Tilldelad</th></tr></thead>
            <tbody>
              {data.map((r: any) => (
                <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => navigate({ to: "/properties/$id/actions/$actionId", params: { id: propertyId, actionId: r.id } })}>
                  <td style={{ ...td, fontWeight: 600 }}>{r.title}</td>
                  <td style={td}><DerivedStatusBadge status={deriveActionStatus(r)} /></td>
                  <td style={{ ...td, color: COLORS.secondary }}>{formatSwedishDate(r.due_date)}</td>
                  <td style={td}>{r.profiles?.full_name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============== TAB: DOCUMENTS ==============
export function DocumentsTab({ propertyId }: { propertyId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["documents", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("documents").select("id, name, category, file_url, file_type, file_size, created_at").eq("property_id", propertyId).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {isLoading ? <div style={{ color: COLORS.secondary }}>Laddar…</div> : data.length === 0 ? <Empty label="dokument" /> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Namn</th><th style={th}>Kategori</th><th style={th}>Storlek</th><th style={th}>Uppladdad</th><th style={th}></th></tr></thead>
            <tbody>
              {data.map((r: any) => (
                <tr key={r.id}>
                  <td style={{ ...td, fontWeight: 600 }}>{r.name}</td>
                  <td style={{ ...td, color: COLORS.secondary }}>{r.category ?? "—"}</td>
                  <td style={{ ...td, color: COLORS.secondary }}>{formatBytes(r.file_size)}</td>
                  <td style={{ ...td, color: COLORS.secondary }}>{formatSwedishDate(r.created_at)}</td>
                  <td style={td}>
                    {r.file_url && (
                      <button
                        onClick={async () => {
                          const marker = `/object/public/documents/`;
                          const idx = r.file_url!.indexOf(marker);
                          if (idx === -1) { window.open(r.file_url!, "_blank"); return; }
                          const path = r.file_url!.substring(idx + marker.length);
                          const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 3600, { download: true });
                          if (error || !data?.signedUrl) { window.open(r.file_url!, "_blank"); return; }
                          const a = document.createElement("a");
                          a.href = data.signedUrl; a.download = r.name ?? ""; a.click();
                        }}
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: COLORS.primary, display: "inline-flex", alignItems: "center", gap: 4 }}
                      >
                        <Download size={18} /> Hämta
                      </button>
                    )}
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

// ============== TAB: INSPECTIONS ==============
export function InspectionsTab({ propertyId, initialFilter }: { propertyId: string; initialFilter?: ArendeStatusFilter }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<SortMode>("newest");
  const [filter, setFilter] = useState<ArendeStatusFilter>(initialFilter ?? "alla");
  const { data = [], isLoading } = usePropertyInspections(propertyId);

  const filtered = useMemo(() => (filter === "alla" ? (data as any[]) : (data as any[]).filter((r) => inspectionBucket(r) === filter)), [data, filter]);
  const sorted = useMemo(() => sortByMode(filtered, mode, user?.id), [filtered, mode, user?.id]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionHeaderRow
        title="Besiktningar"
        mode={mode}
        onCycle={() => setMode((m) => NEXT_SORT_MODE[m])}
        actionLabel="Ny besiktning"
        actionTo="/properties/$id/inspections/new"
        actionToParams={{ id: propertyId }}
      />
      <div style={{ overflowX: "auto", display: "flex", justifyContent: "center" }}>
        <ArendeStatusSwitch value={filter} onChange={setFilter} topic="besiktningar" />
      </div>
      {isLoading ? <div style={{ color: COLORS.secondary }}>Laddar…</div> : sorted.length === 0 ? <Empty label="besiktningar" /> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Typ</th><th style={th}>Besiktningsman</th><th style={th}>Senast utförd</th><th style={th}>Nästa</th><th style={th}>Intervall (mån)</th><th style={th}>Status</th></tr></thead>
            <tbody>
              {sorted.map((r: any) => (
                <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => navigate({ to: "/properties/$id/inspections/$inspectionId", params: { id: propertyId, inspectionId: r.id } })}>
                  <td style={{ ...td, fontWeight: 600 }}>{r.inspection_type ?? "—"}</td>
                  <td style={td}>{r.inspector ?? "—"}</td>
                  <td style={{ ...td, color: COLORS.secondary }}>{formatSwedishDate(r.last_completed_date)}</td>
                  <td style={{ ...td, color: COLORS.secondary }}>{formatSwedishDate(r.next_due_date)}</td>
                  <td style={{ ...td, color: COLORS.secondary }}>{r.interval_months ?? "—"}</td>
                  <td style={td}><DerivedStatusBadge status={deriveInspectionStatus(r)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============== TAB: CONTACTS ==============
export function ContactsTab({ propertyId }: { propertyId: string }) {
  const navigate = useNavigate();

  const { data = [], isLoading } = useQuery({
    queryKey: ["contacts", propertyId],
    queryFn: async () => {
      // select("*") — `active` comes from a hand-run migration
      // (supabase-functions/contacts-active-flag.sql).
      const { data, error } = await supabase.from("contacts").select("*").eq("property_id", propertyId).order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const grouped = data.reduce((acc: Record<string, any[]>, c: any) => { const k = c.contact_type ?? "ovrigt"; (acc[k] ||= []).push(c); return acc; }, {});

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {isLoading ? <div style={{ color: COLORS.secondary }}>Laddar…</div> : data.length === 0 ? <Empty label="kontakter" /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {Object.entries(grouped).map(([type, items]) => (
            <div key={type}>
              <h3 style={{ ...labelStyle, marginBottom: 8 }}>{type}</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {items.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => navigate({ to: "/contacts/$id", params: { id: c.id } })}
                    style={{ padding: 12, border: `1px solid ${COLORS.border}`, borderRadius: 6, cursor: "pointer", opacity: c.active === false ? 0.55 : 1 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFBFA")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ fontWeight: 600, color: COLORS.text }}>
                      {c.full_name}
                      {c.active === false && <span style={{ fontWeight: 500, fontSize: 12, color: COLORS.secondary }}> — inaktiv</span>}
                    </div>
                    {c.company && <div style={{ fontSize: 13, color: COLORS.secondary }}>{c.company}</div>}
                    <div style={{ display: "flex", gap: 12, fontSize: 13, color: COLORS.secondary, marginTop: 4, flexWrap: "wrap" }}>
                      {c.phone && <span>{c.phone}</span>}
                      {c.email && <span>{c.email}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============== TAB: LOGBOOK ==============
// ============== TAB: PROJECTS ==============

export function ProjectsTab({ propertyId, initialFilter }: { propertyId: string; initialFilter?: ArendeStatusFilter }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<ArendeStatusFilter>(initialFilter ?? "alla");
  const { data = [], isLoading } = usePropertyProjects(propertyId);

  const sorted = useMemo(() => {
    const filtered = filter === "alla" ? [...data] : (data as any[]).filter((r) => projectBucket(r) === filter);
    return filtered.sort((a: any, b: any) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  }, [data, filter]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionHeaderRow
        title="Projekt"
        actionLabel="Nytt projekt"
        actionShortLabel="Nytt"
        actionTo="/properties/$id/projects/new"
        actionToParams={{ id: propertyId }}
      />
      <div style={{ overflowX: "auto", display: "flex", justifyContent: "center" }}>
        <ArendeStatusSwitch value={filter} onChange={setFilter} topic="projekt" />
      </div>
      {isLoading ? <div style={{ color: COLORS.secondary }}>Laddar…</div> : sorted.length === 0 ? (
        data.length === 0 ? (
          <Empty label="projekt" />
        ) : (
          <div style={{ padding: "48px 16px", textAlign: "center", color: COLORS.secondary, fontSize: 14 }}>
            Inga {arendeFilters("projekt").find((f) => f.key === filter)!.label.toLowerCase()}
          </div>
        )
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Titel</th><th style={th}>Status</th><th style={th}>Budget</th><th style={th}>Start</th><th style={th}>Slut</th></tr></thead>
            <tbody>
              {sorted.map((r: any) => (
                <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => navigate({ to: "/properties/$id/projects/$projectId", params: { id: propertyId, projectId: r.id } })}>
                  <td style={{ ...td, fontWeight: 600 }}>{r.title}</td>
                  <td style={td}><DerivedStatusBadge status={deriveProjectStatus(r)} /></td>
                  <td style={{ ...td, color: COLORS.secondary }}>{formatSEK(r.budget)}</td>
                  <td style={{ ...td, color: COLORS.secondary }}>{formatSwedishDate(r.start_date)}</td>
                  <td style={{ ...td, color: COLORS.secondary }}>{formatSwedishDate(r.end_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
