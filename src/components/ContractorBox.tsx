import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, X, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

type FileRow = {
  id: string;
  path: string;
  file_name: string;
  mime: string | null;
  created_at: string;
  url: string | null;
  downloadUrl: string | null;
};

const fmt = (s: string) => new Intl.DateTimeFormat("sv-SE").format(new Date(s));

export function ContractorBox({
  kind,
  id,
  note,
  doneAt,
}: {
  kind: "issue" | "inspection" | "project";
  id: string;
  note: string | null | undefined;
  doneAt: string | null | undefined;
}) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const canDelete = profile?.role === "admin";

  const filesQ = useQuery({
    queryKey: ["contractor-files", kind, id],
    queryFn: async (): Promise<FileRow[]> => {
      const { data, error } = await supabase
        .from("contractor_files")
        .select("id, path, file_name, mime, created_at")
        .eq("kind", kind)
        .eq("arende_id", id)
        .order("created_at", { ascending: false });
      if (error) return [];
      const rows: FileRow[] = [];
      for (const r of data ?? []) {
        const path = String(r.path);
        const name = r.file_name as string;
        const { data: signed } = await supabase.storage.from("contractor-files").createSignedUrl(path, 3600);
        const { data: dl } = await supabase.storage
          .from("contractor-files")
          .createSignedUrl(path, 3600, { download: name });
        rows.push({
          id: r.id as string,
          path,
          file_name: name,
          mime: (r.mime as string | null) ?? null,
          created_at: r.created_at as string,
          url: signed?.signedUrl ?? null,
          downloadUrl: dl?.signedUrl ?? null,
        });
      }
      return rows;
    },
  });

  const removeFile = useMutation({
    mutationFn: async (f: FileRow) => {
      const { data: deleted, error } = await supabase
        .from("contractor_files")
        .delete()
        .eq("id", f.id)
        .select("id");
      if (error) throw error;
      if (!deleted?.length) throw new Error("Du saknar behörighet att ta bort filen.");
      // Raden är borta; misslyckas lagringen blir filen kvar men syns inte längre.
      await supabase.storage.from("contractor-files").remove([f.path]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contractor-files", kind, id] });
      qc.invalidateQueries({ queryKey: ["entreprenor-files", kind, id] });
      toast.success("Filen är borttagen", { style: { background: "#3D8A30", color: "#fff" } });
    },
    onError: (e: any) => toast.error(e.message ?? "Kunde inte ta bort filen"),
  });

  const confirmRemove = (f: FileRow) => {
    if (window.confirm(`Ta bort "${f.file_name}"? Det går inte att ångra.`)) removeFile.mutate(f);
  };

  const files = filesQ.data ?? [];
  if (!note && !doneAt && files.length === 0) return null;

  const images = files.filter((f) => (f.mime ?? "").startsWith("image/"));
  const others = files.filter((f) => !(f.mime ?? "").startsWith("image/"));

  const linkStyle: React.CSSProperties = {
    color: "#3D8A30",
    fontSize: 13,
    fontWeight: 600,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  };

  return (
    <div
      style={{
        background: "#F0F7EE",
        border: "1px solid #CFE6C9",
        borderRadius: 8,
        padding: 14,
        marginBottom: 16,
        display: "grid",
        gap: 10,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "#6B7280",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        Från entreprenören
      </div>

      {note && (
        <div style={{ fontSize: 14, color: "#1a1a1a", whiteSpace: "pre-wrap", lineHeight: 1.55, overflowWrap: "anywhere" }}>
          {note}
        </div>
      )}

      {doneAt && (
        <div style={{ fontSize: 13, fontWeight: 600, color: "#3D8A30" }}>
          Entreprenören har meddelat att uppdraget är slutfört ({new Date(doneAt).toLocaleString("sv-SE")}).
          Granska och avsluta ärendet.
        </div>
      )}

      {images.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
          {images.map((f) => (
            <div
              key={f.id}
              style={{ border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden", background: "#fff", fontSize: 12 }}
            >
              <a href={f.url ?? undefined} target="_blank" rel="noreferrer" style={{ display: "block" }}>
                {f.url ? (
                  <img
                    src={f.url}
                    alt={f.file_name}
                    style={{ width: "100%", height: 90, objectFit: "cover", display: "block" }}
                  />
                ) : (
                  <div style={{ height: 90, background: "#F9FAFB" }} />
                )}
              </a>
              <div style={{ padding: "6px 8px", display: "grid", gap: 6 }}>
                <div style={{ overflowWrap: "anywhere", color: "#1F2A37" }}>{f.file_name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <a href={f.url ?? undefined} target="_blank" rel="noreferrer" style={linkStyle}>
                    Öppna
                  </a>
                  <a href={f.downloadUrl ?? undefined} style={linkStyle} title="Ladda ner">
                    <Download size={14} /> Ladda ner
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
                        color: "#DC2626",
                        cursor: "pointer",
                        padding: 0,
                        display: "inline-flex",
                        marginLeft: "auto",
                      }}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {others.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          {others.map((f) => (
            <div
              key={f.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: 10,
                border: "1px solid #E5E7EB",
                borderRadius: 8,
                background: "#fff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <FileText size={22} color="#6B7280" style={{ flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "#1F2A37", overflowWrap: "anywhere" }}>{f.file_name}</div>
                  <div style={{ fontSize: 12, color: "#6B7280" }}>{fmt(f.created_at)}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                <a href={f.url ?? undefined} target="_blank" rel="noreferrer" style={linkStyle}>
                  Öppna
                </a>
                <a href={f.downloadUrl ?? undefined} style={linkStyle} title="Ladda ner">
                  <Download size={14} /> Ladda ner
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
                      color: "#DC2626",
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
  );
}
