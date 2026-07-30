// ===========================================================================
// Multi-select delete for every log surface in the app.
//
// One mechanism, deliberately: the app renders log-shaped lists in seven
// places (fastighetens loggbok, alla byggnaders loggbok, lägenhetens loggbok
// och tidslinje, objektloggen på två sidor, Historik) and the client asked for
// the same file-explorer interaction in all of them — a checkbox per row,
// Välj alla / Avmarkera alla, and one "Radera valda (N)" button. Building that
// per surface would guarantee they drift.
//
// A row is described by a {table, id} pair rather than a display object, so a
// merged timeline can mix loggboksposter with the besiktning/projekt rows the
// same feed derives its events from and still delete both correctly.
//
// HARD DELETE, no tombstone. This is explicitly NOT the chat behaviour, where
// a non-admin delete leaves "Meddelandet togs bort" behind (chat-message-
// delete.sql). Here the row is gone and nothing marks that it existed.
//
// Admin-only, everywhere. Every export below renders null for other roles, and
// the DB agrees — supabase-functions/admin-delete.sql gates each DELETE policy
// on is_admin(). Neither side is decorative; keep them in agreement.
// ===========================================================================

import { useCallback, useMemo, useState, type CSSProperties } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckSquare, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { confirmDialog } from "@/components/ConfirmDialog";

const C = {
  border: "#E5E7EB", secondary: "#6B7280", text: "#1a1a1a",
  danger: "#DC2626", accent: "#0D2B1E", tint: "#F6F8F6",
};

/** Tables a log row can actually live in. */
export type LogTable =
  | "logbook_entries"    // loggbok — manual notes and auto-logged events
  | "logbook_comments"   // a comment under a loggbok event
  | "audit_events"       // Historik — "vem gjorde vad, när"
  | "property_history"   // the older per-fastighet ändringslogg
  | "issues"             // a felanmälan surfaced as a timeline event
  | "inspections"        // a besiktning surfaced as a timeline event
  | "projects";          // a projekt surfaced as a timeline event

export type LogTarget = { table: LogTable; id: string };

/** Deleting one of these removes the ärende itself, not just a log line. */
const ARENDE_TABLES = new Set<LogTable>(["issues", "inspections", "projects"]);

const TABLE_LABEL: Record<LogTable, [singular: string, plural: string]> = {
  logbook_entries: ["loggbokspost", "loggboksposter"],
  logbook_comments: ["kommentar", "kommentarer"],
  audit_events: ["historikpost", "historikposter"],
  property_history: ["historikpost", "historikposter"],
  issues: ["felanmälan", "felanmälningar"],
  inspections: ["besiktning", "besiktningar"],
  projects: ["projekt", "projekt"],
};

export function logTargetKey(t: LogTarget): string {
  return `${t.table}:${t.id}`;
}

