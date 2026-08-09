import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useMyContactId } from "@/hooks/useMyContactId";
import { useVisibleProperties } from "@/hooks/useVisibleProperties";
import {
  LIFECYCLE_OF,
  PRIORITY_BADGE,
  PRIORITY_DISPLAY_LABEL,
  PRIORITY_FULL_LABEL,
  deriveInspectionStatus,
  deriveIssueStatus,
  deriveProjectStatus,
  derivePriorityFromStatus,
  type DerivedStatus,
} from "@/lib/issue-tokens";
import { inspectionTypeLabel } from "@/lib/inspection-tokens";
import { objectTypeLabel } from "@/lib/object-tokens";

/**
 * Every ärende assigned to the signed-in entreprenör — felanmälan, besiktning
 * and projekt in one list.
 *
 * Assignment means exactly one thing: `assigned_contact_id` points at the
 * `contacts` row linked to their login (see useMyContactId). Nothing else may
 * widen this — an entreprenör who happens to work in a building must not see
 * that building's other ärenden. The database enforces the same rule through
 * RLS; this hook is the UI-level half.
 *
 * The three tables disagree about almost every column name (status vs
 * arende_status, deadline vs next_due_date vs end_date), so they are normalized
 * into one `MyArende` shape here and nowhere else.
 */

export type MyArendeKind = "issue" | "inspection" | "project";

export type MyArende = {
  kind: MyArendeKind;
  id: string;
  title: string;
  /**
   * The lifecycle anchor exactly as stored — `issues.status` for felanmälan,
   * `arende_status` for besiktning/projekt. Passed verbatim to
   * OppnaArendeButton/AvslutaArendeButton, which are the only writers of it.
   */
  lifecycleStatus: string | null;
  lifecycle: "vilande" | "oppet" | "avslutat";
  /**
   * Raw `projects.status` — pausad/avbruten live here, invisible to
   * `arende_status`. Null for felanmälan/besiktning. Threaded to the lifecycle
   * buttons so the sheet obeys the same pausad/avbruten rules as the
   * projektsida (avbruten = no actions; pausad = Öppna asks "återuppta?").
   */
  projektStatus: string | null;
  /** Härledd status — the one badge every surface renders. Never chosen. */
  status: DerivedStatus;
  /** Sorting/chip key: the stored column for felanmälan, härledd for the rest. */
  priorityKey: string;
  priorityLabel: string;
  priorityColor: string;
  priorityReason: string;
  propertyId: string | null;
  propertyName: string | null;
  apartmentId: string | null;
  /** "Lgh 1203 · Trappa B" — where the work is, in one line. Null = byggnadsnivå. */
  placeLabel: string | null;
  /**
   * Vem som ska utföra jobbet, upplöst från `assigned_contact_id`. Redundant för
   * en entreprenör (det är alltid de själva) men hela poängen för styrelsen, som
   * läser listan för att se vad som kommer göras och av vem.
   */
  assignedName: string | null;
  description: string | null;
  createdAt: string | null;
  /** Per-ärendetyp extras for the detail sheet, in display order. */
  meta: Array<{ label: string; value: string }>;
};

const KIND_LABEL: Record<MyArendeKind, string> = {
  issue: "Felanmälan",
  inspection: "Besiktning",
  project: "Projekt",
};
const KIND_COLOR: Record<MyArendeKind, string> = {
  issue: "#DC2626",
  inspection: "#D4A017",
  project: "#3D8A30",
};
export const arendeKindLabel = (k: MyArendeKind) => KIND_LABEL[k];
export const arendeKindColor = (k: MyArendeKind) => KIND_COLOR[k];

const PRIORITY_RANK: Record<string, number> = { akut: 0, hog: 1, normal: 2, lag: 3 };

/**
 * Deadline first — närmast i tiden överst, ärenden utan tidsgräns sist — and
 * prioritet only as the tie-breaker. Two ärenden due the same day are ordered
 * akut → hög → normal → låg.
 */
