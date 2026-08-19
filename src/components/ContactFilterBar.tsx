// ===========================================================================
// The filter/sort toolbar above the kontaktlistor.
//
// One component and one hook, same reasoning as LoggbokFilterBar and
// LogSelection: kontakter are listed in two places (/contacts and
// fastighetens Kontakter-flik) and a second hand-rolled sort would drift in
// behaviour and in looks within a release.
//
// Two axes that behave differently — don't conflate them:
//
//   SORT   — Namn (A–Ö / Ö–A) och Tillagd (senast / äldst). Mutually
//            exclusive: exactly one of them orders the list at a time, so
//            turning one on turns the other off. Same rule as objektsidans
//            cycleNameSort/cycleStatusSort.
//   FILTER — Kontakttyp och Fastighet. Freely combinable with each other and
//            with whichever sort is active; they only narrow the row set the
//            sort then runs over.
//
// Kontakttyp is chips and Fastighet is a <select> on purpose: there are 8
// kontakttyper with short labels, so chips can show present-vs-absent and
// active-vs-inactive at a glance, while the building list is open-ended and
// would outgrow any chip row.
// ===========================================================================

import { useMemo, useState } from "react";
import { ArrowUpDown, ArrowDownAZ, ArrowDownZA, ArrowDown, ArrowUp } from "lucide-react";
import { CONTACT_TYPES, CONTACT_TYPE_LABEL, CONTACT_TYPE_BADGE } from "@/lib/contact-tokens";

const C = {
  card: "#ffffff",
  border: "#E5E7EB",
  secondary: "#6B7280",
  text: "#1a1a1a",
  accent: "#0D2B1E",
};

const bodyFont = "Inter, system-ui, sans-serif";

/** 0 = av, 1 = A–Ö, 2 = Ö–A. Tredje trycket slår av igen. */
export type NameSort = 0 | 1 | 2;
/** 0 = av, 1 = senast tillagd, 2 = äldst tillagd. */
export type DateSort = 0 | 1 | 2;

export type ContactSortState = {
  nameSort: NameSort;
  dateSort: DateSort;
  cycleNameSort: () => void;
  cycleDateSort: () => void;
  /** True när någon av sorteringarna styr ordningen. */
  active: boolean;
};

/**
 * Håller de två sorteringsaxlarna och deras ömsesidiga uteslutning.
 * Med båda avslagna behålls ordningen raderna kom i (queryn sorterar på
 * full_name), precis som objektsidans prio-ordning är dess "av"-läge.
 */
export function useContactSort(): ContactSortState {
  const [nameSort, setNameSort] = useState<NameSort>(0);
  const [dateSort, setDateSort] = useState<DateSort>(0);

  // Memoiserad så att anropande listor kan ha den som useMemo-beroende utan
  // att sorteringen räknas om vid varje render.
  return useMemo(
    () => ({
      nameSort,
      dateSort,
      cycleNameSort: () => {
        setDateSort(0);
        setNameSort((m) => (m === 0 ? 1 : m === 1 ? 2 : 0));
      },
      cycleDateSort: () => {
        setNameSort(0);
        setDateSort((m) => (m === 0 ? 1 : m === 1 ? 2 : 0));
      },
      active: nameSort !== 0 || dateSort !== 0,
    }),
    [nameSort, dateSort],
  );
}

type SortableContact = { full_name?: string | null; created_at?: string | null };

/** Sorterar en kopia — anroparens array lämnas orörd. */
export function sortContacts<T extends SortableContact>(rows: readonly T[], sort: ContactSortState): T[] {
  const byName = (a: T, b: T) => (a.full_name ?? "").localeCompare(b.full_name ?? "", "sv");
  const out = [...rows];
  if (sort.nameSort === 1) out.sort(byName);
  else if (sort.nameSort === 2) out.sort((a, b) => byName(b, a));
  else if (sort.dateSort !== 0) {
    out.sort((a, b) => {
      // Poster utan created_at hamnar sist i båda riktningarna: de har inget
      // datum att jämföra, och att låta tomsträngen sortera dem överst vid
      // "äldst" skulle påstå att de är portalens första kontakter.
      const ad = a.created_at ?? "";
      const bd = b.created_at ?? "";
      if (!ad !== !bd) return ad ? -1 : 1;
      if (ad !== bd) return sort.dateSort === 1 ? bd.localeCompare(ad) : ad.localeCompare(bd);
      return byName(a, b);
    });
  }
  return out;
}

