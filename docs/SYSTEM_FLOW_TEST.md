# BAYT — System Data-Flow Test Checklist

High-tier testing: don't just confirm a button reacts — confirm the data lands in the
right place and the right downstream effects fire. Each item lists:
**Do** (the action) → **Lands** (where it must end up) → **Then** (downstream effects to verify).

Marking: `[ ]` untested · `[x]` verified end-to-end · `[!]` broken (note what actually happened).
`⛔ NOT BUILT YET` = expected gap, don't file as a bug.

---

## 1. INVITE FLOW — Admin invites a user

### 1a. Invite an Admin
- [ ] **Do:** Inställningar → Bjud in användare, role = Admin, real email.
- [ ] **Lands:** new row in `auth.users`; trigger creates `public.profiles` row with `role='admin'`, correct `email`, `full_name`, and `password_set=false`.
- [ ] **Then:** email actually arrives (Resend); appears in Användare table; row count increments.
- [ ] **Verify SQL:** `SELECT email, role, password_set FROM profiles WHERE email='...';`

### 1b. Invite a Styrelse WITH buildings
- [ ] **Do:** role = Styrelse, tick 1–2 buildings, invite.
- [ ] **Lands:** `profiles` row `role='styrelse'`; one `styrelse_properties` row **per ticked building** (`profile_id` = new user, `property_id` = each building).
- [ ] **Then:** buildings show under the key-icon panel for that user afterward.
- [ ] **Verify SQL:** `SELECT pr.email, p.name FROM styrelse_properties sp JOIN profiles pr ON pr.id=sp.profile_id JOIN properties p ON p.id=sp.property_id WHERE pr.email='...';`
- [ ] **Critical:** this only works if the **new** `invite-user` function is deployed. If links are missing, the old function is still live.

### 1c. Invite an Entreprenör
- [ ] **Do:** role = Entreprenör, invite.
- [ ] **Lands:** `profiles` row `role='entreprenor'`; **and** a `contacts` row with `contact_type='entreprenor'`, `profile_id` = new user id, `email` set.
- [ ] **Then:** that person is immediately pickable in the Entreprenör dropdown on new felanmälan/besiktning/projekt.
- [ ] **Verify SQL:** `SELECT full_name, contact_type, profile_id, email FROM contacts WHERE email='...';`

### 1d. Accept invite → set password
- [ ] **Do:** click email link → lands on `/accept-invite` → set password → submit.
- [ ] **Lands:** `profiles.password_set` flips `false → true`; auth password is set.
- [ ] **Then:** redirected into app; can log out and log back in with that password.
- [ ] **Gate check:** BEFORE setting password, manually visiting `/dashboard` must bounce to `/accept-invite` (password_set=false gate).