export function compareMyArenden(a: MyArende, b: MyArende): number {
  const da = a.status.dueDate;
  const db = b.status.dueDate;
  if (da && db && da !== db) return da < db ? -1 : 1;
  if (da && !db) return -1;
  if (!da && db) return 1;
  const pa = PRIORITY_RANK[a.priorityKey] ?? 9;
  const pb = PRIORITY_RANK[b.priorityKey] ?? 9;
  if (pa !== pb) return pa - pb;
  return a.title.localeCompare(b.title, "sv");
}

/** apartment_id → "Lgh 1203 · Trappa B". Built from one lookup, see below. */
type PlaceMap = Map<string, string>;
/** assigned_contact_id → "Anna Svensson (Rörjour AB)". Same one-lookup pattern. */
type NameMap = Map<string, string>;

type IssueRow = {
  apartment_id: string | null;
  property_object_id: string | null;
  assigned_contact_id: string | null;
  id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  priority: string | null;
  status: string | null;
  deadline: string | null;
  created_at: string | null;
  property_id: string | null;
  trappa: string | null;
  reporter_name: string | null;
  reporter_phone: string | null;
  properties: { name: string | null } | null;
};

type InspectionRow = {
  apartment_id: string | null;
  property_object_id: string | null;
  assigned_contact_id: string | null;
  id: string;
  /** Optional: only present once trappa-field.sql has been applied. */
  trappa?: string | null;
  inspection_type: string | null;
  inspector: string | null;
  notes: string | null;
  status: string | null;
  arende_status: string | null;
  next_due_date: string | null;
  last_completed_date: string | null;
  interval_months: number | null;
  created_at: string | null;
  property_id: string | null;
  properties: { name: string | null } | null;
};

type ProjectRow = {
  id: string;
  property_object_id: string | null;
  assigned_contact_id: string | null;
  title: string | null;
  description: string | null;
  status: string | null;
  arende_status: string | null;
  budget: number | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  property_id: string | null;
  properties: { name: string | null } | null;
};

/** property_object_id → objektets typ/namn + koppladen lägenhet, om någon. */
type ObjectRow = { id: string; type: string; name: string | null; apartment_id: string | null };
type ObjectMap = Map<string, ObjectRow>;

/**
 * Vilka ärenden som ska hämtas. Två helt olika frågor:
 *
 *   contact    — "mina ärenden", dvs tilldelade mig. Entreprenörens vy.
 *   properties — "vad händer i mina hus", oavsett vem som utför. Styrelsens vy.
 *
 * De två får ALDRIG slås ihop. En entreprenör som arbetar i ett hus ska inte se
 * husets övriga ärenden, och en styrelseledamot ska se alla sina hus ärenden
 * utan att vara tilldelad någonting. Samma rader, olika urval.
 */
type ArendeScope =
  | { by: "contact"; contactId: string }
  | { by: "properties"; propertyIds: string[] };

