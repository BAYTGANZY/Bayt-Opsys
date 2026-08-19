// ===========================================================================
// The filter row above every loggbok list in the app.
//
// One component and one hook, deliberately: the app renders loggbok-shaped
// lists in five places (alla byggnaders loggbok, fastighetens loggbok,
// objektsidans loggflik, objektets egen logg, lägenhetens loggbok) and they
// previously each sorted newest-first with no controls at all. Building the
// filters per surface would guarantee they drift in behaviour and in looks.
//
// One row of identically-shaped fields, in render order:
//   Sök      — free text; leads, and takes the leftover width.
//   Källa    — loggbok / besiktning / projekt. Only rendered where a surface
//              actually mixes them; a single-kind list would show one option.
//   Åtgärd   — what kind of thing happened (actionKindOf in lib/logbook.ts).
//   Vem      — who did it, from created_by.
//   Ordning  — Senaste / Äldst.
//   Rensa    — appears only while something is filtered.
//
// Any control whose option list would have a single entry renders nothing at
// all, so a quiet building shows two fields rather than five dead ones.
//
// There is deliberately NO status filter. A loggbokspost records something
// that already happened; it carries no härledd ärendestatus of its own, and a
// status chip here would invite reading it as one.
// ===========================================================================

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { actionKindLabel } from "@/lib/logbook";

const C = {
  card: "#ffffff", border: "#E5E7EB", secondary: "#6B7280", text: "#1a1a1a",
  accent: "#0D2B1E", green: "#5CB84A", tint: "#F0F7EE",
};

export type DateSort = "senaste" | "aldst";

const SORT_LABEL: Record<DateSort, string> = {
  senaste: "Senaste först",
  aldst: "Äldst först",
};

/** Rows with no created_by — system/legacy entries — get their own bucket
 *  rather than being dropped, so the filter's counts still add up. */
export const UNKNOWN_ACTOR = "__none__";

/** Everything the filter needs to know about one row, whatever table it came
 *  from. Each surface projects its own row shape into this. */
export type LoggbokRowMeta = {
  /** "log" | "inspection" | "project" — always "log" on single-kind surfaces. */
  source: string;
  /** From `actionKindOf(event_type, content)`. */
  actionKind: string;
  actorId: string | null;
  actorName: string | null;
  /** ISO date or timestamp. Compared as a string, so both sort together. */
  date: string;
  /** Free-text haystack. */
  text: string;
};

export type SourceOption = { key: string; label: string };

export type LoggbokFilterState = {
  source: string;
  setSource: (v: string) => void;
  action: string | null;
  setAction: (v: string | null) => void;
  actor: string | null;
  setActor: (v: string | null) => void;
  sort: DateSort;
  setSort: (v: DateSort) => void;
  q: string;
  setQ: (v: string) => void;
  /** Åtgärd-nycklar present in the current result set (plus whatever is
   *  selected, so an active filter can never become invisible). */
  actions: string[];
  actors: Array<{ id: string; name: string }>;
  /** True when anything is narrowing the list — drives the empty-state text. */
  active: boolean;
  reset: () => void;
};

/**
 * Filters, sorts and builds the facet lists for one loggbok surface.
 *
 * Facets are built from the result set with their *own* axis excluded. Doing it
 * the naive way — deriving the Åtgärd chips from the fully filtered rows —
 * makes the chip list collapse to the single chip you just pressed, which reads
 * as if the other kinds stopped existing.
 */
