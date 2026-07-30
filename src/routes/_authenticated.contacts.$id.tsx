import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  CONTACT_TYPES,
  CONTACT_TYPE_LABEL,
  normalizeEmail,
  normalizePhoneDigits,
} from "@/lib/contact-tokens";
import {
  deriveInspectionStatus,
  deriveIssueStatus,
  deriveProjectStatus,
  type DerivedStatus,
} from "@/lib/issue-tokens";
import { DerivedStatusBadge } from "@/components/DerivedStatusBadge";
import { arendeKindColor, arendeKindLabel, type MyArendeKind } from "@/hooks/useMyArenden";
import { DeleteButton } from "@/components/DeleteButton";

export const Route = createFileRoute("/_authenticated/contacts/$id")({
  head: () => ({ meta: [{ title: "Kontakt — BAYT" }] }),
  component: ContactDetailPage,
});

const C = {
  bg: "#FFFFFF",
  card: "#ffffff",
  border: "#E5E7EB",
  primary: "#3D8A30",
  secondary: "#6B7280",
  text: "#1a1a1a",
  error: "#DC2626",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 500,
  color: C.secondary,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 12px",
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  fontSize: 14,
  color: C.text,
  background: C.card,
  outline: "none",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  height: "auto",
  minHeight: 100,
  padding: 12,
  resize: "vertical",
  fontFamily: "inherit",
};

type Contact = {
  id: string;
  property_id: string | null;
  full_name: string;
  company: string | null;
  contact_type: string;
  sub_type: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** false = retired — hidden from the Ansvarig dropdowns but kept for history.
   *  See supabase-functions/contacts-active-flag.sql. */
  active: boolean | null;
};