async function loadArenden(scope: ArendeScope) {
  // PostgREST-byggarna är generiska på ett sätt som inte överlever en
  // hjälpfunktion; urvalet är ett `.eq`/`.in` och inget mer, så `any` här är
  // billigare än att typa om tre frågekedjor.
  const scoped = (q: any) =>
    scope.by === "contact"
      ? q.eq("assigned_contact_id", scope.contactId)
      : q.in("property_id", scope.propertyIds);

  const [issues, inspections, projects] = await Promise.all([
    scoped(
      supabase
        .from("issues")
        .select(
          "id, title, description, category, priority, status, deadline, created_at, property_id, apartment_id, property_object_id, assigned_contact_id, trappa, reporter_name, reporter_phone, properties(name)",
        ),
    ),
    // `select("*")` on purpose, exactly like the besiktning detail page: the
    // `trappa` column comes from a hand-run migration (trappa-field.sql) that is
    // NOT applied to the live DB yet — naming it explicitly 400s the whole query
    // with 42703 and the page shows nothing. Verified against the live schema.
    scoped(supabase.from("inspections").select("*, properties(name)")),
    // Projekt are building-level: the table has no apartment_id column at all.
    scoped(
      supabase
        .from("projects")
        .select(
          "id, title, description, status, arende_status, budget, start_date, end_date, created_at, property_id, property_object_id, assigned_contact_id, properties(name)",
        ),
    ),
  ]);

  const error = issues.error ?? inspections.error ?? projects.error;
  if (error) throw error;

  const issueRows = (issues.data ?? []) as unknown as IssueRow[];
  const inspectionRows = (inspections.data ?? []) as unknown as InspectionRow[];
  const projectRows = (projects.data ?? []) as unknown as ProjectRow[];

  // Objektet ett ärende är rest mot — samma separata uppslag, av samma skäl
  // (ingen embed: en deklarerad FK saknas på minst en av de tre tabellerna).
  // RLS: has_object_assignment() ger en entreprenör läsrätt på precis det
  // objekt de har ett ärende mot, vilket är exakt urvalet den här hooken gör.
  const objectIds = Array.from(
    new Set(
      [...issueRows, ...inspectionRows, ...projectRows]
        .map((r) => r.property_object_id)
        .filter((id): id is string => !!id),
    ),
  );
  const objects: ObjectMap = new Map();
  if (objectIds.length > 0) {
    const { data } = await supabase
      .from("property_objects")
      .select("id, type, name, apartment_id")
      .in("id", objectIds);
    for (const o of (data ?? []) as ObjectRow[]) objects.set(o.id, o);
  }

  // Apartment identity is fetched separately rather than as a PostgREST embed:
  // an embed needs a declared FK on *both* issues and inspections, and if either
  // is missing the whole query 400s and the page shows nothing. A plain lookup
  // degrades to "no lägenhet shown" instead. RLS lets an entreprenör read the
  // apartments they hold an ärende in (has_apartment_assignment). Objektens
  // egna kopplade lägenheter räknas in här också — ett projekt har ingen
  // apartment_id-kolumn alls, så dess "plats" kan bara komma via objektet.
  const aptIds = Array.from(
    new Set(
      [
        ...[...issueRows, ...inspectionRows].map((r) => r.apartment_id),
        ...[...objects.values()].map((o) => o.apartment_id),
      ].filter((id): id is string => !!id),
    ),
  );
  const places: PlaceMap = new Map();
  if (aptIds.length > 0) {
    const { data } = await supabase
      .from("apartments")
      .select("id, apartment_number, trappa")
      .in("id", aptIds);
    for (const a of (data ?? []) as Array<{ id: string; apartment_number: string | null; trappa: string | null }>) {
      const nr = a.apartment_number?.trim();
      if (!nr) continue;
      const trappa = a.trappa?.trim();
      places.set(a.id, trappa ? `Lgh ${nr} · Trappa ${trappa}` : `Lgh ${nr}`);
    }
  }

  // Ansvarig, samma separata uppslag och av samma skäl som lägenheten ovan: en
  // embed på contacts kräver en deklarerad FK, och saknas den tar den ner hela
  // sidan i stället för bara namnet. select("*") eftersom `active` kommer från
  // en handkörd migration — namnges den explicit 400:ar frågan där den inte är
  // körd (samma regel som AnsvarigDropdown följer).
  const contactIds = Array.from(
    new Set(
      [...issueRows, ...inspectionRows, ...projectRows]
        .map((r) => r.assigned_contact_id)
        .filter((id): id is string => !!id),
    ),
  );
  const names: NameMap = new Map();
  if (contactIds.length > 0) {
    const { data } = await supabase.from("contacts").select("*").in("id", contactIds);
    for (const c of (data ?? []) as Array<{ id: string; full_name: string | null; company: string | null }>) {
      const n = c.full_name?.trim();
      if (!n) continue;
      const co = c.company?.trim();
      names.set(c.id, co ? `${n} (${co})` : n);
    }
  }

  return {
    issues: issueRows,
    inspections: inspectionRows,
    projects: projectRows,
    places,
    names,
    objects,
  };
}

