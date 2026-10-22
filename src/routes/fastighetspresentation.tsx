import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { canEdit } from "@/lib/permissions";
import { sanitizeStorageName } from "@/lib/storage";
import {
  PRESENTATION_TILES,
  CUSTOM_ICON_CHOICES,
  PresentationIcon,
} from "@/lib/presentation-config";

const baytLogo = `${import.meta.env.BASE_URL}assets/bayt-logo-green.png`;
const buildingSketch = `${import.meta.env.BASE_URL}assets/building-sketch-2.png`;

const BUCKET = "presentation-files";
const MAX_BYTES = 10 * 1024 * 1024;

export const Route = createFileRoute("/fastighetspresentation")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Fastighetspresentation — BAYT" }] }),
  component: PresentationPage,
});

type Tile = {
  id: string;
  title: string;
  icon: string;
  body: string | null;
  image_path: string | null;
  sort_order: number;
};

type TileValues = {
  title: string;
  icon: string;
  body: string;
  file: File | null;
  removeImage: boolean;
};

async function uploadImage(file: File, folder: string): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Bara bilder tillåts.");
  if (file.size > MAX_BYTES) throw new Error("Bilden är för stor (max 10 MB).");
  const path = `${folder}/${crypto.randomUUID()}-${sanitizeStorageName(file.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (error) throw new Error("Uppladdningen misslyckades.");
  return path;
}

function removeImage(path: string | null | undefined) {
  if (path) void supabase.storage.from(BUCKET).remove([path]);
}

function SignedImage({
  path,
  alt,
  className,
}: {
  path: string | null;
  alt: string;
  className?: string;
}) {
  const q = useQuery({
    queryKey: ["fp-signed", path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path!, 3600);
      return data?.signedUrl ?? null;
    },
  });
  if (!q.data) return null;
  return <img src={q.data} alt={alt} className={className} />;
}

const INK = "#0D2B1E";
const GREEN = "#3D8A30";
const MUTED = "#6B7280";
const LINE = "#E3E7E2";

const STYLES = `
  .fp-page {
    position: relative;
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    background: linear-gradient(180deg, #FFFFFF 0%, #F1F3F0 100%);
    color: ${INK};
    padding: 24px 40px 36px;
    font-family: Inter, system-ui, sans-serif;
    box-sizing: border-box;
  }
  .fp-header {
    display: flex; align-items: center; justify-content: flex-end; gap: 12px;
    padding-bottom: 16px; margin-bottom: 20px; border-bottom: 1px solid ${LINE};
  }
  .fp-home {
    height: 40px; padding: 0 14px; display: inline-flex; align-items: center; border-radius: 8px; flex-shrink: 0;
    font-size: 13px; letter-spacing: 0.04em; text-decoration: none; color: ${MUTED};
    border: 1px solid ${LINE}; background: #fff;
  }
  .fp-home:hover { color: ${INK}; border-color: ${GREEN}; }
  .fp-select {
    height: 40px; padding: 0 12px; border-radius: 8px; font-size: 14px; font-family: inherit;
    background: #fff; color: ${INK}; border: 1px solid ${LINE};
    min-width: 0; max-width: 280px; text-overflow: ellipsis;
  }

  /* Bilden till vänster, loggan och symbolerna till höger. */
  .fp-body {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
    gap: 48px;
    align-items: stretch;
    min-height: 0;
  }
  .fp-menu { display: flex; flex-direction: column; min-width: 0; }
  .fp-logo { height: 64px; width: auto; align-self: flex-start; margin: 0 0 12px 8px; display: block; }
  .fp-grid {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-auto-rows: minmax(140px, 1fr);
    align-content: stretch;
  }
  .fp-tile {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
    padding: 16px 8px; text-decoration: none; color: ${INK}; background: transparent;
    border: none; border-radius: 16px; cursor: pointer; font: inherit;
    transition: background 0.15s ease, color 0.15s ease; -webkit-tap-highlight-color: transparent;
  }
  .fp-tile:hover { background: rgba(61,138,48,0.09); color: ${GREEN}; }
  .fp-tile svg { width: clamp(40px, 4.4vw, 64px); height: auto; color: ${INK}; }
  .fp-tile:hover svg { color: ${GREEN}; }
  .fp-tile-label { font-size: 16px; font-weight: 500; text-align: center; }
  .fp-tile-add { color: ${MUTED}; }
  .fp-tile-add svg { color: ${MUTED}; opacity: 0.85; }

  .fp-side { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; min-height: 0; }
  .fp-image {
    max-width: 100%; max-height: 74vh; width: auto; height: auto; border-radius: 6px; display: block;
    box-shadow: 0 10px 30px rgba(13,43,30,0.18);
  }
  .fp-sketch { max-width: 100%; max-height: 66vh; width: auto; height: auto; filter: invert(1); opacity: 0.35; }
  .fp-side-actions { display: flex; gap: 10px; }

  .fp-back { background: none; border: none; color: ${MUTED}; font-size: 14px; cursor: pointer; padding: 0; font-family: inherit; }
  .fp-back:hover { color: ${INK}; }
  .fp-panel { max-width: 920px; }
  .fp-panel-head { display: flex; align-items: center; gap: 16px; margin: 16px 0 18px; color: ${INK}; }
  .fp-panel-head h1 { font-family: Outfit, Inter, system-ui, sans-serif; font-size: 30px; margin: 0; font-weight: 600; color: ${INK}; }
  .fp-text { font-size: 19px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; color: #1F2A37; }
  .fp-tile-image { max-width: 100%; max-height: 60vh; border-radius: 10px; margin-top: 20px; display: block; box-shadow: 0 8px 24px rgba(13,43,30,0.15); }

  .fp-btn {
    height: 40px; padding: 0 16px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit;
    background: #fff; color: ${INK}; border: 1px solid ${LINE};
  }
  .fp-btn:hover { border-color: ${GREEN}; }
  .fp-btn.fp-primary { background: ${GREEN}; border-color: ${GREEN}; color: #fff; }
  .fp-btn.fp-danger { color: #B91C1C; border-color: #F1C0C0; }
  .fp-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .fp-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 22px; align-items: center; }

  .fp-form { display: grid; gap: 16px; }
  .fp-label { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: ${MUTED}; margin-bottom: 6px; display: block; }
  .fp-input, .fp-textarea {
    width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px; font-size: 15px; font-family: inherit;
    background: #fff; color: ${INK}; border: 1px solid ${LINE};
  }
  .fp-input { height: 42px; padding-top: 0; padding-bottom: 0; }
  .fp-textarea { resize: vertical; line-height: 1.5; }
  .fp-icons { display: flex; flex-wrap: wrap; gap: 8px; }
  .fp-icon-choice {
    width: 56px; height: 56px; border-radius: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center;
    background: #fff; color: ${INK}; border: 1px solid ${LINE};
  }
  .fp-icon-choice[aria-pressed="true"] { border-color: ${GREEN}; background: rgba(61,138,48,0.12); color: ${GREEN}; }
  .fp-icon-choice svg { width: 28px; height: 28px; }

  @media (max-width: 1100px) {
    .fp-body { grid-template-columns: minmax(0, 1fr); gap: 24px; }
    .fp-image, .fp-sketch { max-height: 240px; }
    .fp-logo { align-self: center; margin: 0 0 8px; }
  }
  @media (max-width: 768px) {
    .fp-page { padding: 16px 14px 40px; }
    .fp-logo { height: 48px; }
    .fp-header { margin-bottom: 14px; }
    .fp-grid { grid-auto-rows: minmax(112px, auto); }
    .fp-tile { gap: 8px; padding: 12px 4px; }
    .fp-tile svg { width: 38px; }
    .fp-tile-label { font-size: 13px; }
    .fp-select { max-width: 170px; }
    .fp-panel-head h1 { font-size: 24px; }
    .fp-text { font-size: 17px; }
  }
`;

function TileForm({
  initial,
  saving,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: Tile | null;
  saving: boolean;
  onSave: (v: TileValues) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "note");
  const [body, setBody] = useState(initial?.body ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [dropImage, setDropImage] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  return (
    <form
      className="fp-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) {
          toast.error("Ange en rubrik.");
          return;
        }
        onSave({ title: title.trim(), icon, body, file, removeImage: dropImage });
      }}
    >
      <div>
        <label className="fp-label">Rubrik</label>
        <input className="fp-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="t.ex. Förslag på åtgärder" />
      </div>
      <div>
        <label className="fp-label">Symbol</label>
        <div className="fp-icons">
          {CUSTOM_ICON_CHOICES.map((c) => (
            <button
              key={c.key}
              type="button"
              className="fp-icon-choice"
              aria-pressed={icon === c.key}
              title={c.label}
              onClick={() => setIcon(c.key)}
            >
              <PresentationIcon name={c.key} size={28} />
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="fp-label">Text</label>
        <textarea className="fp-textarea" rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div>
        <label className="fp-label">Bild</label>
        {initial?.image_path && !dropImage && !file && (
          <div style={{ marginBottom: 10 }}>
            <SignedImage path={initial.image_path} alt="" className="fp-tile-image" />
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setDropImage(false);
            e.target.value = "";
          }}
        />
        <div className="fp-actions" style={{ marginTop: 0 }}>
          <button type="button" className="fp-btn" onClick={() => fileRef.current?.click()}>
            {file ? `Vald: ${file.name}` : initial?.image_path ? "Byt bild" : "Välj bild"}
          </button>
          {initial?.image_path && !file && (
            <button type="button" className="fp-btn fp-danger" onClick={() => setDropImage((v) => !v)}>
              {dropImage ? "Behåll bilden" : "Ta bort bilden"}
            </button>
          )}
        </div>
      </div>
      <div className="fp-actions">
        <button type="submit" className="fp-btn fp-primary" disabled={saving}>
          {saving ? "Sparar…" : "Spara"}
        </button>
        <button type="button" className="fp-btn" onClick={onCancel}>
          Avbryt
        </button>
        {onDelete && (
          <button type="button" className="fp-btn fp-danger" style={{ marginLeft: "auto" }} onClick={onDelete}>
            Ta bort rutan
          </button>
        )}
      </div>
    </form>
  );
}

function PresentationPage() {
  const qc = useQueryClient();
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [propertyId, setPropertyId] = useState<string>(() => {
    try {
      return window.localStorage.getItem("bayt.presentation.property") ?? "";
    } catch {
      return "";
    }
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"new" | string | null>(null);
  const imageInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        setRole(null);
        return;
      }
      const { data: p } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.session.user.id)
        .maybeSingle();
      setRole((p?.role as string | undefined) ?? null);
    });
  }, []);

  const allowed = role !== undefined && canEdit(role);

  const propsQ = useQuery({
    queryKey: ["properties-min"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
  const properties = propsQ.data ?? [];

  useEffect(() => {
    if (properties.length === 0) return;
    if (!propertyId || !properties.some((p) => p.id === propertyId)) setPropertyId(properties[0].id);
  }, [propertyId, properties]);

  useEffect(() => {
    if (!propertyId) return;
    try {
      window.localStorage.setItem("bayt.presentation.property", propertyId);
    } catch {
      /* ignoreras */
    }
  }, [propertyId]);

  const coverQ = useQuery({
    queryKey: ["fp-cover", propertyId],
    enabled: allowed && !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_presentation")
        .select("image_path")
        .eq("property_id", propertyId)
        .maybeSingle();
      if (error) throw error;
      return (data?.image_path as string | null) ?? null;
    },
  });
  const coverPath = coverQ.data ?? null;

  const tilesQ = useQuery({
    queryKey: ["fp-tiles", propertyId],
    enabled: allowed && !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("presentation_tiles")
        .select("id, title, icon, body, image_path, sort_order")
        .eq("property_id", propertyId)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Tile[];
    },
  });
  const tiles = tilesQ.data ?? [];

  const setCover = useMutation({
    mutationFn: async (file: File) => {
      const path = await uploadImage(file, `property/${propertyId}`);
      const { error } = await supabase
        .from("property_presentation")
        .upsert({ property_id: propertyId, image_path: path, updated_at: new Date().toISOString() }, { onConflict: "property_id" });
      if (error) throw error;
      if (coverPath && coverPath !== path) removeImage(coverPath);
    },
    onSuccess: () => {
      toast.success("Bilden är sparad", { style: { background: "#3D8A30", color: "#fff" } });
      void qc.invalidateQueries({ queryKey: ["fp-cover", propertyId] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Kunde inte spara bilden"),
  });

  const saveTile = useMutation({
    mutationFn: async (v: { id: string | null; values: TileValues; current: Tile | null }) => {
      let image_path: string | null = v.current?.image_path ?? null;
      if (v.values.removeImage) image_path = null;
      if (v.values.file) image_path = await uploadImage(v.values.file, `tiles/${propertyId}`);

      const row = {
        title: v.values.title,
        icon: v.values.icon,
        body: v.values.body.trim() || null,
        image_path,
      };
      if (v.id) {
        const { error } = await supabase.from("presentation_tiles").update(row).eq("id", v.id);
        if (error) throw error;
      } else {
        const max = tiles.reduce((m, t) => Math.max(m, t.sort_order), 0);
        const { error } = await supabase
          .from("presentation_tiles")
          .insert({ ...row, property_id: propertyId, sort_order: max + 10 });
        if (error) throw error;
      }
      const old = v.current?.image_path ?? null;
      if (old && old !== image_path) removeImage(old);
    },
    onSuccess: () => {
      toast.success("Sparat", { style: { background: "#3D8A30", color: "#fff" } });
      setFormMode(null);
      void qc.invalidateQueries({ queryKey: ["fp-tiles", propertyId] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Kunde inte spara"),
  });

  const deleteTile = useMutation({
    mutationFn: async (t: Tile) => {
      const { error } = await supabase.from("presentation_tiles").delete().eq("id", t.id);
      if (error) throw error;
      removeImage(t.image_path);
    },
    onSuccess: () => {
      setFormMode(null);
      setOpenId(null);
      void qc.invalidateQueries({ queryKey: ["fp-tiles", propertyId] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Kunde inte ta bort"),
  });

  const openTile = tiles.find((t) => t.id === openId) ?? null;
  const editingTile = formMode && formMode !== "new" ? tiles.find((t) => t.id === formMode) ?? null : null;
  const inForm = formMode === "new" || !!editingTile;

  return (
    <>
      <style>{STYLES}</style>
      <div className="fp-page">
        <div className="fp-header">
          {allowed && (
            <select
              className="fp-select"
              value={propertyId}
              onChange={(e) => {
                setPropertyId(e.target.value);
                setOpenId(null);
                setFormMode(null);
              }}
              aria-label="Fastighet"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <Link to="/start" className="fp-home">
            ← Start
          </Link>
        </div>

        {role === undefined && <div style={{ color: MUTED, fontSize: 14 }}>Laddar…</div>}

        {role !== undefined && !allowed && (
          <div style={{ color: INK, fontSize: 15 }}>Du har inte behörighet till den här sidan.</div>
        )}

        {allowed && inForm && (
          <div className="fp-panel">
            <button type="button" className="fp-back" onClick={() => setFormMode(null)}>
              ← Tillbaka
            </button>
            <div className="fp-panel-head">
              <h1>{formMode === "new" ? "Ny ruta" : "Redigera ruta"}</h1>
            </div>
            <TileForm
              key={formMode ?? "new"}
              initial={editingTile}
              saving={saveTile.isPending}
              onCancel={() => setFormMode(null)}
              onSave={(values) => saveTile.mutate({ id: editingTile?.id ?? null, values, current: editingTile })}
              onDelete={
                editingTile
                  ? () => {
                      if (window.confirm(`Ta bort "${editingTile.title}"?`)) deleteTile.mutate(editingTile);
                    }
                  : undefined
              }
            />
          </div>
        )}

        {allowed && !inForm && openTile && (
          <div className="fp-panel">
            <button type="button" className="fp-back" onClick={() => setOpenId(null)}>
              ← Fastighetspresentation
            </button>
            <div className="fp-panel-head">
              <PresentationIcon name={openTile.icon} size={44} />
              <h1>{openTile.title}</h1>
            </div>
            {openTile.body && <div className="fp-text">{openTile.body}</div>}
            {openTile.image_path && <SignedImage path={openTile.image_path} alt={openTile.title} className="fp-tile-image" />}
            <div className="fp-actions">
              <button type="button" className="fp-btn" onClick={() => setFormMode(openTile.id)}>
                Redigera
              </button>
            </div>
          </div>
        )}

        {allowed && !inForm && !openTile && (
          <div className="fp-body">
            <div className="fp-side">
              {coverPath ? (
                <SignedImage path={coverPath} alt="Fastigheten" className="fp-image" />
              ) : (
                <img src={buildingSketch} alt="" className="fp-sketch" />
              )}
              <input
                ref={imageInput}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) setCover.mutate(f);
                }}
              />
              <div className="fp-side-actions">
                <button type="button" className="fp-btn" disabled={setCover.isPending} onClick={() => imageInput.current?.click()}>
                  {setCover.isPending ? "Laddar upp…" : coverPath ? "Byt bild" : "Lägg till bild på fastigheten"}
                </button>
              </div>
            </div>

            <div className="fp-menu">
              <img src={baytLogo} alt="BAYT" className="fp-logo" />
              <div className="fp-grid">
                {PRESENTATION_TILES.map((t) => (
                  <Link key={t.key} to={t.href as never} className="fp-tile">
                    <PresentationIcon name={t.key} />
                    <span className="fp-tile-label">{t.label}</span>
                  </Link>
                ))}
                {tiles.map((t) => (
                  <button key={t.id} type="button" className="fp-tile" onClick={() => setOpenId(t.id)}>
                    <PresentationIcon name={t.icon} />
                    <span className="fp-tile-label">{t.title}</span>
                  </button>
                ))}
                <button type="button" className="fp-tile fp-tile-add" onClick={() => setFormMode("new")}>
                  <PresentationIcon name="plus" />
                  <span className="fp-tile-label">Ny ruta</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
