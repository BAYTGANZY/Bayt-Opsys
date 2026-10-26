import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, X, Download, FolderPlus, Folder, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { sanitizeStorageName } from "@/lib/storage";

const C = {
  border: "#E5E7EB",
  primary: "#3D8A30",
  secondary: "#6B7280",
  text: "#1a1a1a",
  error: "#DC2626",
  wash: "#F9FAFB",
};
const BUCKET = "user-documents";
const MAX_BYTES = 20 * 1024 * 1024;

type FolderRow = { id: string; owner_id: string; name: string; created_at: string };
type FileRow = {
  id: string;
  owner_id: string;
  folder_id: string | null;
  name: string;
  path: string;
  mime: string | null;
  size_bytes: number | null;
  created_at: string;
};
type FileView = FileRow & { openUrl: string | null };

const fmtDate = (s: string) => new Intl.DateTimeFormat("sv-SE").format(new Date(s));
function fmtSize(n: number | null) {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
const isImage = (f: { name: string; mime: string | null }) =>
  (f.mime ?? "").startsWith("image/") || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(f.name);

export function MinaDokument({ isMobile }: { isMobile: boolean }) {
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [newName, setNewName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const allScope = isAdmin && scope === "all";

  const foldersQ = useQuery({
    queryKey: ["doc-folders", user?.id, allScope],
    enabled: !!user,
    queryFn: async (): Promise<FolderRow[]> => {
      let q = supabase.from("doc_folders").select("*").order("name");
      if (!allScope) q = q.eq("owner_id", user!.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as FolderRow[];
    },
  });

  const filesQ = useQuery({
    queryKey: ["doc-files", user?.id, allScope],
    enabled: !!user,
    queryFn: async (): Promise<FileView[]> => {
      let q = supabase.from("doc_files").select("*").order("created_at", { ascending: false });
      if (!allScope) q = q.eq("owner_id", user!.id);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as FileRow[];
      if (rows.length === 0) return [];
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(
        rows.map((r) => r.path),
        3600,
      );
      return rows.map((r, i) => ({ ...r, openUrl: signed?.[i]?.signedUrl ?? null }));
    },
  });

  const ownersQ = useQuery({
    queryKey: ["doc-owners", allScope],
    enabled: allScope,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name");
      return new Map<string, string>(((data ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [p.id, p.full_name ?? ""]));
    },
  });

  const folders = foldersQ.data ?? [];
  const folderName = (id: string | null) => folders.find((f) => f.id === id)?.name ?? "";
  const files = useMemo(() => {
    const all = filesQ.data ?? [];
    if (allScope) return all;
    return folderId ? all.filter((f) => f.folder_id === folderId) : all.filter((f) => f.folder_id === null);
  }, [filesQ.data, folderId, allScope]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["doc-folders"] });
    void qc.invalidateQueries({ queryKey: ["doc-files"] });
  };

  const createFolder = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.from("doc_folders").insert({ name }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      setNewName(null);
      setFolderId(id);
      refresh();
      toast.success("Mappen är skapad", { style: { background: "#3D8A30", color: "#fff" } });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Kunde inte skapa mappen"),
  });

  const removeFile = useMutation({
    mutationFn: async (f: FileRow) => {
      const { data, error } = await supabase.from("doc_files").delete().eq("id", f.id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Du saknar behörighet att ta bort filen.");
      await supabase.storage.from(BUCKET).remove([f.path]);
    },
    onSuccess: () => {
      refresh();
      toast.success("Filen är borttagen", { style: { background: "#3D8A30", color: "#fff" } });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Kunde inte ta bort filen"),
  });

  const removeFolder = useMutation({
    mutationFn: async (id: string) => {
      const inside = (filesQ.data ?? []).filter((f) => f.folder_id === id).map((f) => f.path);
      if (inside.length) await supabase.storage.from(BUCKET).remove(inside);
      const { error } = await supabase.from("doc_folders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setFolderId(null);
      refresh();
      toast.success("Mappen är borttagen", { style: { background: "#3D8A30", color: "#fff" } });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Kunde inte ta bort mappen"),
  });

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!picked.length || !user) return;
    setUploading(true);
    try {
      for (const f of picked) {
        if (f.size > MAX_BYTES) throw new Error(`${f.name} är för stor (max 20 MB).`);
        const path = `${user.id}/${crypto.randomUUID()}-${sanitizeStorageName(f.name)}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined });
        if (upErr) throw new Error(`Uppladdningen av ${f.name} misslyckades: ${upErr.message}`);
        const { error: insErr } = await supabase.from("doc_files").insert({
          folder_id: folderId,
          name: f.name,
          path,
          mime: f.type || null,
          size_bytes: f.size,
        });
        if (insErr) {
          await supabase.storage.from(BUCKET).remove([path]);
          throw insErr;
        }
      }
      toast.success("Sparat!", { style: { background: "#3D8A30", color: "#fff" } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Uppladdningen misslyckades");
    } finally {
      setUploading(false);
      refresh();
    }
  }

  async function download(f: FileRow) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(f.path, 300, { download: f.name });
    if (data?.signedUrl) window.location.href = data.signedUrl;
    else toast.error("Kunde inte ladda ner filen");
  }

  const chip = (active: boolean): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 34,
    padding: "0 14px",
    borderRadius: 999,
    border: `1px solid ${active ? C.primary : C.border}`,
    background: active ? C.primary : "#fff",
    color: active ? "#fff" : C.secondary,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  });
  const linkStyle: React.CSSProperties = {
    color: C.primary,
    fontSize: 13,
    fontWeight: 600,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {isAdmin && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" style={chip(scope === "mine")} onClick={() => setScope("mine")}>
            Mina dokument
          </button>
          <button type="button" style={chip(scope === "all")} onClick={() => setScope("all")}>
            Alla användares dokument
          </button>
        </div>
      )}

      {!allScope && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" style={chip(folderId === null)} onClick={() => setFolderId(null)}>
              Utan mapp
            </button>
            {folders.map((f) => (
              <button key={f.id} type="button" style={chip(folderId === f.id)} onClick={() => setFolderId(f.id)}>
                <Folder size={14} /> {f.name}
              </button>
            ))}
            {newName === null ? (
              <button type="button" style={{ ...chip(false), borderStyle: "dashed" }} onClick={() => setNewName("")}>
                <FolderPlus size={14} /> Ny mapp
              </button>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = newName.trim();
                  if (n) createFolder.mutate(n);
                }}
                style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
              >
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Mappens namn"
                  style={{ height: 34, padding: "0 12px", border: `1px solid ${C.border}`, borderRadius: 999, fontSize: 13, outline: "none" }}
                />
                <button type="submit" disabled={!newName.trim() || createFolder.isPending} style={chip(true)}>
                  Spara
                </button>
                <button type="button" onClick={() => setNewName(null)} style={chip(false)}>
                  Avbryt
                </button>
              </form>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input ref={inputRef} type="file" multiple onChange={onPick} style={{ display: "none" }} />
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              style={{
                height: 40,
                padding: "0 18px",
                background: C.primary,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: uploading ? "not-allowed" : "pointer",
                opacity: uploading ? 0.7 : 1,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Upload size={16} /> {uploading ? "Laddar upp…" : `Lägg till filer${folderId ? ` i "${folderName(folderId)}"` : ""}`}
            </button>
            {folderId && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Ta bort mappen "${folderName(folderId)}" och alla filer i den? Det går inte att ångra.`)) {
                    removeFolder.mutate(folderId);
                  }
                }}
                disabled={removeFolder.isPending}
                style={{ ...linkStyle, color: C.error }}
              >
                <Trash2 size={14} /> Ta bort mappen
              </button>
            )}
            <span style={{ fontSize: 12, color: C.secondary }}>Max 20 MB per fil. Bara du och admin kan se filerna.</span>
          </div>
        </>
      )}

      {allScope && (
        <div style={{ fontSize: 13, color: C.secondary }}>Alla användares personliga dokument. Du kan öppna, ladda ner och ta bort.</div>
      )}

      {filesQ.isLoading ? (
        <div style={{ color: C.secondary }}>Laddar…</div>
      ) : files.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: C.secondary, fontSize: 14 }}>
          {allScope ? "Inga personliga dokument ännu" : folderId ? "Mappen är tom" : "Inga filer här ännu. Lägg till en fil eller skapa en mapp."}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {files.map((f) => (
            <div
              key={f.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: 12,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                background: "#fff",
                flexWrap: isMobile ? "wrap" : "nowrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
                {isImage(f) && f.openUrl ? (
                  <a href={f.openUrl} target="_blank" rel="noreferrer" style={{ flexShrink: 0, display: "block" }}>
                    <img src={f.openUrl} alt={f.name} loading="lazy" style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.border}`, display: "block" }} />
                  </a>
                ) : (
                  <div style={{ width: 52, height: 52, borderRadius: 8, background: C.wash, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <FileText size={22} color={C.secondary} />
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflowWrap: "anywhere" }}>{f.name}</div>
                  <div style={{ fontSize: 12, color: C.secondary, marginTop: 2 }}>
                    {fmtDate(f.created_at)}
                    {f.size_bytes != null ? ` · ${fmtSize(f.size_bytes)}` : ""}
                    {allScope ? ` · ${ownersQ.data?.get(f.owner_id) || "Okänd"}` : ""}
                    {allScope && f.folder_id ? ` · mapp: ${folderName(f.folder_id)}` : ""}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
                <a href={f.openUrl ?? undefined} target="_blank" rel="noreferrer" style={linkStyle}>
                  Öppna
                </a>
                <button type="button" onClick={() => void download(f)} style={linkStyle} title="Ladda ner">
                  <Download size={14} /> Ladda ner
                </button>
                <button
                  type="button"
                  title="Ta bort filen"
                  aria-label="Ta bort filen"
                  onClick={() => {
                    if (window.confirm(`Ta bort "${f.name}"? Det går inte att ångra.`)) removeFile.mutate(f);
                  }}
                  disabled={removeFile.isPending}
                  style={{ border: "none", background: "transparent", color: C.error, cursor: "pointer", padding: 4, display: "inline-flex" }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
