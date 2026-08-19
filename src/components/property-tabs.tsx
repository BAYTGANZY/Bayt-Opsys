import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, createContext, useContext } from "react";
import { Plus, Upload, Download, ArrowUpDown, ArrowDown, ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMyContactId, useMyArendeScope } from "@/hooks/useMyContactId";
import { SectionHeaderRow, SortFilterControls, sortByMode, NEXT_SORT_MODE, type SortMode } from "@/components/SortFilterControls";
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
  worstArendeStatus,
  LIFECYCLE_OF,
  PRIORITY_BADGE,
  PRIORITY_DISPLAY_LABEL,
  PRIORITY_LABEL,
  PRIORITY_SHORT_LABEL,
  type ArendeForStatus,
  type BesiktningForStatus,
  type DerivedStatus,
  type WorstArende,
} from "@/lib/issue-tokens";
import { DerivedStatusBadge } from "@/components/DerivedStatusBadge";
import {
  ContactSortToggles,
  contactTypeKey,
  readableOn,
  sortContacts,
  useContactSort,
} from "@/components/ContactFilterBar";
import { CONTACT_TYPES, CONTACT_TYPE_LABEL } from "@/lib/contact-tokens";
import { INSPECTION_TYPES, inspectionTypeLabel, inspectionTypeShortLabel } from "@/lib/inspection-tokens";
import { DOC_CATEGORIES, documentCategoryLabel } from "@/lib/document-tokens";
import {
  applySort,
  FilterChips,
  FilterDropdown,
  FilterRow,
  NONE_KEY,
  SortToggles,
  useListSort,
  usePresentKeys,
  usePresentOptions,
  type SortAxis,
} from "@/components/ListFilterBar";

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

// Prioritetens färger ägs av PRIORITY_BADGE i issue-tokens — den här filen
// hade en egen kopia med andra nyanser, så raden och prioritetschipen under
// filterraden kunde visa två färger för samma prioritet. En källa nu.
type BadgeTokens = { bg: string; color: string; border?: string };

const apartmentStatusBadge: Record<string, BadgeTokens> = {
  Uthyrd: { bg: "#e8f0d8", color: "#2E6B24" },
  Ledig: { bg: "#E8F5E4", color: "#3D8A30" },
  Renovering: { bg: "#fff3cd", color: "#856404" },
  Reserverad: { bg: "#ebebeb", color: "#555555" },
};

function Badge({ value, map }: { value: string | null; map: Record<string, BadgeTokens> }) {
  if (!value) return <span style={{ color: COLORS.secondary }}>—</span>;
  const s = map[value] ?? { bg: "#FFFFFF", color: "#6B7280" };
  return (
    <span style={{
      background: s.bg, color: s.color, border: s.border ? `1px solid ${s.border}` : undefined,
      padding: "4px 10px", borderRadius: 4, fontSize: 12, fontWeight: 600,
      display: "inline-block", textTransform: "lowercase",
    }}>
      {value}
    </span>
  );
}

/** `filtered` = listan är tom för att ett filter smalnat av den, inte för att
 *  det saknas rader. En filtrerad tom lista får aldrig läsas som en tom
 *  fastighet — samma regel som loggbokEmptyText. */