function push(meta: MyArende["meta"], label: string, value: string | number | null | undefined) {
  if (value === null || value === undefined) return;
  const s = String(value).trim();
  if (s) meta.push({ label, value: s });
}

/**
 * "Ansvarig" hamnar först i meta — det är det styrelsen läser listan för.
 *
 * Tre utfall, inte två: ingen tilldelning alls, tilldelad och känd, eller
 * tilldelad men onåbar. Det sista inträffar om rollen saknar läsrätt på
 * `contacts` — då returnerar uppslaget tomt med en 200, precis som om ingen
 * vore tilldelad. Att skriva "Ej tilldelad" där vore ett direkt felaktigt
 * påstående om ett ärende som faktiskt har en utförare.
 */
function assignee(meta: MyArende["meta"], r: { assigned_contact_id: string | null }, names: NameMap): string | null {
  if (!r.assigned_contact_id) {
    push(meta, "Ansvarig", "Ej tilldelad");
    return null;
  }
  const name = names.get(r.assigned_contact_id) ?? "Tilldelad entreprenör";
  push(meta, "Ansvarig", name);
  return name;
}

/**
 * Objektet ärendet är rest mot, om något — pushar en "Objekt"-rad i meta och
 * ger tillbaka objektets kopplade lägenhet (om det har en) så anroparen kan
 * falla tillbaka på den när ärendet inte har en egen apartment_id. Det är så
 * ett projekt — som inte har någon apartment_id-kolumn alls — ändå kan visa
 * "var det gäller" när det är rest mot ett objekt som sitter på en lägenhet.
 */
function objectInfo(
  meta: MyArende["meta"],
  r: { property_object_id: string | null },
  objects: ObjectMap,
  places: PlaceMap,
): { apartmentId: string | null; placeLabel: string | null } {
  const o = r.property_object_id ? objects.get(r.property_object_id) : undefined;
  if (!o) return { apartmentId: null, placeLabel: null };
  const label = o.name?.trim() ? `${objectTypeLabel(o.type)} · ${o.name.trim()}` : objectTypeLabel(o.type);
  push(meta, "Objekt", label);
  return { apartmentId: o.apartment_id, placeLabel: (o.apartment_id && places.get(o.apartment_id)) || null };
}

function mapIssue(r: IssueRow, places: PlaceMap, names: NameMap, objects: ObjectMap): MyArende {
  const status = deriveIssueStatus({
    status: r.status,
    priority: r.priority,
    created_at: r.created_at,
    deadline: r.deadline,
  });
  // Felanmälan is the one ärendetyp with a real prioritet column — the public
  // /felanmalan form lets the resident set it, so it is read, not re-derived.
  const key = r.priority ?? "normal";
  const meta: MyArende["meta"] = [];
  const assignedName = assignee(meta, r, names);
  const obj = objectInfo(meta, r, objects, places);
  push(meta, "Kategori", r.category);
  push(meta, "Trappa (angiven på ärendet)", r.trappa);
  push(meta, "Anmäld av", r.reporter_name);
  push(meta, "Telefon", r.reporter_phone);

  return {
    kind: "issue",
    id: r.id,
    title: r.title?.trim() || "Felanmälan",
    lifecycleStatus: r.status ?? null,
    lifecycle: LIFECYCLE_OF[r.status ?? ""] ?? "vilande",
    projektStatus: null,
    status,
    priorityKey: key,
    priorityLabel: PRIORITY_DISPLAY_LABEL[key] ?? key,
    priorityColor: (PRIORITY_BADGE[key] ?? PRIORITY_BADGE.normal).color,
    priorityReason: PRIORITY_FULL_LABEL[key] ?? "",
    propertyId: r.property_id,
    propertyName: r.properties?.name ?? null,
    apartmentId: r.apartment_id ?? obj.apartmentId,
    placeLabel: (r.apartment_id && places.get(r.apartment_id)) || obj.placeLabel,
    assignedName,
    description: r.description,
    createdAt: r.created_at,
    meta,
  };
}

