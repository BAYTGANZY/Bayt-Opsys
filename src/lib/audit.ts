// ===========================================================================
// Audit timeline — READ SIDE ONLY.
//
// There is deliberately no writer in this file. Every audit_events row is
// written by database triggers (supabase-functions/audit-events-triggers.sql),
// not by the client, because client-side audit discipline has failed in this
// codebase every previous time it was tried — logEvent was called without
// apartment_id in all three status writers, and issue_status_history is
// written from three places and read from none.
//
// Rows are self-contained by design: actor names are snapshotted at write time
// rather than joined at read time, because chat.sql's profiles policy hides
// other users' profiles from styrelse and entreprenör accounts. Never add a
// `profiles:actor_profile_id(...)` join to a query in this feature — it
// returns null for exactly the case the feature exists to serve.
// ===========================================================================

export type AuditAction =
  | "created" | "opened" | "closed" | "status_changed" | "updated" | "deleted";

export type AuditEntityType = "issue" | "inspection" | "project" | "apartment";

export type AuditEvent = {
  id: string;
  batch_id: string;
  entity_type: AuditEntityType;
  entity_id: string;
  entity_title: string | null;
  action: AuditAction;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  lifecycle_from: string | null;
  lifecycle_to: string | null;
  actor_name: string;
  actor_company: string | null;
  actor_role: string | null;
  created_at: string;
};

/** Columns the timeline reads. No joins — see the note at the top of this file. */
export const AUDIT_SELECT =
  "id, batch_id, entity_type, entity_id, entity_title, action, field, " +
  "old_value, new_value, lifecycle_from, lifecycle_to, actor_name, " +
  "actor_company, actor_role, created_at";

export const ENTITY_LABEL: Record<AuditEntityType, string> = {
  issue: "Felanmälan",
  inspection: "Besiktning",
  project: "Projekt",
  apartment: "Lägenheten",
};

export const ACTION_LABEL: Record<AuditAction, string> = {
  created: "Skapade",
  opened: "Öppnade ärendet",
  closed: "Avslutade ärendet",
  status_changed: "Ändrade status",
  updated: "Ändrade",
  deleted: "Tog bort",
};

/** Dot colours, reusing the palette already used across the apartment page. */
export const ACTION_COLOR: Record<AuditAction, string> = {
  created: "#E07B35",
  opened: "#5CB84A",
  closed: "#0D2B1E",
  status_changed: "#D4A017",
  updated: "#6B7280",
  deleted: "#DC2626",
};

export const ACTOR_ROLE_LABEL: Record<string, string> = {
  admin: "Administratör",
  styrelse: "Styrelse",
  entreprenor: "Entreprenör",
  boende: "Boende",
  system: "Systemet",
};

/** Swedish names for the columns the triggers are allowed to audit. */
export const FIELD_LABEL: Record<string, string> = {
  title: "Titel",
  description: "Beskrivning",
  category: "Kategori",
  priority: "Prioritet",
  deadline: "Deadline",
  status: "Status",
  arende_status: "Ärendestatus",
  assigned_to: "Tilldelad intern",
  assigned_contact_id: "Ansvarig",
  contractor_id: "Entreprenör",
  property_id: "Fastighet",
  apartment_id: "Lägenhet",
  trappa: "Trappa",
  apartment_number: "Lägenhetsnummer",
  floor: "Våning",
  area_sqm: "Yta",
  tenant_name: "Hyresgäst",
  tenant_phone: "Telefon",
  tenant_email: "E-post",
  move_in_date: "Inflytt",
  move_out_date: "Utflytt",
  notes: "Anteckningar",
  inspection_type: "Typ",
  inspector: "Besiktningsman",
  last_completed_date: "Senast utförd",
  next_due_date: "Nästa förfallodag",
  budget: "Budget",
  start_date: "Startdatum",
  end_date: "Slutdatum",
};

/** FK fields read better as "Ej tilldelad" than "—" when empty. */
const UNASSIGNED_FIELDS = new Set([
  "assigned_contact_id", "assigned_to", "contractor_id", "apartment_id",
]);

function displayValue(field: string | null, value: string | null): string {
  if (value !== null && value !== "") return value;
  return field && UNASSIGNED_FIELDS.has(field) ? "Ej tilldelad" : "—";
}

/** One Swedish sentence describing the event, e.g. "Ändrade Prioritet från normal till akut". */
export function formatAuditLine(e: AuditEvent): string {
  switch (e.action) {
    case "opened":
    case "closed":
      return ACTION_LABEL[e.action];
    case "created":
      return `Skapade ${ENTITY_LABEL[e.entity_type].toLowerCase()}`;
    case "deleted":
      return `Tog bort ${ENTITY_LABEL[e.entity_type].toLowerCase()}`;
    case "status_changed":
      return `Ändrade status från ${displayValue(e.field, e.old_value)} till ${displayValue(e.field, e.new_value)}`;
    case "updated": {
      const label = (e.field && FIELD_LABEL[e.field]) || e.field || "fältet";
      return `Ändrade ${label} från ${displayValue(e.field, e.old_value)} till ${displayValue(e.field, e.new_value)}`;
    }
    default:
      return ACTION_LABEL[e.action] ?? e.action;
  }
}

/** "Nils Berg — Nordisk VVS AB · Entreprenör" */
export function formatAuditActor(e: AuditEvent): string {
  const role = e.actor_role ? ACTOR_ROLE_LABEL[e.actor_role] ?? e.actor_role : null;
  return [
    e.actor_company ? `${e.actor_name} — ${e.actor_company}` : e.actor_name,
    role,
  ].filter(Boolean).join(" · ");
}