### 1e. Delete a user
- [ ] **Do:** key/trash icon → Radera.
- [ ] **Lands:** `auth.users` row gone; `profiles` row gone (cascade).
- [ ] **Then:** disappears from Användare table; if they were an entreprenör contact, decide expected behavior (contact row currently remains — note if that's wanted).

---

## 2. PUBLIC FELANMÄLAN SURVEY

- [ ] **Do:** `/felanmalan` logged-out, pick building, fill name+phone, attach image, submit.
- [ ] **Lands:** `issues` row `status='ny'`, `submission_source='public_form'`, correct `property_id`, `reporter_name/phone`.
- [ ] **Apartment connect-or-create:** if apartment number typed → matches existing `apartments` row OR creates one (`created_via='public_form'`); `issue.apartment_id` set to it.
- [ ] **Image:** file in `documents` bucket under `issues/<id>/...`; `issue_images` row with public URL.
- [ ] **Loggbok:** intake entry added to `logbook_entries` for that property/apartment.
- [ ] **Then:** errand appears immediately in Felanmälningar (⛔ moderation queue NOT BUILT — instant-live is current expected behavior).
- [ ] **Verify SQL:** `SELECT status, submission_source, property_id, apartment_id FROM issues ORDER BY created_at DESC LIMIT 1;`

---

## 3. ADMIN CREATES ERRANDS

### 3a. New felanmälan (`/issues/new`)
- [ ] **Do:** fill form, pick Entreprenör = Rolf, pick priority + deadline, attach file, save.
- [ ] **Lands:** `issues` row `status='ny'`, `submission_source='admin'`, `created_by` = you, **`assigned_contact_id`** = Rolf's contact id, `priority`, `deadline` all correct.
- [ ] **Image:** `documents` bucket + `issue_images` row.
- [ ] **Loggbok:** `felanmalan_mottagen` event in `logbook_entries`.
- [ ] **Then:** redirect to detail; detail shows assigned entreprenör, priority, deadline, image.
- [ ] **Verify SQL:** `SELECT assigned_contact_id, priority, deadline, submission_source FROM issues ORDER BY created_at DESC LIMIT 1;`

### 3b. New besiktning (`/inspections/new`)
- [ ] **Do:** fill, pick Entreprenör, set utförd datum + intervall, save.
- [ ] **Lands:** `inspections` row, `assigned_contact_id` set, `next_due_date` = utförd + intervall months, `status='aktiv'`.
- [ ] **Protocol file:** in `protocols` bucket; `inspection_protocols` row.
- [ ] **Verify SQL:** `SELECT assigned_contact_id, next_due_date, status FROM inspections ORDER BY created_at DESC LIMIT 1;`

### 3c. New projekt
- [ ] **Do:** fill, pick Entreprenör, save.
- [ ] **Lands:** `projects` row, `assigned_contact_id` set.

### 3d. "+ Skapa" menu (property → Objekt page)
- [ ] **Do:** press + Skapa on a building's Objekt page.
- [ ] **Then:** menu actually opens (was clipped before); each item routes to the correct scoped create form with `property_id` pre-filled.

---

## 4. ENTREPRENÖR DROPDOWN INTEGRITY

- [ ] Dropdown lists **only** `contact_type='entreprenor'` contacts — no styrelse/leverantör/etc.
- [ ] As Admin, "+ Lägg till entreprenör" is present; adding creates a `contacts` row `contact_type='entreprenor'` and auto-selects it.
- [ ] As Entreprenör login, "+ Lägg till entreprenör" is **hidden** (can pick but not add).
- [ ] Invited entreprenör (1c) appears here without any manual contact creation.

---

## 5. AVSLUTA (close) — the full downstream chain

- [ ] **Do:** open an errand, press Avsluta.
- [ ] **Lands:** `status` → `stangd`/`avslutat` (issues) or `arende_status='avslutat'` (besiktning/projekt); `issue_status_history` row written; auto `logbook_entries` entry.
- [ ] **Then (verify EACH disappears):**
  - [ ] Gone from Dag Rapport main list.
  - [ ] Gone from Veckans ärenden — even if its deadline is within 7 days.
  - [ ] Status dot gone on Fastigheter section button (even if never opened/viewed).
  - [ ] Status dot gone on the section-overview building card.
  - [ ] Dashboard "kräver åtgärd" / open counts drop by one.
  - [ ] AKUT bell no longer counts it.
- [ ] **Priority as history:** reopening the closed errand still shows its old priority value (stored, not wiped) — but it drives nothing anymore.

---

## 6. STYRELSE ACCESS (read-only, scoped)

- [ ] **Do:** log in as a styrelse account with buildings attached.
- [ ] Login succeeds (previously blocked entirely).
- [ ] Fastigheter shows **only** attached buildings — not the full list.
- [ ] "+ Ny fastighet" button hidden.
- [ ] Sidebar/start show only permitted sections (⛔ full sidebar/start filtering may be partial — note what's visible).
- [ ] **Admin edits access:** key icon → tick/untick a building → save → styrelse view updates to match on next load.
- [ ] **RLS proof:** styrelse cannot read a non-attached building even via direct URL `/fastigheter/<other-id>/...`.
- [ ] ⛔ NOT FULLY BUILT: nested subpages (Lägenheter/Felanmälan/etc.) read-only enforcement — note any edit controls still visible.

---

## 7. ENTREPRENÖR ACCESS

- [ ] Login succeeds.
- [ ] Settings shows ONLY: Namn, Telefon, Byt lösenord, profilbild. NO Demolänk, NO Användare/invite section.
- [ ] ⛔ NOT BUILT: filtered "my errands" view (issues/inspections/projects where assigned_contact_id = their contact). Confirm the login↔contact link exists (1c) as the foundation, but don't expect the scoped list yet.

---

## 8. STORAGE / IMAGES

- [ ] **Avatar:** Inställningar → Byt bild → file lands in `avatars` bucket; `profiles.avatar_url` updated; image renders in Min profil and avatar menu.
- [ ] **Felanmälan images:** upload on create AND on detail page → `documents` bucket + `issue_images` row → visible in gallery, no "ingen bild" false negative.
- [ ] **Besiktning protocol:** `protocols` bucket; download returns the real file, not HTML.
- [ ] No RLS/403 error in network tab during any upload.

---

## 9. CROSS-CUTTING INTEGRITY

- [ ] Deep-link a nested URL directly (paste `/properties/<id>/issues`) → loads correct scoped data.
- [ ] No console errors clicking through every top section.
- [ ] No 403/RLS errors in network tab during normal admin use.
- [ ] Service role key never appears client-side (search built bundle for `sb_secret` → 0 hits).
- [ ] Counts on cards match reality (open a building, count its open issues by hand vs the badge).
