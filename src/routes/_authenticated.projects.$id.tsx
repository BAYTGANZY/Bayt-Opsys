import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Upload } from "lucide-react";
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
import { DerivedStatusField } from "@/components/DerivedStatusBadge";
import { DerivedPriorityField } from "@/components/DerivedPriorityField";
import { deriveProjectStatus, derivePriorityFromStatus } from "@/lib/issue-tokens";
import { useRecordScopeGuard } from "@/hooks/useRecordScopeGuard";
import { isStyrelse } from "@/lib/permissions";
import { sanitizeStorageName, useSignedFileUrls } from "@/lib/storage";

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
  properties: { name: string | null } | null;
};

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

  // Reachable by URL — enforce role scope on this projekt. `undefined` until the
  // row is in hand (see useRecordScopeGuard), and no redirectTo so each role
  // lands on its own home page rather than a grid it may not be able to use.
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

  // Stored image URLs are getPublicUrl() links into a bucket the app treats as
  // private — render through signed URLs or the thumbnails 400 for everyone.
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
      const { error } = await supabase
        .from("projects")
        .update({
          property_id: propertyId || null,
          property_object_id: propertyObjectId,
          title,
          description: description || null,
          // `status` is deliberately absent — derived via deriveProjectStatus.
          // Only ProjektStatusButtons (pausad/avbruten) and Öppna/Avsluta
          // (arende_status) may change what a projekt's status is.
          budget: budget ? Number(budget) : null,
          start_date: startDate || null,
          end_date: endDate || null,
          assigned_contact_id: assignedContactId,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", id] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      setError(null);
      toast.success("Sparat!", { style: { background: "#3D8A30", color: "#fff" } });
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

  const fmtDate = (s: string | null) =>
    s ? new Intl.DateTimeFormat("sv-SE").format(new Date(s)) : "—";

  const p = projectQ.data;

  // Read, never chosen. Live form dates so the badge reacts while editing;
  // pausad/avbruten come from the record, since only the buttons set them.
  const derived = deriveProjectStatus({
    arende_status: (p as { arende_status?: string | null } | null)?.arende_status ?? null,
    status: p?.status ?? null,
    start_date: startDate || null,
    end_date: endDate || null,
  });
  // Projekt have no prioritet column and never had a dropdown — the prioritet
  // is purely read, out of slutdatum (the same tidsgräns the status uses).
  const derivedPriority = derivePriorityFromStatus(derived, {
    from: p?.created_at ?? null,
    dueLabel: "Slutdatum",
  });

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

      {/* Images section */}
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: 24,
          maxWidth: 640,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: "0 0 16px" }}>Projektbilder</h2>

        {/* Uppladdning: admin + entreprenör. Styrelse är läs-only by spec och
            project_images har bara en SELECT-policy för dem — knappen skulle
            bara ge ett RLS-fel, så den renderas inte alls. */}
        {!isStyrelse(profile?.role) && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ ...labelStyle, marginBottom: 8 }}>Ladda upp bild</label>
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
          <div style={{ color: C.secondary }}>Laddar bilder…</div>
        ) : imagesQ.data && imagesQ.data.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
            {(imagesQ.data as Array<{ id: string; url: string; created_at: string }>).map((img, i) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setLightboxIdx(i)}
                style={{
                  display: "block",
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
                  alt="Projektbild"
                  style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }}
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        ) : (
          <div style={{ color: C.secondary, fontSize: 14 }}>Inga bilder ännu</div>
        )}
      </div>

      {lightboxIdx !== null && imagesQ.data && (
        <ImageLightbox
          images={(imagesQ.data as Array<{ id: string; url: string }>).map((img) => ({
            ...img,
            url: resolveFileUrl(img.url),
          }))}
          startIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </div>
  );
}