/** "3 loggboksposter, 1 besiktning och 2 projekt" */
function describe(targets: LogTarget[]): string {
  const counts = new Map<LogTable, number>();
  for (const t of targets) counts.set(t.table, (counts.get(t.table) ?? 0) + 1);
  const parts = [...counts.entries()].map(([table, n]) => {
    const [one, many] = TABLE_LABEL[table];
    return `${n} ${n === 1 ? one : many}`;
  });
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} och ${parts[parts.length - 1]}`;
}

// ---------------------------------------------------------------------------

export type LogSelection = {
  /** False for non-admins — every UI piece in this file no-ops on it. */
  enabled: boolean;
  count: number;
  total: number;
  allSelected: boolean;
  targets: LogTarget[];
  isSelected: (t: LogTarget) => boolean;
  toggle: (t: LogTarget) => void;
  /** Select or clear a group in one go — one Historik card is several rows. */
  setMany: (ts: readonly LogTarget[], on: boolean) => void;
  selectAll: () => void;
  clear: () => void;
};

/**
 * `all` is the full set of rows currently on screen, in render order.
 *
 * Selection is stored as keys and the target list is derived from `all` on
 * every render, so rows that disappear — deleted, or filtered out by a chip —
 * drop out of the selection on their own. Nothing has to remember to prune,
 * and "Radera valda" can never act on a row the admin can no longer see.
 */
export function useLogSelection(all: LogTarget[]): LogSelection {
  const { profile } = useAuth();
  const enabled = profile?.role === "admin";
  const [keys, setKeys] = useState<ReadonlySet<string>>(() => new Set());

  // Callers build `all` inline from query data, so it is a fresh array every
  // render. Memoize on its contents instead of its identity.
  const allKeys = all.map(logTargetKey);
  const fingerprint = allKeys.join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableAll = useMemo(() => all, [fingerprint]);

  const targets = useMemo(
    () => stableAll.filter((t) => keys.has(logTargetKey(t))),
    [stableAll, keys],
  );

  const isSelected = useCallback((t: LogTarget) => keys.has(logTargetKey(t)), [keys]);

  const toggle = useCallback((t: LogTarget) => {
    const k = logTargetKey(t);
    setKeys((prev) => {
      const next = new Set(prev);
      if (!next.delete(k)) next.add(k);
      return next;
    });
  }, []);

  const setMany = useCallback((ts: readonly LogTarget[], on: boolean) => {
    setKeys((prev) => {
      const next = new Set(prev);
      for (const t of ts) {
        if (on) next.add(logTargetKey(t));
        else next.delete(logTargetKey(t));
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setKeys(new Set(stableAll.map(logTargetKey)));
  }, [stableAll]);

  const clear = useCallback(() => setKeys(new Set()), []);

  return {
    enabled,
    count: targets.length,
    total: stableAll.length,
    allSelected: stableAll.length > 0 && targets.length === stableAll.length,
    targets,
    isSelected,
    toggle,
    setMany,
    selectAll,
    clear,
  };
}

// ---------------------------------------------------------------------------

/** entity_type in audit_events for the ärende tables. */
const AUDIT_ENTITY: Partial<Record<LogTable, string>> = {
  issues: "issue",
  inspections: "inspection",
  projects: "project",
};

/**
 * audit_events does not exist in every deployment — audit-events.sql is a
 * hand-run migration and this project has not applied it. A missing table is
 * therefore an expected state, not a failure: there is no Historik to purge,
 * so the delete already left no trace. Anything else is a real error.
 */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01"          // Postgres: undefined_table
      || error.code === "PGRST205"       // PostgREST: not in the schema cache
      || /could not find the table/i.test(error.message ?? "");
}

/**
 * Deletes the given rows, grouped into one request per table.
 *
 * Three things this does that a plain `.delete()` does not:
 *
 *  - `.select("id")` on every delete, and a count check on the result. A
 *    DELETE that no RLS policy permits is not an error in PostgREST; it
 *    removes zero rows and returns 200. Without this check the UI would report
 *    "Raderad" over a list that is still fully intact — the exact failure this
 *    whole change exists to fix.
 *  - Cleans up logbook_comments keyed by a synthetic `event_key`. Comments on a
 *    besiktning/projekt event are not foreign-keyed to anything (see
 *    loggbok-comments-generalize.sql), so no database cascade can reach them.
 *  - Purges the deleted ärende's audit_events. See purgeAudit below.
 *
 * Returns a warning when the rows are gone but the cleanup behind them was
 * refused, so the caller can say so instead of reporting a clean success.
 */
export async function deleteLogTargets(targets: LogTarget[]): Promise<{ warning?: string }> {
  const byTable = new Map<LogTable, string[]>();
  for (const t of targets) {
    const ids = byTable.get(t.table) ?? [];
    ids.push(t.id);
    byTable.set(t.table, ids);
  }

  const eventKeys = [
    ...(byTable.get("inspections") ?? []).map((id) => `i-${id}`),
    ...(byTable.get("projects") ?? []).map((id) => `p-${id}`),
  ];
  if (eventKeys.length > 0) {
    await supabase.from("logbook_comments").delete().in("event_key", eventKeys);
  }

  for (const [table, ids] of byTable) {
    const { data, error } = await supabase.from(table).delete().in("id", ids).select("id");
    if (error) throw error;
    if ((data?.length ?? 0) < ids.length) {
      throw new Error(
        `Databasen tillät inte borttagningen (${data?.length ?? 0} av ${ids.length} rader i ${table} togs bort). ` +
        `Kör supabase-functions/admin-delete.sql.`,
      );
    }
  }

  // "No trace" has to be enforced here, after the fact, because the deletes
  // above create the trace themselves: audit_log_changes() fires on DELETE and
  // writes a "Tog bort felanmälan" row (audit-events-triggers.sql). Leaving it
  // would mean clearing an event from the loggbok only to have it reappear
  // under Historik — so every audit row for the deleted entity goes too, the
  // trigger's parting row included.
  //
  // Deliberately NOT done by <DeleteButton> on the detail pages: deleting an
  // ärende from its own page is an ordinary admin action and stays on record.
  // This path is "clear the log", which is a different intent.
  const auditIds: Array<[string, string[]]> = [];
  for (const [table, ids] of byTable) {
    const entity = AUDIT_ENTITY[table];
    if (entity) auditIds.push([entity, ids]);
  }
  for (const [entity, ids] of auditIds) {
    const { error } = await supabase
      .from("audit_events").delete()
      .eq("entity_type", entity).in("entity_id", ids);
    if (isMissingTable(error)) break;   // no Historik in this deployment
    if (error) {
      return {
        warning:
          "Raderat, men historikposterna för ärendet kunde inte tas bort — " +
          "kör supabase-functions/admin-delete.sql.",
      };
    }
  }

  return {};
}

// ---------------------------------------------------------------------------

/**
 * The toolbar. Sits above the list it controls.
 *
 * `invalidateKeys` must include every query that renders any of these rows —
 * a loggbokspost typically appears in the fastighetens loggbok, the merged
 * timeline and the all-buildings view at once, and a stale cache would show a
 * row that no longer exists.
 */
export function LogSelectionBar({
  selection,
  invalidateKeys,
  onDeleted,
  style,
}: {
  selection: LogSelection;
  invalidateKeys?: readonly unknown[][];
  onDeleted?: () => void;
  style?: CSSProperties;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  if (!selection.enabled || selection.total === 0) return null;

  async function run() {
    const targets = selection.targets;
    if (targets.length === 0) return;

    const arenden = targets.filter((t) => ARENDE_TABLES.has(t.table));
    const warning = arenden.length > 0
      ? `\n\nOBS: ${describe(arenden)} raderas i sin helhet — inte bara raden i loggboken.`
      : "";

    const ok = await confirmDialog({
      title: "Radera?",
      message:
        `Denna åtgärd är permanent — är du säker på att du vill radera ${describe(targets)}?${warning}` +
        `\n\nDetta går inte att ångra och lämnar inget spår.`,
      confirmLabel: "Radera",
      danger: true,
    });
    if (!ok) return;

    setBusy(true);
    try {
      const { warning } = await deleteLogTargets(targets);
      for (const key of invalidateKeys ?? []) qc.invalidateQueries({ queryKey: key });
      selection.clear();
      if (warning) toast.warning(warning);
      else toast.success(`${targets.length} post${targets.length === 1 ? "" : "er"} raderade`);
      onDeleted?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Kunde inte radera");
    } finally {
      setBusy(false);
    }
  }

  const has = selection.count > 0;

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        padding: "8px 12px", borderRadius: 10,
        border: `1px solid ${has ? C.accent : C.border}`,
        background: has ? C.tint : "#fff",
        ...style,
      }}
    >
      <button
        type="button"
        onClick={() => (selection.allSelected ? selection.clear() : selection.selectAll())}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          height: 30, padding: "0 10px", borderRadius: 8,
          border: `1px solid ${C.border}`, background: "#fff",
          color: C.text, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
        }}
      >
        {selection.allSelected ? <Square size={14} /> : <CheckSquare size={14} />}
        {selection.allSelected ? "Avmarkera alla" : "Välj alla"}
      </button>

      <span style={{ fontSize: 12.5, color: C.secondary }}>
        {selection.count} av {selection.total} valda
      </span>

      <button
        type="button"
        onClick={run}
        disabled={!has || busy}
        style={{
          marginLeft: "auto",
          display: "inline-flex", alignItems: "center", gap: 6,
          height: 30, padding: "0 12px", borderRadius: 8,
          border: `1px solid ${C.danger}`,
          background: has ? C.danger : "transparent",
          color: has ? "#fff" : C.danger,
          fontSize: 12.5, fontWeight: 600,
          cursor: !has || busy ? "not-allowed" : "pointer",
          opacity: !has || busy ? 0.5 : 1,
        }}
      >
        <Trash2 size={14} />
        {busy ? "Raderar…" : `Radera valda (${selection.count})`}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * The per-row checkbox. `target` takes an array when one visible card stands
 * for several rows — a Historik card is one save, which is one row per changed
 * field, and ticking it must take the whole save with it.
 *
 * stopPropagation is required, not defensive: most log rows sit inside a
 * clickable card that navigates to the ärende, so without it every tick would
 * leave the page before the state update rendered.
 */
export function LogSelectCheckbox({
  selection,
  target,
  style,
}: {
  selection: LogSelection;
  target: LogTarget | readonly LogTarget[];
  style?: CSSProperties;
}) {
  if (!selection.enabled) return null;

  const list = Array.isArray(target) ? target : [target as LogTarget];
  const picked = list.filter((t) => selection.isSelected(t)).length;
  const checked = list.length > 0 && picked === list.length;

  return (
    <input
      type="checkbox"
      checked={checked}
      // Partially-selected group: neither ticked nor empty, so the admin can
      // see the card is involved without it claiming to be fully selected.
      ref={(el) => { if (el) el.indeterminate = picked > 0 && !checked; }}
      aria-label={checked ? "Avmarkera post" : "Markera post"}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => { e.stopPropagation(); selection.setMany(list, !checked); }}
      style={{
        width: 16, height: 16, flexShrink: 0, cursor: "pointer",
        accentColor: C.accent, margin: 0,
        // Several timeline rows are flex containers with align-items: stretch.
        alignSelf: "flex-start",
        ...style,
      }}
    />
  );
}