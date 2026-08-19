// ===========================================================================
// Kolumnstyrd filtrering och sortering — den delade mekaniken.
//
// Samma resonemang som LogSelection, LoggbokFilterBar och ContactFilterBar: de
// listor som ännu saknade kontroller (åtgärder, dokument, lägenhetens
// tidslinje, användare, historik, dag-rapport, ekonomi) är sju stycken, och sju
// handrullade sorteringar driver isär i beteende och utseende inom en release.
// Lägg till en åttonde yta genom att projicera dess rader hit — hitta inte på
// en egen.
//
// Två axlar som beter sig olika, precis som i ContactFilterBar — blanda inte
// ihop dem:
//
//   SORT   — ömsesidigt uteslutande. Exakt en kolumn ordnar listan åt gången,
//            så att slå på en slår av den andra. Ett klick på den aktiva axeln
//            vänder riktningen.
//   FILTER — kombineras fritt med varandra och med vilken sortering som helst;
//            de smalnar bara av raduppsättningen som sorteringen sedan ordnar.
//
// Ett filter visar bara värden som faktiskt förekommer i raderna (samma regel
// som prioritetschipen, besiktningstypschipen och ContactFilterBar) — ett val
// som garanterat ger en tom lista är inget val. Det valda värdet behålls alltid
// i sin egen lista, annars försvinner ett aktivt filter ur kontrollen som satte
// det.
// ===========================================================================

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { ContactGroupLabel, readableOn } from "@/components/ContactFilterBar";

const C = {
  card: "#ffffff",
  border: "#E5E7EB",
  secondary: "#6B7280",
  text: "#1a1a1a",
  accent: "#0D2B1E",
};

const bodyFont = "Inter, system-ui, sans-serif";

/** Samma etikett som kontaktfiltret använder — en definition, ingen kopia. */
export const FilterGroupLabel = ContactGroupLabel;

/**
 * Nyckeln för "inget värde satt" — ingen tilldelad, ingen kategori, ingen
 * fastighet. Rader utan värde får en egen hink i stället för att falla ur
 * filtret helt (samma val som UNKNOWN_ACTOR i LoggbokFilterBar).
 */
export const NONE_KEY = "__none__";

// ---------------------------------------------------------------------------
// SORTERING
// ---------------------------------------------------------------------------

export type SortDir = "asc" | "desc";

export type SortAxis = {
  key: string;
  /** Kolumnens namn — vad knappen heter när axeln inte styr ordningen. */
  label: string;
  /** Etikett per riktning när axeln styr ordningen ("Senaste" / "Äldst"). */
  dirLabel: Record<SortDir, string>;
  /** Riktningen ett första klick slår på. Default: fallande. */
  first?: SortDir;
};

export type ListSortState = {
  /** Aktiv axel, eller null när listan ligger kvar i sin egen grundordning. */
  key: string | null;
  dir: SortDir;
  toggle: (key: string) => void;
  active: boolean;
};

/**
 * Håller den enda aktiva sorteringsaxeln och dess riktning.
 *
 * `initial` avgör om "av" finns som läge, och det är en avsiktlig skillnad:
 *  - En lista som redan kom med en fast ordning (dokument låg på uppladdad
 *    fallande, åtgärder på förfallodatum stigande) får den ordningen som
 *    startläge, och axeln växlar då mellan sina två riktningar. Att kunna slå
 *    av den vore att kunna välja "ingen ordning alls", vilket inte är något
 *    listan kan visa.
 *  - En lista utan egen ordning (ekonomins poster) får `initial = null`. Där
 *    är av ett riktigt läge — tredje klicket lämnar tillbaka radernas
 *    ursprungliga ordning, precis som ContactSortToggles gör.
 */
export function useListSort(
  axes: readonly SortAxis[],
  initial: { key: string; dir: SortDir } | null = null,
): ListSortState {
  const [state, setState] = useState<{ key: string; dir: SortDir } | null>(initial);
  // Läses en gång: anropssidan skickar en modulkonstant, inte ett växlande värde.
  const [canTurnOff] = useState(initial === null);

  const firstDirOf = useMemo(() => {
    const m = new Map<string, SortDir>();
    for (const a of axes) m.set(a.key, a.first ?? "desc");
    return m;
  }, [axes]);

  const toggle = (key: string) =>
    setState((prev) => {
      const first = firstDirOf.get(key) ?? "desc";
      if (!prev || prev.key !== key) return { key, dir: first };
      const other: SortDir = first === "desc" ? "asc" : "desc";
      if (prev.dir === first) return { key, dir: other };
      return canTurnOff ? null : { key, dir: first };
    });

  return {
    key: state?.key ?? null,
    dir: state?.dir ?? "desc",
    toggle,
    active: state !== null,
  };
}