function Empty({ label, filtered }: { label: string; filtered?: boolean }) {
  return (
    <div style={{ padding: "48px 16px", textAlign: "center", color: COLORS.secondary, fontSize: 14 }}>
      {filtered ? `Inga ${label} för det här valet` : `Inga ${label} ännu`}
    </div>
  );
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

// Kolumnsortering: 0 = av, 1 = fallande, 2 = stigande, tredje trycket loopar
// tillbaka till av. Samma cykelform som objektlistans sorteringar. Riktningen
// betyder samma sak i varje kolumn — första trycket ger "störst först": högsta
// numret, största ytan, mest akuta ärendet, sist i alfabetet. Textkolumnerna
// följer den regeln i stället för att vända på den, annars betyder samma pil
// olika saker i två rubriker bredvid varandra.
type ColumnSortMode = 0 | 1 | 2;

/** Kolumnerna som kan styra radordningen — en åt gången. */
type ApartmentSortKey = "urgency" | "number" | "trappa" | "floor" | "area" | "status" | "tenant";
type ColumnSort = { key: ApartmentSortKey; dir: 1 | 2 } | null;

const SORTABLE_COLUMNS: {
  key: ApartmentSortKey;
  label: string;
  titles: { off: string; desc: string; asc: string };
  style?: React.CSSProperties;
}[] = [
  { key: "urgency", label: "Ärenden", style: { width: 1 }, titles: { off: "Sortera på angelägenhet", desc: "Sorterad: mest akut → minst akut", asc: "Sorterad: minst akut → mest akut" } },
  { key: "number", label: "Lgh nr", titles: { off: "Sortera på lägenhetsnummer", desc: "Sorterad: nummer högst → lägst", asc: "Sorterad: nummer lägst → högst" } },
  { key: "trappa", label: "Trappa", titles: { off: "Sortera på trappa", desc: "Sorterad: trappa högst → lägst", asc: "Sorterad: trappa lägst → högst" } },
  { key: "floor", label: "Våning", titles: { off: "Sortera på våning", desc: "Sorterad: våning högst → lägst", asc: "Sorterad: våning lägst → högst" } },
  { key: "area", label: "Yta", titles: { off: "Sortera på yta", desc: "Sorterad: yta störst → minst", asc: "Sorterad: yta minst → störst" } },
  { key: "status", label: "Status", titles: { off: "Gruppera på status", desc: "Grupperad: status Ö → A", asc: "Grupperad: status A → Ö" } },
  { key: "tenant", label: "Hyresgäst", titles: { off: "Sortera på hyresgäst", desc: "Sorterad: hyresgäst Ö → A", asc: "Sorterad: hyresgäst A → Ö" } },
];

/** Tomt/oläsbart fält → null. `Number("")` är 0, så tomsträngen måste fångas. */
function sortableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Radens värde i en sorterbar kolumn. `null` = fältet är tomt (inte "lägst").
 * Trappan är en ren siffersträng precis som lägenhetsnumret (normalizeTrappa),
 * så den jämförs numeriskt — "10" ska ligga efter "9", inte före.
 * Status och hyresgäst gemensamgörs, annars sorteras "Uthyrd" och "uthyrd"
 * som två skilda värden och statuskolumnen slutar gruppera.
 * `urgency` har ingen egen kolumn här — den jämförs mot ärendedatan.
 */
function apartmentSortValue(row: any, key: ApartmentSortKey): number | string | null {
  switch (key) {
    case "number": return sortableNumber(row.apartment_number);
    case "trappa": return sortableNumber(row.trappa);
    case "floor": return sortableNumber(row.floor);
    case "area": return sortableNumber(row.area_sqm);
    case "status": return (row.status ?? "").trim().toLocaleLowerCase("sv") || null;
    case "tenant": return (row.tenant_name ?? "").trim().toLocaleLowerCase("sv") || null;
    default: return null;
  }
}

/** Sorteringsknappen i en tabellrubrik — samma ikonspråk som objektlistan. */
function ColumnSortButton({ mode, onCycle, title }: { mode: ColumnSortMode; onCycle: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onCycle}
      title={title}
      aria-label={title}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 18, height: 18, padding: 0, border: "none", background: "transparent",
        color: mode === 0 ? COLORS.secondary : COLORS.primary, cursor: "pointer",
      }}
    >
      {mode === 1 ? <ArrowDown size={13} /> : mode === 2 ? <ArrowUp size={13} /> : <ArrowUpDown size={13} />}
    </button>
  );
}

