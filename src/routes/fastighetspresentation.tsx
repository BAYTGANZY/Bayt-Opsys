import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { canEdit } from "@/lib/permissions";
import { sanitizeStorageName, useSignedFileUrls } from "@/lib/storage";
import {
  deriveIssueStatus,
  deriveInspectionStatus,
  deriveProjectStatus,
  derivePriority,
  LIFECYCLE_OF,
  type DerivedStatus,
} from "@/lib/issue-tokens";
import { DerivedStatusBadge } from "@/components/DerivedStatusBadge";
import { inspectionTypeLabel } from "@/lib/inspection-tokens";
import {
  PRESENTATION_TILES,
  CUSTOM_ICON_CHOICES,
  PresentationIcon,
} from "@/lib/presentation-config";
import { TEKNIK_SECTIONS } from "@/lib/teknik-config";

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

type Kind = "issue" | "inspection" | "project";
type Lifecycle = "vilande" | "oppet" | "avslutat";

type PItem = {
  kind: Kind;
  id: string;
  title: string;
  description: string | null;
  lifecycle: Lifecycle;
  status: DerivedStatus;
  createdAt: string | null;
  place: string | null;
  assignee: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: Record<string, any>;
};

type View = { t: "section"; key: string } | { t: "tile"; id: string } | null;

const TABLE: Record<Kind, string> = { issue: "issues", inspection: "inspections", project: "projects" };
const KIND_LABEL: Record<Kind, string> = { issue: "Felanmälan", inspection: "Besiktning", project: "Projekt" };

const dayFmt = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long", year: "numeric" });
function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? "—" : dayFmt.format(d);
}

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

function SignedImage({ path, alt, className }: { path: string | null; alt: string; className?: string }) {
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

// ---------------------------------------------------------------------------
// Data: ärenden för en fastighet
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lifecycleFor(kind: Kind, row: Record<string, any>): Lifecycle {
  const map = LIFECYCLE_OF as Record<string, Lifecycle>;
  if (kind === "issue") return map[String(row.status ?? "")] ?? "vilande";
  if (row.arende_status) return map[String(row.arende_status)] ?? "vilande";
  const legacy = String(row.status ?? "");
  if (kind === "inspection") return legacy === "klar" ? "avslutat" : "oppet";
  return legacy === "klar" || legacy === "avbruten" ? "avslutat" : "oppet";
}

function useItems(kind: Kind, propertyId: string, enabled: boolean) {
  const rowsQ = useQuery({
    queryKey: ["fp-items", kind, propertyId],
    enabled: enabled && !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase.from(TABLE[kind]).select("*").eq("property_id", propertyId);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as Array<Record<string, any>>;
    },
  });

  const placesQ = useQuery({
    queryKey: ["fp-places", propertyId],
    enabled: enabled && !!propertyId,
    queryFn: async () => {
      const [a, o] = await Promise.all([
        supabase.from("apartments").select("id, apartment_number").eq("property_id", propertyId),
        supabase.from("property_objects").select("id, name, type").eq("property_id", propertyId),
      ]);
      const apts: Record<string, string> = {};
      for (const r of (a.data ?? []) as Array<{ id: string; apartment_number: string }>) {
        apts[r.id] = `Lgh ${r.apartment_number}`;
      }
      const objs: Record<string, string> = {};
      for (const r of (o.data ?? []) as Array<{ id: string; name: string | null; type: string | null }>) {
        objs[r.id] = r.name || r.type || "Objekt";
      }
      return { apts, objs };
    },
  });

  const contactsQ = useQuery({
    queryKey: ["fp-contacts"],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from("contacts").select("id, full_name, company");
      const out: Record<string, string> = {};
      for (const c of (data ?? []) as Array<{ id: string; full_name: string | null; company: string | null }>) {
        out[c.id] = c.full_name || c.company || "—";
      }
      return out;
    },
  });

  const items = useMemo<PItem[]>(() => {
    const rows = rowsQ.data ?? [];
    const apts = placesQ.data?.apts ?? {};
    const objs = placesQ.data?.objs ?? {};
    const contacts = contactsQ.data ?? {};
    return rows.map((row) => {
      let status: DerivedStatus;
      let title: string;
      let description: string | null;
      if (kind === "issue") {
        const prio = derivePriority(row.deadline || null, { from: row.created_at });
        status = deriveIssueStatus({
          status: row.status,
          priority: prio.key,
          created_at: row.created_at,
          deadline: row.deadline || null,
        });
        title = row.title || "Felanmälan";
        description = row.description ?? null;
      } else if (kind === "inspection") {
        status = deriveInspectionStatus({
          status: row.status ?? null,
          arende_status: row.arende_status ?? null,
          next_due_date: row.next_due_date ?? null,
          last_completed_date: row.last_completed_date ?? null,
          interval_months: row.interval_months ?? null,
        });
        title = inspectionTypeLabel(row.inspection_type);
        description = row.notes ?? null;
      } else {
        status = deriveProjectStatus({
          status: row.status ?? null,
          arende_status: row.arende_status ?? null,
          start_date: row.start_date ?? null,
          end_date: row.end_date ?? null,
        });
        title = row.title || "Projekt";
        description = row.description ?? null;
      }
      const place = row.apartment_id
        ? apts[row.apartment_id] ?? null
        : row.property_object_id
          ? objs[row.property_object_id] ?? null
          : null;
      return {
        kind,
        id: row.id as string,
        title,
        description,
        lifecycle: lifecycleFor(kind, row),
        status,
        createdAt: (row.created_at as string | null) ?? null,
        place,
        assignee: row.assigned_contact_id ? contacts[row.assigned_contact_id] ?? null : null,
        raw: row,
      };
    });
  }, [rowsQ.data, placesQ.data, contactsQ.data, kind]);

  return { items, isLoading: rowsQ.isLoading };
}

