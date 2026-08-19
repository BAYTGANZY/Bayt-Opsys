import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { COLORS, labelStyle, textareaStyle, primaryBtn } from "@/components/property-tabs";
import { useMergedPropertyTimeline, formatSwedishLongDate, type TimelineEvent } from "@/components/PropertyTimeline";
import {
  LogSelectCheckbox, LogSelectionBar, useLogSelection, type LogTarget,
} from "@/components/LogSelection";
import {
  LoggbokFilterBar, loggbokEmptyText, useLoggbokFilter, type SourceOption,
} from "@/components/LoggbokFilterBar";

type CommentRow = {
  id: string;
  content: string;
  created_at: string;
  target: string; // matches TimelineEvent.id ("l-...", "i-...", "p-...")
  authorName: string | null;
};

function targetPayload(ev: TimelineEvent) {
  return ev.kind === "log"
    ? { logbook_entry_id: ev.id.slice(2), event_key: null }
    : { logbook_entry_id: null, event_key: ev.id };
}

/** The row behind a timeline event. A besiktning/projekt event is not a log
 *  row at all — it is derived from the ärende — so deleting it here deletes
 *  the ärende. LogSelectionBar spells that out in the confirm dialog. */
const EVENT_TABLE = { log: "logbook_entries", inspection: "inspections", project: "projects" } as const;

/** Same Källa chips as alla byggnaders loggbok — this feed mixes the same
 *  three kinds, so the control has to mean the same thing in both. */
const SOURCES: readonly SourceOption[] = [
  { key: "alla", label: "Alla" },
  { key: "log", label: "Loggbok" },
  { key: "inspection", label: "Besiktningar" },
  { key: "project", label: "Projekt" },
];

function deleteTarget(ev: TimelineEvent): LogTarget {
  return { table: EVENT_TABLE[ev.kind], id: ev.id.slice(2) };
}

/** The property Loggbok page: the same merged history shown on the fastighet
 *  settings page, but every event here can be commented on — visible to
 *  anyone who opens this page. */