export function useLoggbokFilter<T>(
  rows: readonly T[],
  meta: (row: T) => LoggbokRowMeta,
): { rows: T[]; filters: LoggbokFilterState } {
  const [source, setSource] = useState("alla");
  const [action, setAction] = useState<string | null>(null);
  const [actor, setActor] = useState<string | null>(null);
  const [sort, setSort] = useState<DateSort>("senaste");
  const [q, setQ] = useState("");

  // `meta` is written inline at every call site, so it is a new function every
  // render; the row array is what actually changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tagged = useMemo(() => rows.map((row) => ({ row, m: meta(row) })), [rows]);

  const base = useMemo(() => {
    const s = q.trim().toLowerCase();
    return tagged.filter(({ m }) => {
      if (source !== "alla" && m.source !== source) return false;
      if (s && !m.text.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [tagged, source, q]);

  const actions = useMemo(() => {
    const present = new Set<string>();
    for (const { m } of base) {
      if (actor && (m.actorId ?? UNKNOWN_ACTOR) !== actor) continue;
      present.add(m.actionKind);
    }
    if (action) present.add(action);
    return [...present].sort((a, b) => actionKindLabel(a).localeCompare(actionKindLabel(b), "sv"));
  }, [base, actor, action]);

  const actors = useMemo(() => {
    const map = new Map<string, string>();
    for (const { m } of base) {
      if (action && m.actionKind !== action) continue;
      const id = m.actorId ?? UNKNOWN_ACTOR;
      if (!map.has(id)) map.set(id, id === UNKNOWN_ACTOR ? "Okänd" : m.actorName?.trim() || "Okänd användare");
    }
    if (actor && !map.has(actor)) {
      const hit = base.find(({ m }) => (m.actorId ?? UNKNOWN_ACTOR) === actor);
      map.set(actor, actor === UNKNOWN_ACTOR ? "Okänd" : hit?.m.actorName?.trim() || "Okänd användare");
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => {
        if (a.id === UNKNOWN_ACTOR) return 1;
        if (b.id === UNKNOWN_ACTOR) return -1;
        return a.name.localeCompare(b.name, "sv");
      });
  }, [base, action, actor]);

  const filtered = useMemo(() => {
    const out = base.filter(({ m }) => {
      if (action && m.actionKind !== action) return false;
      if (actor && (m.actorId ?? UNKNOWN_ACTOR) !== actor) return false;
      return true;
    });
    out.sort((a, b) =>
      sort === "senaste" ? b.m.date.localeCompare(a.m.date) : a.m.date.localeCompare(b.m.date),
    );
    return out.map((x) => x.row);
  }, [base, action, actor, sort]);

  return {
    rows: filtered,
    filters: {
      source, setSource,
      action, setAction,
      actor, setActor,
      sort, setSort,
      q, setQ,
      actions, actors,
      active: source !== "alla" || action !== null || actor !== null || q.trim() !== "",
      reset: () => { setSource("alla"); setAction(null); setActor(null); setQ(""); },
    },
  };
}

/** "Inga poster för det här valet" vs the surface's own "ingenting ännu" —
 *  a filtered-empty list must never read as an empty building. */
export function loggbokEmptyText(active: boolean, base: string): string {
  return active ? "Inga poster för det här valet" : base;
}

// ---------------------------------------------------------------------------

/**
 * Every control is the same shape and size — one soft-bordered field, 34px.
 *
 * The first version of this bar had four labelled rows of solid dark chips and
 * read as a wall: three visual languages (filled chip, green pill, dark circle
 * button) stacked four deep, in a box that also holds the delete toolbar. Two
 * things fixed it without dropping an axis:
 *
 *  - Each control names its own axis in its resting option ("Alla åtgärder"),
 *    so the uppercase KÄLLA / ÅTGÄRD / VEM / ORDNING labels are gone — the
 *    label was saying what the control already said.
 *  - A dropdown is one line whatever the option count, so twelve åtgärder can
 *    no longer wrap into a second and third unlabelled row of chips.
 *
 * Engaged state is a light green tint, not a solid dark fill: still obvious at
 * a glance against the white row, without four black blocks fighting the list.
 */
const FIELD_H = 34;

function fieldStyle(engaged: boolean): React.CSSProperties {
  return {
    height: FIELD_H,
    padding: "0 10px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: engaged ? 600 : 500,
    fontFamily: "inherit",
    cursor: "pointer",
    minWidth: 0,
    maxWidth: "100%",
    boxSizing: "border-box",
    outline: "none",
    border: `1px solid ${engaged ? C.green : C.border}`,
    background: engaged ? C.tint : C.card,
    color: engaged ? C.accent : C.secondary,
  };
}

/** Shared by all four dropdowns. `resting` is the "no filter" option, which is
 *  also what names the axis — so the control needs no separate label. */
function FilterSelect({
  value, onChange, resting, options, ariaLabel, engaged,
}: {
  value: string;
  onChange: (v: string) => void;
  resting: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  ariaLabel: string;
  engaged: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      title={ariaLabel}
      style={fieldStyle(engaged)}
    >
      {/* Options inherit the field's colours otherwise, which would render the
          open list green-on-green in the engaged state. */}
      <option value="" style={{ color: C.text, background: C.card, fontWeight: 500 }}>{resting}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value} style={{ color: C.text, background: C.card, fontWeight: 500 }}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * `sources` is omitted on the three surfaces that only ever list
 * logbook_entries — a Källa control there would be one permanently-selected
 * option pretending to be a choice.
 */
export function LoggbokFilterBar({
  filters,
  sources,
  searchPlaceholder = "Sök i loggboken…",
}: {
  filters: LoggbokFilterState;
  sources?: readonly SourceOption[];
  searchPlaceholder?: string;
}) {
  const isMobile = useIsMobile();

  // Källa's resting option is the surface's own "Alla" chip label; the rest of
  // the list are the real kinds.
  const sourceOptions = (sources ?? []).filter((s) => s.key !== "alla");

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        minWidth: 0, rowGap: 8,
      }}
    >
      {/* Search leads and takes the slack: it is the control people reach for
          first, and giving it flex keeps the dropdowns from stretching into
          four ragged widths. */}
      <div style={{ position: "relative", flex: isMobile ? "1 1 100%" : "1 1 200px", minWidth: 0 }}>
        <Search
          size={15}
          color={C.secondary}
          style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
        />
        <input
          value={filters.q}
          onChange={(e) => filters.setQ(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          style={{
            ...fieldStyle(false),
            width: "100%",
            padding: "0 10px 0 31px",
            cursor: "text",
            fontWeight: 500,
            color: C.text,
          }}
        />
      </div>

      {sourceOptions.length > 0 && (
        <FilterSelect
          ariaLabel="Filtrera på källa"
          resting="Alla källor"
          value={filters.source === "alla" ? "" : filters.source}
          onChange={(v) => filters.setSource(v || "alla")}
          engaged={filters.source !== "alla"}
          options={sourceOptions.map((s) => ({ value: s.key, label: s.label }))}
        />
      )}

      {filters.actions.length > 1 && (
        <FilterSelect
          ariaLabel="Filtrera på åtgärd"
          resting="Alla åtgärder"
          value={filters.action ?? ""}
          onChange={(v) => filters.setAction(v || null)}
          engaged={filters.action !== null}
          options={filters.actions.map((a) => ({ value: a, label: actionKindLabel(a) }))}
        />
      )}

      {filters.actors.length > 1 && (
        <FilterSelect
          ariaLabel="Filtrera på vem"
          resting="Alla personer"
          value={filters.actor ?? ""}
          onChange={(v) => filters.setActor(v || null)}
          engaged={filters.actor !== null}
          options={filters.actors.map((a) => ({ value: a.id, label: a.name }))}
        />
      )}

      {/* Ordning is a plain two-option dropdown rather than the pill + cycle
          button used on the fastighetslistorna: that pair only earns its extra
          weight next to a three-state cycle, and here both states fit in the
          same field shape as everything else. */}
      <select
        value={filters.sort}
        onChange={(e) => filters.setSort(e.target.value as DateSort)}
        aria-label="Sortering"
        title="Sortering"
        style={{ ...fieldStyle(false), color: C.text }}
      >
        <option value="senaste">{SORT_LABEL.senaste}</option>
        <option value="aldst">{SORT_LABEL.aldst}</option>
      </select>

      {filters.active && (
        <button
          type="button"
          onClick={filters.reset}
          title="Rensa alla filter"
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            height: FIELD_H, padding: "0 10px", borderRadius: 8,
            border: "1px solid transparent", background: "transparent",
            color: C.secondary, fontSize: 13, fontWeight: 500,
            fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          <X size={14} /> Rensa
        </button>
      )}
    </div>
  );
}