/** Rubrikcell med sorteringsknapp. */
function SortableTh({ label, mode, onCycle, title, style }: { label: string; mode: ColumnSortMode; onCycle: () => void; title: string; style?: React.CSSProperties }) {
  return (
    <th style={{ ...th, ...style }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
        {label}
        <ColumnSortButton mode={mode} onCycle={onCycle} title={title} />
      </span>
    </th>
  );
}

type ApartmentIssueRow = ArendeForStatus & { apartment_id: string | null };
type ApartmentInspectionRow = BesiktningForStatus & { apartment_id: string | null };

const NO_URGENCY: WorstArende = { status: null, rank: 0, dueDate: null };
const NO_URGENCY_REASON = "Inga aktiva ärenden kopplade till lägenheten.";

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
  // Kolumnsorteringarna och Nyast/Äldst/Mina styr samma radordning, så bara en
  // av dem kan vara aktiv åt gången. Sju kolumner som var sitt eget läge skulle
  // betyda att varje knapp måste nolla sex andra — ett enda aktivt val kan inte
  // hamna i otakt med sig självt.
  const [columnSort, setColumnSort] = useState<ColumnSort>(null);
  const sortModeOf = (key: ApartmentSortKey): ColumnSortMode => (columnSort?.key === key ? columnSort.dir : 0);
  const cycleColumnSort = (key: ApartmentSortKey) =>
    setColumnSort((c) => (c?.key !== key ? { key, dir: 1 } : c.dir === 1 ? { key, dir: 2 } : null));
  const cycleDateSort = () => {
    setColumnSort(null);
    setMode((m) => NEXT_SORT_MODE[m]);
  };
  const dateSortActive = columnSort === null;
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

  // Lägenhetens angelägenhet = värsta härledda statusen bland dess icke
  // avslutade felanmälningar och besiktningar. Projekt kan inte delta —
  // `projects` har ingen apartment_id-kolumn, de är byggnadsnivå.
  // "Bara mina ärenden" gäller här också: en entreprenörs ordning ska spegla
  // deras egna ärenden, inte byggnadens. (useMyAssignedApartmentIds ovan avgör
  // vilka *rader* de ser — det här avgör vad som räknas in i angelägenheten.)
  const { filterContactId, ready: scopeReady } = useMyArendeScope();
  const urgencyQ = useQuery({
    queryKey: ["apartments-urgency", propertyId, filterContactId],
    enabled: scopeReady,
    queryFn: async () => {
      let issues = supabase
        .from("issues")
        .select("apartment_id, status, priority, deadline, created_at")
        .eq("property_id", propertyId)
        .not("apartment_id", "is", null);
      if (filterContactId) issues = issues.eq("assigned_contact_id", filterContactId);

      let inspections = supabase
        .from("inspections")
        .select("apartment_id, arende_status, status, next_due_date, last_completed_date, interval_months")
        .eq("property_id", propertyId)
        .not("apartment_id", "is", null);
      if (filterContactId) inspections = inspections.eq("assigned_contact_id", filterContactId);

      const [i, b] = await Promise.all([issues, inspections]);
      if (i.error) throw i.error;
      if (b.error) throw b.error;
      return {
        issues: (i.data ?? []) as ApartmentIssueRow[],
        inspections: (b.data ?? []) as ApartmentInspectionRow[],
      };
    },
  });

  const urgencyByApartment = useMemo(() => {
    const statusesByApartment = new Map<string, DerivedStatus[]>();
    const push = (apartmentId: string | null, s: DerivedStatus) => {
      if (!apartmentId) return;
      const arr = statusesByApartment.get(apartmentId);
      if (arr) arr.push(s);
      else statusesByApartment.set(apartmentId, [s]);
    };
    for (const row of urgencyQ.data?.issues ?? []) push(row.apartment_id, deriveIssueStatus(row));
    for (const row of urgencyQ.data?.inspections ?? []) push(row.apartment_id, deriveInspectionStatus(row));

    const map = new Map<string, WorstArende>();
    for (const [apartmentId, statuses] of statusesByApartment) {
      map.set(apartmentId, worstArendeStatus(statuses));
    }
    return map;
  }, [urgencyQ.data]);

  const sorted = useMemo(() => {
    // Samma nummer i olika trappor är två skilda lägenheter, därav trappan som
    // andrahandsnyckel. Ordningen är också slutlig tie-break för varje annan
    // kolumn: två rader med samma yta, våning eller status hamnar i
    // lägenhetsordning i stället för i den ordning databasen råkade svara.
    const byNumberAsc = (a: any, b: any) => {
      const an = apartmentSortValue(a, "number") ?? Infinity;
      const bn = apartmentSortValue(b, "number") ?? Infinity;
      if (an !== bn) return (an as number) - (bn as number);
      return (a.trappa ?? "").localeCompare(b.trappa ?? "", "sv");
    };

    if (!columnSort) return sortByMode(visible, mode, user?.id);

    // Jämförelserna nedan är skrivna stigande; `flip` vänder dem till fallande.
    const flip = columnSort.dir === 1 ? -1 : 1;

    if (columnSort.key === "urgency") {
      return [...visible].sort((a, b) => {
        const ua = urgencyByApartment.get(a.id) ?? NO_URGENCY;
        const ub = urgencyByApartment.get(b.id) ?? NO_URGENCY;
        if (ua.rank !== ub.rank) return (ua.rank - ub.rank) * flip;
        // Samma nivå — tidsgränsen avgör. Stigande lägger den avlägsnaste först
        // (och saknad tidsgräns allra först), så att vänd ordning ger exakt
        // "mest akut, närmaste frist överst".
        const ad = ua.dueDate ?? "9999-12-31";
        const bd = ub.dueDate ?? "9999-12-31";
        if (ad !== bd) return bd.localeCompare(ad) * flip;
        return byNumberAsc(a, b);
      });
    }

    const key = columnSort.key;
    return [...visible].sort((a, b) => {
      const av = apartmentSortValue(a, key);
      const bv = apartmentSortValue(b, key);
      // Ett tomt fält är inte "lägst", det är oredovisat — saknade värden
      // ligger sist i BÅDA riktningarna. Annars fylls toppen av rader som
      // inget säger så fort man vänder ordningen.
      if (av === null || bv === null) {
        if (av !== bv) return av === null ? 1 : -1;
        return byNumberAsc(a, b);
      }
      const c = typeof av === "string"
        ? av.localeCompare(bv as string, "sv")
        : av === (bv as number) ? 0 : av < (bv as number) ? -1 : 1;
      return c !== 0 ? c * flip : byNumberAsc(a, b);
    });
  }, [visible, mode, user?.id, columnSort, urgencyByApartment]);

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
        controls={
          // Nedtonad medan en kolumnsortering styr ordningen — samma markering
          // av "avstängd datumsortering" som fastighetsgriddens.
          <div style={{ opacity: dateSortActive ? 1 : 0.45 }}>
            <SortFilterControls mode={mode} onCycle={cycleDateSort} compact={isMobile} />
          </div>
        }
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
            <input style={inputStyle} inputMode="numeric" pattern="[0-9]*" placeholder={TRAPPA_PLACEHOLDER} value={form.trappa} onChange={(e) => setForm({ ...form, trappa: normalizeTrappa(e.target.value) })} required />
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
            <thead>
              <tr>
                {/* SORTABLE_COLUMNS ligger i tabellens egen kolumnordning —
                    lägg till en kolumn där och den hamnar rätt här. */}
                {SORTABLE_COLUMNS.map((col) => {
                  const m = sortModeOf(col.key);
                  return (
                    <SortableTh
                      key={col.key}
                      label={col.label}
                      mode={m}
                      onCycle={() => cycleColumnSort(col.key)}
                      title={m === 1 ? col.titles.desc : m === 2 ? col.titles.asc : col.titles.off}
                      style={col.style}
                    />
                  );
                })}
                <th style={th}>Telefon</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a: any) => {
                const urgency = urgencyByApartment.get(a.id) ?? NO_URGENCY;
                return (
                <tr key={a.id} style={{ cursor: "pointer" }} onClick={() => navigate({ to: "/properties/$id/apartments/$apartmentId", params: { id: propertyId, apartmentId: a.id }, search: { tab: "info" } })}>
                  {/* Rangordningen ska synas, inte bara anas av radordningen.
                      Samma färgskala som DerivedStatusBadge — prickens färg ÄR
                      det värsta ärendets härledda status. */}
                  <td style={td}>
                    <span
                      title={urgencyQ.isLoading ? "Laddar ärenden…" : (urgency.status?.reason ?? NO_URGENCY_REASON)}
                      style={{
                        display: "block", width: 10, height: 10, borderRadius: "50%",
                        background: urgencyQ.isLoading ? COLORS.border : (urgency.status?.color ?? COLORS.primary),
                      }}
                    />
                  </td>
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
                );
              })}
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