function mapInspection(r: InspectionRow, places: PlaceMap, names: NameMap, objects: ObjectMap): MyArende {
  const status = deriveInspectionStatus({
    arende_status: r.arende_status,
    status: r.status,
    next_due_date: r.next_due_date,
    last_completed_date: r.last_completed_date,
    interval_months: r.interval_months,
  });
  const prio = derivePriorityFromStatus(status, { from: r.created_at, dueLabel: "Nästa besiktning" });
  const meta: MyArende["meta"] = [];
  const assignedName = assignee(meta, r, names);
  const obj = objectInfo(meta, r, objects, places);
  push(meta, "Besiktningsman", r.inspector);
  push(meta, "Senast utförd", r.last_completed_date);
  push(meta, "Intervall", r.interval_months ? `${r.interval_months} mån` : null);
  push(meta, "Trappa (angiven på ärendet)", r.trappa ?? null);

  return {
    kind: "inspection",
    id: r.id,
    title: inspectionTypeLabel(r.inspection_type),
    // Legacy rows predate arende_status. They are left as-is: the lifecycle
    // buttons only act on 'vilande'/'oppet', so such a row shows no action and
    // the sheet says so rather than guessing a transition on the user's behalf.
    lifecycleStatus: r.arende_status ?? null,
    lifecycle: r.arende_status
      ? (LIFECYCLE_OF[r.arende_status] ?? "vilande")
      : r.status === "klar" ? "avslutat" : "oppet",
    projektStatus: null,
    status,
    priorityKey: prio.key,
    priorityLabel: prio.label,
    priorityColor: prio.color,
    priorityReason: prio.reason,
    propertyId: r.property_id,
    propertyName: r.properties?.name ?? null,
    apartmentId: r.apartment_id ?? obj.apartmentId,
    placeLabel: (r.apartment_id && places.get(r.apartment_id)) || obj.placeLabel,
    assignedName,
    description: r.notes,
    createdAt: r.created_at,
    meta,
  };
}

function mapProject(r: ProjectRow, names: NameMap, objects: ObjectMap, places: PlaceMap): MyArende {
  const status = deriveProjectStatus({
    arende_status: r.arende_status,
    status: r.status,
    start_date: r.start_date,
    end_date: r.end_date,
  });
  const prio = derivePriorityFromStatus(status, { from: r.created_at, dueLabel: "Slutdatum" });
  const meta: MyArende["meta"] = [];
  const assignedName = assignee(meta, r, names);
  const obj = objectInfo(meta, r, objects, places);
  push(meta, "Startdatum", r.start_date);
  push(meta, "Slutdatum", r.end_date);
  push(meta, "Budget", r.budget != null ? `${new Intl.NumberFormat("sv-SE").format(r.budget)} SEK` : null);

  return {
    kind: "project",
    id: r.id,
    title: r.title?.trim() || "Projekt",
    lifecycleStatus: r.arende_status ?? null,
    lifecycle: r.arende_status
      ? (LIFECYCLE_OF[r.arende_status] ?? "vilande")
      : r.status === "klar" || r.status === "avbruten" ? "avslutat" : "oppet",
    projektStatus: r.status ?? null,
    status,
    priorityKey: prio.key,
    priorityLabel: prio.label,
    priorityColor: prio.color,
    priorityReason: prio.reason,
    propertyId: r.property_id,
    propertyName: r.properties?.name ?? null,
    // Projekt har ingen egen apartment_id-kolumn — enda vägen till en plats
    // är via objektet det ev. är rest mot.
    apartmentId: obj.apartmentId,
    placeLabel: obj.placeLabel,
    assignedName,
    description: r.description,
    createdAt: r.created_at,
    meta,
  };
}

