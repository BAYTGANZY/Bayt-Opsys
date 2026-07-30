# BAYT — Autonomous QA Loop Prompt

Feed this to `/loop` (no interval — self-paced). Each iteration continues from
`docs/QA_FINDINGS.md`, which is the living state file.

---

You are running an exhaustive QA pass over the BAYT admin portal. Work autonomously.
Do NOT ask the user anything mid-run — collect every question into the QUESTIONS
section of the findings file and surface them all at the very end, in one batch.

## State

Read `docs/QA_FINDINGS.md` first. If it doesn't exist, create it from the template at
the bottom of this file. It tracks:
- `## PROGRESS` — which surfaces are done (`[x]`), in flight (`[~]`), untested (`[ ]`)
- `## FIXED` — bugs found and already fixed by you, with file:line
- `## QUESTIONS` — anything needing the user's decision, credentials, or a dashboard action
- `## BLOCKED` — things you could not test and why

Every iteration: pick the next untested item, test it, record the result, update the file.
Never re-test something already marked `[x]` unless a fix you made could have regressed it.

## Ground rules

1. **Trace data, don't click.** A surface passes only when you've confirmed the write
   landed in the right table/column/bucket AND the downstream effects fired. Use the
   browser's JS console against the live Supabase client to verify rows directly:
   `javascript_tool` → `import('/src/lib/supabase.ts')` → query and assert.
2. **Fix what you can.** If the bug is in app code, fix it, rebuild (`npm run build`),
   confirm the build is clean, and log it under FIXED. Don't ask permission for
   clear-cut bug fixes.
3. **Never fix by guessing.** If a fix needs a schema change, an Edge Function deploy,
   an RLS policy, or a product decision, write the exact SQL/TS/decision into QUESTIONS
   with a **Paste into:** label (SQL Editor vs Edge Functions → name → Code). Keep going.
4. **Never enter passwords, and never request a role switch mid-run.** The run must be
   fully autonomous start to finish. Verify styrelse/entreprenör behavior WITHOUT logging
   in as them, by combining:
   - **Data layer:** resolve each test user's `profiles.id`, then run the exact queries
     the app runs for that role (e.g. `styrelse_properties` for their id;
     `assigned_contact_id = their contact id`) and assert the row sets are correct.
   - **Policy layer:** read `pg_policy` for every table they touch and reason about what
     the database would actually return for `auth.uid() = <their id>`.
   - **Code layer:** trace `permissions.ts`, the nav filters, and each page's query to
     confirm the role branch is correct and that hiding is backed by a real filter.
   Anything that genuinely can only be confirmed with human eyes on a logged-in session
   goes into QUESTIONS as a short "spot-check when you log in as X" list — never as a
   mid-run stop.
5. **Test the seams, not just the pages.** Most real bugs live in cross-surface flows —
   create in one place, verify it shows correctly in the four other places that read it.

## Surfaces to cover

### Public (no login)
- `/felanmalan` — submit with/without apartment number, with/without image; verify
  `issues` row, apartment connect-or-create, `issue_images`, loggbok intake entry.
- `/demo` — runs standalone, no failing Supabase calls, no real customer data.
- `/login` — wrong password errors in Swedish; no crash.
- `/accept-invite` — with no token shows the expired/invalid state, doesn't white-screen.

### Admin role
Every route: `/start`, `/dag-rapport`, `/dashboard`, `/fastigheter`,
`/fastigheter/$id/installningar`, `/apartments`, `/apartments/$id` (all tabs),
`/issues` + `/new` + `/$id`, `/inspections` + `/new` + `/$id`, `/projects` + `/new` + `/$id`,
`/dokument`, `/contacts` + `/new` + `/$id`, `/loggbok`, `/installningar`,
and every `/properties/$id/*` sub-route (info, apartments, issues, inspections,
projects, documents, contacts, logbook, objects, actions, history).

For each: page renders, no console errors, no 403/RLS in network, empty states are
friendly, counts match reality, every create form writes every field it shows,
every edit form round-trips, every delete works or explains why it can't.

### Styrelse role
- Sees ONLY: Fastigheter, Lägenheter, Felanmälningar, Besiktningar, Projekt, Loggbok,
  Inställningar. No Dag Rapport / Översikt / Dokument / Kontakter in nav OR by direct URL.