/**
 * Sorterar en kopia — anroparens array lämnas orörd.
 *
 * `valueOf` returnerar radens värde för den aktiva axeln. Rader utan värde
 * hamnar sist i **båda** riktningarna: de har inget att jämföras på, och att
 * låta tomsträngen sortera dem överst vid "äldst" skulle påstå att de är
 * listans första poster (samma regel som sortContacts i ContactFilterBar).
 */
export function applySort<T>(
  rows: readonly T[],
  sort: ListSortState,
  valueOf: (row: T, axis: string) => string | number | null | undefined,
): T[] {
  const out = [...rows];
  const axis = sort.key;
  if (!axis) return out;
  const sign = sort.dir === "asc" ? 1 : -1;
  const missing = (v: string | number | null | undefined) => v === null || v === undefined || v === "";

  out.sort((a, b) => {
    const av = valueOf(a, axis);
    const bv = valueOf(b, axis);
    const am = missing(av);
    const bm = missing(bv);
    if (am !== bm) return am ? 1 : -1;
    if (am && bm) return 0;
    if (typeof av === "number" && typeof bv === "number") return sign * (av - bv);
    return sign * String(av).localeCompare(String(bv), "sv");
  });
  return out;
}

// ---------------------------------------------------------------------------
// KONTROLLERNA
// ---------------------------------------------------------------------------

const chipBase: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 12px",
  borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
  whiteSpace: "nowrap", fontFamily: bodyFont, boxSizing: "border-box",
};

/** Neutralt chip — samma språk som ContactFilterBar: aktivt = accentfyllt. */
function chipStyle(active: boolean): React.CSSProperties {
  return {
    ...chipBase,
    border: `1px solid ${active ? C.accent : C.border}`,
    background: active ? C.accent : C.card,
    color: active ? "#fff" : C.secondary,
  };
}

/** Chip som bär värdets egen badgefärg (roll, prioritet, kostnadskategori). */
function tintedChipStyle(tint: { bg: string; color: string }, active: boolean): React.CSSProperties {
  return {
    ...chipBase,
    border: `1px solid ${active ? tint.color : C.border}`,
    background: active ? tint.color : tint.bg,
    color: active ? readableOn(tint.color) : tint.color,
  };
}

/** En rad kontroller. Wrappar hellre än scrollar — raden sitter över en tabell. */
export function FilterRow({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0, ...style }}>
      {children}
    </div>
  );
}

/**
 * Sorteringsknapparna. Riktningen står i klartext på den aktiva knappen
 * ("Senaste", "A–Ö", "Störst") — pilen ensam säger inte åt vilket håll en
 * bokstavsordning eller ett belopp går.
 */
export function SortToggles({
  axes,
  sort,
  label = "Sortering",
}: {
  axes: readonly SortAxis[];
  sort: ListSortState;
  /** Sätt till null för att utelämna gruppetiketten. */
  label?: string | null;
}) {
  return (
    <>
      {label && <FilterGroupLabel>{label}</FilterGroupLabel>}
      {axes.map((a) => {
        const active = sort.key === a.key;
        return (
          <button
            key={a.key}
            type="button"
            onClick={() => sort.toggle(a.key)}
            aria-pressed={active}
            title={active ? `Sorterad: ${a.dirLabel[sort.dir].toLowerCase()}` : `Sortera på ${a.label.toLowerCase()}`}
            style={chipStyle(active)}
          >
            {!active ? <ArrowUpDown size={14} /> : sort.dir === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
            {active ? a.dirLabel[sort.dir] : a.label}
          </button>
        );
      })}
    </>
  );
}

export type ChipOption = {
  value: string;
  label: string;
  /** Värdets egna badgefärger, när det har några. */
  tint?: { bg: string; color: string };
  title?: string;
};

/**
 * Chipfilter för en axel med få, korta värden. Öppen eller lång värdelista →
 * använd FilterDropdown i stället; en chiprad som wrappar tre gånger är samma
 * vägg som LoggbokFilterBar byggdes om för att slippa.
 *
 * "Alla"-chipet finns kvar även när ett värde är valt: att klicka det valda
 * chipet igen nollställer också, men den vägen är inte synlig.
 */
export function FilterChips({
  options,
  value,
  onChange,
  ariaLabel,
  allLabel = "Alla",
  label,
}: {
  options: readonly ChipOption[];
  value: string | null;
  onChange: (v: string | null) => void;
  ariaLabel: string;
  allLabel?: string;
  label?: string | null;
}) {
  if (options.length <= 1) return null;
  return (
    <>
      {label && <FilterGroupLabel>{label}</FilterGroupLabel>}
      <div role="group" aria-label={ariaLabel} style={{ display: "flex", flexWrap: "wrap", gap: 6, minWidth: 0 }}>
        <button type="button" onClick={() => onChange(null)} aria-pressed={value === null} style={chipStyle(value === null)}>
          {allLabel}
        </button>
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(active ? null : o.value)}
              aria-pressed={active}
              title={o.title ?? (active ? "Klicka igen för att visa alla" : `Visa bara ${o.label}`)}
              style={o.tint ? tintedChipStyle(o.tint, active) : chipStyle(active)}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </>
  );
}