/** Åtgärder har ingen egen livscykelkolumn — deriveActionStatus läser den ur
 *  den gamla planerad/pagar/klar-kolumnen, och den här hinken speglar exakt den
 *  avläsningen. Ändras den ena måste den andra följa med, annars visar
 *  statusväxeln en annan sanning än badgen i raden bredvid. */
function actionBucket(r: any): Exclude<ArendeStatusFilter, "alla"> {
  return lifecycleBucket(r.status === "klar" ? "avslutat" : r.status === "pagar" ? "oppet" : "vilande");
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

// ============== PRIORITETSFILTER (felanmälningar) ==============
// Prioritet är en egen axel bredvid ArendeStatusSwitch, inte en andra status:
// status säger var i livscykeln ärendet är, prioritet hur brådskande det var
// när det kom in. De smalnar av samma lista och kombineras fritt — sorteringen
// ordnar bara det som blir kvar.
//
// Chipen bär prioritetens egen färg ur PRIORITY_BADGE, samma karta som radens
// badge i tabellen, så ett valt chip och raderna det ger tillbaka aldrig kan
// visa två olika färger för samma prioritet.

/** PRIORITY_LABELs kanoniska uppsättning, värst först — samma "värst överst"-
 *  ordning som objektlistan och fastighetskortens prioritetsprick. */
const PRIORITY_FILTER_ORDER: readonly string[] = [...PRIORITY_LABEL].reverse();

/** Aktivt chip fylls med prioritetens färg, inaktivt visar den som text på
 *  vitt — medvetet lättare än ArendeStatusSwitch ovanför, prioritet är en
 *  förfining av statusvalet och ska inte konkurrera med det. */
function prioChipStyle(priority: string, active: boolean): React.CSSProperties {
  const s = PRIORITY_BADGE[priority] ?? { bg: "transparent", color: COLORS.secondary };
  return {
    display: "inline-flex", alignItems: "center", height: 28, padding: "0 12px",
    borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
    whiteSpace: "nowrap", fontFamily: "Inter, system-ui, sans-serif", boxSizing: "border-box",
    border: `1px solid ${active ? s.color : COLORS.border}`,
    background: active ? s.color : COLORS.card,
    color: active ? readableOn(s.color) : s.color,
  };
}

function PrioritetChips({ options, value, onChange }: {
  options: readonly string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Filtrera felanmälningar på prioritet"
      style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6, minWidth: 0 }}
    >
      {options.map((p) => {
        const active = value === p;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(active ? null : p)}
            aria-pressed={active}
            title={active ? "Klicka igen för att visa alla prioriteter" : `Visa bara prioritet ${PRIORITY_SHORT_LABEL[p] ?? p}`}
            style={prioChipStyle(p, active)}
          >
            {PRIORITY_DISPLAY_LABEL[p] ?? p}
          </button>
        );
      })}
    </div>
  );
}

