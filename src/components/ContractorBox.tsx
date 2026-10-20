import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

type FileRow = {
  id: string;
  path: string;
  file_name: string;
  mime: string | null;
  created_at: string;
  url: string | null;
};

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
        const { data: signed } = await supabase.storage
          .from("contractor-files")
          .createSignedUrl(String(r.path), 3600);
        rows.push({
          id: r.id as string,
          path: r.path as string,
          file_name: r.file_name as string,
          mime: (r.mime as string | null) ?? null,
          created_at: r.created_at as string,
          url: signed?.signedUrl ?? null,
        });
      }
      return rows;
    },
  });

  const files = filesQ.data ?? [];
  if (!note && !doneAt && files.length === 0) return null;

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

      {files.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
          {files.map((f) => {
            const isImage = (f.mime ?? "").startsWith("image/");
            return (
              <a
                key={f.id}
                href={f.url ?? undefined}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "block",
                  border: "1px solid #E5E7EB",
                  borderRadius: 8,
                  overflow: "hidden",
                  textDecoration: "none",
                  color: "#1F2A37",
                  fontSize: 12,
                  background: "#fff",
                }}
              >
                {isImage && f.url ? (
                  <img
                    src={f.url}
                    alt={f.file_name}
                    style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }}
                  />
                ) : (
                  <div
                    style={{
                      height: 80,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "#F9FAFB",
                      fontWeight: 600,
                    }}
                  >
                    PDF
                  </div>
                )}
                <div style={{ padding: "4px 6px", overflowWrap: "anywhere" }}>{f.file_name}</div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
