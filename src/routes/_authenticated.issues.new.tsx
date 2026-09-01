import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { FileDropzone } from "@/components/FileDropzone";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { ISSUE_CATEGORIES, derivePriority } from "@/lib/issue-tokens";
import { AnsvarigDropdown } from "@/components/AnsvarigDropdown";
import { gateEntreprenorEmail, notifyEntreprenorAboutIssue } from "@/lib/entreprenor-notify";
import { ObjectDropdown } from "@/components/ObjectDropdown";
import { ChevronSelect } from "@/components/ChevronSelect";
import { DerivedPriorityField } from "@/components/DerivedPriorityField";
import { sanitizeStorageName } from "@/lib/storage";

export const Route = createFileRoute("/_authenticated/issues/new")({
  head: () => ({ meta: [{ title: "Ny felanmälan — BAYT" }] }),
  component: NewIssuePage,
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
  maxWidth: "100%",
  minWidth: 0,
  height: 40,
  padding: "0 12px",
  border: `1px solid ${C.border}`,
  borderRadius: 8,
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

export function NewIssuePage({ initialPropertyId, lockProperty }: { initialPropertyId?: string; lockProperty?: boolean } = {}) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const [propertyId, setPropertyId] = useState(initialPropertyId ?? "");
  const [apartmentId, setApartmentId] = useState("");
  const [propertyObjectId, setPropertyObjectId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [cause, setCause] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [deadline, setDeadline] = useState<string>("");
  const [reporterName, setReporterName] = useState("");
  const [reporterPhone, setReporterPhone] = useState("");
  const [reporterEmail, setReporterEmail] = useState("");
  const [trappa, setTrappa] = useState("");
  const [assignedContactId, setAssignedContactId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apartmentWarn, setApartmentWarn] = useState(false);

  const { data: properties = [] } = useQuery({
    queryKey: ["properties-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  const { data: apartments = [] } = useQuery({
    queryKey: ["apartments-for-property", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("apartments")
        // trappa included to match the other users of this cache key — the five
        // ["apartments-for-property"] queries must select identical columns or
        // whichever runs first starves the others of trappa.
        .select("id, apartment_number, trappa")
        .eq("property_id", propertyId)
        .order("apartment_number");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; apartment_number: string; trappa: string | null }>;
    },
  });

  // Prioritet väljs inte — deadline sätter den. Räknas från idag eftersom
  // ärendet skapas nu, dvs. samma frist som created_at kommer att ge.
  const derivedPriority = derivePriority(deadline || null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Anmälaruppgifter är frivilliga här — bara det publika /felanmalan-formuläret
    // kräver namn och telefon. Admin skapar ofta ärenden utan en boende bakom sig.
    if (!propertyId || !title.trim() || !user) {
      setError("Fastighet och rubrik krävs");
      return;
    }
    // Tilldelas en entreprenör redan här mejlas ärendet ut till hen så fort
    // det är skapat — så adressen bekräftas innan något skrivs. Backar admin
    // ur rutan skapas ingen felanmälan alls: hade den skapats tilldelad utan
    // utskick hade nästa sparning inte frågat igen (grinden i issues/$id
    // reagerar bara på ett *byte* av entreprenör).
    let gateEmail: string | null = null;
    let gateName: string | null = null;
    if (profile?.role === "admin" && assignedContactId) {
      try {
        const gate = await gateEntreprenorEmail({
          contactId: assignedContactId,
          qc,
          arendeTitle: title.trim(),
          confirmLabel: "Skicka och spara",
        });
        if (!gate.ok) {
          setError("Ingenting sparades — entreprenören tilldelades inte.");
          return;
        }
        gateEmail = gate.email;
        gateName = gate.name;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Kunde inte spara e-postadressen.");
        return;
      }
    }
    setSaving(true);
    try {
      const combinedDescription = [
        cause.trim() ? `Orsak: ${cause.trim()}` : "",
        description.trim(),
      ].filter(Boolean).join("\n\n") || null;
      const { data: inserted, error: insertErr } = await supabase
        .from("issues")
        .insert({
          property_id: propertyId,
          apartment_id: apartmentId || null,
          property_object_id: propertyObjectId,
          title: title.trim(),
          description: combinedDescription,
          category: category.trim() || null,
          priority: derivedPriority.key,
          status: "ny",
          deadline: deadline || null,
          reporter_name: reporterName.trim() || null,
          reporter_phone: reporterPhone.trim() || null,
          reporter_email: reporterEmail.trim() || null,
          trappa: trappa.trim() || null,
          assigned_contact_id: assignedContactId,
          submission_source: "admin",
          created_by: user.id,
        } as any)
        .select("id")
        .single();
      if (insertErr) throw insertErr;
      const issueId = inserted!.id as string;

      // auto-log
      try {
        const { logEvent } = await import("@/lib/logbook");
        await logEvent({
          event_type: "felanmalan_mottagen",
          property_id: propertyId,
          apartment_id: apartmentId || null,
          description: title.trim(),
          created_by: user.id,
        });
      } catch {}

      // The felanmälan is already created at this point — a file that fails
      // must be reported, not swallowed, but it doesn't undo the save.
      const fileFailures: string[] = [];
      for (const file of files) {
        const path = `issues/${issueId}/${Date.now()}-${sanitizeStorageName(file.name)}`;
        const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
        if (upErr) { fileFailures.push(`${file.name}: ${upErr.message}`); continue; }
        const { data: pub } = supabase.storage.from("documents").getPublicUrl(path);
        const { error: imgErr } = await supabase.from("issue_images").insert({
          issue_id: issueId,
          url: pub.publicUrl,
          uploaded_by: user.id,
        });
        if (imgErr) fileFailures.push(`${file.name}: ${imgErr.message}`);
      }

      // Ärendet finns nu — utskicket speglar det som faktiskt sparades. Ett
      // misslyckat mejl ångrar inte felanmälan; det rapporteras.
      let mailedTo: string | null = null;
      let mailError: string | null = null;
      if (gateEmail) {
        try {
          await notifyEntreprenorAboutIssue({
            issueId,
            propertyId,
            apartmentId: apartmentId || null,
            propertyObjectId,
            title: title.trim(),
            contactName: gateName ?? "entreprenören",
            email: gateEmail,
            createdBy: user.id,
          });
          mailedTo = gateEmail;
        } catch (err) {
          mailError = err instanceof Error ? err.message : "E-posten kunde inte skickas.";
        }
      }

      const problems: string[] = [];
      if (fileFailures.length) {
        problems.push(`${fileFailures.length === 1 ? "en fil" : `${fileFailures.length} filer`} kunde inte laddas upp: ${fileFailures.join("; ")}`);
      }
      if (mailError) problems.push(mailError);
      if (problems.length) {
        toast.error(`Felanmälan skapades, men ${problems.join(" ")}`);
      } else if (mailedTo) {
        toast.success(`Sparat! Ärendet skickades till ${mailedTo}.`, { style: { background: "#3D8A30", color: "#fff" } });
      } else {
        toast.success("Sparat!", { style: { background: "#3D8A30", color: "#fff" } });
      }
      navigate({ to: "/issues/$id", params: { id: issueId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara");
      setSaving(false);
    }
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: isMobile ? 16 : 32, boxSizing: "border-box", width: "100%", overflowX: "hidden" }}>
      <Link
        to="/issues"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.secondary, textDecoration: "none", fontSize: 14, marginBottom: 16 }}
      >
        <ArrowLeft size={18} /> Tillbaka
      </Link>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: "0 0 24px" }}>Ny felanmälan</h1>

      <form
        onSubmit={onSubmit}
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: 24,
          maxWidth: 720,
          width: "100%",
          boxSizing: "border-box",
          display: "grid",
          gap: 16,
          minWidth: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <label style={labelStyle}>Fastighet *</label>
          <ChevronSelect style={inputStyle} value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setApartmentId(""); setPropertyObjectId(null); }} required>
            <option value="">Välj fastighet</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </ChevronSelect>
        </div>
        <ObjectDropdown propertyId={propertyId} value={propertyObjectId} onChange={setPropertyObjectId} />
        <div style={{ minWidth: 0 }}>
          <label style={labelStyle}>Lägenhet</label>
          <div onMouseDown={() => { if (!propertyId) setApartmentWarn(true); }}>
            <ChevronSelect
              style={inputStyle}
              value={apartmentId}
              onChange={(e) => setApartmentId(e.target.value)}
              disabled={!propertyId}
            >
              <option value="">{propertyId ? "Välj lägenhet" : "Välj fastighet först"}</option>
              {apartments.map((a) => (
                <option key={a.id} value={a.id}>Lgh {a.apartment_number}</option>
              ))}
            </ChevronSelect>
          </div>
          {!propertyId && apartmentWarn && (
            <div style={{ color: "#DC2626", fontSize: 13, marginTop: 6 }}>Välj en fastighet först</div>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <label style={labelStyle}>Rubrik *</label>
          <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div style={{ minWidth: 0 }}>
          <label style={labelStyle}>Orsak / fri text</label>
          <input style={inputStyle} value={cause} onChange={(e) => setCause(e.target.value)} placeholder="Kort orsak…" />
        </div>
        <div style={{ minWidth: 0 }}>
          <label style={labelStyle}>Beskrivning / fritext</label>
          <textarea style={textareaStyle} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div style={{ minWidth: 0 }}>
          <label style={labelStyle}>Kategori</label>
          <ChevronSelect style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Välj kategori</option>
            {ISSUE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </ChevronSelect>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            <label style={labelStyle}>Deadline</label>
            <input type="date" style={inputStyle} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          <DerivedPriorityField priority={derivedPriority} labelStyle={labelStyle} reasonColor={C.secondary} />
        </div>
        <AnsvarigDropdown value={assignedContactId} onChange={setAssignedContactId} />
        <div style={{ minWidth: 0 }}>
          <label style={labelStyle}>Filer</label>
          <FileDropzone
            files={files}
            onAdd={(picked) => setFiles((prev) => [...prev, ...picked])}
            onRemove={(i) => setFiles((prev) => prev.filter((_, k) => k !== i))}
          />
        </div>

        <div
          style={{
            borderTop: `1px solid ${C.border}`,
            marginTop: 4,
            paddingTop: 20,
            display: "grid",
            gap: 16,
            minWidth: 0,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Anmälare</div>
          <div style={{ fontSize: 13, color: C.secondary, marginTop: -8 }}>
            Frivilligt — fyll i om ärendet kommer från en boende.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, minWidth: 0 }}>
            <div style={{ minWidth: 0 }}>
              <label style={labelStyle}>Namn</label>
              <input style={inputStyle} value={reporterName} onChange={(e) => setReporterName(e.target.value)} />
            </div>
            <div style={{ minWidth: 0 }}>
              <label style={labelStyle}>Telefonnummer</label>
              <input type="tel" style={inputStyle} value={reporterPhone} onChange={(e) => setReporterPhone(e.target.value)} />
            </div>
          </div>
          <div style={{ minWidth: 0 }}>
            <label style={labelStyle}>E-post</label>
            <input type="email" style={inputStyle} value={reporterEmail} onChange={(e) => setReporterEmail(e.target.value)} />
          </div>
          <div style={{ minWidth: 0 }}>
            <label style={labelStyle}>Trappa / lägenhetsnummer (fritext)</label>
            <input style={inputStyle} value={trappa} onChange={(e) => setTrappa(e.target.value)} placeholder="Används om ingen registrerad lägenhet valts" />
          </div>
        </div>

        {error && <div style={{ color: C.error, fontSize: 14 }}>{error}</div>}

        <div style={{ display: "flex", gap: 12 }}>
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
            {saving ? "Sparar…" : "Spara"}
          </button>
          <Link
            to="/issues"
            style={{
              height: 44,
              display: "inline-flex",
              alignItems: "center",
              padding: "0 20px",
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              color: C.text,
              textDecoration: "none",
              fontSize: 15,
            }}
          >
            Avbryt
          </Link>
        </div>
      </form>
    </div>
  );
}