// ============== BESIKTNINGSTYPSFILTER (besiktningar) ==============
// Samma axelresonemang som prioritetschipen ovan: status säger var i livscykeln
// besiktningen är, typen vad som besiktigas. De kombineras fritt och sorteringen
// ordnar bara det som blir kvar.
//
// Till skillnad från prioritet har en besiktningstyp ingen egen färg, så chipen
// bär den neutrala accentfyllningen (samma språk som ContactFilterBar och
// LoggbokFilterBar) i exakt prioritetschipens geometri — 28px hög, radius 8 —
// för att sitta i samma visuella slot som raden på felanmälningssidan.

/** Kanonisk ordning ur DB-enumet, inte bokstavsordning: besiktningstyper har
 *  ingen rangordning att vända på, och INSPECTION_TYPES-ordningen är den som
 *  syns i väljaren på ny besiktning. */
const INSPECTION_TYPE_FILTER_ORDER: readonly string[] = INSPECTION_TYPES.map((t) => t.value);

function typChipStyle(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", height: 28, padding: "0 12px",
    borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
    whiteSpace: "nowrap", fontFamily: "Inter, system-ui, sans-serif", boxSizing: "border-box",
    border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
    background: active ? COLORS.accent : COLORS.card,
    color: active ? "#fff" : COLORS.secondary,
  };
}