// ---------------------------------------------------------------------------

const chipBase: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 12px",
  borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
  whiteSpace: "nowrap", fontFamily: bodyFont, boxSizing: "border-box",
};

/** Neutral pill — samma språk som LoggbokFilterBar: aktiv = accentfylld. */
function chipStyle(active: boolean): React.CSSProperties {
  return {
    ...chipBase,
    border: `1px solid ${active ? C.accent : C.border}`,
    background: active ? C.accent : C.card,
    color: active ? "#fff" : C.secondary,
  };
}

/**
 * Vit eller mörk text på en godtycklig fyllnadsfärg. CONTACT_TYPE_BADGE är
 * valt för färgad text på tonad platta, så ett par av färgerna (ovrigt,
 * ekonomisk_forvaltare) är för ljusa att vända till vit text rakt av.
 * Tröskeln 0.2 är ungefär där WCAG-kontrasten mot vitt och mot svart möts.
 *
 * Exporterad: prioritetschipen i property-tabs.tsx fyller på samma sätt med
 * en tokenfärg (PRIORITY_BADGE) och behöver exakt samma bedömning — en andra
 * kopia skulle driva isär från den här inom en release.
 */
export function readableOn(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#fff";
  const chan = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * chan(0) + 0.7152 * chan(2) + 0.0722 * chan(4);
  return luminance > 0.2 ? C.text : "#fff";
}

/**
 * Kontakttypschipen bär typens egna badgefärger, samma som <Badge> på varje
 * rad — så att välja "Entreprenör" och se entreprenörsfärgade badges under
 * filtret läses som samma sak. Aktivt chip fyller med typens textfärg.
 */
function typeChipStyle(type: string, active: boolean): React.CSSProperties {
  const s = CONTACT_TYPE_BADGE[type] ?? { bg: "#F0F0F0", color: C.secondary };
  return {
    ...chipBase,
    border: `1px solid ${active ? s.color : C.border}`,
    background: active ? s.color : s.bg,
    color: active ? readableOn(s.color) : s.color,
  };
}

export function ContactGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color: C.secondary, fontFamily: bodyFont,
      textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0,
};

const NAME_TITLE: Record<NameSort, string> = {
  0: "Sortera på namn",
  1: "Sorterad: A–Ö",
  2: "Sorterad: Ö–A",
};

const DATE_TITLE: Record<DateSort, string> = {
  0: "Sortera på när kontakten lades till",
  1: "Sorterad: senast tillagd först",
  2: "Sorterad: äldst tillagd först",
};

/**
 * De två sorteringsknapparna. Egen export eftersom fastighetens
 * Kontakter-flik bara behöver sorteringen — den är redan scopad till en
 * fastighet och grupperar redan på kontakttyp.
 */
export function ContactSortToggles({ sort, label = true }: { sort: ContactSortState; label?: boolean }) {
  return (
    <>
      {label && <ContactGroupLabel>Sortering</ContactGroupLabel>}
      <button
        type="button"
        onClick={sort.cycleNameSort}
        title={NAME_TITLE[sort.nameSort]}
        aria-pressed={sort.nameSort !== 0}
        style={chipStyle(sort.nameSort !== 0)}
      >
        {sort.nameSort === 1 ? <ArrowDownAZ size={14} /> : sort.nameSort === 2 ? <ArrowDownZA size={14} /> : <ArrowUpDown size={14} />}
        {sort.nameSort === 1 ? "A–Ö" : sort.nameSort === 2 ? "Ö–A" : "Namn"}
      </button>
      <button
        type="button"
        onClick={sort.cycleDateSort}
        title={DATE_TITLE[sort.dateSort]}
        aria-pressed={sort.dateSort !== 0}
        style={chipStyle(sort.dateSort !== 0)}
      >
        {sort.dateSort === 1 ? <ArrowDown size={14} /> : sort.dateSort === 2 ? <ArrowUp size={14} /> : <ArrowUpDown size={14} />}
        {sort.dateSort === 1 ? "Senast tillagd" : sort.dateSort === 2 ? "Äldst tillagd" : "Tillagd"}
      </button>
    </>
  );
}

