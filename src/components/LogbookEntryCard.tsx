import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { actionKindLabel, actionKindOf } from "@/lib/logbook";
import { LogSelectCheckbox, type LogSelection } from "@/components/LogSelection";

type Entry = {
  id: string;
  entry_date: string | null;
  created_at: string;
  content: string;
  event_type: string | null;
  property_id: string | null;
  apartment_id: string | null;
  property_object_id: string | null;
  profiles?: { full_name: string | null } | null;
  properties?: { name: string | null } | null;
};

const C = { border: "#E5E7EB", text: "#1a1a1a", secondary: "#6B7280", primary: "#3D8A30" };

const fmtDateTime = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});

/** `selection` is optional: pass it where the surrounding list offers
 *  multi-select delete, omit it and the card renders exactly as before. */
export function LogbookEntryCard({
  entry,
  showProperty,
  selection,
}: {
  entry: Entry;
  showProperty?: boolean;
  selection?: LogSelection;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const qc = useQueryClient();
  const { user } = useAuth();

  const commentsQ = useQuery({
    queryKey: ["logbook-comments", entry.id],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("logbook_comments")
        .select("id, content, created_at, profiles:created_by(full_name)")
        .eq("entry_id", entry.id)
        .order("created_at", { ascending: true });
      return (data ?? []) as unknown as Array<{ id: string; content: string; created_at: string; profiles: { full_name: string | null } | null }>;
    },
  });

  const addComment = useMutation({
    mutationFn: async () => {
      if (!user || !text.trim()) return;
      await supabase.from("logbook_comments").insert({
        entry_id: entry.id, content: text.trim(), created_by: user.id,
      } as any);
    },
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["logbook-comments", entry.id] });
    },
  });

  // The same key the Åtgärd-chipsen filter on, so a filtered list shows why
  // each row survived — "Öppnade ärende", not a flat "Ärende status-ändring".
  const eventLabel = entry.event_type && entry.event_type !== "manuell"
    ? actionKindLabel(actionKindOf(entry.event_type, entry.content))
    : null;
  const when = fmtDateTime.format(new Date(entry.created_at));

  return (
    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        {selection && (
          <LogSelectCheckbox
            selection={selection}
            target={{ table: "logbook_entries", id: entry.id }}
            style={{ alignSelf: "flex-start", marginTop: 3 }}
          />
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          {eventLabel && (
            <div style={{ fontSize: 11, fontWeight: 700, color: C.primary, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
              [{eventLabel}]
            </div>
          )}
          {showProperty && entry.properties?.name && (
            <div style={{ fontSize: 13, color: C.secondary, marginBottom: 4 }}>{entry.properties.name}</div>
          )}
          <div style={{ fontSize: 14, color: C.text, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{entry.content}</div>
        </div>
        <div style={{ fontSize: 12, color: C.secondary, whiteSpace: "nowrap" }}>{when}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
        <div style={{ fontSize: 12, color: C.secondary }}>{entry.profiles?.full_name ?? ""}</div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{ background: "transparent", border: "none", color: C.primary, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          {open ? "Dölj kommentarer" : "Kommentera"}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {(commentsQ.data ?? []).map((c) => (
            <div key={c.id} style={{ fontSize: 13, color: C.text }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: C.secondary, fontSize: 12, marginBottom: 2 }}>
                <span>{c.profiles?.full_name ?? "Okänd"}</span>
                <span>{fmtDateTime.format(new Date(c.created_at))}</span>
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>{c.content}</div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Förklara varför…"
              style={{ flex: 1, height: 36, padding: "0 10px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, outline: "none" }}
            />
            <button
              type="button"
              onClick={() => addComment.mutate()}
              disabled={!text.trim() || addComment.isPending}
              style={{ height: 36, padding: "0 14px", background: C.primary, color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: !text.trim() ? 0.6 : 1 }}
            >
              Skicka
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
