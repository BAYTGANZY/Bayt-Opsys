import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { sanitizeStorageName } from "@/lib/storage";
import { inspectionTypeLabel } from "@/lib/inspection-tokens";

type Kind = "issue" | "inspection" | "project";

const TABLE: Record<Kind, string> = { issue: "issues", inspection: "inspections", project: "projects" };
const KIND_LABEL: Record<Kind, string> = { issue: "Felanmälan", inspection: "Besiktning", project: "Projekt" };
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

const C = { border: "#E5E7EB", primary: "#3D8A30", dark: "#0D2B1E", secondary: "#6B7280", text: "#1a1a1a", wash: "#F9FAFB" };

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s.length <= 10 ? `${s}T00:00:00` : s);
  return Number.isNaN(d.getTime()) ? "—" : new Intl.DateTimeFormat("sv-SE", { dateStyle: "long" }).format(d);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "baseline", minWidth: 0 }}>
      <div style={{ fontSize: 11, color: C.secondary, textTransform: "uppercase", letterSpacing: "0.06em", width: 110, flexShrink: 0 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: C.text, minWidth: 0, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{children}</div>
    </div>
  );
}

type FileRow = { id: string; file_name: string; mime: string | null; url: string | null };

export function EntreprenorView({ kind, id }: { kind: Kind; id: string }) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const rowQ = useQuery({
    queryKey: ["entreprenor-arende", kind, id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TABLE[kind])
        .select("*, properties(name)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const filesQ = useQuery({
    queryKey: ["entreprenor-files", kind, id],
    queryFn: async (): Promise<FileRow[]> => {
      const { data, error } = await supabase
        .from("contractor_files")
        .select("id, path, file_name, mime")
        .eq("kind", kind)
        .eq("arende_id", id)
        .order("created_at", { ascending: false });
      if (error) return [];
      const out: FileRow[] = [];
      for (const r of data ?? []) {
        const { data: signed } = await supabase.storage.from("contractor-files").createSignedUrl(String(r.path), 3600);
        out.push({ id: r.id as string, file_name: r.file_name as string, mime: (r.mime as string | null) ?? null, url: signed?.signedUrl ?? null });
      }
      return out;
    },
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["entreprenor-arende", kind, id] });
    void qc.invalidateQueries({ queryKey: ["entreprenor-files", kind, id] });
  };

  const saveNote = useMutation({
    mutationFn: async () => {
      const value = (note ?? rowQ.data?.contractor_note ?? "").trim();
      const { data, error } = await supabase
        .from(TABLE[kind])
        .update({ contractor_note: value || null })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Du saknar behörighet att ändra det här ärendet.");
    },
    onSuccess: () => {
      toast.success("Kommentaren är sparad", { style: { background: "#3D8A30", color: "#fff" } });
      refresh();
    },
    onError: (e: any) => toast.error(e.message ?? "Kunde inte spara"),
  });

  const markDone = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from(TABLE[kind])
        .update({ contractor_done_at: new Date().toISOString() })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Du saknar behörighet att ändra det här ärendet.");
    },
    onSuccess: () => {
      toast.success("Förvaltaren har fått besked om att uppdraget är slutfört", { style: { background: "#3D8A30", color: "#fff" } });
      refresh();
    },
    onError: (e: any) => toast.error(e.message ?? "Kunde inte skicka"),
  });

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
    setUploading(true);
    try {
      for (const f of picked) {
        if (!ALLOWED.includes(f.type)) throw new Error(`${f.name}: bara bilder och PDF tillåts.`);
        if (f.size > MAX_BYTES) throw new Error(`${f.name} är för stor (max 10 MB).`);
        const path = `${kind}/${id}/${crypto.randomUUID()}-${sanitizeStorageName(f.name)}`;
        const { error: upErr } = await supabase.storage.from("contractor-files").upload(path, f, { contentType: f.type });
        if (upErr) throw new Error(`Uppladdningen av ${f.name} misslyckades.`);
        const { error: insErr } = await supabase.from("contractor_files").insert({
          kind,
          arende_id: id,
          path,
          file_name: f.name,
          mime: f.type,
          size_bytes: f.size,
          uploaded_by_label: profile?.full_name ?? null,
        });
        if (insErr) throw insErr;
      }
      toast.success("Uppladdat!", { style: { background: "#3D8A30", color: "#fff" } });
    } catch (err: any) {
      toast.error(err?.message ?? "Uppladdningen misslyckades");
    } finally {
      setUploading(false);
      refresh();
    }
  }

  if (rowQ.isLoading) return <div style={{ padding: 32, color: C.secondary }}>Laddar…</div>;
  if (rowQ.error || !rowQ.data) return <div style={{ padding: 32, color: "#DC2626" }}>Ärendet hittades inte</div>;

  const r = rowQ.data;
  const title = kind === "inspection" ? inspectionTypeLabel(r.inspection_type) : (r.title ?? KIND_LABEL[kind]);
  const description = kind === "inspection" ? r.notes : r.description;
  const deadline = kind === "issue" ? r.deadline : kind === "inspection" ? r.next_due_date : r.end_date;
  const deadlineLabel = kind === "inspection" ? "Nästa besiktning" : kind === "project" ? "Slutdatum" : "Tidsgräns";
  const noteValue = note ?? r.contractor_note ?? "";
  const doneAt = r.contractor_done_at as string | null;
  const files = filesQ.data ?? [];

  const box: React.CSSProperties = {
    width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px",
    fontSize: 14, fontFamily: "inherit", boxSizing: "border-box",
  };

  return (
    <div style={{ padding: 16, maxWidth: 720, margin: "0 auto", display: "grid", gap: 16 }}>
      <button
        type="button"
        onClick={() => window.history.back()}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.secondary, fontSize: 14, cursor: "pointer", padding: 0, justifySelf: "start" }}
      >
        <ArrowLeft size={18} /> Tillbaka
      </button>

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.secondary, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {KIND_LABEL[kind]}
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: "4px 0 0" }}>{title}</h1>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, display: "grid", gap: 10 }}>
        <Row label="Fastighet">{r.properties?.name ?? "—"}</Row>
        <Row label={deadlineLabel}>{fmtDate(deadline)}</Row>
        {kind === "project" && r.budget ? <Row label="Budget">{`${Number(r.budget).toLocaleString("sv-SE")} kr`}</Row> : null}
        {kind === "issue" && (r.reporter_name || r.reporter_phone) ? (
          <Row label="Anmälare">{[r.reporter_name, r.reporter_phone].filter(Boolean).join(" · ")}</Row>
        ) : null}
        {description ? (
          <div style={{ background: C.wash, borderRadius: 8, padding: "12px 14px", marginTop: 4 }}>
            <div style={{ fontSize: 11, color: C.secondary, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
              Beskrivning från förvaltaren
            </div>
            <div style={{ fontSize: 14, color: C.text, lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{description}</div>
          </div>
        ) : null}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6, fontSize: 13, color: C.text }}>
          Din kommentar
          <textarea
            rows={4}
            style={box}
            value={noteValue}
            placeholder="Skriv här, t.ex. vad som är gjort eller vad som behövs."
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={saveNote.isPending}
          onClick={() => saveNote.mutate()}
          style={{ height: 44, background: C.primary, color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: saveNote.isPending ? "not-allowed" : "pointer", opacity: saveNote.isPending ? 0.7 : 1 }}
        >
          {saveNote.isPending ? "Sparar…" : "Spara kommentar"}
        </button>

        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 13, color: C.text }}>Bilder och filer</div>
          <input ref={inputRef} type="file" accept={ALLOWED.join(",")} multiple onChange={onPick} style={{ display: "none" }} />
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            style={{ height: 44, background: "#fff", color: C.dark, border: `1px dashed ${C.primary}`, borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: uploading ? "not-allowed" : "pointer", opacity: uploading ? 0.7 : 1 }}
          >
            {uploading ? "Laddar upp…" : "Ta foto / lägg till fil"}
          </button>
          <div style={{ fontSize: 12, color: C.secondary }}>Bilder och PDF, max 10 MB per fil.</div>
          {files.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
              {files.map((f) => {
                const isImage = (f.mime ?? "").startsWith("image/");
                return (
                  <a key={f.id} href={f.url ?? undefined} target="_blank" rel="noreferrer"
                    style={{ display: "block", border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", textDecoration: "none", color: C.text, fontSize: 12 }}>
                    {isImage && f.url ? (
                      <img src={f.url} alt={f.file_name} style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }} />
                    ) : (
                      <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", background: C.wash, fontWeight: 600 }}>PDF</div>
                    )}
                    <div style={{ padding: "4px 6px", overflowWrap: "anywhere" }}>{f.file_name}</div>
                  </a>
                );
              })}
            </div>
          )}
        </div>

        {doneAt ? (
          <div style={{ fontSize: 13, color: C.primary, fontWeight: 600 }}>
            Du har meddelat att uppdraget är slutfört. Förvaltaren granskar och avslutar ärendet.
          </div>
        ) : (
          <button
            type="button"
            disabled={markDone.isPending}
            onClick={() => {
              if (window.confirm("Meddela förvaltaren att uppdraget är slutfört?")) markDone.mutate();
            }}
            style={{ height: 44, background: C.dark, color: "#fff", border: `1px solid ${C.dark}`, borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: markDone.isPending ? "not-allowed" : "pointer", opacity: markDone.isPending ? 0.7 : 1 }}
          >
            {markDone.isPending ? "Skickar…" : "Meddela att uppdraget är slutfört"}
          </button>
        )}
      </div>
    </div>
  );
}