function BesiktningstypChips({ options, value, onChange }: {
  options: readonly string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Filtrera besiktningar på typ"
      style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6, minWidth: 0 }}
    >
      {options.map((t) => {
        const active = value === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(active ? null : t)}
            aria-pressed={active}
            // Titeln bär hela namnet, så "OVK" och "SBA" går att slå upp utan
            // att chipraden blir en mening.
            title={active ? "Klicka igen för att visa alla besiktningstyper" : `Visa bara ${inspectionTypeLabel(t)}`}
            style={typChipStyle(active)}
          >
            {inspectionTypeShortLabel(t)}
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
  const [prio, setPrio] = useState<string | null>(null);
  const { data = [], isLoading } = usePropertyIssues(propertyId);

  const statusFiltered = useMemo(
    () => (filter === "alla" ? (data as any[]) : (data as any[]).filter((r) => issueBucket(r) === filter)),
    [data, filter],
  );

  // Bara prioriteter som faktiskt förekommer i det valda statusläget — ett chip
  // som garanterat ger en tom lista är inget val. Den valda behålls alltid,
  // annars försvinner ett aktivt filter ur sin egen rad (samma undantag som
  // ContactFilterBar och AnsvarigDropdown gör).
  const prioOptions = useMemo(() => {
    const present = new Set<string>();
    for (const r of statusFiltered) if (r.priority) present.add(r.priority);
    if (prio) present.add(prio);
    return PRIORITY_FILTER_ORDER.filter((p) => present.has(p));
  }, [statusFiltered, prio]);

  // Jämförs mot radens faktiska priority, inte mot en härledd default: chipet
  // lovar exakt de rader vars badge visar den prioriteten. En rad utan
  // prioritet (äldre import) har därför ingen chip och syns bara ofiltrerat.
  const filtered = useMemo(
    () => (prio ? statusFiltered.filter((r) => r.priority === prio) : statusFiltered),
    [statusFiltered, prio],
  );
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
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
        <div style={{ overflowX: "auto", display: "flex", justifyContent: "center" }}>
          <ArendeStatusSwitch value={filter} onChange={setFilter} topic="felanmälningar" />
        </div>
        {(prioOptions.length > 1 || prio) && (
          <PrioritetChips options={prioOptions} value={prio} onChange={setPrio} />
        )}
      </div>
      {isLoading ? <div style={{ color: COLORS.secondary }}>Laddar…</div> : sorted.length === 0 ? <Empty label="felanmälningar" filtered={(data as any[]).length > 0} /> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Titel</th><th style={th}>Status</th><th style={th}>Prioritet</th><th style={th}>Skapad</th></tr></thead>
            <tbody>
              {sorted.map((r: any) => (
                <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => navigate({ to: "/properties/$id/issues/$issueId", params: { id: propertyId, issueId: r.id } })}>
                  <td style={{ ...td, fontWeight: 600 }}>{r.title}</td>
                  <td style={td}><DerivedStatusBadge status={deriveIssueStatus(r as ArendeForStatus)} /></td>
                  <td style={td}><Badge value={r.priority} map={PRIORITY_BADGE} /></td>
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
// Kolumnerna är Titel / Status / Förfaller / Tilldelad, och tre av fyra är
// filtrerbara: status via den delade ärendeväxeln (samma fyra lägen som
// felanmälningar, besiktningar och projekt — åtgärder saknade den helt),
// förfallodatum som sorteringsaxel, tilldelad som personfilter. Titel är
// fritext och har inget filter. Åtgärder har ingen kategorikolumn, så det finns
// ingen typaxel att lägga till här.
const ACTION_SORT_AXES: readonly SortAxis[] = [
  { key: "due", label: "Förfaller", dirLabel: { asc: "Snarast", desc: "Senast" }, first: "asc" },
];
/** Listan kom med förfallodatum stigande från queryn — det förblir viloläget. */
const ACTION_SORT_INITIAL = { key: "due", dir: "asc" as const };

export function ActionsTab({ propertyId }: { propertyId: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<ArendeStatusFilter>("alla");
  const [assignee, setAssignee] = useState<string | null>(null);
  const sort = useListSort(ACTION_SORT_AXES, ACTION_SORT_INITIAL);
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

  const statusFiltered = useMemo(
    () => (filter === "alla" ? (data as any[]) : (data as any[]).filter((r) => actionBucket(r) === filter)),
    [data, filter],
  );

  // Tilldelad är en riktig personkolumn (assigned_to → profiles), inte en
  // uppräkning: valen byggs ur de tilldelade som faktiskt förekommer, plus en
  // egen hink för raderna utan ansvarig. Namnet hämtas från samma rad som
  // id:t — inget extra anrop.
  const assigneeOptions = usePresentOptions(
    statusFiltered,
    (r: any) => ({
      value: r.assigned_to ?? NONE_KEY,
      label: r.assigned_to ? (r.profiles?.full_name?.trim() || "Okänd användare") : "Ej tilldelad",
    }),
    assignee,
    data as any[],
  );

  const filtered = useMemo(
    () => (assignee ? statusFiltered.filter((r) => (r.assigned_to ?? NONE_KEY) === assignee) : statusFiltered),
    [statusFiltered, assignee],
  );
  const sorted = useMemo(() => applySort(filtered, sort, (r: any) => r.due_date ?? null), [filtered, sort]);

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
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
        <div style={{ overflowX: "auto", display: "flex", justifyContent: "center" }}>
          <ArendeStatusSwitch value={filter} onChange={setFilter} topic="åtgärder" />
        </div>
        <FilterRow style={{ justifyContent: "center" }}>
          <FilterDropdown
            options={assigneeOptions}
            value={assignee}
            onChange={setAssignee}
            resting="Alla tilldelade"
            ariaLabel="Filtrera åtgärder på tilldelad"
          />
          <SortToggles axes={ACTION_SORT_AXES} sort={sort} label={null} />
        </FilterRow>
      </div>
      {isLoading ? <div style={{ color: COLORS.secondary }}>Laddar…</div> : sorted.length === 0 ? <Empty label="åtgärder" filtered={(data as any[]).length > 0} /> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Titel</th><th style={th}>Status</th><th style={th}>Förfaller</th><th style={th}>Tilldelad</th></tr></thead>
            <tbody>
              {sorted.map((r: any) => (
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
// Ett dokumentbibliotek bläddras på riktigt efter filnamn, till skillnad från en
// ärendelista — därför får Namn en egen sorteringsaxel här och ingen annanstans.
// De tre sorterbara kolumnerna delar en grupp: exakt en ordnar listan åt gången.
// Kategori är ett filter och kombineras fritt med vilken som helst av dem.
export const DOCUMENT_SORT_AXES: readonly SortAxis[] = [
  { key: "name", label: "Namn", dirLabel: { asc: "A–Ö", desc: "Ö–A" }, first: "asc" },
  { key: "size", label: "Storlek", dirLabel: { desc: "Störst", asc: "Minst" }, first: "desc" },
  { key: "uploaded", label: "Uppladdad", dirLabel: { desc: "Senaste", asc: "Äldst" }, first: "desc" },
];
/** Listan kom med uppladdad fallande från queryn — det förblir viloläget. */
export const DOCUMENT_SORT_INITIAL = { key: "uploaded", dir: "desc" as const };

/** Radens värde för den aktiva axeln. Delad med lägenhetens dokumentflik, som
 *  läser samma kolumner ur samma tabell. */
export function documentSortValue(r: any, axis: string): string | number | null {
  if (axis === "name") return r.name ?? null;
  if (axis === "size") return r.file_size ?? null;
  return r.created_at ?? null;
}

export function DocumentsTab({ propertyId }: { propertyId: string }) {
  const [kategori, setKategori] = useState<string | null>(null);
  const sort = useListSort(DOCUMENT_SORT_AXES, DOCUMENT_SORT_INITIAL);

  const { data = [], isLoading } = useQuery({
    queryKey: ["documents", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("documents").select("id, name, category, file_url, file_type, file_size, created_at").eq("property_id", propertyId).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Bara kategorier som faktiskt förekommer, i uppladdningsväljarens ordning.
  // Dokument utan kategori får en egen hink i stället för att bli ofiltrerbara.
  const kategoriKeys = usePresentKeys(data as any[], (r: any) => r.category ?? NONE_KEY, kategori, DOC_CATEGORIES);
  const kategoriOptions = useMemo(
    () => kategoriKeys.map((k) => ({ value: k, label: k === NONE_KEY ? "Utan kategori" : documentCategoryLabel(k) })),
    [kategoriKeys],
  );

  const filtered = useMemo(
    () => (kategori ? (data as any[]).filter((r) => (r.category ?? NONE_KEY) === kategori) : (data as any[])),
    [data, kategori],
  );
  const sorted = useMemo(() => applySort(filtered, sort, documentSortValue), [filtered, sort]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {(kategoriOptions.length > 1 || (data as any[]).length > 0) && (
        <FilterRow>
          <FilterChips
            options={kategoriOptions}
            value={kategori}
            onChange={setKategori}
            ariaLabel="Filtrera dokument på kategori"
            allLabel="Alla kategorier"
          />
          <SortToggles axes={DOCUMENT_SORT_AXES} sort={sort} />
        </FilterRow>
      )}
      {isLoading ? <div style={{ color: COLORS.secondary }}>Laddar…</div> : sorted.length === 0 ? <Empty label="dokument" filtered={(data as any[]).length > 0} /> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Namn</th><th style={th}>Kategori</th><th style={th}>Storlek</th><th style={th}>Uppladdad</th><th style={th}></th></tr></thead>
            <tbody>
              {sorted.map((r: any) => (
                <tr key={r.id}>
                  <td style={{ ...td, fontWeight: 600 }}>{r.name}</td>
                  <td style={{ ...td, color: COLORS.secondary }}>{r.category ? documentCategoryLabel(r.category) : "—"}</td>
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
  const [typ, setTyp] = useState<string | null>(null);
  const { data = [], isLoading } = usePropertyInspections(propertyId);

  const statusFiltered = useMemo(
    () => (filter === "alla" ? (data as any[]) : (data as any[]).filter((r) => inspectionBucket(r) === filter)),
    [data, filter],
  );

  // Bara typer som faktiskt förekommer i det valda statusläget — de flesta
  // fastigheter kör 3–5 besiktningstyper, så det håller raden kort utan extra
  // logik, och ett chip som garanterat ger en tom lista är inget val. Den valda
  // behålls alltid, annars försvinner ett aktivt filter ur sin egen rad (samma
  // undantag som prioritetschipen, ContactFilterBar och AnsvarigDropdown gör).
  const typOptions = useMemo(() => {
    const present = new Set<string>();
    for (const r of statusFiltered) if (r.inspection_type) present.add(r.inspection_type);
    if (typ) present.add(typ);
    // Typer utanför enumet (äldre import) hamnar sist men får ändå ett chip —
    // annars går de rader bara att nå ofiltrerat.
    const known = INSPECTION_TYPE_FILTER_ORDER.filter((t) => present.has(t));
    const unknown = [...present].filter((t) => !INSPECTION_TYPE_FILTER_ORDER.includes(t)).sort();
    return [...known, ...unknown];
  }, [statusFiltered, typ]);

  const filtered = useMemo(
    () => (typ ? statusFiltered.filter((r) => r.inspection_type === typ) : statusFiltered),
    [statusFiltered, typ],
  );
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
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
        <div style={{ overflowX: "auto", display: "flex", justifyContent: "center" }}>
          <ArendeStatusSwitch value={filter} onChange={setFilter} topic="besiktningar" />
        </div>
        {(typOptions.length > 1 || typ) && (
          <BesiktningstypChips options={typOptions} value={typ} onChange={setTyp} />
        )}
      </div>
      {isLoading ? <div style={{ color: COLORS.secondary }}>Laddar…</div> : sorted.length === 0 ? <Empty label="besiktningar" filtered={(data as any[]).length > 0} /> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Typ</th><th style={th}>Besiktningsman</th><th style={th}>Senast utförd</th><th style={th}>Nästa</th><th style={th}>Intervall (mån)</th><th style={th}>Status</th></tr></thead>
            <tbody>
              {sorted.map((r: any) => (
                <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => navigate({ to: "/properties/$id/inspections/$inspectionId", params: { id: propertyId, inspectionId: r.id } })}>
                  <td style={{ ...td, fontWeight: 600 }}>{inspectionTypeLabel(r.inspection_type)}</td>
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
type TabContact = {
  id: string;
  full_name: string | null;
  contact_type: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  created_at: string | null;
  /** false = retired, see supabase-functions/contacts-active-flag.sql */
  active?: boolean | null;
};

export function ContactsTab({ propertyId }: { propertyId: string }) {
  const navigate = useNavigate();
  // Samma sorteringsaxlar som /contacts, delade via ContactFilterBar. Fliken
  // behöver varken fastighetsfilter (den är redan scopad till en fastighet)
  // eller kontakttypsfilter (den grupperar redan på typ).
  const sort = useContactSort();

  const { data = [], isLoading } = useQuery({
    queryKey: ["contacts", propertyId],
    queryFn: async () => {
      // select("*") — `active` comes from a hand-run migration
      // (supabase-functions/contacts-active-flag.sql).
      const { data, error } = await supabase.from("contacts").select("*").eq("property_id", propertyId).order("full_name");
      if (error) throw error;
      return (data ?? []) as unknown as TabContact[];
    },
  });

  // Grupperna ligger i CONTACT_TYPES-ordning, inte i den ordning raderna råkar
  // komma i — annars flyttar sig hela grupperna när man byter sortering, som
  // om sorteringen även gjorde om grupperingen. Sorteringen gäller inuti varje
  // grupp.
  const groups = useMemo(() => {
    const map = new Map<string, TabContact[]>();
    for (const c of data) {
      const k = contactTypeKey(c);
      const arr = map.get(k);
      if (arr) arr.push(c);
      else map.set(k, [c]);
    }
    const rank = (t: string) => {
      const i = (CONTACT_TYPES as readonly string[]).indexOf(t);
      return i === -1 ? CONTACT_TYPES.length : i;
    };
    return [...map.entries()]
      .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0], "sv"))
      .map(([type, items]) => ({ type, items: sortContacts(items, sort) }));
  }, [data, sort]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {isLoading ? <div style={{ color: COLORS.secondary }}>Laddar…</div> : data.length === 0 ? <Empty label="kontakter" /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
            <ContactSortToggles sort={sort} />
          </div>
          {groups.map(({ type, items }) => (
            <div key={type}>
              <h3 style={{ ...labelStyle, marginBottom: 8 }}>{CONTACT_TYPE_LABEL[type] ?? type}</h3>
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
