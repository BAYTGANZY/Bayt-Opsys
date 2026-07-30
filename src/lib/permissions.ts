/**
 * Role → allowed top-level routes.
 *
 * Client spec (2026-07-20):
 *  - admin: everything.
 *  - styrelse: read-only, and ONLY Fastigheter / Lägenheter / Felanmälningar /
 *    Besiktningar / Projekt (all scoped to their attached buildings), Loggbok,
 *    and Inställningar (no invite section).
 *  - entreprenor: only what relates to errands assigned to them — Dag Rapport,
 *    Fastigheter (buildings where they have work), the three errand sections,
 *    Kalender, Avslutat ("basket"), Loggbok, Inställningar.
 *
 * Nav is filtered from this, and each route also guards itself — hiding a link
 * is not access control on its own.
 *
 * Chatt (/chatt) is a deliberate exception to "styrelse is read-only" and to
 * entreprenör's assigned-errand-only scope: both roles may send messages there.
 * That write access is enforced by the chat RLS policies and the
 * create_chat_conversation() RPC (see supabase-functions/chat.sql), not by
 * canEdit() — this file only controls whether the route is reachable at all.
 */
export type Role = "admin" | "styrelse" | "entreprenor";

// NOTE: `/properties` must be included wherever `/fastigheter` is — the building
// cards link into `/properties/$id/<section>` for every per-building sub-page.
// Leaving it out silently breaks all building navigation for that role.
const STYRELSE_ROUTES = [
  // Läsvy: samma arbetslista som entreprenören ser, men för styrelsens egna
  // fastigheter och utan livscykelknappar (StyrelseDagRapport). Att veta vad
  // som ska utföras och när är styrelsens uppgift; att utföra det är inte det.
  "/dag-rapport",
  "/fastigheter",
  "/properties",
  "/apartments",
  "/issues",
  "/inspections",
  "/projects",
  "/loggbok",
  "/installningar",
  "/chatt",
];

// /kalender and /avslutat are specced for entreprenörer but not built yet.
// Deliberately NOT listed: a nav link to a route that doesn't exist 404s in front
// of the user. Re-add both here the same commit the pages land.
const ENTREPRENOR_ROUTES = [
  "/dag-rapport",
  "/fastigheter",
  "/properties",
  // Lägenheter is reachable but NARROWER than for styrelse: canAccess only gets
  // them past the route layer, and useRecordScopeGuard then restricts them to
  // apartments where they hold an assignment (useMyAssignedApartmentIds). They
  // are here for the per-apartment Historik on the Info view.
  "/apartments",
  "/issues",
  "/inspections",
  "/projects",
  "/loggbok",
  "/installningar",
  "/chatt",
];

/**
 * Per-building sections each role may open. Also drives the building sub-nav, so
 * the menu and the URL guard can't disagree.
 */
export const PROPERTY_SECTIONS_FOR_ROLE: Record<string, ReadonlyArray<string>> = {
  styrelse: ["apartments", "issues", "inspections", "projects", "logbook", "avslutat"],
  // "apartments" reaches the section; ApartmentsTab then shows an entreprenör
  // only the units they are assigned to, not the building's whole roster.
  // "avslutat" is the per-building archive — its queries repeat the same
  // assigned_contact_id scoping as the section tabs, so an entreprenör only
  // sees their own closed ärenden there.
  entreprenor: ["apartments", "issues", "inspections", "projects", "logbook", "avslutat"],
};

/**
 * Where each role lands when it hits something it may not open.
 *
 * Lives here, next to canAccess, because it is the same knowledge: a role's home
 * must be a page that role can actually use. Sending an entreprenör to a
 * building grid was the bug behind "det tar mig till en tom felanmälan-sida" —
 * the grids are useless to them until they have work in a building.
 * Consumed by the `_authenticated` route guard and by useRecordScopeGuard.
 */
export const HOME_FOR_ROLE: Record<string, string> = {
  admin: "/dashboard",
  styrelse: "/fastigheter",
  entreprenor: "/dag-rapport",
};

export function homeForRole(role: string | null | undefined): string {
  return (role && HOME_FOR_ROLE[role]) || "/start";
}

export function canAccess(role: string | null | undefined, to: string): boolean {
  if (role === "admin") return true;

  // Creation is admin-only. Without this, allowing "/issues" would also allow
  // "/issues/new" — letting a read-only styrelse, or an entreprenör who may only
  // öppna/avsluta, reach a working create form.
  if (/(^|\/)new$/.test(to)) return false;

  // Building sub-pages: "/properties/<id>/<section>". Allowing "/properties"
  // wholesale would otherwise expose Objekt, Dokument, Kontakter and
  // Åtgärdslista by URL even though the sub-nav hides them.
  const sub = to.match(/^\/properties\/[^/]+\/([^/]+)/);
  if (sub && role && PROPERTY_SECTIONS_FOR_ROLE[role]) {
    if (!PROPERTY_SECTIONS_FOR_ROLE[role]!.includes(sub[1])) return false;
  }

  const allowed =
    role === "styrelse" ? STYRELSE_ROUTES : role === "entreprenor" ? ENTREPRENOR_ROUTES : [];
  return allowed.some((r) => to === r || to.startsWith(r + "/"));
}

/** True when the role may create/edit/delete. Styrelse is read-only by spec. */
export function canEdit(role: string | null | undefined): boolean {
  return role === "admin";
}

export function isStyrelse(role: string | null | undefined): boolean {
  return role === "styrelse";
}

export function isEntreprenor(role: string | null | undefined): boolean {
  return role === "entreprenor";
}
