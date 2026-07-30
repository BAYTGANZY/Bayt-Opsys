# BAYT — Manual Test Checklist

Everything that needs a logged-in session. Organised so you log in **three times
total** — do every item under a heading before switching accounts.

Mark: `[x]` works · `[!]` broken (write what happened)

---

## ALREADY VERIFIED — skip these

Done without a session. `[✓]` = verified, `[✓✓]` = verified by an executable test.

- [✓✓] **All URL guards (S2 + E2 denials).** `scripts/test-access.mjs` — 65/65 assertions
      pass. Covers every forbidden URL for styrelse and entreprenör, every allowed one,
      full admin access, and default-deny for missing/bogus roles.
      Re-run any time with `node scripts/test-access.mjs`.
- [✓] **A2 field coverage** — every create form (felanmälan, besiktning, projekt,
      lägenhet, kontakt, fastighet) writes every field it renders. No dropped fields.
- [✓] **A3 field coverage** — every edit form (felanmälan, besiktning, lägenhet,
      kontakt) writes every field it renders.
- [✓] **A5 exclusion logic** — all six surfaces plus dashboard counts correctly
      exclude closed errands. Found and fixed a dashboard mismatch (F11).
- [✓] **S1 / E1 nav restrictions** — role filtering verified in code.
- [✓] **Public felanmälan** — verified end-to-end logged out; building dropdown populated.

**Still needs you:** whether the database actually accepts these writes at runtime,
uploads, delete/FK behaviour, the invite flow, and every cross-role check. Static
analysis proves the code is wired right; it can't prove the server agrees.

---

# LOGIN 1 — ADMIN  (plattform@bayt.se)

## A1. Nothing broke (do this FIRST)
The RLS rewrite changed access rules on six tables. If any list below is empty
when it shouldn't be, stop and report it — that's a policy bug, not your fault.
- [ ] Fastigheter lists all buildings
- [ ] Open a building → Info, Lägenheter, Felanmälningar, Besiktningar, Projekt,
      Dokument, Kontakter, Loggbok, Objekt all load with data
- [ ] /dag-rapport loads
- [ ] /dashboard loads with non-zero counts
- [ ] /loggbok, /dokument, /contacts, /apartments all load

## A2. Create — does every field actually save?
For each: fill in **every** field, save, reopen, confirm each value persisted.
- [ ] Ny felanmälan (`/issues/new`) — incl. Entreprenör, priority, deadline, image
- [ ] Ny besiktning (`/inspections/new`) — incl. Entreprenör, utförd datum, intervall,
      and confirm "Nästa besiktning" computed correctly
- [ ] Nytt projekt — incl. Entreprenör
- [ ] Ny lägenhet — all 12 fields
- [ ] Ny kontakt — set type Entreprenör, confirm it appears in the Entreprenör dropdown
- [ ] Ny fastighet
- [ ] "+ Skapa" menu on a building's Objekt page opens and every item routes correctly

## A3. Edit round-trip
- [ ] Edit a felanmälan, save, reload → changes stuck
- [ ] Edit a besiktning, a projekt, a lägenhet, a kontakt → same
- [ ] Building settings: rename, change address, upload image → shows on the card

## A4. Delete
- [ ] Delete a felanmälan → gone from list
- [ ] Delete a besiktning, a projekt, a lägenhet
- [ ] Delete a kontakt who is an entreprenör → gone from every Entreprenör dropdown,
      and errands that referenced them still open (assignment just cleared)
- [ ] Delete a building → note what happens to its errands/apartments
- [ ] Confirm dialog appears every time; Cancel actually cancels

## A5. Avsluta chain (the important one)
Close one errand, then check it disappears from ALL of these:
- [ ] Dag Rapport main list
- [ ] Veckans ärenden (even if its deadline is within 7 days)
- [ ] Status dot on the Fastigheter section button
- [ ] Status dot on the section-overview building card
- [ ] Dashboard counts drop by one
- [ ] AKUT bell no longer counts it
- [ ] Reopening it still shows its old priority (history preserved)

## A6. Uploads
- [ ] Profile picture (Inställningar → Byt bild) — uploads and displays
- [ ] Felanmälan image on create AND on detail page
- [ ] Besiktning protocol — uploads, and download returns the real file not HTML
- [ ] No 403/RLS errors in the network tab during any upload

