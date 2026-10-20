import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type PortalFile = {
  id: string;
  file_name: string;
  mime: string | null;
  created_at: string;
  url: string | null;
};

const SESSION_KEY = "bayt.entreprenor.session";
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,application/pdf";

function getToken(): string | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? ((JSON.parse(raw) as { token?: string }).token ?? null) : null;
  } catch {
    return null;
  }
}

async function callFiles<T>(payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("portal-files", { body: payload });
  if (error) {
    const res = (error as { context?: Response }).context;
    if (res && typeof res.json === "function") {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? error.message);
    }
    throw new Error(error.message || "Något gick fel.");
  }
  const asError = data as { error?: string } | null;
  if (asError?.error) throw new Error(asError.error);
  return data as T;
}

export function PortalEditForm({
  kind,
  values,
  saving,
  onSave,
  onDone,
  doneSaving,
}: {
  kind: string;
  values: Record<string, unknown>;
  saving: boolean;
  onSave: (fields: Record<string, unknown>) => void;
  onDone: () => void;
  doneSaving: boolean;
}) {
  const arendeId = String(values.id ?? "");
  const [note, setNote] = useState<string>(
    values.contractor_note == null ? "" : String(values.contractor_note),
  );
  const doneAt = values.contractor_done_at ? String(values.contractor_done_at) : null;

  const [files, setFiles] = useState<PortalFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const loadFiles = useCallback(async () => {
    const token = getToken();
    if (!token || !arendeId) return;
    try {
      const res = await callFiles<{ files: PortalFile[] }>({ action: "list", token, kind, id: arendeId });
      setFiles(res.files ?? []);
    } catch {
      /* listan är bonus; fel visas vid uppladdning */
    }
  }, [kind, arendeId]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
    const token = getToken();
    if (!token) {
      setFileError("Din inloggning har gått ut. Ladda om sidan och logga in igen.");
      return;
    }
    setFileError(null);
    setUploading(true);
    try {
      for (const f of picked) {
        if (f.size > MAX_BYTES) throw new Error(`${f.name} är för stor (max 10 MB).`);
        const signed = await callFiles<{ path: string; token: string }>({
          action: "sign",
          token,
          kind,
          id: arendeId,
          file_name: f.name,
          mime: f.type,
          size: f.size,
        });
        const { error: upErr } = await supabase.storage
          .from("contractor-files")
          .uploadToSignedUrl(signed.path, signed.token, f, { contentType: f.type });
        if (upErr) throw new Error(`Uppladdningen av ${f.name} misslyckades.`);
        await callFiles({
          action: "register",
          token,
          kind,
          id: arendeId,
          path: signed.path,
          file_name: f.name,
          mime: f.type,
          size: f.size,
        });
      }
      await loadFiles();
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Uppladdningen misslyckades.");
      await loadFiles();
    } finally {
      setUploading(false);
    }
  }

  const box: React.CSSProperties = {
    width: "100%",
    border: "1px solid #E5E7EB",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 14,
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  return (
    <div style={{ display: "grid", gap: 12, marginTop: 4 }}>
      <label style={{ display: "grid", gap: 4, fontSize: 13, color: "#1F2A37" }}>
        Din kommentar
        <textarea
          rows={4}
          style={box}
          value={note}
          placeholder="Skriv här, t.ex. vad som är gjort eller vad som behövs."
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <button
        type="button"
        disabled={saving}
        onClick={() => onSave({ contractor_note: note === "" ? null : note })}
        style={{
          height: 44,
          background: "#3D8A30",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          fontSize: 15,
          fontWeight: 600,
          cursor: saving ? "not-allowed" : "pointer",
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? "Sparar…" : "Spara kommentar"}
      </button>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontSize: 13, color: "#1F2A37" }}>Bilder och filer</div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          onChange={onPick}
          style={{ display: "none" }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          style={{
            height: 44,
            background: "#ffffff",
            color: "#0D2B1E",
            border: "1px dashed #3D8A30",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: uploading ? "not-allowed" : "pointer",
            opacity: uploading ? 0.7 : 1,
          }}
        >
          {uploading ? "Laddar upp…" : "Ta foto / lägg till fil"}
        </button>
        <div style={{ fontSize: 12, color: "#6B7280" }}>Bilder och PDF, max 10 MB per fil.</div>
        {fileError && <div style={{ fontSize: 13, color: "#DC2626" }}>{fileError}</div>}

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

      {doneAt ? (
        <div style={{ fontSize: 13, color: "#3D8A30", fontWeight: 600 }}>
          Du har meddelat att uppdraget är slutfört. Förvaltaren granskar och avslutar ärendet.
        </div>
      ) : (
        <button
          type="button"
          disabled={doneSaving}
          onClick={() => {
            if (window.confirm("Meddela förvaltaren att uppdraget är slutfört?")) onDone();
          }}
          style={{
            height: 44,
            background: "#0D2B1E",
            color: "#ffffff",
            border: "1px solid #0D2B1E",
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 600,
            cursor: doneSaving ? "not-allowed" : "pointer",
            opacity: doneSaving ? 0.7 : 1,
          }}
        >
          {doneSaving ? "Skickar…" : "Meddela att uppdraget är slutfört"}
        </button>
      )}
    </div>
  );
}
