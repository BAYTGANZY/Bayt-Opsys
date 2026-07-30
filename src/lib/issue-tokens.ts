export const STATUS_LABEL = ["ny", "pagande", "vantar", "klar", "fakturerad", "stangd"] as const;
export const PRIORITY_LABEL = ["lag", "normal", "hog", "akut"] as const;

// New lifecycle (display level): vilande (submitted) → oppet (active) → avslutat.
// Maps to existing DB status values to avoid schema churn.
export const LIFECYCLE_OF: Record<string, "vilande" | "oppet" | "avslutat"> = {
  ny: "vilande",
  vilande: "vilande",
  pagande: "oppet",
  oppet: "oppet",
  vantar: "oppet",
  klar: "avslutat",
  fakturerad: "avslutat",
  stangd: "avslutat",
  avslutat: "avslutat",
};
export const LIFECYCLE_LABEL: Record<string, string> = {
  vilande: "Vilande",
  oppet: "Aktivt ärende",
  avslutat: "Avslutat",
};
// Status writes used by Dag Rapport actions.
export const STATUS_ACTIVATE = "pagande"; // vilande → oppet
export const STATUS_CLOSE = "stangd";     // → avslutat

export const PRIORITY_SHORT_LABEL: Record<string, string> = {
  lag: "låg",
  normal: "normal",
  hog: "hög",
  akut: "akut",
};

export const PRIORITY_FULL_LABEL: Record<string, string> = {
  lag: "Låg — Kan vänta, ingen påverkan",
  normal: "Normal — Åtgärdas inom 5 arbetsdagar",
  hog: "Hög — Åtgärdas inom 48 timmar",
  akut: "AKUT — Omedelbar åtgärd, säkerhetsrisk",
};

/** Badge/fält-etikett — kort och versalt första tecken. */
export const PRIORITY_DISPLAY_LABEL: Record<string, string> = {
  lag: "Låg",
  normal: "Normal",
  hog: "Hög",
  akut: "Akut",
};

export const ISSUE_CATEGORIES = [
  "VVS (vatten, avlopp, värme)",
  "El",
  "Ventilation",
  "Tak & fasad",
  "Fönster & dörrar",
  "Gemensamma utrymmen",
  "Lägenhet invändigt",
  "Hiss",
  "Markarbete",
  "Parkering",
  "Övrigt",
];

// Text-only status (8% opacity bg if needed in dense tables).
export const STATUS_BADGE: Record<string, { bg: string; color: string; border?: string }> = {
  ny: { bg: "transparent", color: "#E07B35" },
  pagande: { bg: "transparent", color: "#D4A017" },
  vantar: { bg: "transparent", color: "#6B7280" },
  klar: { bg: "transparent", color: "#9CA3AF" },
  fakturerad: { bg: "transparent", color: "#3D8A30" },
  stangd: { bg: "transparent", color: "#9CA3AF" },
};

export const PRIORITY_BADGE: Record<string, { bg: string; color: string }> = {
  lag: { bg: "transparent", color: "#9CA3AF" },
  normal: { bg: "transparent", color: "#6B7280" },
  hog: { bg: "transparent", color: "#D4A017" },
  akut: { bg: "transparent", color: "#DC2626" },
};

// ===========================================================================
// Härledd status (derived status)
// ---------------------------------------------------------------------------
// Status is never picked from a dropdown. It falls out of three facts the
// ärende already carries: prioritet, skapad-datum and deadline. Everything
// that renders an issue status goes through `deriveIssueStatus` so the list,
// the detail page and any future surface can never disagree.
//
// The DB `status` column is still the lifecycle anchor (vilande → oppet →
// avslutat) and is only ever written by OppnaArendeButton / AvslutaArendeButton
// — those are real human decisions and cannot be derived from dates.
// ===========================================================================

/** How long an ärende may stay unhandled, per prioritet. Mirrors PRIORITY_FULL_LABEL. */
export const SLA_DAYS: Record<string, number | null> = {
  akut: 1,    // omedelbar åtgärd
  hog: 2,     // 48 timmar
  normal: 5,  // 5 arbetsdagar
  lag: null,  // kan vänta — ingen tidsgräns
};

export type DerivedStatusKey =
  | "forsenad" | "bradskande" | "pagaende" | "ny" | "avslutat"
  // Projekt only — decided by a human, never by a date. See PAUSE_STATES.
  | "pausad" | "avbruten";

