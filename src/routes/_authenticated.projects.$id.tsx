import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Upload, FileText, X } from "lucide-react";
import { FileDropzone } from "@/components/FileDropzone";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { ImageLightbox } from "@/components/ImageLightbox";
import { OppnaArendeButton } from "@/components/OppnaArendeButton";
import { AvslutaArendeButton } from "@/components/AvslutaArendeButton";
import { AnsvarigDropdown } from "@/components/AnsvarigDropdown";
import { ObjectDropdown } from "@/components/ObjectDropdown";
import { ObjectInfoCard } from "@/components/ObjectInfoCard";
import { DeleteButton } from "@/components/DeleteButton";
import { ProjektStatusButtons } from "@/components/ProjektStatusButtons";
import { ContractorBox } from "@/components/ContractorBox";
import { EntreprenorView } from "@/components/EntreprenorView";
import { DerivedStatusField } from "@/components/DerivedStatusBadge";
import { DerivedPriorityField } from "@/components/DerivedPriorityField";
import { deriveProjectStatus, derivePriorityFromStatus } from "@/lib/issue-tokens";
import { gateEntreprenorEmail, notifyEntreprenorAboutArende } from "@/lib/entreprenor-notify";
import { useRecordScopeGuard } from "@/hooks/useRecordScopeGuard";
import { isEntreprenor, isStyrelse } from "@/lib/permissions";
import { sanitizeStorageName, useSignedFileUrls, storagePathFromPublicUrl } from "@/lib/storage";