## A7. Invite + access panel
- [ ] Invite a test admin → email arrives → link works → password set → can log in
- [ ] Invite a styrelse with 2 buildings ticked
- [ ] Invite an entreprenör → they appear in the Entreprenör dropdown automatically
- [ ] Key icon on a styrelse row → shows their buildings, add/remove works
- [ ] Delete a test user → gone from the list

---

# LOGIN 2 — STYRELSE  (7hej041104@gmail.com)

## S1. Navigation is limited
- [ ] Sidebar shows ONLY: Fastigheter, Lägenheter, Felanmälningar, Besiktningar,
      Projekt, Loggbok, Inställningar
- [ ] NO Dag Rapport, NO Översikt, NO Dokument, NO Kontakter

## S2. URL guards (type these in the address bar)
Each should bounce you to Fastigheter, not load:
- [ ] `/dashboard`
- [ ] `/dag-rapport`
- [ ] `/contacts`
- [ ] `/dokument`
- [ ] `/issues/new`
- [ ] A building you are NOT attached to: `/properties/<other-id>/issues`
- [ ] A forbidden section of a building you ARE attached to:
      `/properties/<your-id>/objects` and `/properties/<your-id>/documents`

## S3. Scoping — only your buildings, everywhere
- [ ] Fastigheter shows only your attached buildings
- [ ] Lägenheter shows only your buildings
- [ ] Felanmälningar shows only your buildings
- [ ] Besiktningar shows only your buildings
- [ ] Projekt shows only your buildings
- [ ] Loggbok shows only your buildings

## S4. Read-only
- [ ] No "+ Ny …" button on any list page
- [ ] No Radera button anywhere
- [ ] Opening a building shows only: Info, Lägenheter, Felanmälningar,
      Besiktningar, Projekt, Loggbok

## S5. Settings
- [ ] Min profil + Byt lösenord present
- [ ] NO "Användare" / invite section
- [ ] Demolänk present

---

# LOGIN 3 — ENTREPRENÖR  (3hej041104@gmail.com)

> Prerequisite: as admin, assign at least one felanmälan, one besiktning and one
> projekt to this entreprenör, and leave at least one of each **unassigned**, so
> you can tell scoping from "there's just no data".

## E1. Navigation
- [ ] Sidebar shows ONLY: Dag Rapport, Fastigheter, Felanmälningar, Besiktningar,
      Projekt, Loggbok, Inställningar
- [ ] No Kalender / Avslutat links (not built yet — correctly hidden)

## E2. Scoping
- [ ] Felanmälningar: sees ONLY the one assigned to them
- [ ] Besiktningar: same
- [ ] Projekt: same
- [ ] Fastigheter: only buildings where they have assigned work
- [ ] Opening an unassigned errand by URL bounces them out

## E3. Permitted actions
- [ ] Can press Öppna on an assigned errand
- [ ] Can press Avsluta on an assigned errand
- [ ] Can comment on a loggbok event
- [ ] Entreprenör dropdown has NO "+ Lägg till entreprenör" option
- [ ] Cannot create anything (no "+ Ny …" buttons)

## E4. Settings
- [ ] Only: Namn, Telefon, Byt lösenord, profilbild
- [ ] NO Demolänk, NO Användare/invite section

---

# CROSS-ROLE (needs two logins — do at the end)

- [ ] **Assign → see:** admin assigns a new felanmälan to the entreprenör →
      log in as entreprenör → it's there
- [ ] **Attach → see:** admin adds a building to the styrelse via the key icon →
      log in as styrelse → the building appears
- [ ] **Detach → gone:** admin removes it → styrelse no longer sees it
- [ ] **Public → admin:** submit at `/felanmalan` logged out → admin sees it with
      the right building and a loggbok entry
- [ ] **Delete contact:** admin deletes the entreprenör's contact → entreprenör's
      errand list empties, and admin's errands still open fine

---

# KNOWN GAPS (not bugs — don't file these)

- `/kalender` and `/avslutat` for entreprenörer: specced, not built. Removed from
  nav so they don't 404.
- Public felanmälan has no moderation queue — submissions go live immediately.
- These tables still lack per-role RLS: `contacts`, `documents`, `issue_images`,
  `property_objects`, `inspection_protocols`, `logbook_comments`. UI hides them
  from styrelse/entreprenör but the database would still serve them to a direct query.
- The entreprenör loggbok INSERT policy is permissive — they can insert a log entry
  against any building, not just ones they work on.
