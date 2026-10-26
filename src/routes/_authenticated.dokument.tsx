import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, X, Download, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { storagePathFromPublicUrl } from "@/lib/storage";
import { inspectionTypeLabel } from "@/lib/inspection-tokens";
import { MinaDokument } from "@/components/MinaDokument";

export const Route = createFileRoute("/_authenticated/dokument")({
  head: () => ({ meta: [{ title: "Dokument — BAYT" }] }),
  component: DokumentPage,
});

const C = {
  border: "#E5E7EB",
  primary: "#3D8A30",
  secondary: "#6B7280",
  text: "#1a1a1a",
  error: "#DC2626",
  wash: "#F9FAFB",
};

type Kind = "issue" | "inspection" | "project";
type SourceTable = "issue_images" | "project_images" | "inspection_protocols" | "contractor_files";

const KIND_LABEL: Record<Kind, string> = { issue: "Felanmälan", inspection: "Besiktning", project: "Projekt" };
const KIND_PATH: Record<Kind, string> = { issue: "issues", inspection: "inspections", project: "projects" };

type Doc = {
  key: string;
  table: SourceTable;
  rowId: string;
  kind: Kind;
  arendeId: string;
  arendeTitle: string;
  propertyName: string;
  name: string;
  bucket: string | null;
  storagePath: string | null;
  isImage: boolean;
  openUrl: string | null;
  downloadUrl: string | null;
  uploadedBy: string | null;
  uploaderName: string;
  createdAt: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row_ = Record<string, any>;

function nameFromUrl(url: string): string {
  try {
    const last = decodeURIComponent(url.split("?")[0].split("/").pop() ?? "");
    return last.replace(/^\d{10,}-/, "") || "Fil";
  } catch {
    return "Fil";
  }
}

const isImageName = (n: string) => /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(n);

const fmtDate = (s: string) => new Intl.DateTimeFormat("sv-SE").format(new Date(s));

async function sign(bucket: string, path: string, name: string) {
  const [a, b] = await Promise.all([
    supabase.storage.from(bucket).createSignedUrl(path, 3600),
    supabase.storage.from(bucket).createSignedUrl(path, 3600, { download: name }),
  ]);
  return { open: a.data?.signedUrl ?? null, dl: b.data?.signedUrl ?? null };
}

async function loadDocs(): Promise<Doc[]> {
  const [proj, iss, insp, contr] = await Promise.all([
    supabase.from("project_images").select("id, project_id, url, uploaded_by, created_at").order("created_at", { ascending: false }).limit(200),
    supabase.from("issue_images").select("id, issue_id, url, uploaded_by, created_at").order("created_at", { ascending: false }).limit(200),
    supabase.from("inspection_protocols").select("id, inspection_id, protocol_url, uploaded_by, created_at").order("created_at", { ascending: false }).limit(200),
    supabase.from("contractor_files").select("*").order("created_at", { ascending: false }).limit(200),
  ]);

  const projRows = (proj.data ?? []) as Row_[];
  const issRows = (iss.data ?? []) as Row_[];
  const inspRows = (insp.data ?? []) as Row_[];
  const contrRows = (contr.data ?? []) as Row_[];

  const ids = (arr: Row_[], f: string) => [...new Set(arr.map((r) => r[f] as string).filter(Boolean))];
  const issueIds = [...new Set([...ids(issRows, "issue_id"), ...ids(contrRows.filter((r) => r.kind === "issue"), "arende_id")])];
  const projectIds = [...new Set([...ids(projRows, "project_id"), ...ids(contrRows.filter((r) => r.kind === "project"), "arende_id")])];
  const inspectionIds = [...new Set([...ids(inspRows, "inspection_id"), ...ids(contrRows.filter((r) => r.kind === "inspection"), "arende_id")])];

  const [issuesQ, projectsQ, inspectionsQ] = await Promise.all([
    issueIds.length ? supabase.from("issues").select("id, title, property_id").in("id", issueIds) : Promise.resolve({ data: [] as Row_[] }),
    projectIds.length ? supabase.from("projects").select("id, title, property_id").in("id", projectIds) : Promise.resolve({ data: [] as Row_[] }),
    inspectionIds.length ? supabase.from("inspections").select("id, inspection_type, property_id").in("id", inspectionIds) : Promise.resolve({ data: [] as Row_[] }),
  ]);

  const issueMap = new Map<string, Row_>(((issuesQ.data ?? []) as Row_[]).map((r) => [r.id, r]));
  const projectMap = new Map<string, Row_>(((projectsQ.data ?? []) as Row_[]).map((r) => [r.id, r]));
  const inspectionMap = new Map<string, Row_>(((inspectionsQ.data ?? []) as Row_[]).map((r) => [r.id, r]));

  const propertyIds = [
    ...new Set(
      [...issueMap.values(), ...projectMap.values(), ...inspectionMap.values()]
        .map((r) => r.property_id as string)
        .filter(Boolean),
    ),
  ];
  const uploaderIds = [
    ...new Set(
      [...projRows, ...issRows, ...inspRows, ...contrRows].map((r) => r.uploaded_by as string).filter(Boolean),
    ),
  ];

  const [propsQ, profilesQ] = await Promise.all([
    propertyIds.length ? supabase.from("properties").select("id, name").in("id", propertyIds) : Promise.resolve({ data: [] as Row_[] }),
    uploaderIds.length ? supabase.from("profiles").select("id, full_name").in("id", uploaderIds) : Promise.resolve({ data: [] as Row_[] }),
  ]);
  const propMap = new Map<string, string>(((propsQ.data ?? []) as Row_[]).map((r) => [r.id, r.name as string]));
  const nameMap = new Map<string, string>(((profilesQ.data ?? []) as Row_[]).map((r) => [r.id, (r.full_name as string) ?? ""]));

  const parentOf = (kind: Kind, id: string): { title: string; property: string } => {
    if (kind === "issue") {
      const r = issueMap.get(id);
      return { title: r?.title ?? "Felanmälan", property: propMap.get(r?.property_id) ?? "" };
    }
    if (kind === "project") {
      const r = projectMap.get(id);
      return { title: r?.title ?? "Projekt", property: propMap.get(r?.property_id) ?? "" };
    }
    const r = inspectionMap.get(id);
    return { title: r ? inspectionTypeLabel(r.inspection_type) : "Besiktning", property: propMap.get(r?.property_id) ?? "" };
  };

  const docs: Doc[] = [];

  const pushPublic = async (table: SourceTable, kind: Kind, rows: Row_[], arendeField: string, urlField: string) => {
    for (const r of rows) {
      const stored = String(r[urlField] ?? "");
      if (!stored) continue;
      const name = nameFromUrl(stored);
      const parsed = storagePathFromPublicUrl(stored);
      let open: string | null = stored;
      let dl: string | null = stored;
      if (parsed) {
        const s = await sign(parsed.bucket, parsed.path, name);
        open = s.open ?? stored;
        dl = s.dl ?? stored;
      }
      const p = parentOf(kind, r[arendeField]);
      docs.push({
        key: `${table}-${r.id}`,
        table,
        rowId: r.id,
        kind,
        arendeId: r[arendeField],
        arendeTitle: p.title,
        propertyName: p.property,
        name,
        bucket: parsed?.bucket ?? null,
        storagePath: parsed?.path ?? null,
        isImage: isImageName(name),
        openUrl: open,
        downloadUrl: dl,
        uploadedBy: r.uploaded_by ?? null,
        uploaderName: nameMap.get(r.uploaded_by) ?? "",
        createdAt: r.created_at,
      });
    }
  };

  await pushPublic("project_images", "project", projRows, "project_id", "url");
  await pushPublic("issue_images", "issue", issRows, "issue_id", "url");
  await pushPublic("inspection_protocols", "inspection", inspRows, "inspection_id", "protocol_url");

  for (const r of contrRows) {
    const kind = r.kind as Kind;
    if (!KIND_LABEL[kind]) continue;
    const name = String(r.file_name ?? nameFromUrl(String(r.path ?? "")));
    const s = await sign("contractor-files", String(r.path), name);
    const p = parentOf(kind, r.arende_id);
    docs.push({
      key: `contractor_files-${r.id}`,
      table: "contractor_files",
      rowId: r.id,
      kind,
      arendeId: r.arende_id,
      arendeTitle: p.title,
      propertyName: p.property,
      name,
      bucket: "contractor-files",
      storagePath: String(r.path),
      isImage: (r.mime ?? "").startsWith("image/") || isImageName(name),
      openUrl: s.open,
      downloadUrl: s.dl,
      uploadedBy: r.uploaded_by ?? null,
      uploaderName: nameMap.get(r.uploaded_by) ?? (r.uploaded_by_label ?? ""),
      createdAt: r.created_at,
    });
  }

  return docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function ArendeFiler({ isMobile }: { isMobile: boolean }) {
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  const [q, setQ] = useState("");
  const [kindFilter, setKindFilter] = useState<Kind | "alla">("alla");

  const docsQ = useQuery({
    queryKey: ["dokument-samlat", user?.id],
    enabled: !!user,
    queryFn: loadDocs,
  });

  const remove = useMutation({
    mutationFn: async (d: Doc) => {
      const { data, error } = await supabase.from(d.table).delete().eq("id", d.rowId).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Du saknar behörighet att ta bort filen.");
      if (d.bucket && d.storagePath) await supabase.storage.from(d.bucket).remove([d.storagePath]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dokument-samlat"] });
      toast.success("Filen är borttagen", { style: { background: "#3D8A30", color: "#fff" } });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Kunde inte ta bort filen"),
  });

  const canRemove = (d: Doc) => profile?.role === "admin" || (!!user && d.uploadedBy === user.id);
  const confirmRemove = (d: Doc) => {
    if (window.confirm(`Ta bort "${d.name}"? Det går inte att ångra.`)) remove.mutate(d);
  };

  const all = docsQ.data ?? [];
  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter((d) => {
      if (kindFilter !== "alla" && d.kind !== kindFilter) return false;
      if (!s) return true;
      return (
        d.name.toLowerCase().includes(s) ||
        d.arendeTitle.toLowerCase().includes(s) ||
        d.propertyName.toLowerCase().includes(s) ||
        d.uploaderName.toLowerCase().includes(s)
      );
    });
  }, [all, q, kindFilter]);

  const chip = (active: boolean): React.CSSProperties => ({
    height: 32,
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
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ fontSize: 13, color: C.secondary }}>
          Filer som hör till dina ärenden: bilder, protokoll och bilagor. Du ser bara det du har åtkomst till.
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            border: `1px solid ${C.border}`,
            borderRadius: 999,
            padding: "0 14px",
            height: 36,
            background: "#fff",
            color: C.secondary,
            minWidth: isMobile ? "100%" : 260,
          }}
        >
          <Search size={14} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Sök fil, ärende eller fastighet…"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13, minWidth: 0, color: C.text }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(["alla", "issue", "inspection", "project"] as const).map((k) => (
          <button key={k} type="button" style={chip(kindFilter === k)} onClick={() => setKindFilter(k)}>
            {k === "alla" ? "Alla" : KIND_LABEL[k]}
          </button>
        ))}
      </div>

      {docsQ.isLoading ? (
        <div style={{ color: C.secondary }}>Laddar…</div>
      ) : visible.length === 0 ? (
        <div style={{ padding: 48, textAlign: "center", color: C.secondary, fontSize: 14 }}>
          {all.length === 0 ? "Inga filer ännu" : "Inga filer för det här valet"}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {visible.map((d) => (
            <div
              key={d.key}
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
                {d.isImage && d.openUrl ? (
                  <a href={d.openUrl} target="_blank" rel="noreferrer" style={{ flexShrink: 0, display: "block" }}>
                    <img
                      src={d.openUrl}
                      alt={d.name}
                      loading="lazy"
                      style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.border}`, display: "block" }}
                    />
                  </a>
                ) : (
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 8,
                      background: C.wash,
                      border: `1px solid ${C.border}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <FileText size={24} color={C.secondary} />
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflowWrap: "anywhere" }}>{d.name}</div>
                  <div style={{ fontSize: 12.5, color: C.secondary, marginTop: 2, overflowWrap: "anywhere" }}>
                    <Link
                      to={`/${KIND_PATH[d.kind]}/${d.arendeId}` as never}
                      style={{ color: C.primary, textDecoration: "none", fontWeight: 600 }}
                    >
                      {KIND_LABEL[d.kind]}: {d.arendeTitle}
                    </Link>
                    {d.propertyName ? ` · ${d.propertyName}` : ""}
                  </div>
                  <div style={{ fontSize: 12, color: C.secondary, marginTop: 2 }}>
                    {fmtDate(d.createdAt)}
                    {d.uploaderName ? ` · ${d.uploaderName}` : ""}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
                <a href={d.openUrl ?? undefined} target="_blank" rel="noreferrer" style={linkStyle}>
                  Öppna
                </a>
                <a href={d.downloadUrl ?? undefined} style={linkStyle} title="Ladda ner">
                  <Download size={14} /> Ladda ner
                </a>
                {canRemove(d) && (
                  <button
                    type="button"
                    title="Ta bort filen"
                    aria-label="Ta bort filen"
                    onClick={() => confirmRemove(d)}
                    disabled={remove.isPending}
                    style={{ border: "none", background: "transparent", color: C.error, cursor: "pointer", padding: 4, display: "inline-flex" }}
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

function DokumentPage() {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<"arenden" | "mina">("arenden");

  const tabStyle = (active: boolean): React.CSSProperties => ({
    height: 40,
    padding: "0 18px",
    border: "none",
    background: "transparent",
    borderBottom: `3px solid ${active ? C.primary : "transparent"}`,
    color: active ? C.text : C.secondary,
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  });

  return (
    <div style={{ padding: isMobile ? 16 : 32, display: "flex", flexDirection: "column", gap: 18 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0, fontFamily: "Outfit, Inter, system-ui, sans-serif" }}>
        Dokument
      </h1>
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${C.border}` }}>
        <button type="button" style={tabStyle(tab === "arenden")} onClick={() => setTab("arenden")}>
          Ärendefiler
        </button>
        <button type="button" style={tabStyle(tab === "mina")} onClick={() => setTab("mina")}>
          Mina dokument
        </button>
      </div>
      {tab === "arenden" ? <ArendeFiler isMobile={isMobile} /> : <MinaDokument isMobile={isMobile} />}
    </div>
  );
}
