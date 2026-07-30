import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const { canAccess } = await jiti.import(
  "../src/lib/permissions.ts",
);

const OWN = "/properties/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
let pass = 0;
const fails = [];

function expect(role, path, want, label) {
  const got = canAccess(role, path);
  if (got === want) pass++;
  else fails.push(`${label} | role=${role} path=${path} expected=${want} got=${got}`);
}

// ---- S2: styrelse must be bounced from these ----
for (const p of [
  "/dashboard",
  "/contacts",
  "/dokument",
  "/issues/new",
  "/inspections/new",
  "/projects/new",
  "/apartments/new",
  "/properties/new",
  "/contacts/new",
  "/ekonomi",
  `${OWN}/objects`,
  `${OWN}/documents`,
  `${OWN}/contacts`,
  `${OWN}/actions`,
  `${OWN}/history`,
  // Info is admin-only: the building's own uppgifter are not a read-only tab for
  // the other roles, the section is gone for them. Removed from
  // PROPERTY_SECTIONS_FOR_ROLE, not merely disabled in the UI.
  `${OWN}/info`,
]) expect("styrelse", p, false, "S2 deny");

// ---- styrelse must still reach these ----
// /dag-rapport moved here from S2 when StyrelseDagRapport shipped: styrelse gets
// the same worklist read-only, for their own buildings, without lifecycle buttons.
for (const p of [
  "/dag-rapport",
  "/fastigheter",
  "/apartments",
  "/issues",
  "/inspections",
  "/projects",
  "/loggbok",
  "/installningar",
  `${OWN}/apartments`,
  `${OWN}/issues`,
  `${OWN}/inspections`,
  `${OWN}/projects`,
  `${OWN}/logbook`,
  // Per-building arkiv. Its queries repeat the same assigned_contact_id scoping
  // as the section tabs, so reaching it is not the same as seeing everything.
  `${OWN}/avslutat`,
]) expect("styrelse", p, true, "S3 allow");

// ---- E2: entreprenör denials ----
for (const p of [
  "/dashboard",
  "/contacts",
  "/dokument",
  "/issues/new",
  "/apartments/new",
  "/kalender",
  "/avslutat",
  `${OWN}/objects`,
  `${OWN}/documents`,
  `${OWN}/contacts`,
  // Admin-only, same as for styrelse — see the note in the S2 list.
  `${OWN}/info`,
]) expect("entreprenor", p, false, "E2 deny");

// ---- entreprenör allows ----
// NOTE: /apartments and ${OWN}/apartments moved here from E2 when the
// per-apartment Historik shipped. canAccess only gets them past the ROUTE
// layer; useRecordScopeGuard + useMyAssignedApartmentIds then restrict them to
// apartments where they hold an ärende, and audit_events RLS enforces the same
// server-side. Reaching /apartments is not the same as seeing every apartment.
for (const p of [
  "/dag-rapport",
  "/fastigheter",
  "/apartments",
  "/issues",
  "/inspections",
  "/projects",
  "/loggbok",
  "/installningar",
  `${OWN}/apartments`,
  `${OWN}/issues`,
  `${OWN}/inspections`,
  `${OWN}/projects`,
  `${OWN}/logbook`,
  // Per-building arkiv — reachable, and scoped to their own closed ärenden.
  // The TOP-LEVEL /avslutat is still denied above: that page isn't built.
  `${OWN}/avslutat`,
]) expect("entreprenor", p, true, "E3 allow");

// ---- admin reaches everything ----
for (const p of [
  "/dashboard", "/dag-rapport", "/contacts", "/dokument", "/ekonomi",
  "/issues/new", "/properties/new", `${OWN}/objects`, `${OWN}/history`,
]) expect("admin", p, true, "Admin allow");

// ---- unknown / missing role denied ----
for (const p of ["/fastigheter", "/dashboard", "/installningar"]) {
  expect(null, p, false, "No-role deny");
  expect("boende", p, false, "Bogus-role deny");
}

console.log(`PASS ${pass} / ${pass + fails.length}`);
if (fails.length) {
  console.log("\nFAILURES:");
  for (const f of fails) console.log("  " + f);
  process.exit(1);
}