function isOverdue(i: PItem): boolean {
  return i.lifecycle !== "avslutat" && i.status.daysLeft != null && i.status.daysLeft < 0;
}

function sortItems(list: PItem[]): PItem[] {
  return [...list].sort((a, b) => {
    const ad = a.status.dueDate ?? "9999-12-31";
    const bd = b.status.dueDate ?? "9999-12-31";
    if (ad !== bd) return ad.localeCompare(bd);
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  });
}

// ---------------------------------------------------------------------------
// Detaljvy för ett ärende (ligger ovanpå presentationen)
// ---------------------------------------------------------------------------
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="fp-drow">
      <div className="fp-dlabel">{label}</div>
      <div className="fp-dvalue">{children}</div>
    </div>
  );
}

function ArendeDetail({
  item,
  propertyName,
  hideSensitive,
  onClose,
}: {
  item: PItem;
  propertyName: string;
  hideSensitive: boolean;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState<string | null>(null);
  const r = item.raw;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (zoom) setZoom(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom, onClose]);

  const commentsQ = useQuery({
    queryKey: ["fp-comments", item.id],
    enabled: item.kind === "issue",
    queryFn: async () => {
      const { data } = await supabase
        .from("issue_comments")
        .select("id, content, created_at, profiles:created_by(full_name)")
        .eq("issue_id", item.id)
        .order("created_at", { ascending: true });
      return (data ?? []) as unknown as Array<{
        id: string;
        content: string;
        created_at: string;
        profiles: { full_name: string | null } | null;
      }>;
    },
  });

  const imagesQ = useQuery({
    queryKey: ["fp-images", item.kind, item.id],
    enabled: item.kind !== "inspection",
    queryFn: async () => {
      const table = item.kind === "issue" ? "issue_images" : "project_images";
      const col = item.kind === "issue" ? "issue_id" : "project_id";
      const { data } = await supabase.from(table).select("id, url").eq(col, item.id).order("created_at", { ascending: false });
      return (data ?? []) as Array<{ id: string; url: string }>;
    },
  });
  const resolve = useSignedFileUrls((imagesQ.data ?? []).map((i) => i.url));

  return (
    <div className="fp-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="fp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fp-modal-top">
          <span className="fp-kind">{KIND_LABEL[item.kind]}</span>
          <button type="button" className="fp-btn" onClick={onClose}>
            Stäng
          </button>
        </div>
        <h2 className="fp-modal-title">{item.title}</h2>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
          <DerivedStatusBadge status={item.status} size="field" />
        </div>
        <div className="fp-reason">{item.status.reason}</div>

        <div className="fp-dgrid">
          <DetailRow label="Fastighet">{propertyName}</DetailRow>
          {item.place && <DetailRow label="Plats">{item.place}</DetailRow>}
          <DetailRow label="Ansvarig">{item.assignee ?? "Ej tilldelad"}</DetailRow>
          {item.status.dueDate && <DetailRow label="Tidsgräns">{fmtDay(item.status.dueDate)}</DetailRow>}
          {item.kind === "issue" && r.category && <DetailRow label="Kategori">{r.category}</DetailRow>}
          {item.kind === "issue" && <DetailRow label="Anmäld">{fmtDay(item.createdAt)}</DetailRow>}
          {item.kind === "inspection" && r.inspector && <DetailRow label="Besiktningsman">{r.inspector}</DetailRow>}
          {item.kind === "inspection" && r.interval_months && (
            <DetailRow label="Intervall">{`${r.interval_months} månader`}</DetailRow>
          )}
          {item.kind === "inspection" && r.last_completed_date && (
            <DetailRow label="Senast utförd">{fmtDay(r.last_completed_date)}</DetailRow>
          )}
          {item.kind === "inspection" && r.next_due_date && (
            <DetailRow label="Nästa besiktning">{fmtDay(r.next_due_date)}</DetailRow>
          )}
          {item.kind === "project" && r.start_date && <DetailRow label="Startdatum">{fmtDay(r.start_date)}</DetailRow>}
          {item.kind === "project" && r.end_date && <DetailRow label="Slutdatum">{fmtDay(r.end_date)}</DetailRow>}
          {item.kind === "project" && r.budget && !hideSensitive && (
            <DetailRow label="Budget">{`${Number(r.budget).toLocaleString("sv-SE")} kr`}</DetailRow>
          )}
          {item.kind === "issue" && !hideSensitive && (r.reporter_name || r.reporter_phone) && (
            <DetailRow label="Anmälare">{[r.reporter_name, r.reporter_phone].filter(Boolean).join(" · ")}</DetailRow>
          )}
        </div>

        {item.description && (
          <div className="fp-block">
            <div className="fp-dlabel">Beskrivning</div>
            <div className="fp-text-sm">{item.description}</div>
          </div>
        )}

        {r.contractor_note && (
          <div className="fp-block">
            <div className="fp-dlabel">Kommentar från entreprenören</div>
            <div className="fp-text-sm">{r.contractor_note}</div>
          </div>
        )}

        {item.kind === "issue" && (commentsQ.data ?? []).length > 0 && (
          <div className="fp-block">
            <div className="fp-dlabel">Kommentarer</div>
            {(commentsQ.data ?? []).map((c) => (
              <div key={c.id} className="fp-comment">
                <div className="fp-comment-head">
                  <b>{c.profiles?.full_name ?? "Okänd"}</b>
                  <span>{fmtDay(c.created_at)}</span>
                </div>
                <div className="fp-text-sm">{c.content}</div>
              </div>
            ))}
          </div>
        )}

        {(imagesQ.data ?? []).length > 0 && (
          <div className="fp-block">
            <div className="fp-dlabel">Bilder</div>
            <div className="fp-thumbs">
              {(imagesQ.data ?? []).map((img) => (
                <button key={img.id} type="button" className="fp-thumb" onClick={() => setZoom(resolve(img.url))}>
                  <img src={resolve(img.url)} alt="" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {zoom && (
        <div
          className="fp-zoom"
          onClick={(e) => {
            e.stopPropagation();
            setZoom(null);
          }}
        >
          <img src={zoom} alt="" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sammanställning: felanmälningar, besiktningar, projekt
// ---------------------------------------------------------------------------
type FilterKey = "aktiva" | "forsenade" | "avslutade" | "alla";

function ArendeSection({
  kind,
  propertyId,
  propertyName,
  hideSensitive,
}: {
  kind: Kind;
  propertyId: string;
  propertyName: string;
  hideSensitive: boolean;
}) {
  const { items, isLoading } = useItems(kind, propertyId, true);
  const [filter, setFilter] = useState<FilterKey>("aktiva");
  const [open, setOpen] = useState<PItem | null>(null);

  const counts = useMemo(
    () => ({
      aktiva: items.filter((i) => i.lifecycle !== "avslutat").length,
      forsenade: items.filter(isOverdue).length,
      avslutade: items.filter((i) => i.lifecycle === "avslutat").length,
      alla: items.length,
    }),
    [items],
  );

  const visible = useMemo(() => {
    let list = items;
    if (filter === "aktiva") list = items.filter((i) => i.lifecycle !== "avslutat");
    if (filter === "forsenade") list = items.filter(isOverdue);
    if (filter === "avslutade") list = items.filter((i) => i.lifecycle === "avslutat");
    return sortItems(list);
  }, [items, filter]);

  const chips: Array<{ key: FilterKey; label: string }> = [
    { key: "aktiva", label: "Aktiva" },
    { key: "forsenade", label: "Försenade" },
    { key: "avslutade", label: "Avslutade" },
    { key: "alla", label: "Alla" },
  ];

  return (
    <>
      <div className="fp-stats">
        <div className="fp-stat">
          <div className="fp-stat-n">{counts.aktiva}</div>
          <div className="fp-stat-l">Aktiva</div>
        </div>
        <div className={`fp-stat${counts.forsenade > 0 ? " fp-stat-warn" : ""}`}>
          <div className="fp-stat-n">{counts.forsenade}</div>
          <div className="fp-stat-l">Försenade</div>
        </div>
        <div className="fp-stat">
          <div className="fp-stat-n">{counts.avslutade}</div>
          <div className="fp-stat-l">Avslutade</div>
        </div>
      </div>

      <div className="fp-chips">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            className="fp-chip"
            aria-pressed={filter === c.key}
            onClick={() => setFilter(c.key)}
          >
            {c.label} ({counts[c.key]})
          </button>
        ))}
      </div>

      {isLoading && <div className="fp-muted">Hämtar…</div>}
      {!isLoading && visible.length === 0 && <div className="fp-muted">Inget att visa för det här valet.</div>}

      <div className="fp-list">
        {visible.map((i) => (
          <button key={i.id} type="button" className="fp-row" onClick={() => setOpen(i)}>
            <div className="fp-row-main">
              <div className="fp-row-title">{i.title}</div>
              <div className="fp-row-sub">
                {[i.place, i.assignee ?? "Ej tilldelad"].filter(Boolean).join(" · ")}
              </div>
            </div>
            <div className="fp-row-right">
              <div className="fp-row-due">
                {i.status.dueDate ? (
                  <span style={{ color: isOverdue(i) ? "#B91C1C" : undefined, fontWeight: 600 }}>
                    {fmtDay(i.status.dueDate)}
                  </span>
                ) : (
                  <span style={{ color: "#8A94A0" }}>Ingen tidsgräns</span>
                )}
              </div>
              <DerivedStatusBadge status={i.status} />
            </div>
          </button>
        ))}
      </div>

      {open && (
        <ArendeDetail item={open} propertyName={propertyName} hideSensitive={hideSensitive} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Teknik: framsteg per område för den valda fastigheten
// ---------------------------------------------------------------------------
function TeknikSection({ propertyId }: { propertyId: string }) {
  const itemsQ = useQuery({
    queryKey: ["fp-teknik-items"],
    queryFn: async () => {
      const { data } = await supabase
        .from("teknik_items")
        .select("id, section, label, sort_order")
        .order("sort_order")
        .order("created_at");
      return (data ?? []) as Array<{ id: string; section: string; label: string; sort_order: number }>;
    },
  });
  const roundsQ = useQuery({
    queryKey: ["fp-teknik-rounds", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("teknik_rounds")
        .select("id, section, started_at")
        .eq("property_id", propertyId)
        .is("completed_at", null);
      return (data ?? []) as Array<{ id: string; section: string; started_at: string }>;
    },
  });
  const rounds = roundsQ.data ?? [];
  const roundKey = rounds.map((r) => r.id).sort().join(",");
  const checksQ = useQuery({
    queryKey: ["fp-teknik-checks", roundKey],
    enabled: rounds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("teknik_checks")
        .select("round_id, item_id, checked, note")
        .in("round_id", rounds.map((r) => r.id));
      return (data ?? []) as Array<{ round_id: string; item_id: string; checked: boolean; note: string | null }>;
    },
  });
  const items = itemsQ.data ?? [];
  const checks = checksQ.data ?? [];

  return (
    <div className="fp-cards">
      {TEKNIK_SECTIONS.filter((s) => s.kind === "checklist").map((s) => {
        const sectionItems = items.filter((i) => i.section === s.key);
        const round = rounds.find((r) => r.section === s.key);
        const roundChecks = round ? checks.filter((c) => c.round_id === round.id) : [];
        const done = sectionItems.filter((i) => roundChecks.some((c) => c.item_id === i.id && c.checked)).length;
        const total = sectionItems.length;
        return (
          <div key={s.key} className="fp-card">
            <div className="fp-card-head">
              <PresentationIcon name={s.key === "ovk" ? "genomgang" : s.key === "energi" ? "teknik" : "note"} size={26} />
              <div className="fp-card-title">{s.label}</div>
              <div className="fp-card-count">
                {done}/{total}
              </div>
            </div>
            <div className="fp-bar">
              <div style={{ width: total > 0 ? `${Math.round((done / total) * 100)}%` : "0%" }} />
            </div>
            {!round && <div className="fp-muted" style={{ marginTop: 8 }}>Ingen genomgång påbörjad.</div>}
            {round && (
              <div style={{ marginTop: 8 }}>
                {sectionItems.map((it) => {
                  const c = roundChecks.find((x) => x.item_id === it.id);
                  return (
                    <div key={it.id} className={`fp-check${c?.checked ? " fp-check-done" : ""}`}>
                      <span className="fp-check-box">{c?.checked ? "✓" : ""}</span>
                      <span className="fp-check-label">
                        {it.label}
                        {c?.note ? <span className="fp-check-note"> — {c.note}</span> : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Översikt och Loggbok
// ---------------------------------------------------------------------------
function OversiktSection({ propertyId }: { propertyId: string }) {
  const issues = useItems("issue", propertyId, true).items;
  const inspections = useItems("inspection", propertyId, true).items;
  const projects = useItems("project", propertyId, true).items;
  const countsQ = useQuery({
    queryKey: ["fp-counts", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const [a, o] = await Promise.all([
        supabase.from("apartments").select("id", { count: "exact", head: true }).eq("property_id", propertyId),
        supabase.from("property_objects").select("id", { count: "exact", head: true }).eq("property_id", propertyId),
      ]);
      return { apartments: a.count ?? 0, objects: o.count ?? 0 };
    },
  });

  const active = (l: PItem[]) => l.filter((i) => i.lifecycle !== "avslutat").length;
  const late = (l: PItem[]) => l.filter(isOverdue).length;

  const stats: Array<{ label: string; value: number | string; warn?: boolean }> = [
    { label: "Lägenheter", value: countsQ.data?.apartments ?? "—" },
    { label: "Objekt", value: countsQ.data?.objects ?? "—" },
    { label: "Aktiva felanmälningar", value: active(issues) },
    { label: "Försenade felanmälningar", value: late(issues), warn: late(issues) > 0 },
    { label: "Aktiva besiktningar", value: active(inspections) },
    { label: "Försenade besiktningar", value: late(inspections), warn: late(inspections) > 0 },
    { label: "Aktiva projekt", value: active(projects) },
    { label: "Försenade projekt", value: late(projects), warn: late(projects) > 0 },
  ];

  return (
    <div className="fp-stats fp-stats-wrap">
      {stats.map((s) => (
        <div key={s.label} className={`fp-stat${s.warn ? " fp-stat-warn" : ""}`}>
          <div className="fp-stat-n">{s.value}</div>
          <div className="fp-stat-l">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function LoggbokSection({ propertyId }: { propertyId: string }) {
  const q = useQuery({
    queryKey: ["fp-logbook", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("logbook_entries")
        .select("id, entry_date, content, created_at")
        .eq("property_id", propertyId)
        .not("content", "ilike", "%skickat till%")
        .order("created_at", { ascending: false })
        .limit(40);
      return (data ?? []) as Array<{ id: string; entry_date: string | null; content: string; created_at: string }>;
    },
  });
  const rows = q.data ?? [];
  return (
    <>
      {q.isLoading && <div className="fp-muted">Hämtar…</div>}
      {!q.isLoading && rows.length === 0 && <div className="fp-muted">Inga poster i loggboken.</div>}
      <div className="fp-list">
        {rows.map((r) => (
          <div key={r.id} className="fp-row fp-row-static">
            <div className="fp-row-main">
              <div className="fp-row-title">{r.content}</div>
              <div className="fp-row-sub">{fmtDay(r.entry_date ?? r.created_at)}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Formulär för egna rutor
// ---------------------------------------------------------------------------
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
          {initial?.image_path && (
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

// ---------------------------------------------------------------------------
// Sidan
// ---------------------------------------------------------------------------
const INK = "#0D2B1E";
const GREEN = "#3D8A30";
const MUTED = "#6B7280";
const LINE = "#E3E7E2";

const STYLES = `
  .fp-page {
    position: relative; min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column;
    background: linear-gradient(180deg, #FFFFFF 0%, #F1F3F0 100%); color: ${INK};
    padding: 22px 40px 36px; font-family: Inter, system-ui, sans-serif; box-sizing: border-box;
  }
  .fp-header {
    display: flex; align-items: center; justify-content: flex-end; gap: 12px;
    padding-bottom: 16px; margin-bottom: 20px; border-bottom: 1px solid ${LINE};
  }
  .fp-leave {
    height: 40px; padding: 0 14px; display: inline-flex; align-items: center; border-radius: 8px; flex-shrink: 0;
    font-size: 13px; letter-spacing: 0.04em; text-decoration: none; color: ${MUTED}; border: 1px solid ${LINE}; background: #fff;
  }
  .fp-leave:hover { color: ${INK}; border-color: ${GREEN}; }
  .fp-select {
    height: 40px; padding: 0 12px; border-radius: 8px; font-size: 14px; font-family: inherit;
    background: #fff; color: ${INK}; border: 1px solid ${LINE}; min-width: 0; max-width: 280px; text-overflow: ellipsis;
  }
  .fp-menu-btn {
    width: 40px; height: 40px; border-radius: 8px; border: 1px solid ${LINE}; background: #fff; color: ${MUTED};
    cursor: pointer; font-size: 18px; line-height: 1; display: inline-flex; align-items: center; justify-content: center;
  }
  .fp-menu-wrap { position: relative; }
  .fp-menu-pop {
    position: absolute; right: 0; top: 46px; z-index: 60; min-width: 250px; background: #fff; border: 1px solid ${LINE};
    border-radius: 12px; box-shadow: 0 12px 30px rgba(13,43,30,0.18); padding: 8px; display: grid; gap: 2px;
  }
  .fp-menu-item {
    display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border-radius: 8px;
    background: transparent; border: none; cursor: pointer; font: inherit; font-size: 14px; color: ${INK}; text-align: left;
  }
  .fp-menu-item:hover { background: #F3F5F2; }
  .fp-menu-state { font-size: 12px; font-weight: 600; color: ${MUTED}; }
  .fp-menu-state.on { color: ${GREEN}; }
  .fp-menu-backdrop { position: fixed; inset: 0; z-index: 55; }

  .fp-body {
    flex: 1; display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 48px; align-items: stretch; min-height: 0;
  }
  .fp-menu { display: flex; flex-direction: column; min-width: 0; }
  .fp-logo { height: 64px; width: auto; align-self: flex-start; margin: 0 0 12px 8px; display: block; }
  .fp-grid { flex: 1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-auto-rows: minmax(140px, 1fr); align-content: stretch; }
  .fp-tile {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 16px 8px;
    text-decoration: none; color: ${INK}; background: transparent; border: none; border-radius: 16px; cursor: pointer; font: inherit;
    transition: background 0.15s ease, color 0.15s ease; -webkit-tap-highlight-color: transparent;
  }
  .fp-tile:hover { background: rgba(61,138,48,0.09); color: ${GREEN}; }
  .fp-tile svg { width: clamp(40px, 4.4vw, 64px); height: auto; color: inherit; }
  .fp-tile-label { font-size: 16px; font-weight: 500; text-align: center; }
  .fp-tile-add { color: ${MUTED}; }

  .fp-side { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; min-height: 0; min-width: 0; }
  .fp-image { max-width: 100%; max-height: 74vh; width: auto; height: auto; border-radius: 6px; display: block; box-shadow: 0 10px 30px rgba(13,43,30,0.18); }
  .fp-sketch { max-width: 100%; max-height: 66vh; width: auto; height: auto; filter: invert(1); opacity: 0.35; }

  .fp-back { background: none; border: none; color: ${MUTED}; font-size: 14px; cursor: pointer; padding: 0; font-family: inherit; }
  .fp-back:hover { color: ${INK}; }
  .fp-panel { width: 100%; max-width: 1040px; margin: 0 auto; }
  .fp-panel-head { display: flex; align-items: center; gap: 16px; margin: 14px 0 18px; color: ${INK}; }
  .fp-panel-head h1 { font-family: Outfit, Inter, system-ui, sans-serif; font-size: 30px; margin: 0; font-weight: 600; color: ${INK}; }
  .fp-panel-head svg { color: ${INK}; }
  .fp-text { font-size: 19px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; color: #1F2A37; }
  .fp-tile-image { max-width: 100%; max-height: 60vh; border-radius: 10px; margin-top: 20px; display: block; box-shadow: 0 8px 24px rgba(13,43,30,0.15); }
  .fp-muted { color: ${MUTED}; font-size: 15px; padding: 8px 2px; }

  .fp-btn {
    height: 40px; padding: 0 16px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit;
    background: #fff; color: ${INK}; border: 1px solid ${LINE};
  }
  .fp-btn:hover { border-color: ${GREEN}; }
  .fp-btn.fp-primary { background: ${GREEN}; border-color: ${GREEN}; color: #fff; }
  .fp-btn.fp-danger { color: #B91C1C; border-color: #F1C0C0; }
  .fp-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .fp-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 22px; align-items: center; }

  .fp-stats { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 18px; }
  .fp-stats-wrap .fp-stat { min-width: 200px; }
  .fp-stat { flex: 1 1 150px; background: #fff; border: 1px solid ${LINE}; border-radius: 14px; padding: 16px 18px; }
  .fp-stat-n { font-family: Outfit, Inter, system-ui, sans-serif; font-size: 36px; font-weight: 600; line-height: 1.1; }
  .fp-stat-l { font-size: 13px; color: ${MUTED}; margin-top: 4px; }
  .fp-stat-warn { border-color: #F1C0C0; background: #FEF3F3; }
  .fp-stat-warn .fp-stat-n { color: #B91C1C; }

  .fp-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
  .fp-chip { height: 36px; padding: 0 14px; border-radius: 999px; border: 1px solid ${LINE}; background: #fff; color: ${MUTED}; font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; }
  .fp-chip[aria-pressed="true"] { background: ${INK}; border-color: ${INK}; color: #fff; }

  .fp-list { background: #fff; border: 1px solid ${LINE}; border-radius: 14px; overflow: hidden; }
  .fp-row {
    display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%; padding: 16px 18px;
    background: transparent; border: none; border-bottom: 1px solid #F0F2EF; cursor: pointer; text-align: left; font: inherit; color: ${INK};
  }
  .fp-row:last-child { border-bottom: none; }
  .fp-row:hover { background: #F7F9F6; }
  .fp-row-static { cursor: default; }
  .fp-row-static:hover { background: transparent; }
  .fp-row-main { min-width: 0; flex: 1; }
  .fp-row-title { font-size: 16.5px; font-weight: 600; overflow-wrap: anywhere; }
  .fp-row-sub { font-size: 13.5px; color: ${MUTED}; margin-top: 3px; }
  .fp-row-right { display: flex; align-items: center; gap: 14px; flex-shrink: 0; }
  .fp-row-due { font-size: 14px; text-align: right; }

  .fp-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .fp-card { background: #fff; border: 1px solid ${LINE}; border-radius: 14px; padding: 18px; }
  .fp-card-head { display: flex; align-items: center; gap: 12px; }
  .fp-card-title { font-size: 18px; font-weight: 600; flex: 1; }
  .fp-card-count { font-size: 15px; font-weight: 600; color: ${GREEN}; }
  .fp-bar { height: 6px; border-radius: 3px; background: #E8EBE7; overflow: hidden; margin-top: 12px; }
  .fp-bar > div { height: 100%; background: ${GREEN}; }
  .fp-check { display: flex; gap: 10px; align-items: flex-start; padding: 6px 0; font-size: 14.5px; }
  .fp-check-box { width: 20px; height: 20px; border-radius: 6px; border: 1.5px solid #B9C2B8; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; color: #fff; margin-top: 1px; }
  .fp-check-done .fp-check-box { background: ${GREEN}; border-color: ${GREEN}; }
  .fp-check-done .fp-check-label { color: ${MUTED}; }
  .fp-check-note { color: ${MUTED}; font-style: italic; }

  .fp-overlay { position: fixed; inset: 0; z-index: 80; background: rgba(13,43,30,0.55); display: flex; align-items: center; justify-content: center; padding: 24px; }
  .fp-modal { background: #fff; border-radius: 18px; max-width: 860px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 28px 32px; box-shadow: 0 24px 60px rgba(0,0,0,0.35); }
  .fp-modal-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  .fp-kind { font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${GREEN}; }
  .fp-modal-title { font-family: Outfit, Inter, system-ui, sans-serif; font-size: 28px; margin: 4px 0 10px; font-weight: 600; }
  .fp-reason { font-size: 14px; color: ${MUTED}; margin-bottom: 18px; }
  .fp-dgrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 28px; background: #F7F9F6; border: 1px solid ${LINE}; border-radius: 12px; padding: 16px 18px; }
  .fp-drow { min-width: 0; }
  .fp-dlabel { font-size: 11.5px; letter-spacing: 0.08em; text-transform: uppercase; color: ${MUTED}; }
  .fp-dvalue { font-size: 16px; margin-top: 3px; overflow-wrap: anywhere; }
  .fp-block { margin-top: 20px; }
  .fp-text-sm { font-size: 16px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; margin-top: 6px; }
  .fp-comment { border-bottom: 1px solid #F0F2EF; padding: 10px 0; }
  .fp-comment-head { display: flex; justify-content: space-between; font-size: 13.5px; color: ${MUTED}; }
  .fp-thumbs { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin-top: 8px; }
  .fp-thumb { padding: 0; border: 1px solid ${LINE}; border-radius: 10px; overflow: hidden; background: none; cursor: zoom-in; }
  .fp-thumb img { width: 100%; height: 120px; object-fit: cover; display: block; }
  .fp-zoom { position: fixed; inset: 0; z-index: 90; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; padding: 20px; cursor: zoom-out; }
  .fp-zoom img { max-width: 100%; max-height: 100%; border-radius: 8px; }

  .fp-form { display: grid; gap: 16px; }
  .fp-label { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: ${MUTED}; margin-bottom: 6px; display: block; }
  .fp-input, .fp-textarea { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px; font-size: 15px; font-family: inherit; background: #fff; color: ${INK}; border: 1px solid ${LINE}; }
  .fp-input { height: 42px; padding-top: 0; padding-bottom: 0; }
  .fp-textarea { resize: vertical; line-height: 1.5; }
  .fp-icons { display: flex; flex-wrap: wrap; gap: 8px; }
  .fp-icon-choice { width: 56px; height: 56px; border-radius: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; background: #fff; color: ${INK}; border: 1px solid ${LINE}; }
  .fp-icon-choice[aria-pressed="true"] { border-color: ${GREEN}; background: rgba(61,138,48,0.12); color: ${GREEN}; }
  .fp-icon-choice svg { width: 28px; height: 28px; }

  /* iPad och mindre: samma upplägg som datorn, tätare. */
  @media (max-width: 1100px) {
    .fp-page { padding: 18px 24px 32px; }
    .fp-body { gap: 24px; }
    .fp-logo { height: 52px; }
    .fp-tile-label { font-size: 15px; }
    .fp-cards { grid-template-columns: minmax(0, 1fr); }
  }
  @media (max-width: 768px) {
    .fp-page { padding: 14px 12px 36px; }
    .fp-header { margin-bottom: 12px; padding-bottom: 12px; gap: 8px; }
    .fp-select { max-width: 150px; height: 36px; font-size: 13px; }
    .fp-leave { height: 36px; padding: 0 10px; font-size: 12px; }
    .fp-menu-btn { width: 36px; height: 36px; }
    .fp-body { grid-template-columns: minmax(0, 0.55fr) minmax(0, 1.45fr); gap: 6px; }
    .fp-logo { height: 34px; margin-left: 4px; }
    .fp-grid { grid-auto-rows: minmax(100px, 1fr); }
    .fp-tile { gap: 8px; padding: 10px 2px; }
    .fp-tile svg { width: 34px; }
    .fp-tile-label { font-size: 12px; }
    .fp-image, .fp-sketch { max-height: 52vh; }
    .fp-panel-head h1 { font-size: 24px; }
    .fp-text { font-size: 17px; }
    .fp-row { flex-direction: column; align-items: flex-start; gap: 8px; }
    .fp-row-right { width: 100%; justify-content: space-between; }
    .fp-dgrid { grid-template-columns: minmax(0, 1fr); }
    .fp-modal { padding: 20px 18px; }
    .fp-overlay { padding: 10px; }
  }
`;

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
  const [hideSensitive, setHideSensitive] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem("bayt.presentation.hide") !== "0";
    } catch {
      return true;
    }
  });
  const [edit, setEdit] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState<View>(null);
  const [formMode, setFormMode] = useState<"new" | string | null>(null);
  const imageInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        setRole(null);
        return;
      }
      const { data: p } = await supabase.from("profiles").select("role").eq("id", data.session.user.id).maybeSingle();
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
  const propertyName = properties.find((p) => p.id === propertyId)?.name ?? "";

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

  useEffect(() => {
    try {
      window.localStorage.setItem("bayt.presentation.hide", hideSensitive ? "1" : "0");
    } catch {
      /* ignoreras */
    }
  }, [hideSensitive]);

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
      const row = { title: v.values.title, icon: v.values.icon, body: v.values.body.trim() || null, image_path };
      if (v.id) {
        const { error } = await supabase.from("presentation_tiles").update(row).eq("id", v.id);
        if (error) throw error;
      } else {
        const max = tiles.reduce((m, t) => Math.max(m, t.sort_order), 0);
        const { error } = await supabase.from("presentation_tiles").insert({ ...row, property_id: propertyId, sort_order: max + 10 });
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
      setView(null);
      void qc.invalidateQueries({ queryKey: ["fp-tiles", propertyId] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Kunde inte ta bort"),
  });

  const openTile = view?.t === "tile" ? tiles.find((t) => t.id === view.id) ?? null : null;
  const editingTile = formMode && formMode !== "new" ? tiles.find((t) => t.id === formMode) ?? null : null;
  const inForm = formMode === "new" || !!editingTile;
  const sectionTile = view?.t === "section" ? PRESENTATION_TILES.find((t) => t.key === view.key) ?? null : null;

  const renderSection = () => {
    if (!sectionTile) return null;
    switch (sectionTile.key) {
      case "felanmalningar":
        return <ArendeSection kind="issue" propertyId={propertyId} propertyName={propertyName} hideSensitive={hideSensitive} />;
      case "besiktningar":
        return <ArendeSection kind="inspection" propertyId={propertyId} propertyName={propertyName} hideSensitive={hideSensitive} />;
      case "projekt":
        return <ArendeSection kind="project" propertyId={propertyId} propertyName={propertyName} hideSensitive={hideSensitive} />;
      case "teknik":
        return <TeknikSection propertyId={propertyId} />;
      case "oversikt":
        return <OversiktSection propertyId={propertyId} />;
      case "loggbok":
        return <LoggbokSection propertyId={propertyId} />;
      default:
        return (
          <div className="fp-muted">
            Den här vyn kommer i nästa steg.
            <div className="fp-actions">
              <a className="fp-btn" href={sectionTile.href} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
                Öppna i portalen (ny flik)
              </a>
            </div>
          </div>
        );
    }
  };

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
                setView(null);
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
          {allowed && (
            <div className="fp-menu-wrap">
              <button type="button" className="fp-menu-btn" aria-label="Inställningar" onClick={() => setMenuOpen((v) => !v)}>
                ⋯
              </button>
              {menuOpen && (
                <>
                  <div className="fp-menu-backdrop" onClick={() => setMenuOpen(false)} />
                  <div className="fp-menu-pop">
                    <button type="button" className="fp-menu-item" onClick={() => setHideSensitive((v) => !v)}>
                      <span>Dölj känsliga uppgifter</span>
                      <span className={`fp-menu-state${hideSensitive ? " on" : ""}`}>{hideSensitive ? "På" : "Av"}</span>
                    </button>
                    <button
                      type="button"
                      className="fp-menu-item"
                      onClick={() => {
                        setEdit((v) => !v);
                        setMenuOpen(false);
                      }}
                    >
                      <span>Redigera bild och rutor</span>
                      <span className={`fp-menu-state${edit ? " on" : ""}`}>{edit ? "På" : "Av"}</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          <Link to="/start" className="fp-leave">
            Lämna presentationen
          </Link>
        </div>

        {role === undefined && <div className="fp-muted">Laddar…</div>}

        {role !== undefined && !allowed && <div style={{ color: INK, fontSize: 15 }}>Du har inte behörighet till den här sidan.</div>}

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
            <button type="button" className="fp-back" onClick={() => setView(null)}>
              ← Presentation
            </button>
            <div className="fp-panel-head">
              <PresentationIcon name={openTile.icon} size={44} />
              <h1>{openTile.title}</h1>
            </div>
            {openTile.body && <div className="fp-text">{openTile.body}</div>}
            {openTile.image_path && <SignedImage path={openTile.image_path} alt={openTile.title} className="fp-tile-image" />}
            {edit && (
              <div className="fp-actions">
                <button type="button" className="fp-btn" onClick={() => setFormMode(openTile.id)}>
                  Redigera
                </button>
              </div>
            )}
          </div>
        )}

        {allowed && !inForm && !openTile && sectionTile && (
          <div className="fp-panel">
            <button type="button" className="fp-back" onClick={() => setView(null)}>
              ← Presentation
            </button>
            <div className="fp-panel-head">
              <PresentationIcon name={sectionTile.key} size={44} />
              <h1>{sectionTile.label}</h1>
            </div>
            {renderSection()}
          </div>
        )}

        {allowed && !inForm && !openTile && !sectionTile && (
          <div className="fp-body">
            <div className="fp-side">
              {coverPath ? (
                <SignedImage path={coverPath} alt="Fastigheten" className="fp-image" />
              ) : (
                <img src={buildingSketch} alt="" className="fp-sketch" />
              )}
              {edit && (
                <>
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
                  <button type="button" className="fp-btn" disabled={setCover.isPending} onClick={() => imageInput.current?.click()}>
                    {setCover.isPending ? "Laddar upp…" : coverPath ? "Byt bild" : "Lägg till bild på fastigheten"}
                  </button>
                </>
              )}
            </div>

            <div className="fp-menu">
              <img src={baytLogo} alt="BAYT" className="fp-logo" />
              <div className="fp-grid">
                {PRESENTATION_TILES.map((t) =>
                  t.key === "genomgang" ? (
                    <a key={t.key} href={t.href} target="_blank" rel="noreferrer" className="fp-tile">
                      <PresentationIcon name={t.key} />
                      <span className="fp-tile-label">{t.label}</span>
                    </a>
                  ) : (
                    <button key={t.key} type="button" className="fp-tile" onClick={() => setView({ t: "section", key: t.key })}>
                      <PresentationIcon name={t.key} />
                      <span className="fp-tile-label">{t.label}</span>
                    </button>
                  ),
                )}
                {tiles.map((t) => (
                  <button key={t.id} type="button" className="fp-tile" onClick={() => setView({ t: "tile", id: t.id })}>
                    <PresentationIcon name={t.icon} />
                    <span className="fp-tile-label">{t.title}</span>
                  </button>
                ))}
                {edit && (
                  <button type="button" className="fp-tile fp-tile-add" onClick={() => setFormMode("new")}>
                    <PresentationIcon name="plus" />
                    <span className="fp-tile-label">Ny ruta</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