export function PropertyLoggbokWithComments({ propertyId }: { propertyId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const timelineQ = useMergedPropertyTimeline(propertyId);
  const allEvents = timelineQ.data ?? [];

  const { rows: events, filters } = useLoggbokFilter(allEvents, (e) => ({
    source: e.kind,
    actionKind: e.actionKind,
    actorId: e.actorId,
    actorName: e.actorName,
    date: e.date,
    text: e.title,
  }));

  const selection = useLogSelection(events.map(deleteTarget));

  // Comments load for the whole feed, not the filtered slice — otherwise every
  // chip press would re-key the query and refetch what is already cached.
  const logIds = useMemo(() => allEvents.filter((e) => e.kind === "log").map((e) => e.id.slice(2)), [allEvents]);
  const eventKeys = useMemo(() => allEvents.filter((e) => e.kind !== "log").map((e) => e.id), [allEvents]);

  const commentsQ = useQuery({
    queryKey: ["property-loggbok-comments", propertyId, logIds.join(","), eventKeys.join(",")],
    enabled: allEvents.length > 0,
    queryFn: async () => {
      const [byEntry, byKey] = await Promise.all([
        logIds.length
          ? supabase.from("logbook_comments").select("id, content, created_at, logbook_entry_id, profiles:created_by(full_name)").in("logbook_entry_id", logIds)
          : Promise.resolve({ data: [] as any[] }),
        eventKeys.length
          ? supabase.from("logbook_comments").select("id, content, created_at, event_key, profiles:created_by(full_name)").in("event_key", eventKeys)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const rows: CommentRow[] = [
        ...((byEntry.data ?? []) as any[]).map((c) => ({ id: c.id, content: c.content, created_at: c.created_at, target: `l-${c.logbook_entry_id}`, authorName: c.profiles?.full_name ?? null })),
        ...((byKey.data ?? []) as any[]).map((c) => ({ id: c.id, content: c.content, created_at: c.created_at, target: c.event_key, authorName: c.profiles?.full_name ?? null })),
      ];
      rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
      return rows;
    },
  });

  const commentsByTarget = useMemo(() => {
    const map = new Map<string, CommentRow[]>();
    for (const c of commentsQ.data ?? []) {
      const list = map.get(c.target) ?? [];
      list.push(c);
      map.set(c.target, list);
    }
    return map;
  }, [commentsQ.data]);

  const addComment = useMutation({
    mutationFn: async (ev: TimelineEvent) => {
      if (!user) throw new Error("Inte inloggad");
      const text = (drafts[ev.id] ?? "").trim();
      if (!text) return;
      const { error } = await supabase.from("logbook_comments").insert({
        ...targetPayload(ev),
        content: text,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: (_data, ev) => {
      setDrafts((d) => ({ ...d, [ev.id]: "" }));
      qc.invalidateQueries({ queryKey: ["property-loggbok-comments", propertyId] });
    },
  });

  if (timelineQ.isLoading) return <div style={{ color: COLORS.secondary }}>Laddar…</div>;

  const groups: { year: number; items: TimelineEvent[] }[] = [];
  for (const ev of events) {
    const y = new Date(ev.date).getFullYear();
    const g = groups[groups.length - 1];
    if (g && g.year === y) g.items.push(ev); else groups.push({ year: y, items: [ev] });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <LoggbokFilterBar filters={filters} sources={SOURCES} />

      <LogSelectionBar
        selection={selection}
        invalidateKeys={[
          ["property-timeline", propertyId],
          ["property-loggbok-comments", propertyId],
          ["all-buildings-loggbok"],
          ["section-overview-stats", "logbook"],
          // A besiktning/projekt event deleted from here is the ärende itself.
          ["inspections"], ["projects"], ["oppna-arenden"],
        ]}
      />

      {events.length === 0 && (
        <div style={{ padding: "48px 16px", textAlign: "center", color: COLORS.secondary, fontSize: 14 }}>
          {loggbokEmptyText(filters.active, "Ingen aktivitet ännu")}
        </div>
      )}

      {groups.map((g) => (
        <div key={g.year}>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, marginBottom: 12 }}>{g.year}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {g.items.map((ev) => {
              const comments = commentsByTarget.get(ev.id) ?? [];
              const isOpen = openId === ev.id;
              return (
                <div key={ev.id} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <LogSelectCheckbox selection={selection} target={deleteTarget(ev)} style={{ marginTop: 3 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>{ev.title}</div>
                      <div style={{ fontSize: 12, color: COLORS.secondary, marginTop: 2 }}>
                        {formatSwedishLongDate(ev.date)}
                        {ev.actorId ? ` · ${ev.actorName ?? "Okänd"}` : ""}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : ev.id)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8,
                      background: "transparent", border: "none", padding: 0, cursor: "pointer",
                      fontSize: 12.5, color: COLORS.primary, fontWeight: 600,
                    }}
                  >
                    <MessageCircle size={14} />
                    {comments.length > 0 ? `${comments.length} kommentar${comments.length === 1 ? "" : "er"}` : "Kommentera"}
                  </button>

                  {isOpen && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${COLORS.border}`, display: "flex", flexDirection: "column", gap: 10 }}>
                      {comments.map((c) => (
                        <div key={c.id} style={{ fontSize: 13 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", color: COLORS.secondary, fontSize: 11.5, marginBottom: 2 }}>
                            <span>{c.authorName ?? "Okänd"}</span>
                            <span>{formatSwedishLongDate(c.created_at)}</span>
                          </div>
                          <div style={{ color: COLORS.text, whiteSpace: "pre-wrap" }}>{c.content}</div>
                        </div>
                      ))}
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <label style={labelStyle}>Ny kommentar</label>
                        <textarea
                          style={{ ...textareaStyle, minHeight: 60 }}
                          rows={2}
                          value={drafts[ev.id] ?? ""}
                          onChange={(e) => setDrafts((d) => ({ ...d, [ev.id]: e.target.value }))}
                        />
                        <button
                          type="button"
                          onClick={() => addComment.mutate(ev)}
                          disabled={addComment.isPending || !(drafts[ev.id] ?? "").trim()}
                          style={{ ...primaryBtn, alignSelf: "flex-start", opacity: !(drafts[ev.id] ?? "").trim() ? 0.6 : 1 }}
                        >
                          {addComment.isPending ? "Skickar…" : "Skicka"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
