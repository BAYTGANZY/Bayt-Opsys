import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { LogSelectCheckbox, LogSelectionBar, useLogSelection } from "@/components/LogSelection";
import {
  ACTION_COLOR,
  AUDIT_SELECT,
  ENTITY_LABEL,
  formatAuditActor,
  formatAuditLine,
  type AuditEntityType,
  type AuditEvent,
} from "@/lib/audit";

const C = {
  card: "#ffffff", border: "#E5E7EB", secondary: "#6B7280", text: "#1a1a1a",
};

const PAGE_SIZE = 60;
const MAX_SIZE = 500;

// An audit log needs the time of day — two ärenden closed on the same day are
// otherwise indistinguishable. The apartment page's own formatSwedishDate is
// date-only, so it is deliberately not reused here.
const fmtTime = new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit" });
const fmtDay = new Intl.DateTimeFormat("sv-SE", {
  weekday: "long", day: "numeric", month: "long", year: "numeric",
});

type Filter = "alla" | AuditEntityType;

const FILTERS: ReadonlyArray<{ key: Filter; label: string }> = [
  { key: "alla", label: "Alla" },
  { key: "issue", label: "Felanmälningar" },
  { key: "inspection", label: "Besiktningar" },
  { key: "apartment", label: "Lägenheten" },
];

/** A batch = one save. Several field changes collapse into a single card. */
type Batch = {
  batch_id: string;
  head: AuditEvent;
  events: AuditEvent[];
};

/**
 * Historik for one apartment — "vem gjorde vad och när".
 *
 * Rendered at the bottom of the apartment's Info view, below Spara.
 * Reads audit_events, which is written entirely by database triggers.
 */