export type BuildingOptions = {
  /** [id, namn], redan sorterade. */
  list: Array<[string, string]>;
  hasUnassigned: boolean;
};

/**
 * `types` ska bara innehålla kontakttyper som faktiskt finns kvar efter
 * fastighetsfiltret — ett chip som garanterat ger en tom lista är inget val.
 */
export function ContactFilterBar({
  sort,
  types,
  typeFilter,
  onTypeFilter,
  buildings,
  buildingFilter,
  onBuildingFilter,
}: {
  sort: ContactSortState;
  types: readonly string[];
  typeFilter: string | null;
  onTypeFilter: (v: string | null) => void;
  buildings: BuildingOptions;
  buildingFilter: string;
  onBuildingFilter: (v: string) => void;
}) {
  const hasBuildings = buildings.list.length + (buildings.hasUnassigned ? 1 : 0) > 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      {types.length > 1 && (
        <div style={rowStyle}>
          <ContactGroupLabel>Kontakttyp</ContactGroupLabel>
          <button type="button" onClick={() => onTypeFilter(null)} style={chipStyle(typeFilter === null)}>
            Alla typer
          </button>
          {types.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTypeFilter(typeFilter === t ? null : t)}
              aria-pressed={typeFilter === t}
              style={typeChipStyle(t, typeFilter === t)}
            >
              {CONTACT_TYPE_LABEL[t] ?? t}
            </button>
          ))}
        </div>
      )}

      <div style={rowStyle}>
        {hasBuildings && (
          <>
            <ContactGroupLabel>Fastighet</ContactGroupLabel>
            <select
              value={buildingFilter}
              onChange={(e) => onBuildingFilter(e.target.value)}
              aria-label="Filtrera på fastighet"
              style={{
                height: 30, padding: "0 10px", borderRadius: 8, fontSize: 12.5,
                fontWeight: 600, cursor: "pointer", fontFamily: bodyFont,
                maxWidth: "100%", minWidth: 0, boxSizing: "border-box",
                border: `1px solid ${buildingFilter ? C.accent : C.border}`,
                background: buildingFilter ? C.accent : C.card,
                color: buildingFilter ? "#fff" : C.secondary,
              }}
            >
              <option value="" style={{ color: C.text, background: C.card }}>Alla fastigheter</option>
              {buildings.list.map(([id, name]) => (
                <option key={id} value={id} style={{ color: C.text, background: C.card }}>{name}</option>
              ))}
              {buildings.hasUnassigned && (
                <option value="__none__" style={{ color: C.text, background: C.card }}>Utan fastighet</option>
              )}
            </select>
          </>
        )}

        <ContactSortToggles sort={sort} />
      </div>
    </div>
  );
}

/**
 * En kontakt utan contact_type räknas som "ovrigt" — både här och i
 * filtreringen (contactTypeKey), så chipet aldrig lovar rader det inte kan
 * visa. Raden själv visar ingen badge i det läget; det är avsiktligt,
 * <Badge> renderar null för en typlös kontakt.
 */
export function contactTypeKey(contact: { contact_type?: string | null }): string {
  return contact.contact_type ?? "ovrigt";
}

/**
 * De kontakttyper som finns kvar i raderna filtret redan har smalnat av,
 * i CONTACT_TYPES ordning. Den valda typen behålls alltid i listan — annars
 * försvinner det aktiva filtret ur sin egen chiprad (samma undantag som
 * AnsvarigDropdown gör för en inaktiv kontakt).
 */
export function usePresentContactTypes(
  rows: ReadonlyArray<{ contact_type?: string | null }>,
  selected: string | null,
): string[] {
  return useMemo(() => {
    const present = new Set<string>();
    for (const c of rows) present.add(contactTypeKey(c));
    if (selected) present.add(selected);
    const known: string[] = CONTACT_TYPES.filter((t) => present.has(t));
    const unknown = [...present].filter((t) => !CONTACT_TYPES.includes(t as never)).sort();
    return [...known, ...unknown];
  }, [rows, selected]);
}
