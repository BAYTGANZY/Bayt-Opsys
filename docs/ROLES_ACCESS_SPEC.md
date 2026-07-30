# Roles & Access — Design Spec

Confirmed with client 2026-07-20. This is the source of truth for the role/access rebuild.

## Admin
Unchanged. Full access to everything, exactly as today.

## Styrelse

- **Scope:** the Fastigheter page, filtered to only the building(s) attached to them — nothing outside that scope, anywhere in the app (not just Fastigheter itself, but anything scoped by property: Lägenheter, Felanmälningar, Besiktningar, Projekt, Dokument, Kontakter, Loggbok for their building(s)).
- **Permission level:** read-only. No edits anywhere.
- **How the building link is set:** at invite time, the admin picks one or more buildings from a multi-select (pulled live from `properties`). The link is **editable afterward only by an Admin**, from a per-user access panel reachable from Inställningar → Användare. Never self-service, never automatic — a newly-created building does NOT automatically appear for existing Styrelse members; an Admin must manually attach it via that panel.
- **Storage:** new link table, e.g. `styrelse_properties (profile_id, property_id)` — many-to-many, doesn't exist yet.

## Entreprenör

- **Scope:** every issue/inspection/project (past, current, future) where they're set as the "Ansvarig" (the existing contractor dropdown on those three forms), plus the building each belongs to (for context only, not full building access).
- **Loggbok:** entries tied to those same errands; can comment on loggbok events.
- **Actions allowed:** Öppna / Avsluta on any of the three errand types (issue, inspection, project). Nothing else editable.
- **Architecture problem to solve:** "entreprenör" currently exists in two disconnected places — a `role` on `profiles` (a login) and a `role` on `contacts` (a name pickable in the Ansvarig dropdown). Nothing links a login to a contact today. Invite flow needs a step to link the new login to an existing (or new) `contacts` row, so the app can filter issues/inspections/projects by `ansvarig_contact_id` for that login.

## Sidebar / `/start` filtering

Once roles carry real permissions: Styrelse and Entreprenör only ever see the sidebar sections and `/start` tiles that map to what their role can access. Everything else doesn't render for them (not just disabled).

## Public felanmälan moderation queue

Currently: `felanmalan.tsx` → `submit-felanmalan` Edge Function inserts directly into the real `issues` table with `status: "ny"` — live immediately, no review.

Target: submissions land in a separate pending state. Admin reviews each one, can edit details, then Accept (→ becomes a real issue, same as today) or Reject (discarded). Open question: scope currently assumed to be felanmälan-only, since that's the only public intake form that exists (no public projekt/besiktning intake today).

## Build order (agreed)

1. Styrelse building access — schema, invite-form multi-select, admin-only editable access panel, property-scoped data filtering.
2. Sidebar/start filtering based on real per-role permissions.
3. Entreprenör-to-contact linking — invite-form step, filtering issues/inspections/projects/loggbok by linked contact.
4. Public felanmälan moderation queue — separate track, can run in parallel or after.