/**
 * Dropdown för en öppen värdelista (personer, fastigheter). `resting` namnger
 * axeln, så kontrollen behöver ingen egen etikett — samma val som
 * LoggbokFilterBar gjorde när dess fyra chiprader blev fyra fält.
 */
export function FilterDropdown({
  options,
  value,
  onChange,
  resting,
  ariaLabel,
}: {
  options: readonly ChipOption[];
  value: string | null;
  onChange: (v: string | null) => void;
  resting: string;
  ariaLabel: string;
}) {
  if (options.length <= 1) return null;
  const engaged = value !== null;
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      aria-label={ariaLabel}
      title={ariaLabel}
      style={{
        height: 30, padding: "0 10px", borderRadius: 8, fontSize: 12.5,
        fontWeight: 600, cursor: "pointer", fontFamily: bodyFont,
        maxWidth: "100%", minWidth: 0, boxSizing: "border-box", outline: "none",
        border: `1px solid ${engaged ? C.accent : C.border}`,
        background: engaged ? C.accent : C.card,
        color: engaged ? "#fff" : C.secondary,
      }}
    >
      {/* Optionerna ärver annars fältets färger och blir vit-på-mörkt när
          filtret är aktivt. */}
      <option value="" style={{ color: C.text, background: C.card }}>{resting}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value} style={{ color: C.text, background: C.card }}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// FACETTER
// ---------------------------------------------------------------------------

/**
 * De nycklar som faktiskt förekommer i raderna, i `order`-ordning där en sådan
 * finns (okända värden — äldre import — hamnar sist men får ändå ett val,
 * annars går de raderna bara att nå ofiltrerat). Den valda nyckeln behålls
 * alltid.
 *
 * Skicka rader som *inte* är filtrerade på den här axeln, men gärna filtrerade
 * på de andra: härleds valen ur den färdigfiltrerade listan kollapsar de till
 * det val man just gjorde, vilket läses som att de andra slutade finnas.
 */
export function usePresentKeys<T>(
  rows: readonly T[],
  keyOf: (row: T) => string | null | undefined,
  selected: string | null,
  order?: readonly string[],
): string[] {
  return useMemo(() => {
    const present = new Set<string>();
    for (const r of rows) {
      const k = keyOf(r);
      if (k) present.add(k);
    }
    if (selected) present.add(selected);
    if (!order) {
      return [...present].sort((a, b) => (a === NONE_KEY ? 1 : b === NONE_KEY ? -1 : a.localeCompare(b, "sv")));
    }
    const known = order.filter((k) => present.has(k));
    const unknown = [...present]
      .filter((k) => !order.includes(k))
      .sort((a, b) => (a === NONE_KEY ? 1 : b === NONE_KEY ? -1 : a.localeCompare(b, "sv")));
    return [...known, ...unknown];
    // keyOf skrivs inline på varje anropssida och är ny varje render; raderna
    // är det som faktiskt ändras.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, selected, order]);
}

/**
 * Namngivna val ur en öppen lista (personer), byggda i ett svep så att namnet
 * hämtas från samma rad som nyckeln. Sorteras på etikett, med "inget värde"
 * sist. `all` är hela raduppsättningen och används bara för att kunna namnge
 * ett valt värde som de synliga raderna inte längre innehåller.
 */
export function usePresentOptions<T>(
  rows: readonly T[],
  entryOf: (row: T) => { value: string; label: string },
  selected: string | null,
  all: readonly T[] = rows,
): ChipOption[] {
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      const { value, label } = entryOf(r);
      if (!map.has(value)) map.set(value, label);
    }
    if (selected && !map.has(selected)) {
      const hit = all.find((r) => entryOf(r).value === selected);
      map.set(selected, hit ? entryOf(hit).label : "Okänd");
    }
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) =>
        a.value === NONE_KEY ? 1 : b.value === NONE_KEY ? -1 : a.label.localeCompare(b.label, "sv"),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, selected, all]);
}

/** "Inga poster för det här valet" vs ytans egen tomtext — en filtrerad tom
 *  lista får aldrig läsas som en tom byggnad. Samma regel som loggbokEmptyText. */
export function listEmptyText(active: boolean, base: string, label = "poster"): string {
  return active ? `Inga ${label} för det här valet` : base;
}