- Sees ONLY their attached buildings, everywhere — including via direct URL to a
  building they're not attached to (must be blocked, not just hidden).
- Read-only: no create/edit/delete controls anywhere.
- Inställningar: profile + password + demo link, NO invite section.

### Entreprenör role
- Sees ONLY errands where `assigned_contact_id` = their linked contact.
- Fastigheter shows only buildings where they have work.
- Can Öppna/Avsluta on issue/inspection/project; can comment on loggbok events.
- Cannot add kontakter; no "+ Lägg till entreprenör" in dropdowns.
- Inställningar: name, phone, password, avatar only.
- `/kalender` and `/avslutat` are reserved in nav but NOT BUILT — confirm they 404 and
  log as a known gap, not a bug.

### Cross-role flows (the highest-value tests)
1. Admin creates felanmälan + assigns entreprenör → entreprenör sees exactly that one,
   and does NOT see an unassigned one.
2. Admin attaches/detaches a building to styrelse via key icon → styrelse view changes.
3. Public felanmälan submitted → admin sees it; correct building; loggbok entry exists.
4. Avsluta an errand → verify it vanishes from Dag Rapport, Veckans ärenden, the
   Fastigheter dot, the section-overview card dot, dashboard counts, and the AKUT bell.
5. Admin deletes a kontakt who is an entreprenör → gone from every dropdown;
   errands that referenced them survive with the reference cleared.
6. Admin deletes a building → its errands/apartments behave per FK rules (verify, don't assume).

## Test users (IDs to resolve at the data layer — do NOT log in as these)

- admin: `plattform@bayt.se`
- styrelse: `7hej041104@gmail.com`
- entreprenör: `3hej041104@gmail.com`

Resolve each to a `profiles.id` once, cache it in the findings file, and use those ids
for all role-scoping assertions.

## Finish condition

When every PROGRESS item is `[x]`, write a final report at the top of the findings file:
- Count of: passed / fixed-by-you / needs-user / blocked
- **ONE** consolidated action list for the user, ordered so it can be done in a single
  sitting with no back-and-forth:
  1. **All SQL** — merged into one paste-able block, labelled **Paste into: SQL Editor**
  2. **All Edge Function code** — full file contents, labelled with the exact function name
  3. **Product decisions** — each as a yes/no or pick-one, with your recommendation first
  4. **Spot-checks** — a short list of things to eyeball when they next log in as
     styrelse/entreprenör, phrased so each takes seconds
- Then stop the loop (`ScheduleWakeup` with `stop: true`).

Do not surface anything to the user before this final report.

---

## Template for `docs/QA_FINDINGS.md`

```markdown
# BAYT QA — Findings

_Last updated: <date>_

## PROGRESS
- [ ] Public: /felanmalan
- [ ] Public: /demo
- [ ] Public: /login, /accept-invite
- [ ] Admin: navigation + /start + /dag-rapport + /dashboard
- [ ] Admin: /fastigheter + building settings + delete
- [ ] Admin: /apartments + detail tabs
- [ ] Admin: /issues (list, new, detail, delete)
- [ ] Admin: /inspections (list, new, detail, delete)
- [ ] Admin: /projects (list, new, detail, delete)
- [ ] Admin: /dokument, /contacts, /loggbok
- [ ] Admin: /installningar (profile, password, invite, access panel)
- [ ] Admin: /properties/$id/* every sub-route
- [ ] Styrelse: nav restrictions + direct-URL blocks
- [ ] Styrelse: building scoping + read-only
- [ ] Entreprenör: errand scoping
- [ ] Entreprenör: nav + settings restrictions
- [ ] Cross-role flow 1: assign → entreprenör sees
- [ ] Cross-role flow 2: styrelse building attach/detach
- [ ] Cross-role flow 3: public felanmälan → admin
- [ ] Cross-role flow 4: avsluta → disappears everywhere
- [ ] Cross-role flow 5: delete entreprenör contact
- [ ] Cross-role flow 6: delete building

## FIXED
(bug → file:line → what changed)

## QUESTIONS
(batched for the user at the end)

## BLOCKED
(couldn't test + why)
```