function ContactDetailPage() {
  const { id } = Route.useParams();
  const isMobile = useIsMobile();
  const qc = useQueryClient();

  const { data: properties = [] } = useQuery({
    queryKey: ["properties-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  const { data: contact, isLoading } = useQuery({
    queryKey: ["contact", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Contact;
    },
  });

  const navigate = useNavigate();
  const [propertyId, setPropertyId] = useState("");
  const [fullName, setFullName] = useState("");
  const [contactType, setContactType] = useState("");
  const [subType, setSubType] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (contact) {
      setPropertyId(contact.property_id ?? "");
      setFullName(contact.full_name);
      setContactType(contact.contact_type);
      setSubType(contact.sub_type ?? "");
      setCompany(contact.company ?? "");
      setPhone(contact.phone ?? "");
      setEmail(contact.email ?? "");
      setNotes(contact.notes ?? "");
      setActive(contact.active !== false);
    }
  }, [contact]);

  const updateMutation = useMutation({
    mutationFn: async (payload: Partial<Contact>) => {
      const { error } = await supabase.from("contacts").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact", id] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      // Separate key — the Ansvarig dropdown won't notice the Status change
      // (or a renamed entreprenör) without this.
      qc.invalidateQueries({ queryKey: ["contacts-entreprenorer"] });
      toast.success("Ändringar sparade", { style: { background: "#3D8A30", color: "#fff" } });
    },
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Fastighet is optional: entreprenörer are system-wide (property_id null) and
    // are created that way by the Entreprenör dropdown. Requiring it here made
    // every global contact impossible to edit — saving always failed.
    if (!fullName.trim() || !contactType) {
      setError("Namn och typ krävs");
      return;
    }
    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        property_id: propertyId || null,
        full_name: fullName.trim(),
        contact_type: contactType,
        sub_type: subType.trim() || null,
        company: company.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        notes: notes.trim() || null,
        active,
      });
      setSaving(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara");
      setSaving(false);
    }
  }

  if (isLoading || !contact) {
    return <div style={{ padding: isMobile ? 16 : 32, color: C.secondary }}>Laddar…</div>;
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: isMobile ? 16 : 32 }}>
      <Link
        to="/contacts"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.secondary, textDecoration: "none", fontSize: 14, marginBottom: 16 }}
      >
        <ArrowLeft size={18} /> Tillbaka
      </Link>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: "0 0 24px" }}>{contact.full_name}</h1>

      <form
        onSubmit={onSubmit}
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: 24,
          maxWidth: 720,
          display: "grid",
          gap: 16,
        }}
      >
        <div>
          {/* No `required`: entreprenörer are system-wide (property_id null), and
              HTML5 validation on this select blocked saving every global contact
              even though onSubmit deliberately allows it. */}
          <label style={labelStyle}>Fastighet</label>
          <select
            style={inputStyle}
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
          >
            <option value="">Välj fastighet</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Namn *</label>
          <input
            style={inputStyle}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
        </div>
        <div>
          <label style={labelStyle}>Typ *</label>
          <select
            style={inputStyle}
            value={contactType}
            onChange={(e) => setContactType(e.target.value)}
            required
          >
            <option value="">Välj typ</option>
            {CONTACT_TYPES.map((t) => (
              <option key={t} value={t}>{CONTACT_TYPE_LABEL[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Undertyp</label>
          <input style={inputStyle} value={subType} onChange={(e) => setSubType(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Företag</label>
          <input style={inputStyle} value={company} onChange={(e) => setCompany(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Telefon</label>
          <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>E-post</label>
          <input type="email" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Anteckningar</label>
          <textarea style={textareaStyle} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Status</label>
          <select style={inputStyle} value={active ? "1" : "0"} onChange={(e) => setActive(e.target.value === "1")}>
            <option value="1">Aktiv</option>
            <option value="0">Inaktiv</option>
          </select>
          <div style={{ fontSize: 13, color: C.secondary, marginTop: 6 }}>
            Inaktiv tar bort kontakten ur Ansvarig-listan på felanmälan, besiktning och projekt.
            Namnet står kvar på ärenden som redan är tilldelade, så historiken bevaras.
          </div>
        </div>

        {error && <div style={{ color: C.error, fontSize: 14 }}>{error}</div>}

        <button
          type="submit"
          disabled={saving}
          style={{
            height: 44,
            background: C.primary,
            color: "#ffffff",
            border: "none",
            borderRadius: 6,
            padding: "0 20px",
            fontSize: 15,
            fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "Sparar…" : "Spara ändringar"}
        </button>
        <DeleteButton
          table="contacts"
          id={id}
          label={fullName || "kontakten"}
          variant="full"
          // Clearing these drops the contact from every Entreprenör dropdown
          // and from any errand that had them assigned.
          invalidateKeys={[["contacts"], ["contacts-all"], ["contacts-entreprenorer"]]}
          onDeleted={() => navigate({ to: "/contacts" })}
        />
      </form>

      <ArendenSomAnsvarig contactId={id} />
      <InskickadeFelanmalningar contact={contact} />
    </div>
  );
}

// ===========================================================================
// Profilsektioner — vad kontakten gör i systemet, inte bara vem den är.
// ===========================================================================

const sectionCard: React.CSSProperties = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: 24,
  maxWidth: 720,
  marginTop: 24,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 700,
  color: C.text,
  margin: "0 0 4px",
};

const sectionNote: React.CSSProperties = {
  fontSize: 13,
  color: C.secondary,
  marginBottom: 12,
};

const rowStyle: React.CSSProperties = {
  padding: "12px 0",
  borderTop: `1px solid ${C.border}`,
  display: "grid",
  gap: 6,
  minWidth: 0,
};

/**
 * Fastighet först — same route shape as every other ärende link in the portal
 * (see arendeHref in EntreprenorDagRapport). The flat form is only a fallback
 * for an ärende with no fastighet.
 */
const KIND_SECTION: Record<MyArendeKind, string> = {
  issue: "issues",
  inspection: "inspections",
  project: "projects",
};

function arendeHref(kind: MyArendeKind, propertyId: string | null, id: string): string {
  const section = KIND_SECTION[kind];
  return propertyId ? `/properties/${propertyId}/${section}/${id}` : `/${section}/${id}`;
}

type AnsvarigIssueRow = {
  id: string;
  title: string | null;
  status: string | null;
  priority: string | null;
  created_at: string | null;
  deadline: string | null;
  property_id: string | null;
};

type AnsvarigInspectionRow = {
  id: string;
  inspection_type: string | null;
  status: string | null;
  arende_status: string | null;
  next_due_date: string | null;
  last_completed_date: string | null;
  interval_months: number | null;
  created_at: string | null;
  property_id: string | null;
};

type AnsvarigProjectRow = {
  id: string;
  title: string | null;
  status: string | null;
  arende_status: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  property_id: string | null;
};

type ArendeListItem = {
  kind: MyArendeKind;
  id: string;
  title: string;
  status: DerivedStatus;
  createdAt: string | null;
  propertyId: string | null;
};

function ArendeRow({
  item,
  showKind = false,
  dateLabel = "Skapad",
  chips,
}: {
  item: ArendeListItem;
  showKind?: boolean;
  dateLabel?: string;
  chips?: React.ReactNode;
}) {
  const dates: string[] = [];
  if (item.createdAt) dates.push(`${dateLabel} ${item.createdAt.slice(0, 10)}`);
  if (item.status.dueDate) dates.push(`Tidsgräns ${item.status.dueDate}`);

  return (
    <div style={rowStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
        {showKind && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: arendeKindColor(item.kind),
              whiteSpace: "nowrap",
            }}
          >
            {arendeKindLabel(item.kind)}
          </span>
        )}
        <Link
          to={arendeHref(item.kind, item.propertyId, item.id) as never}
          style={{ fontSize: 14, fontWeight: 600, color: C.primary, textDecoration: "none", overflowWrap: "anywhere" }}
        >
          {item.title}
        </Link>
        <span style={{ marginLeft: "auto" }}>
          <DerivedStatusBadge status={item.status} />
        </span>
      </div>
      {dates.length > 0 && (
        <div style={{ fontSize: 13, color: C.secondary }} title={item.status.reason}>
          {dates.join(" · ")}
        </div>
      )}
      {chips}
    </div>
  );
}

function ArendenSomAnsvarig({ contactId }: { contactId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["contact-arenden", contactId],
    queryFn: async () => {
      const [issues, inspections, projects] = await Promise.all([
        supabase
          .from("issues")
          .select("id, title, status, priority, created_at, deadline, property_id")
          .eq("assigned_contact_id", contactId),
        // select("*") on purpose: inspections.trappa (trappa-field.sql) is not
        // applied to the live DB, and naming columns explicitly would 400 the
        // whole query — same rule as useMyArenden and the besiktning pages.
        supabase.from("inspections").select("*").eq("assigned_contact_id", contactId),
        supabase
          .from("projects")
          .select("id, title, status, arende_status, start_date, end_date, created_at, property_id")
          .eq("assigned_contact_id", contactId),
      ]);
      const err = issues.error ?? inspections.error ?? projects.error;
      if (err) throw err;
      return {
        issues: (issues.data ?? []) as unknown as AnsvarigIssueRow[],
        inspections: (inspections.data ?? []) as unknown as AnsvarigInspectionRow[],
        projects: (projects.data ?? []) as unknown as AnsvarigProjectRow[],
      };
    },
  });

  // Härledd status läser dagens datum — beräknas vid render, inte i cachen,
  // samma resonemang som useMyArenden.
  const arenden = useMemo<ArendeListItem[]>(() => {
    if (!data) return [];
    return [
      ...data.issues.map((r) => ({
        kind: "issue" as const,
        id: r.id,
        title: r.title?.trim() || "Felanmälan",
        status: deriveIssueStatus(r),
        createdAt: r.created_at,
        propertyId: r.property_id,
      })),
      ...data.inspections.map((r) => ({
        kind: "inspection" as const,
        id: r.id,
        title: r.inspection_type?.trim() || "Besiktning",
        status: deriveInspectionStatus(r),
        createdAt: r.created_at,
        propertyId: r.property_id,
      })),
      ...data.projects.map((r) => ({
        kind: "project" as const,
        id: r.id,
        title: r.title?.trim() || "Projekt",
        status: deriveProjectStatus(r),
        createdAt: r.created_at,
        propertyId: r.property_id,
      })),
    ].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  }, [data]);

  return (
    <section style={sectionCard}>
      <h2 style={sectionTitle}>Ärenden som ansvarig</h2>
      <div style={sectionNote}>
        Felanmälningar, besiktningar och projekt där kontakten är vald som ansvarig.
      </div>
      {isLoading && <div style={{ color: C.secondary, fontSize: 14 }}>Laddar…</div>}
      {!!error && <div style={{ color: C.error, fontSize: 14 }}>Kunde inte hämta ärenden.</div>}
      {!isLoading && !error && arenden.length === 0 && (
        <div style={{ color: C.secondary, fontSize: 14 }}>Inga ärenden.</div>
      )}
      {arenden.map((a) => (
        <ArendeRow key={`${a.kind}-${a.id}`} item={a} showKind />
      ))}
    </section>
  );
}

type SubmittedIssueRow = AnsvarigIssueRow & {
  reporter_email: string | null;
  reporter_phone: string | null;
};

/**
 * The soft yellow is the entire explanation of why an ärende is in the list —
 * no text spells the heuristic out, the highlight does.
 */
function ReporterChip({ value, matched }: { value: string; matched: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 12,
        border: matched ? "1px solid #F59E0B" : `1px solid ${C.border}`,
        background: matched ? "#FEF3C7" : "#F9FAFB",
        color: matched ? "#92400E" : C.secondary,
      }}
    >
      {value}
    </span>
  );
}

function InskickadeFelanmalningar({ contact }: { contact: Contact }) {
  const email = normalizeEmail(contact.email);
  const phone = normalizePhoneDigits(contact.phone);
  const hasKeys = !!(email || phone);

  const { data, isLoading, error } = useQuery({
    queryKey: ["contact-submitted-issues", contact.id, email, phone],
    enabled: hasKeys,
    queryFn: async () => {
      // Matchningen är heuristisk (normaliserad e-post/telefon, se
      // contact-tokens.ts) och kan inte uttryckas i SQL utan att duplicera
      // normaliseringen — hämta ärendena som har någon anmälaruppgift alls
      // och matcha klient-side.
      const { data, error } = await supabase
        .from("issues")
        .select(
          "id, title, status, priority, created_at, deadline, property_id, reporter_email, reporter_phone",
        )
        .or("reporter_email.not.is.null,reporter_phone.not.is.null");
      if (error) throw error;
      return (data ?? []) as unknown as SubmittedIssueRow[];
    },
  });

  const matched = useMemo(() => {
    if (!data) return [];
    return data
      .flatMap((r) => {
        const emailMatch = !!email && normalizeEmail(r.reporter_email) === email;
        const phoneMatch = !!phone && normalizePhoneDigits(r.reporter_phone) === phone;
        if (!emailMatch && !phoneMatch) return [];
        return [{ row: r, emailMatch, phoneMatch, status: deriveIssueStatus(r) }];
      })
      .sort((a, b) => (b.row.created_at ?? "").localeCompare(a.row.created_at ?? ""));
  }, [data, email, phone]);

  return (
    <section style={sectionCard}>
      <h2 style={sectionTitle}>Inskickade felanmälningar</h2>
      <div style={sectionNote}>
        Felanmälningar vars anmälare matchar kontaktens e-post eller telefon.
      </div>
      {!hasKeys && (
        <div style={{ color: C.secondary, fontSize: 14 }}>
          Kontakten har varken e-post eller telefon att matcha mot.
        </div>
      )}
      {hasKeys && isLoading && <div style={{ color: C.secondary, fontSize: 14 }}>Laddar…</div>}
      {hasKeys && !!error && (
        <div style={{ color: C.error, fontSize: 14 }}>Kunde inte hämta felanmälningar.</div>
      )}
      {hasKeys && !isLoading && !error && matched.length === 0 && (
        <div style={{ color: C.secondary, fontSize: 14 }}>Inga matchande felanmälningar.</div>
      )}
      {matched.map((m) => (
        <ArendeRow
          key={m.row.id}
          item={{
            kind: "issue",
            id: m.row.id,
            title: m.row.title?.trim() || "Felanmälan",
            status: m.status,
            createdAt: m.row.created_at,
            propertyId: m.row.property_id,
          }}
          dateLabel="Inskickad"
          chips={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {m.row.reporter_email && (
                <ReporterChip value={m.row.reporter_email} matched={m.emailMatch} />
              )}
              {m.row.reporter_phone && (
                <ReporterChip value={m.row.reporter_phone} matched={m.phoneMatch} />
              )}
            </div>
          }
        />
      ))}
    </section>
  );
}
