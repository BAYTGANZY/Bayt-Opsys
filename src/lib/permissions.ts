/**
 * Role → allowed top-level routes.
 *
 *  - admin: everything.
 *  - styrelse: read-only on their own buildings (see STYRELSE_ROUTES).
 *  - entreprenor: only what relates to errands assigned to them.
 *
 * Nav is filtered from this, and each route also guards itself — hiding a link
 * is not access control on its own.
 *
 * Chatt (/chatt): every role with a login (admin, styrelse, entreprenör) may chat;
 * styrelse and entreprenör can only start a conversation with an admin (see the
 * recipient list in _authenticated.chatt.tsx). Enforced by the chat RLS policies,
 * not by canEdit().
 *
 * Dokument (/dokument) is open to all roles: it only lists files that belong to
 * errands, and those tables are role-scoped by RLS.
 *
 * Underhållsplan (/underhallsplan): admin and styrelse (own buildings), plus
 * entreprenörer that admin has granted access per plan (maintenance_plan_access).
 * The real filtering is done by the maintenance_* RLS policies.
 */
export type Role = "admin" | "styrelse" | "entreprenor";

// NOTE: `/properties` must be included wherever `/fastigheter` is — the building
// cards link into `/properties/$id/<section>` for every per-building sub-page.
const STYRELSE_ROUTES = [
  "/styrelse",
  "/koll",
  "/dag-rapport",
  "/fastigheter",
  "/properties",
  "/apartments",
  "/issues",
  "/inspections",
  "/projects",
  "/loggbok",
  "/dokument",
  "/underhallsplan",
  "/ekonomi-oversikt",
  "/objects",
  "/installningar",
  "/chatt",
];

const ENTREPRENOR_ROUTES = [
  "/mina-uppdrag",
  "/dag-rapport",
  "/issues",
  "/inspections",
  "/projects",
  "/properties",
  "/dokument",
  "/underhallsplan",
  "/loggbok",
  "/chatt",
];

/**
 * Per-building sections each role may open. Also drives the building sub-nav, so
 * the menu and the URL guard can't disagree.
 */
export const PROPERTY_SECTIONS_FOR_ROLE: Record<string, ReadonlyArray<string>> = {
  styrelse: ["apartments", "issues", "inspections", "projects", "logbook", "objects", "avslutat"],
  entreprenor: ["apartments", "issues", "inspections", "projects", "logbook", "objects", "avslutat"],
};

/** Where each role lands when it hits something it may not open. */
export const HOME_FOR_ROLE: Record<string, string> = {
  admin: "/styrelse",
  styrelse: "/styrelse",
  entreprenor: "/mina-uppdrag",
};

export function homeForRole(role: string | null | undefined): string {
  return (role && HOME_FOR_ROLE[role]) || "/dashboard";
}

export function canAccess(role: string | null | undefined, to: string): boolean {
  if (role === "admin") return true;

  // Creation is admin-only.
  if (/(^|\/)new$/.test(to)) return false;

  // Building sub-pages: "/properties/<id>/<section>".
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
