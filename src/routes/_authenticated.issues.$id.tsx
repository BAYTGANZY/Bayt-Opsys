import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Upload } from "lucide-react";
import { FileDropzone } from "@/components/FileDropzone";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  ISSUE_CATEGORIES,
  deriveIssueStatus,
  derivePriority,
} from "@/lib/issue-tokens";
import { DerivedPriorityField } from "@/components/DerivedPriorityField";
import { sanitizeStorageName, useSignedFileUrls } from "@/lib/storage";
import { OppnaArendeButton } from "@/components/OppnaArendeButton";
import { AvslutaArendeButton } from "@/components/AvslutaArendeButton";
import { AnsvarigDropdown } from "@/components/AnsvarigDropdown";
import { gateEntreprenorEmail, notifyEntreprenorAboutIssue } from "@/lib/entreprenor-notify";
import { ObjectDropdown } from "@/components/ObjectDropdown";
import { ObjectInfoCard } from "@/components/ObjectInfoCard";
import { DeleteButton } from "@/components/DeleteButton";
import { useRecordScopeGuard } from "@/hooks/useRecordScopeGuard";

export const Route = createFileRoute("/_authenticated/issues/$id")({
  head: () => ({ meta: [{ title: "Felanmälan — BAYT" }] }),
  component: IssueDetailPage,
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
  minHeight: 80,
  padding: 12,
  resize: "vertical",
  fontFamily: "inherit",
};

type Issue = {
  id: string;
  property_id: string | null;
  apartment_id: string | null;
  property_object_id: string | null;
  title: string;
  description: string | null;
  category: string | null;
  priority: string;
  status: string;
  deadline: string | null;
  assigned_to: string | null;
  assigned_contact_id: string | null;
  reporter_name: string | null;
  reporter_phone: string | null;
  reporter_email: string | null;
  trappa: string | null;
  submission_source: string | null;
  created_by: string | null;
  created_at: string;
  properties: { name: string | null } | null;
};

/**
 * Vad en sparning slutade med. `cancelled` är inte ett fel: admin backade ur
 * bekräftelserutan för utskicket, och då skrivs ingenting alls — tilldelning
 * och utskick hör ihop.
 */
type SaveOutcome = {
  failures: string[];
  cancelled: boolean;
  /** Adressen ärendet mejlades till, om en entreprenör tilldelades i denna sparning. */
  mailedTo: string | null;
  mailError: string | null;
};

export function IssueDetailPage({ idOverride }: { idOverride?: string } = {}) {
  const params = useParams({ strict: false }) as { id?: string };
  const id = idOverride ?? params.id!;
  // Embedded = rendered inside PropertyShell (property-scoped route). That shell
  // already provides the back link, breadcrumb, building header and outer card,
  // so we drop our own duplicate chrome and let the fields flow into that card.
  const embedded = !!idOverride;
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, profile } = useAuth();

  const issueQ = useQuery({
    queryKey: ["issue", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("issues")
        .select("id, property_id, apartment_id, property_object_id, title, description, category, priority, status, deadline, assigned_to, assigned_contact_id, reporter_name, reporter_phone, reporter_email, trappa, submission_source, created_by, created_at, properties(name)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as unknown as Issue;
    },
  });

  // Reachable by URL — make sure this role is actually scoped to this errand.
  // `undefined` until the row is actually in hand: a read that failed must not
  // masquerade as "assigned to nobody" and evict the entreprenör it belongs to.
  // No redirectTo — the guard sends each role to its own home page.
  useRecordScopeGuard({
    propertyId: issueQ.data?.property_id,
    assignedContactId: issueQ.data ? (issueQ.data.assigned_contact_id ?? null) : undefined,
    loading: issueQ.isLoading,
  });

  const imagesQ = useQuery({
    queryKey: ["issue-images", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("issue_images")
        .select("id, url, created_at")
        .eq("issue_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Stored image URLs are getPublicUrl() links into the private "documents"
  // bucket — render them through signed URLs or the thumbnails 400 for everyone.
  const resolveFileUrl = useSignedFileUrls(
    ((imagesQ.data ?? []) as Array<{ url: string }>).map((i) => i.url),
  );

  const commentsQ = useQuery({
    queryKey: ["issue-comments", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("issue_comments")
        .select("id, content, created_at, profiles:created_by(full_name)")
        .eq("issue_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        content: string;
        created_at: string;
        profiles: { full_name: string | null } | null;
      }>;
    },
  });

  const assigneesQ = useQuery({
    queryKey: ["assignable-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("role", ["admin", "entreprenor"]);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; full_name: string | null; role: string | null }>;
    },
  });

  const propertiesQ = useQuery({
    queryKey: ["properties-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  const [title, setTitle] = useState("");
  const [cause, setCause] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  // Ingen priority-state: prioritet är härledd ur deadline (derivePriority).
  const [status, setStatus] = useState("ny");
  const [deadline, setDeadline] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [assignedContactId, setAssignedContactId] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState("");
  const [apartmentId, setApartmentId] = useState("");
  const [propertyObjectId, setPropertyObjectId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

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

  useEffect(() => {
    if (!issueQ.data) return;
    const i = issueQ.data;
    setTitle(i.title ?? "");
    const raw = i.description ?? "";
    const m = raw.match(/^Orsak:\s*(.*?)(?:\n\n([\s\S]*))?$/);
    if (m) { setCause(m[1] ?? ""); setDescription(m[2] ?? ""); }
    else { setCause(""); setDescription(raw); }
    setCategory(i.category ?? "");
    setStatus(i.status ?? "ny");
    setDeadline(i.deadline ?? "");
    setAssignedTo(i.assigned_to ?? "");
    setAssignedContactId(i.assigned_contact_id ?? null);
    setPropertyId(i.property_id ?? "");
    setApartmentId(i.apartment_id ?? "");
    setPropertyObjectId(i.property_object_id ?? null);
  }, [issueQ.data]);

  useEffect(() => {
    if (!id) return;
    void supabase.from("issues").update({ viewed_at: new Date().toISOString() }).eq("id", id).is("viewed_at", null);
  }, [id]);

  // Shared by "Ladda upp" and "Spara ändringar": uploads what's picked, prunes
  // the successfully uploaded files out of state (so a retry never re-uploads
  // them) and returns what failed so the caller can report it. A failure keeps
  // its chip in the dropzone list so nothing is silently dropped.
  const uploadPendingFiles = async (): Promise<{ uploaded: number; failures: string[] }> => {
    let uploaded = 0;
    const failures: string[] = [];
    const failedNames = new Set<string>();
    for (const file of files) {
      const path = `issues/${id}/${Date.now()}-${sanitizeStorageName(file.name)}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
      if (upErr) { failures.push(`${file.name}: ${upErr.message}`); failedNames.add(file.name); continue; }
      const { data: pub } = supabase.storage.from("documents").getPublicUrl(path);
      const { error: insErr } = await supabase.from("issue_images").insert({
        issue_id: id, url: pub.publicUrl, uploaded_by: user!.id,
      });
      if (insErr) { failures.push(`${file.name}: ${insErr.message}`); failedNames.add(file.name); continue; }
      uploaded++;
    }
    setFiles((cur) => cur.filter((f) => failedNames.has(f.name)));
    if (uploaded > 0) qc.invalidateQueries({ queryKey: ["issue-images", id] });
    return { uploaded, failures };
  };

  const save = useMutation({
    mutationFn: async (): Promise<SaveOutcome> => {
      const idle: SaveOutcome = { failures: [], cancelled: false, mailedTo: null, mailError: null };
      if (!issueQ.data || !user) return idle;

      // Att tilldela en entreprenör är också att mejla ut ärendet till hen.
      // Frågan om adressen ställs FÖRE skrivningen: säger admin nej ska ingen
      // tilldelning bli kvar heller, annars hade ärendet stått som tilldelat
      // utan att någon fått veta det — och nästa sparning hade inte frågat
      // igen, eftersom grinden bara reagerar på ett byte av entreprenör.
      const previousContactId = issueQ.data.assigned_contact_id ?? null;
      const notifyContactId =
        profile?.role === "admin" && assignedContactId && assignedContactId !== previousContactId
          ? assignedContactId
          : null;
      let gateEmail: string | null = null;
      let gateName: string | null = null;
      if (notifyContactId) {
        const gate = await gateEntreprenorEmail({
          contactId: notifyContactId,
          qc,
          arendeTitle: title || issueQ.data.title,
          confirmLabel: "Skicka och spara",
        });
        if (!gate.ok) return { ...idle, cancelled: true };
        gateEmail = gate.email;
        gateName = gate.name;
      }

      // Picked-but-not-uploaded files ride along with the save — before this,
      // "Spara ändringar" silently ignored them.
      const upload = files.length
        ? await uploadPendingFiles()
        : { uploaded: 0, failures: [] as string[] };
      const combined = [
        cause.trim() ? `Orsak: ${cause.trim()}` : "",
        description.trim(),
      ].filter(Boolean).join("\n\n") || null;
      // `status` is deliberately absent: it is derived (see deriveIssueStatus)
      // and the lifecycle column is only written by Öppna-/Avsluta-ärende.
      // `priority` on the other hand IS written — but never picked: it falls out
      // of the deadline, so editing the deadline re-stamps it (derivePriority).
      const { data: updated, error } = await supabase.from("issues").update({
        title,
        description: combined,
        category: category || null,
        priority: derivePriority(deadline || null, { from: issueQ.data.created_at }).key,
        deadline: deadline || null,
        assigned_to: assignedTo || null,
        assigned_contact_id: assignedContactId,
        property_id: propertyId || null,
        apartment_id: apartmentId || null,
        property_object_id: propertyObjectId,
      } as any).eq("id", id).select("id");
      if (error) throw error;
      // An UPDATE that RLS filters away is a 200 with zero rows — without this
      // check the toast says "Sparat!" over an untouched row.
      if (!updated?.length) throw new Error("Du saknar behörighet att ändra denna felanmälan.");

      // Utskicket sker efter skrivningen — mejlet innehåller ärendets
      // uppgifter och ska spegla det som faktiskt sparades. Ett misslyckat
      // utskick rullar inte tillbaka sparningen; det rapporteras i toasten.
      let mailedTo: string | null = null;
      let mailError: string | null = null;
      if (notifyContactId && gateEmail) {
        try {
          await notifyEntreprenorAboutIssue({
            issueId: id,
            propertyId: propertyId || null,
            apartmentId: apartmentId || null,
            propertyObjectId,
            title: title || issueQ.data.title,
            contactName: gateName ?? "entreprenören",
            email: gateEmail,
            createdBy: user.id,
          });
          mailedTo = gateEmail;
        } catch (e) {
          mailError = e instanceof Error ? e.message : "E-posten kunde inte skickas.";
        }
      }
      return { failures: upload.failures, cancelled: false, mailedTo, mailError };
    },
    onSuccess: ({ failures, cancelled, mailedTo, mailError }) => {
      if (cancelled) {
        toast.error("Ingenting sparades — entreprenören tilldelades inte.");
        return;
      }
      const problems: string[] = [];
      if (failures.length) {
        problems.push(`${failures.length === 1 ? "en fil" : `${failures.length} filer`} kunde inte laddas upp: ${failures.join("; ")}`);
      }
      if (mailError) problems.push(mailError);
      if (problems.length) {
        toast.error(`Ändringarna sparades, men ${problems.join(" ")}`);
      } else if (mailedTo) {
        toast.success(`Sparat! Ärendet skickades till ${mailedTo}.`, { style: { background: "#3D8A30", color: "#fff" } });
      } else {
        toast.success("Sparat!", { style: { background: "#3D8A30", color: "#fff" } });
      }
      qc.invalidateQueries({ queryKey: ["issue", id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Kunde inte spara"),
  });

  const handleUpload = async () => {
    if (!files.length || !user) return;
    setUploading(true);
    try {
      const { uploaded, failures } = await uploadPendingFiles();
      if (failures.length) {
        toast.error(
          uploaded > 0
            ? `${uploaded} av ${uploaded + failures.length} filer laddades upp. Misslyckades: ${failures.join("; ")}`
            : `Uppladdningen misslyckades: ${failures.join("; ")}`,
        );
      } else {
        toast.success("Uppladdat!", { style: { background: "#3D8A30", color: "#fff" } });
      }
    } finally {
      setUploading(false);
    }
  };

  const [comment, setComment] = useState("");
  const commentMut = useMutation({
    mutationFn: async () => {
      if (!user || !comment.trim()) return;
      const { error } = await supabase.from("issue_comments").insert({
        issue_id: id, content: comment.trim(), created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setComment("");
      qc.invalidateQueries({ queryKey: ["issue-comments", id] });
    },
  });

  const fmt = new Intl.DateTimeFormat("sv-SE", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });

  if (issueQ.isLoading) return <div style={{ padding: 32, color: C.secondary }}>Laddar…</div>;
  if (issueQ.error || !issueQ.data) return <div style={{ padding: 32, color: C.error }}>Felanmälan hittades inte</div>;
  const issue = issueQ.data;

  // Prioritet and status are both read, never chosen — and both fall out of the
  // deadline currently in the form, so the two badges react live while it is
  // being edited. Prioritet is the width of the window measured from skapad;
  // that the window is closing is what status says.
  const derivedPriority = derivePriority(deadline || null, { from: issue.created_at });
  const derived = deriveIssueStatus({
    status,
    priority: derivedPriority.key,
    created_at: issue.created_at,
    deadline: deadline || null,
  });

  const card: React.CSSProperties = {
    background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 24,
    minWidth: 0, boxSizing: "border-box",
  };

  return (
    <div style={{ background: embedded ? "transparent" : C.bg, minHeight: embedded ? undefined : "100vh", padding: embedded ? 0 : (isMobile ? 16 : 32), width: "100%", boxSizing: "border-box", overflowX: "hidden" }}>
      {!embedded && (
        <Link to="/issues" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.secondary, textDecoration: "none", fontSize: 14, marginBottom: 16 }}>
          <ArrowLeft size={18} /> Tillbaka till felanmälningar
        </Link>
      )}
      <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>{issue.title}</h1>
      <div style={{ fontSize: 13, color: C.secondary, marginBottom: 16 }}>{issue.properties?.name ?? "—"}</div>
      <div style={{ marginBottom: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <OppnaArendeButton
          kind="issue"
          id={id}
          currentStatus={status}
          title={title || issue.title}
          propertyId={propertyId || null}
          apartmentId={issue.apartment_id}
          invalidateKeys={[["issue", id]]}
        />
        <AvslutaArendeButton
          kind="issue"
          id={id}
          currentStatus={status}
          title={title || issue.title}
          propertyId={propertyId || null}
          apartmentId={issue.apartment_id}
          invalidateKeys={[["issue", id]]}
        />
      </div>


      <div style={{ display: "grid", gridTemplateColumns: embedded || isMobile ? "1fr" : "2fr 1fr", gap: 16, minWidth: 0 }}>
        <div style={{ ...(embedded ? { minWidth: 0 } : card), display: "grid", gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <label style={labelStyle}>Rubrik</label>
            <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div style={{ minWidth: 0 }}>
            <label style={labelStyle}>Fastighet</label>
            <select style={inputStyle} value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setApartmentId(""); }}>
              <option value="">—</option>
              {(propertiesQ.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 0 }}>
            <label style={labelStyle}>Lägenhet</label>
            <select style={inputStyle} value={apartmentId} onChange={(e) => setApartmentId(e.target.value)} disabled={!propertyId}>
              <option value="">—</option>
              {apartments.map((a) => (
                <option key={a.id} value={a.id}>Lgh {a.apartment_number}</option>
              ))}
            </select>
          </div>
          <ObjectDropdown propertyId={propertyId} value={propertyObjectId} onChange={setPropertyObjectId} />
          <ObjectInfoCard objectId={propertyObjectId} />
          <div style={{ minWidth: 0 }}>
            <label style={labelStyle}>Orsak / fri text</label>
            <input style={inputStyle} value={cause} onChange={(e) => setCause(e.target.value)} placeholder="Kort orsak…" />
          </div>
          <div style={{ minWidth: 0 }}>
            <label style={labelStyle}>Beskrivning / fritext</label>
            <textarea style={textareaStyle} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, minWidth: 0 }}>
            <div style={{ minWidth: 0 }}>
              <label style={labelStyle}>Kategori</label>
              <select style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Välj kategori</option>
                {ISSUE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ minWidth: 0 }}>
              <label style={labelStyle}>Skapad</label>
              <div style={{ fontSize: 14, color: C.text, lineHeight: "40px" }}>{fmt.format(new Date(issue.created_at))}</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, minWidth: 0 }}>
            <DerivedPriorityField priority={derivedPriority} labelStyle={labelStyle} reasonColor={C.secondary} />
            <div style={{ minWidth: 0 }}>
              <label style={labelStyle}>Status (härledd)</label>
              <div style={{ display: "flex", alignItems: "center", minHeight: 40 }}>
                <span
                  style={{
                    background: derived.bg,
                    color: derived.color,
                    padding: "6px 12px",
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {derived.label}
                </span>
              </div>
              <div style={{ fontSize: 12, color: C.secondary, marginTop: 6, lineHeight: 1.4 }}>
                {derived.reason}
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, minWidth: 0 }}>
            <div style={{ minWidth: 0 }}>
              <label style={labelStyle}>Deadline</label>
              <input type="date" style={inputStyle} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
            <div style={{ minWidth: 0 }}>
              <label style={labelStyle}>Tilldelad till</label>
              <select style={inputStyle} value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="">Ej tilldelad</option>
                {(assigneesQ.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name ?? "(namn saknas)"}</option>
                ))}
              </select>
            </div>
          </div>

          <AnsvarigDropdown value={assignedContactId} onChange={setAssignedContactId} />

          {(issue.reporter_name || issue.reporter_phone || issue.reporter_email || issue.trappa) && (
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, display: "grid", gap: 4, minWidth: 0, overflowWrap: "anywhere" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>
                Anmälare
                {issue.submission_source === "public_form" && (
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: "#3D8A30", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Inkommen via felanmälningslänk
                  </span>
                )}
              </div>
              {issue.reporter_name && <div style={{ fontSize: 14, color: C.text }}>{issue.reporter_name}</div>}
              {issue.reporter_phone && <div style={{ fontSize: 14, color: C.secondary }}>{issue.reporter_phone}</div>}
              {issue.reporter_email && <div style={{ fontSize: 14, color: C.secondary }}>{issue.reporter_email}</div>}
              {issue.trappa && <div style={{ fontSize: 14, color: C.secondary }}>Trappa/lgh: {issue.trappa}</div>}
            </div>
          )}

          <div style={{ display: "flex", gap: 12, alignItems: "center", justifySelf: "start", flexWrap: "wrap" }}>
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              style={{
                height: 44, background: C.primary, color: "#fff", border: "none",
                borderRadius: 6, padding: "0 20px", fontSize: 15, fontWeight: 600,
                cursor: save.isPending ? "not-allowed" : "pointer", opacity: save.isPending ? 0.7 : 1,
              }}
            >
              {save.isPending ? "Sparar…" : "Spara ändringar"}
            </button>
            <DeleteButton
              table="issues"
              id={id}
              label={issue.title ?? "felanmälan"}
              variant="full"
              invalidateKeys={[["issues"], ["dag-rapport"], ["oppna-arenden"]]}
              onDeleted={() => navigate({ to: "/issues" })}
            />
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={labelStyle}>Bilder & filer</div>
            {imagesQ.data && imagesQ.data.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8, marginBottom: 12 }}>
                {imagesQ.data.map((img: any) => (
                  <a key={img.id} href={resolveFileUrl(img.url)} target="_blank" rel="noreferrer">
                    <img src={resolveFileUrl(img.url)} alt="" style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 6, border: `1px solid ${C.border}` }} />
                  </a>
                ))}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
              <FileDropzone
                files={files}
                onAdd={(picked) => setFiles((prev) => [...prev, ...picked])}
                onRemove={(i) => setFiles((prev) => prev.filter((_, k) => k !== i))}
              />
              <button
                onClick={handleUpload}
                disabled={!files.length || uploading}
                style={{
                  height: 40, background: C.primary, color: "#fff", border: "none",
                  borderRadius: 6, padding: "0 16px", fontSize: 14, fontWeight: 600,
                  cursor: !files.length || uploading ? "not-allowed" : "pointer",
                  opacity: !files.length || uploading ? 0.6 : 1,
                  display: "inline-flex", alignItems: "center", gap: 6,
                  alignSelf: "flex-start",
                }}
              >
                <Upload size={18} /> {uploading ? "Laddar upp…" : "Ladda upp"}
              </button>
            </div>
          </div>
        </div>

        <div style={{ ...(embedded ? { borderTop: `1px solid ${C.border}`, paddingTop: 16, minWidth: 0 } : card), display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Kommentarer</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: 480, overflowY: "auto" }}>
            {(commentsQ.data ?? []).length === 0 && <div style={{ fontSize: 14, color: C.secondary }}>Inga kommentarer ännu</div>}
            {(commentsQ.data ?? []).map((c) => (
              <div key={c.id} style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{c.profiles?.full_name ?? "Okänd"}</span>
                  <span style={{ fontSize: 12, color: C.secondary }}>{fmt.format(new Date(c.created_at))}</span>
                </div>
                <div style={{ fontSize: 14, color: C.text, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{c.content}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <textarea style={textareaStyle} placeholder="Skriv en kommentar…" value={comment} onChange={(e) => setComment(e.target.value)} />
            <button
              onClick={() => commentMut.mutate()}
              disabled={!comment.trim() || commentMut.isPending}
              style={{
                height: 40, background: C.primary, color: "#fff", border: "none",
                borderRadius: 6, padding: "0 16px", fontSize: 14, fontWeight: 600,
                cursor: !comment.trim() || commentMut.isPending ? "not-allowed" : "pointer",
                opacity: !comment.trim() || commentMut.isPending ? 0.6 : 1,
                alignSelf: "flex-end",
              }}
            >
              {commentMut.isPending ? "Skickar…" : "Skicka"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