export function ApartmentAuditTimeline({ apartmentId }: { apartmentId: string }) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [filter, setFilter] = useState<Filter>("alla");
  const [expanded, setExpanded] = useState(false);

  const limit = expanded ? MAX_SIZE : PAGE_SIZE;

  const { data: events = [], isLoading, error } = useQuery({
    queryKey: ["audit", "apartment", apartmentId, limit],
    queryFn: async () => {
      // Sorted server-side on a real timestamptz. The existing TimelineTab
      // sorts client-side with localeCompare over a mix of date-only strings
      // and ISO timestamps, which mis-orders same-day items — don't copy it.
      const { data, error } = await supabase
        .from("audit_events")
        .select(AUDIT_SELECT)
        .eq("apartment_id", apartmentId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as AuditEvent[];
    },
  });

  const filtered = useMemo(
    () => (filter === "alla" ? events : events.filter((e) => e.entity_type === filter)),
    [events, filter],
  );

  // Group by day, then collapse each save (batch_id) into one card. Both
  // preserve the server's DESC order because Map keeps insertion order.
  const days = useMemo(() => {
    const byDay = new Map<string, Map<string, Batch>>();
    for (const e of filtered) {
      const dayKey = e.created_at.slice(0, 10);
      let batches = byDay.get(dayKey);
      if (!batches) { batches = new Map(); byDay.set(dayKey, batches); }
      const existing = batches.get(e.batch_id);
      if (existing) existing.events.push(e);
      else batches.set(e.batch_id, { batch_id: e.batch_id, head: e, events: [e] });
    }
    return [...byDay.entries()].map(([day, batches]) => ({
      day,
      batches: [...batches.values()],
    }));
  }, [filtered]);

  // Selection follows the visible (filtered) rows, not everything fetched —
  // "Välj alla" under the Besiktningar chip must not also take the
  // felanmälningar the admin cannot currently see.
  const selection = useLogSelection(
    filtered.map((e) => ({ table: "audit_events" as const, id: e.id })),
  );

  // An entreprenör would be bounced off another contractor's ärende by
  // useRecordScopeGuard, so render plain text rather than a link that
  // silently redirects.
  const canOpenArende = profile?.role === "admin" || profile?.role === "styrelse";

  function open(e: AuditEvent) {
    if (!canOpenArende) return;
    if (e.entity_type === "issue") navigate({ to: "/issues/$id", params: { id: e.entity_id } });
    if (e.entity_type === "inspection") navigate({ to: "/inspections/$id", params: { id: e.entity_id } });
  }

  if (isLoading) return <div style={{ color: C.secondary, fontSize: 14 }}>Laddar historik…</div>;

  if (error) {
    return (
      <div style={{ fontSize: 13, color: C.secondary }}>
        Kunde inte hämta historiken.
      </div>
    );
  }

  return (
    <div>
      {/* Filter chips. type="button" is mandatory — see the note in InfoTab
          about this section living outside the <form>. */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              style={{
                height: 30, padding: "0 12px", borderRadius: 8, fontSize: 12.5,
                fontWeight: 600, cursor: "pointer",
                border: `1px solid ${active ? "#0D2B1E" : C.border}`,
                background: active ? "#0D2B1E" : C.card,
                color: active ? "#fff" : C.secondary,
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <LogSelectionBar
        selection={selection}
        invalidateKeys={[["audit", "apartment", apartmentId]]}
        style={{ marginBottom: 16 }}
      />

      {filtered.length === 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center", color: C.secondary, fontSize: 14 }}>
          Ingen historik ännu. Statusändringar och redigeringar av lägenhetens ärenden visas här.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {days.map(({ day, batches }) => (
            <div key={day}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: C.secondary,
                textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10,
              }}>
                {fmtDay.format(new Date(day))}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {batches.map((b, i) => {
                  const isLast = i === batches.length - 1;
                  const color = ACTION_COLOR[b.head.action] ?? C.secondary;
                  const clickable =
                    canOpenArende &&
                    (b.head.entity_type === "issue" || b.head.entity_type === "inspection");
                  return (
                    <div
                      key={b.batch_id}
                      onClick={() => open(b.head)}
                      style={{
                        display: "flex", gap: 14, alignItems: "stretch",
                        cursor: clickable ? "pointer" : "default",
                      }}
                    >
                      {/* One card = one save = one row per changed field, so
                          the checkbox takes the whole batch. */}
                      <LogSelectCheckbox
                        selection={selection}
                        target={b.events.map((e) => ({ table: "audit_events" as const, id: e.id }))}
                        style={{ marginTop: 4 }}
                      />

                      {/* Rail */}
                      <div style={{
                        display: "flex", flexDirection: "column", alignItems: "center",
                        width: 12, flexShrink: 0,
                      }}>
                        <span style={{
                          width: 10, height: 10, borderRadius: "50%",
                          background: color, marginTop: 6, flexShrink: 0,
                        }} />
                        {!isLast && (
                          <span style={{ flex: 1, width: 1, background: C.border, marginTop: 4 }} />
                        )}
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? 0 : 18 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: "0.04em" }}>
                            {ENTITY_LABEL[b.head.entity_type]}
                          </span>
                          <span style={{ fontSize: 12, color: C.secondary }}>
                            {fmtTime.format(new Date(b.head.created_at))}
                          </span>
                        </div>

                        {b.head.entity_title && (
                          <div style={{
                            fontSize: 14, color: C.text, fontWeight: 600,
                            marginTop: 2, whiteSpace: "pre-wrap",
                          }}>
                            {b.head.entity_title}
                          </div>
                        )}

                        <div style={{ marginTop: 3, display: "grid", gap: 2 }}>
                          {b.events.map((e) => (
                            <div key={e.id} style={{ fontSize: 13, color: C.text }}>
                              {formatAuditLine(e)}
                            </div>
                          ))}
                        </div>

                        <div style={{ fontSize: 12, color: C.secondary, marginTop: 4 }}>
                          {formatAuditActor(b.head)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {!expanded && events.length >= PAGE_SIZE && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          style={{
            marginTop: 16, height: 36, padding: "0 16px", borderRadius: 8,
            border: `1px solid ${C.border}`, background: C.card,
            color: C.text, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          Visa fler
        </button>
      )}
    </div>
  );
}