export const DERIVED_STATUS: Record<DerivedStatusKey, { label: string; color: string; bg: string }> = {
  forsenad: { label: "Försenad", color: "#B91C1C", bg: "#FDE8E8" },
  bradskande: { label: "Brådskande", color: "#856404", bg: "#FFF3CD" },
  pagaende: { label: "Pågående", color: "#2E6B24", bg: "#E8F0D8" },
  ny: { label: "Ny", color: "#3D8A30", bg: "#E8F5E4" },
  avslutat: { label: "Avslutad", color: "#6B7280", bg: "#F3F4F6" },
  pausad: { label: "Pausad", color: "#555555", bg: "#EBEBEB" },
  avbruten: { label: "Avbruten", color: "#B91C1C", bg: "#F3F4F6" },
};

/**
 * Projekt states a clock can never produce. They stay human-driven — set by
 * the Pausa/Avbryt buttons — and short-circuit the date logic while active.
 */
export const PAUSE_STATES = ["pausad", "avbruten"] as const;

/** Local (not UTC) yyyy-mm-dd — the app reasons in Swedish calendar days. */
export function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Calendar-month step, clamped — 2026-01-31 + 1 mån = 2026-02-28, not 03-03. */
function addMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  const targetDay = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(targetDay, lastOfMonth));
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(`${fromISO}T00:00:00`).getTime();
  const b = new Date(`${toISO}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export type ArendeForStatus = {
  status?: string | null;
  priority?: string | null;
  created_at?: string | null;
  deadline?: string | null;
};

export type DerivedStatus = {
  key: DerivedStatusKey;
  label: string;
  color: string;
  bg: string;
  /** Swedish one-liner explaining why the status is what it is. */
  reason: string;
  /** The date it must be handled by — explicit deadline, else prioritet SLA from skapad. */
  dueDate: string | null;
  /** Where dueDate came from, so the UI can say so. */
  dueSource: "deadline" | "prioritet" | "intervall" | null;
  /** Negative = overdue. Null when there is no due date at all. */
  daysLeft: number | null;
};

/** Swedish wording per ärendetyp — the rules are identical, only the nouns differ. */
type Terms = {
  /** "Ärendet är avslutat." */
  closed: string;
  /** Prefix for the öppet state, e.g. "Öppet ärende". */
  open: string;
  /** Prefix for the vilande state, e.g. "Inkommet, ej öppnat". */
  fresh: string;
  /** Verb phrase for the due date, e.g. "åtgärdat" → "Ska vara åtgärdat idag". */
  done: string;
};

/**
 * The one rule set every ärendetyp shares. Callers resolve their own lifecycle
 * and due date — felanmälan from prioritet SLA, besiktning from nästa datum,
 * projekt from slutdatum — and this decides what that means.
 */
function deriveFromDue(
  lifecycle: "vilande" | "oppet" | "avslutat",
  dueDate: string | null,
  dueSource: DerivedStatus["dueSource"],
  basis: string,
  noDue: string,
  t: Terms,
): DerivedStatus {
  const shape = (key: DerivedStatusKey, reason: string, dd: string | null, dl: number | null): DerivedStatus => ({
    key, ...DERIVED_STATUS[key], reason, dueDate: dd, dueSource: dd ? dueSource : null, daysLeft: dl,
  });

  if (lifecycle === "avslutat") return shape("avslutat", t.closed, null, null);

  const daysLeft = dueDate ? daysBetween(todayISO(), dueDate) : null;

  if (dueDate && daysLeft !== null && daysLeft < 0) {
    return shape("forsenad", `Skulle vara ${t.done} ${dueDate} (${basis}) — ${Math.abs(daysLeft)} dygn försenat.`, dueDate, daysLeft);
  }
  if (dueDate && daysLeft !== null && daysLeft <= 1) {
    const when = daysLeft === 0 ? "idag" : "imorgon";
    return shape("bradskande", `Ska vara ${t.done} ${when}, ${dueDate} (${basis}).`, dueDate, daysLeft);
  }
  if (lifecycle === "oppet") {
    return shape("pagaende", dueDate ? `${t.open} — ${daysLeft} dygn kvar till ${dueDate} (${basis}).` : `${t.open} — ${noDue}.`, dueDate, daysLeft);
  }
  return shape("ny", dueDate ? `${t.fresh} — ska vara ${t.done} senast ${dueDate} (${basis}).` : `${t.fresh} — ${noDue}.`, dueDate, daysLeft);
}

/**
 * Felanmälan. An explicit deadline always wins over the prioritet SLA — someone
 * set it on purpose. With no deadline, prioritet + skapad-datum produce one
 * (akut = 1 dygn, hög = 2, normal = 5, låg = ingen). `lag` with no deadline
 * therefore never goes brådskande or försenad, which is the point of it.
 */
export function deriveIssueStatus(i: ArendeForStatus): DerivedStatus {
  const priority = i.priority ?? "normal";
  const sla = SLA_DAYS[priority] ?? null;
  const created = i.created_at ? i.created_at.slice(0, 10) : null;
  const slaDue = sla !== null && created ? addDays(created, sla) : null;

  return deriveFromDue(
    LIFECYCLE_OF[i.status ?? ""] ?? "vilande",
    i.deadline || slaDue,
    i.deadline ? "deadline" : slaDue ? "prioritet" : null,
    i.deadline ? "satt deadline" : `prioritet ${PRIORITY_SHORT_LABEL[priority] ?? priority}, ${sla} dygn från skapad`,
    priority === "lag" ? "ingen tidsgräns (prioritet låg, ingen deadline)" : "ingen tidsgräns (ingen deadline satt)",
    { closed: "Ärendet är avslutat.", open: "Öppet ärende", fresh: "Inkommet, ej öppnat", done: "åtgärdat" },
  );
}

export type BesiktningForStatus = {
  arende_status?: string | null;
  /** Legacy aktiv/forfallen/klar column — only consulted when arende_status is null. */
  status?: string | null;
  next_due_date?: string | null;
  last_completed_date?: string | null;
  interval_months?: number | null;
};

/**
 * Besiktning. No prioritet column and none needed — a besiktning carries a real
 * due date. `next_due_date` wins; failing that, senast utförd + intervallet.
 */
export function deriveInspectionStatus(i: BesiktningForStatus): DerivedStatus {
  // Legacy rows predate arende_status. `klar` is the only one that meant closed.
  const lifecycle = i.arende_status
    ? (LIFECYCLE_OF[i.arende_status] ?? "vilande")
    : i.status === "klar" ? "avslutat" : "oppet";

  const last = i.last_completed_date ? i.last_completed_date.slice(0, 10) : null;
  const months = i.interval_months ?? null;
  const intervalDue = last && months ? addMonths(last, months) : null;
  const dueDate = i.next_due_date || intervalDue;

  return deriveFromDue(
    lifecycle,
    dueDate,
    i.next_due_date ? "deadline" : intervalDue ? "intervall" : null,
    i.next_due_date ? "nästa besiktning" : `senast utförd ${last} + ${months} mån intervall`,
    "ingen tidsgräns (varken nästa datum eller intervall satt)",
    { closed: "Besiktningen är avslutad.", open: "Pågående besiktning", fresh: "Planerad, ej påbörjad", done: "utförd" },
  );
}

export type ProjektForStatus = {
  arende_status?: string | null;
  /** planerad/aktiv/pausad/klar/avbruten. pausad + avbruten are honoured as overrides. */
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

/**
 * Projekt. Driven by slutdatum, except that pausad and avbruten are human
 * decisions no clock can produce — those short-circuit the date logic.
 */
export function deriveProjectStatus(p: ProjektForStatus): DerivedStatus {
  const lifecycle = p.arende_status
    ? (LIFECYCLE_OF[p.arende_status] ?? "vilande")
    : p.status === "klar" || p.status === "avbruten" ? "avslutat" : "oppet";

  if (lifecycle !== "avslutat" && p.status === "pausad") {
    return {
      key: "pausad", ...DERIVED_STATUS.pausad,
      reason: "Projektet är pausat — tidsgränsen räknas inte förrän det återupptas.",
      dueDate: p.end_date ?? null, dueSource: p.end_date ? "deadline" : null, daysLeft: null,
    };
  }
  if (p.status === "avbruten") {
    return {
      key: "avbruten", ...DERIVED_STATUS.avbruten,
      reason: "Projektet är avbrutet.",
      dueDate: null, dueSource: null, daysLeft: null,
    };
  }

  return deriveFromDue(
    lifecycle,
    p.end_date ?? null,
    p.end_date ? "deadline" : null,
    "projektets slutdatum",
    "ingen tidsgräns (inget slutdatum satt)",
    { closed: "Projektet är avslutat.", open: "Pågående projekt", fresh: "Planerat, ej påbörjat", done: "klart" },
  );
}

export type AtgardForStatus = {
  /** Legacy planerad/pagar/klar column — no UI writes it yet, so most rows sit on the default. */
  status?: string | null;
  due_date?: string | null;
};

/**
 * Åtgärd (åtgärdslistan). No prioritet column — förfallodatumet is the whole
 * time story. Lifecycle is read off the legacy status column (planerad →
 * vilande, pagar → oppet, klar → avslutat) until the real öppna/avsluta flow
 * arrives with the Supabase task.
 */
export function deriveActionStatus(a: AtgardForStatus): DerivedStatus {
  const lifecycle =
    a.status === "klar" ? "avslutat" : a.status === "pagar" ? "oppet" : "vilande";

  return deriveFromDue(
    lifecycle,
    a.due_date ? a.due_date.slice(0, 10) : null,
    a.due_date ? "deadline" : null,
    "förfallodatum",
    "ingen tidsgräns (inget förfallodatum satt)",
    { closed: "Åtgärden är klar.", open: "Pågående åtgärd", fresh: "Planerad, ej påbörjad", done: "utförd" },
  );
}

// ===========================================================================
// Härledd prioritet (derived priority)
// ---------------------------------------------------------------------------
// Prioritet väljs aldrig i en dropdown inne i portalen — deadline sätter den.
// Trösklarna är SLA_DAYS baklänges: sätter någon en deadline om ett dygn är
// ärendet akut, punkt. Ingen deadline = normal (5 dygn), inte låg — låg betyder
// "ingen tidsgräns alls" och ska inte gälla ärenden ingen tagit ställning till.
//
// Medvetet undantag: den publika /felanmalan-enkäten. Den boende har ingen
// deadline att sätta men måste kunna säga hur akut det är, så den formen (och
// submit-felanmalan) skickar prioritet som vanligt. Rör inte den.
// ===========================================================================

/** Dygn kvar till deadline → prioritet. Första träffen uppifrån vinner. */
export const PRIORITY_THRESHOLDS: Array<{ maxDays: number; priority: string }> = [
  { maxDays: 1, priority: "akut" },   // SLA_DAYS.akut
  { maxDays: 2, priority: "hog" },    // SLA_DAYS.hog
  { maxDays: 5, priority: "normal" }, // SLA_DAYS.normal
];
/** Bortom sista tröskeln — gott om tid. */
export const PRIORITY_BEYOND_THRESHOLDS = "lag";
/** Ingen deadline satt alls. */
export const PRIORITY_NO_DEADLINE = "normal";

export type DerivedPriority = {
  key: string;
  /** "Akut", "Hög", … */
  label: string;
  color: string;
  bg: string;
  /** Svensk enradare som förklarar varför prioriteten blev den den blev. */
  reason: string;
  /** Fristen i dygn. Negativ = deadline redan passerad. Null = ingen deadline. */
  daysToDue: number | null;
};

/**
 * Den enda regeln. `dueDate` är ärendets tidsgräns — felanmälans deadline,
 * besiktningens nästa datum, projektets slutdatum — och `from` är den dag
 * fristen räknas från (skapad-datum, eller idag för ett ärende som inte finns
 * än). Fristen är *storleken på fönstret man fick*, inte hur nära det är idag:
 * att tiden rinner ut syns i status (Brådskande/Försenad), inte i prioritet.
 */
export function derivePriority(
  dueDate: string | null | undefined,
  opts: { from?: string | null; dueLabel?: string } = {},
): DerivedPriority {
  const dueLabel = opts.dueLabel ?? "Deadline";
  const from = opts.from ? opts.from.slice(0, 10) : todayISO();
  const due = dueDate ? dueDate.slice(0, 10) : null;

  const shape = (key: string, reason: string, daysToDue: number | null): DerivedPriority => ({
    key,
    label: PRIORITY_DISPLAY_LABEL[key] ?? key,
    ...(PRIORITY_BADGE[key] ?? { bg: "transparent", color: "#6B7280" }),
    reason,
    daysToDue,
  });

  if (!due) {
    return shape(
      PRIORITY_NO_DEADLINE,
      `Ingen ${dueLabel.toLowerCase()} satt — prioritet ${PRIORITY_SHORT_LABEL[PRIORITY_NO_DEADLINE]} (${SLA_DAYS[PRIORITY_NO_DEADLINE]} dygn).`,
      null,
    );
  }

  const days = daysBetween(from, due);
  const key = PRIORITY_THRESHOLDS.find((t) => days <= t.maxDays)?.priority ?? PRIORITY_BEYOND_THRESHOLDS;
  const short = PRIORITY_SHORT_LABEL[key] ?? key;

  if (days < 0) return shape(key, `${dueLabel} ${due} har redan passerat — prioritet ${short}.`, days);
  return shape(key, `${dueLabel} ${due} — ${days} dygns frist, prioritet ${short}.`, days);
}

/**
 * Genväg för besiktning och projekt, som saknar egen prioritetskolumn: deras
 * tidsgräns är redan uträknad av derive*Status (nästa datum / intervall /
 * slutdatum), så prioriteten faller ut av samma dueDate.
 */
export function derivePriorityFromStatus(
  status: DerivedStatus,
  opts: { from?: string | null; dueLabel?: string } = {},
): DerivedPriority {
  return derivePriority(status.dueDate, opts);
}

export function isOverdue(deadline: string | null | undefined, status: string | null | undefined): boolean {
  if (!deadline) return false;
  if (status && LIFECYCLE_OF[status] === "avslutat") return false;
  return deadline < todayISO();
}