type LoadedArenden = Awaited<ReturnType<typeof loadArenden>>;

/**
 * Rådata → sorterad lista. Härledd status läser dagens datum och beräknas
 * därför vid render, inte i cachen — en flik som lämnats öppen över natten får
 * inte behålla gårdagens "Brådskande" när ärendet hunnit bli Försenat.
 */
function toArenden(data: LoadedArenden | undefined): MyArende[] {
  if (!data) return [];
  const { places, names, objects } = data;
  return [
    ...data.issues.map((r) => mapIssue(r, places, names, objects)),
    ...data.inspections.map((r) => mapInspection(r, places, names, objects)),
    ...data.projects.map((r) => mapProject(r, names, objects, places)),
  ].sort(compareMyArenden);
}

export function useMyArenden() {
  const { contactId, isEntreprenor, isLoading: contactLoading } = useMyContactId();

  const q = useQuery({
    // Prefix "mina-arenden" — the lifecycle buttons invalidate on that prefix,
    // so öppna/avsluta refreshes this list wherever it is rendered.
    queryKey: ["mina-arenden", contactId],
    enabled: !!contactId,
    queryFn: () => loadArenden({ by: "contact", contactId: contactId! }),
  });

  const arenden = useMemo(() => toArenden(q.data), [q.data]);

  return {
    arenden,
    // contactId === undefined means "still resolving the contact link" — folding
    // it in stops the page flashing "inga ärenden" before the first fetch.
    isLoading: contactLoading || (!!contactId && q.isLoading),
    error: q.error as Error | null,
    isEntreprenor,
  };
}

/**
 * Ärendena i de fastigheter den inloggade får se — styrelsens Dag Rapport.
 *
 * Skild från useMyArenden med flit och de två får inte närma sig varandra:
 * den här frågar "vad händer i mina hus", inte "vad är tilldelat mig". Urvalet
 * kommer från useVisibleProperties (styrelse → styrelse_properties), samma
 * regel som fastighetsgridarna använder, så en styrelseledamot aldrig kan se
 * en byggnad de inte är kopplade till. Databasens RLS säger samma sak; det här
 * är UI-halvan.
 *
 * Läsvy. Inget här skriver status — se DagRapportView readOnly.
 */
export function useByggnadensArenden() {
  const { allowedIds, isLoading: scopeLoading } = useVisibleProperties();

  // Sorterad nyckel så cachen inte får en ny post per renderordning i Set:en.
  const propertyIds = useMemo(
    () => (allowedIds === null ? null : [...allowedIds].sort()),
    [allowedIds],
  );
  const idsKey = propertyIds === null ? "all" : propertyIds.join(",");

  const q = useQuery({
    // Prefix "byggnadens-arenden" — separat från ["mina-arenden"] så en
    // entreprenörs öppna/avsluta inte invaliderar styrelsens vy i onödan.
    queryKey: ["byggnadens-arenden", idsKey],
    enabled: !scopeLoading && propertyIds !== null && propertyIds.length > 0,
    queryFn: () => loadArenden({ by: "properties", propertyIds: propertyIds! }),
  });

  const arenden = useMemo(() => toArenden(q.data), [q.data]);

  return {
    arenden,
    isLoading: scopeLoading || (propertyIds !== null && propertyIds.length > 0 && q.isLoading),
    error: q.error as Error | null,
    /** Inga kopplade fastigheter alls — annat än "inga ärenden just nu". */
    noProperties: !scopeLoading && propertyIds !== null && propertyIds.length === 0,
  };
}