export const Route = createFileRoute("/_authenticated/projects/$id")({
  head: () => ({ meta: [{ title: "Projekt — BAYT" }] }),
  component: ProjectDetailPage,
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
  minHeight: 80,
  padding: 12,
  resize: "vertical",
  fontFamily: "inherit",
};

function formatSek(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("sv-SE").format(n) + " SEK";
}

/** Filnamn ur en länk, utan tidsstämpelprefix (1792871771353-namn.pdf → namn.pdf). */
function fileNameFromUrl(url: string): string {
  try {
    const last = decodeURIComponent(url.split("?")[0].split("/").pop() ?? "");
    return last.replace(/^\d{10,}-/, "") || "Fil";
  } catch {
    return "Fil";
  }
}

function isImageUrl(url: string): boolean {
  return /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(url.split("?")[0]);
}

type Project = {
  id: string;
  property_id: string | null;
  title: string;
  description: string | null;
  status: string;
  budget: number | null;
  start_date: string | null;
  end_date: string | null;
  contractor_id: string | null;
  assigned_contact_id: string | null;
  property_object_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
  contractor_note: string | null;
  contractor_done_at: string | null;
  properties: { name: string | null } | null;
};

type ImageRow = { id: string; url: string; created_at: string };

export function ProjectDetailPage({ idOverride }: { idOverride?: string } = {}) {
  const params = useParams({ strict: false }) as { id?: string };
  const id = idOverride ?? params.id!;
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, profile } = useAuth();

  const projectQ = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, properties(name)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as unknown as Project;
    },
  });

  useRecordScopeGuard({
    propertyId: projectQ.data?.property_id,
    assignedContactId: projectQ.data
      ? ((projectQ.data as { assigned_contact_id?: string | null }).assigned_contact_id ?? null)
      : undefined,
    loading: projectQ.isLoading,
  });

  const imagesQ = useQuery({
    queryKey: ["project-images", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_images")
        .select("id, url, created_at")
        .eq("project_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const resolveFileUrl = useSignedFileUrls(
    ((imagesQ.data ?? []) as Array<{ url: string }>).map((i) => i.url),
  );

  const { data: properties = [] } = useQuery({
    queryKey: ["properties-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const [propertyId, setPropertyId] = useState("");
  const [propertyObjectId, setPropertyObjectId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [assignedContactId, setAssignedContactId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!projectQ.data) return;
    const p = projectQ.data;
    setPropertyId(p.property_id ?? "");
    setPropertyObjectId(p.property_object_id ?? null);
    setTitle(p.title ?? "");
    setDescription(p.description ?? "");
    setBudget(p.budget != null ? String(p.budget) : "");
    setStartDate(p.start_date ?? "");
    setEndDate(p.end_date ?? "");
    setAssignedContactId(p.assigned_contact_id ?? null);
  }, [projectQ.data]);

  useEffect(() => {
    if (!id) return;
    void supabase.from("projects").update({ viewed_at: new Date().toISOString() }).eq("id", id).is("viewed_at", null);
  }, [id]);

  const save = useMutation({
    mutationFn: async () => {
      const previousContactId = projectQ.data?.assigned_contact_id ?? null;
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
          arendeTitle: title,
          confirmLabel: "Skicka och spara",
        });
        if (!gate.ok) return { cancelled: true, mailedTo: null, mailError: null };
        gateEmail = gate.email;
        gateName = gate.name;
      }

      const { data: updated, error } = await supabase
        .from("projects")
        .update({
          property_id: propertyId || null,
          property_object_id: propertyObjectId,
          title,
          description: description || null,
          budget: budget ? Number(budget) : null,
          start_date: startDate || null,
          end_date: endDate || null,
          assigned_contact_id: assignedContactId,
        })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!updated?.length) throw new Error("Du saknar behörighet att ändra det här projektet.");

      let mailedTo: string | null = null;
      let mailError: string | null = null;
      if (notifyContactId && gateEmail) {
        try {
          await notifyEntreprenorAboutArende({
            kind: "project",
            id,
            propertyId: propertyId || null,
            propertyObjectId,
            title,
            contactName: gateName ?? "entreprenören",
            email: gateEmail,
            createdBy: user?.id ?? null,
          });
          mailedTo = gateEmail;
        } catch (e) {
          mailError = e instanceof Error ? e.message : "E-posten kunde inte skickas.";
        }
      }
      return { cancelled: false, mailedTo, mailError };
    },
    onSuccess: ({ cancelled, mailedTo, mailError }) => {
      if (cancelled) {
        toast.error("Ingenting sparades — entreprenören tilldelades inte.");
        return;
      }
      qc.invalidateQueries({ queryKey: ["project", id] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      setError(null);
      if (mailError) {
        toast.error(`Ändringarna sparades, men ${mailError}`);
      } else if (mailedTo) {
        toast.success(`Sparat! Projektet skickades till ${mailedTo}.`, { style: { background: "#3D8A30", color: "#fff" } });
      } else {
        toast.success("Sparat!", { style: { background: "#3D8A30", color: "#fff" } });
      }
    },
    onError: (e: any) => setError(e.message ?? "Kunde inte spara"),
  });

  const [filesList, setFilesList] = useState<File[]>([]);

  const handleUpload = async () => {
    if (!filesList.length || !user) return;
    setUploading(true);
    setError(null);
    try {
      for (const f of filesList) {
        const path = `${id}/${Date.now()}-${sanitizeStorageName(f.name)}`;
        const { error: upErr } = await supabase.storage.from("project-files").upload(path, f);
        if (upErr) throw new Error("Uppladdning misslyckades: " + upErr.message);
        const { data: pub } = supabase.storage.from("project-files").getPublicUrl(path);
        const { error: insErr } = await supabase.from("project_images").insert({
          project_id: id,
          url: pub.publicUrl,
          uploaded_by: user.id,
        });
        if (insErr) throw insErr;
      }
      qc.invalidateQueries({ queryKey: ["project-images", id] });
      setFilesList([]);
      toast.success("Sparat!", { style: { background: "#3D8A30", color: "#fff" } });
    } catch (e: any) {
      setError(e.message ?? "Uppladdning misslyckades");
    } finally {
      setUploading(false);
    }
  };

  // Ta bort en fil: raden i project_images och filen i lagringen.
  const removeFile = useMutation({
    mutationFn: async (img: ImageRow) => {
      const { data: deleted, error } = await supabase
        .from("project_images")
        .delete()
        .eq("id", img.id)
        .select("id");
      if (error) throw error;
      if (!deleted?.length) throw new Error("Du saknar behörighet att ta bort filen.");
      const parsed = storagePathFromPublicUrl(img.url);
      if (parsed) {
        // Raden är borta; misslyckas lagringen blir filen kvar men syns inte längre.
        await supabase.storage.from(parsed.bucket).remove([parsed.path]);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-images", id] });
      toast.success("Filen är borttagen", { style: { background: "#3D8A30", color: "#fff" } });
    },
    onError: (e: any) => toast.error(e.message ?? "Kunde inte ta bort filen"),
  });

  const confirmRemove = (img: ImageRow) => {
    if (window.confirm(`Ta bort "${fileNameFromUrl(img.url)}"? Det går inte att ångra.`)) {
      removeFile.mutate(img);
    }
  };

  const fmtDate = (s: string | null) =>
    s ? new Intl.DateTimeFormat("sv-SE").format(new Date(s)) : "—";

  // Entreprenör: egen vy (admins uppgifter som text, egen kommentar, filer, slutfört).
  if (isEntreprenor(profile?.role)) return <EntreprenorView kind="project" id={id} />;

  const p = projectQ.data;
  const canDelete = profile?.role === "admin";

  const derived = deriveProjectStatus({
    arende_status: (p as { arende_status?: string | null } | null)?.arende_status ?? null,
    status: p?.status ?? null,
    start_date: startDate || null,
    end_date: endDate || null,
  });
  const derivedPriority = derivePriorityFromStatus(derived, {
    from: p?.created_at ?? null,
    dueLabel: "Slutdatum",
  });

  const allFiles = (imagesQ.data ?? []) as ImageRow[];
  const imageFiles = allFiles.filter((f) => isImageUrl(f.url));
  const otherFiles = allFiles.filter((f) => !isImageUrl(f.url));

  const xButton: React.CSSProperties = {
    position: "absolute",
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: "50%",
    border: "none",
    background: "rgba(13,43,30,0.82)",
    color: "#fff",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    padding: 0,
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: isMobile ? 16 : 32 }}>
      <Link
        to="/projects"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 14,
          color: C.secondary,
          textDecoration: "none",
          marginBottom: 16,
        }}
      >
        <ArrowLeft size={18} /> Tillbaka
      </Link>

      <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>
        {p?.title ?? "Projekt"}
      </h1>
      <div style={{ fontSize: 13, color: C.secondary, marginBottom: 16 }}>
        {p?.properties?.name ?? "—"} · {fmtDate(p?.start_date ?? null)} – {fmtDate(p?.end_date ?? null)}
      </div>
      <div style={{ marginBottom: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <OppnaArendeButton
          kind="project"
          id={id}
          currentStatus={(p as { arende_status?: string | null } | null)?.arende_status ?? null}
          projektStatus={p?.status ?? null}
          title={p?.title ?? "Projekt"}
          propertyId={p?.property_id ?? null}
          invalidateKeys={[["project", id]]}
        />
        <AvslutaArendeButton
          kind="project"
          id={id}
          currentStatus={(p as { arende_status?: string | null } | null)?.arende_status ?? null}
          projektStatus={p?.status ?? null}
          title={p?.title ?? "Projekt"}
          propertyId={p?.property_id ?? null}
          invalidateKeys={[["project", id]]}
        />
        <ProjektStatusButtons
          id={id}
          arendeStatus={(p as { arende_status?: string | null } | null)?.arende_status ?? null}
          status={p?.status ?? null}
          title={p?.title ?? "Projekt"}
          propertyId={p?.property_id ?? null}
          invalidateKeys={[["project", id]]}
        />
      </div>

      <div style={{ maxWidth: 640 }}>
        <ContractorBox
          kind="project"
          id={id}
          note={p?.contractor_note}
          doneAt={p?.contractor_done_at}
        />
      </div>

      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: 24,
          maxWidth: 640,
          marginBottom: 24,
        }}
      >
        {projectQ.isLoading ? (
          <div style={{ color: C.secondary }}>Laddar…</div>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Fastighet</label>
              <select
                style={inputStyle}
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
              >
                <option value="">Välj fastighet</option>
                {(properties as Array<{ id: string; name: string }>).map((pr) => (
                  <option key={pr.id} value={pr.id}>{pr.name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <ObjectDropdown propertyId={propertyId} value={propertyObjectId} onChange={setPropertyObjectId} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <ObjectInfoCard objectId={propertyObjectId} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Titel</label>
              <input
                style={inputStyle}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Beskrivning</label>
              <textarea
                style={textareaStyle}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <DerivedStatusField status={derived} labelStyle={labelStyle} reasonColor={C.secondary} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <DerivedPriorityField priority={derivedPriority} labelStyle={labelStyle} reasonColor={C.secondary} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Budget (SEK)</label>
              <input
                style={inputStyle}
                type="number"
                min={0}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
              {p?.budget != null && (
                <div style={{ fontSize: 12, color: C.secondary, marginTop: 4 }}>
                  Nuvarande: {formatSek(p.budget)}
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Startdatum</label>
                <input
                  style={inputStyle}
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle}>Slutdatum</label>
                <input
                  style={inputStyle}
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <AnsvarigDropdown value={assignedContactId} onChange={setAssignedContactId} />
            </div>

            {error && (
              <div style={{ color: C.error, fontSize: 14, marginBottom: 16 }}>{error}</div>
            )}

            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              style={{
                width: "100%",
                height: 44,
                background: C.primary,
                color: "#ffffff",
                border: "none",
                borderRadius: 6,
                fontSize: 15,
                fontWeight: 600,
                cursor: save.isPending ? "not-allowed" : "pointer",
                opacity: save.isPending ? 0.7 : 1,
              }}
            >
              {save.isPending ? "Sparar…" : "Spara ändringar"}
            </button>
            <div style={{ marginTop: 12 }}>
              <DeleteButton
                table="projects"
                id={id}
                label="projektet"
                variant="full"
                invalidateKeys={[["projects"], ["oppna-arenden"]]}
                onDeleted={() => navigate({ to: "/projects" })}
              />
            </div>
          </>
        )}
      </div>

      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: 24,
          maxWidth: 640,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: "0 0 16px" }}>Bilder och filer</h2>

        {!isStyrelse(profile?.role) && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ ...labelStyle, marginBottom: 8 }}>Ladda upp bild eller fil</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
              <FileDropzone
                files={filesList}
                onAdd={(picked) => setFilesList((prev) => [...prev, ...picked])}
                onRemove={(i) => setFilesList((prev) => prev.filter((_, k) => k !== i))}
              />
              {filesList.length > 0 && (
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    borderRadius: 6,
                    background: C.primary,
                    color: "#ffffff",
                    border: "none",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: uploading ? "not-allowed" : "pointer",
                    opacity: uploading ? 0.7 : 1,
                    alignSelf: "flex-start",
                  }}
                >
                  <Upload size={18} />
                  {uploading ? "Laddar upp…" : "Ladda upp"}
                </button>
              )}
            </div>
          </div>
        )}

        {imagesQ.isLoading ? (
          <div style={{ color: C.secondary }}>Laddar filer…</div>
        ) : allFiles.length === 0 ? (
          <div style={{ color: C.secondary, fontSize: 14 }}>Inga filer ännu</div>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {imageFiles.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
                {imageFiles.map((img, i) => (
                  <div key={img.id} style={{ position: "relative" }}>
                    <button
                      type="button"
                      onClick={() => setLightboxIdx(i)}
                      style={{
                        display: "block",
                        width: "100%",
                        borderRadius: 6,
                        overflow: "hidden",
                        border: `1px solid ${C.border}`,
                        padding: 0,
                        background: "none",
                        cursor: "pointer",
                      }}
                    >
                      <img
                        src={resolveFileUrl(img.url)}
                        alt={fileNameFromUrl(img.url)}
                        style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }}
                        loading="lazy"
                      />
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        title="Ta bort bilden"
                        aria-label="Ta bort bilden"
                        onClick={() => confirmRemove(img)}
                        disabled={removeFile.isPending}
                        style={xButton}
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {otherFiles.length > 0 && (
              <div style={{ display: "grid", gap: 8 }}>
                {otherFiles.map((f) => (
                  <div
                    key={f.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: 12,
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <FileText size={22} color={C.secondary} style={{ flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, color: C.text, overflowWrap: "anywhere" }}>
                          {fileNameFromUrl(f.url)}
                        </div>
                        <div style={{ fontSize: 12, color: C.secondary }}>{fmtDate(f.created_at)}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                      <a
                        href={resolveFileUrl(f.url)}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: C.primary, fontSize: 14, fontWeight: 600, textDecoration: "none" }}
                      >
                        Öppna
                      </a>
                      {canDelete && (
                        <button
                          type="button"
                          title="Ta bort filen"
                          aria-label="Ta bort filen"
                          onClick={() => confirmRemove(f)}
                          disabled={removeFile.isPending}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: C.error,
                            cursor: "pointer",
                            padding: 4,
                            display: "inline-flex",
                          }}
                        >
                          <X size={18} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {lightboxIdx !== null && imageFiles.length > 0 && (
        <ImageLightbox
          images={imageFiles.map((img) => ({
            id: img.id,
            url: resolveFileUrl(img.url),
          }))}
          startIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </div>
  );
}
