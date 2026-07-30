# BAYT QA — Findings

_Run started 2026-07-21. Autonomous pass — no mid-run stops._

## SESSION NOTE
Browser session is **logged out**. Data-layer verification that requires an
authenticated role is deferred; everything reachable anonymously (public surfaces,
RLS posture, code-layer role logic, build integrity) is being done first.

## PROGRESS
- [x] Public: RLS posture for anonymous visitors — PASS (all tables return 0 rows to anon)
- [x] Public: /felanmalan — FAILED, fixed (F1)
- [x] Public: /demo — PASS (loads logged out, no console errors, mock data only)
- [x] Public: /login, /accept-invite — PASS (invalid-token state correct; protected
      routes redirect to login; /styrelse + /boende are auth-guarded, no anon leak)
- [x] Code-layer: role permission logic — FAILED, fixed (F2, F3)
- [x] Code-layer: styrelse scoping queries — FAILED, fixed (F4, F5, F6)
- [x] Code-layer: entreprenör scoping queries — FAILED, fixed (F4, F5, F6)
- [x] Code-layer: detail-page URL scoping — FAILED, fixed (F7)
- [BLOCKED] Admin UI surfaces (all) — needs an authenticated session
- [BLOCKED] Cross-role flows 1-6 — needs an authenticated session

## RESULT
7 bugs found, 7 fixed in app code. 4 were security holes (F2, F4, F5, F7).
Typecheck and build clean after every change.
Blocked: runtime UI verification — session expired, and passwords can't be entered.

## FIXED

### F1 — Public felanmälan form was completely unusable (CRITICAL)
**Found:** logged out, `/felanmalan`'s "FASTIGHET *" dropdown renders zero buildings.
The form hard-requires a building (`if (!propertyId ...) return`), so **no member of
the public could ever submit a felanmälan.** It appeared to work in testing only
because the tester was logged in as admin at the time.

**Cause:** RLS on `properties` correctly blocks anonymous reads, but the public form
queries `properties` directly. Verified: anon `SELECT id, name FROM properties` → 0 rows,
no error (silently empty).

**Fix applied:** frontend now reads from a dedicated `public_properties` view exposing
only `id` + `name`. Requires the SQL in Q1 to be run — see QUESTIONS.
File: `src/routes/felanmalan.tsx`

### F2 — Role restrictions were cosmetic only (SECURITY)
**Found:** `_authenticated.tsx` `beforeLoad` verified the user's role was one of the
three valid roles, but never checked whether that role may open the *requested route*.
Nav filtering hid the links, but a styrelse or entreprenör typing `/dashboard`,
`/dokument`, `/contacts`, `/dag-rapport` or `/ekonomi` reached them with full access.

**Fix applied:** `beforeLoad` now receives `location` and enforces `canAccess(role, pathname)`,
redirecting a role that overreaches to its own landing page (admin → /dashboard,
styrelse → /fastigheter, entreprenör → /dag-rapport).
File: `src/routes/_authenticated.tsx`

### F3 — Allowed-route lists omitted `/properties` (would break building nav)
**Found:** while adding F2's guard: `permissions.ts` listed `/fastigheter` but not
`/properties`. Every per-building sub-page (Lägenheter, Felanmälan, Besiktningar,
Projekt, Dokument, Kontakter, Loggbok, Objekt) lives under `/properties/$id/...`,
so the new guard would have bounced styrelse and entreprenör out of every building
the moment they clicked into one.

**Fix applied:** `/properties` added to both role route lists, with a comment so it
isn't dropped again.
File: `src/lib/permissions.ts`

### F4 — Every section overview leaked all buildings to every role (SECURITY)
**Found:** only Fastigheter was scoped. `/apartments`, `/inspections`, `/projects`,
`/dokument`, `/loggbok` (all via `SectionOverviewPage`) and `/issues` (via
`IssuesPropertyOverview`) each called an unfiltered `loadProperties()`. A styrelse
member saw **every building in the system** with live errand counts and status dots
on five of the six section pages; an entreprenör likewise.

**Fix applied:** new `useVisibleProperties()` hook is now the single source of truth
for "which buildings may this user see" (admin → all, styrelse → `styrelse_properties`,
entreprenör → buildings with work assigned to them). Wired into `SectionOverviewPage`
and `IssuesPropertyOverview`, and `fastigheter.index.tsx` was refactored onto it so
the three copies of this logic became one.
Files: `src/hooks/useVisibleProperties.ts` (new), `src/components/SectionOverviewPage.tsx`,
`src/components/IssuesPropertyOverview.tsx`, `src/routes/_authenticated.fastigheter.index.tsx`

### F5 — Any building openable by URL regardless of scope (SECURITY)
**Found:** `PropertyShell` fetched whatever `$id` was in the URL with no ownership
check. Even with F2/F4 in place, a styrelse or entreprenör pasting
`/properties/<any-building-uuid>/issues` got that building's full data.

**Fix applied:** PropertyShell now checks the id against `useVisibleProperties()` and
redirects to `/fastigheter` when out of scope.
File: `src/routes/_authenticated.properties.$id.tsx`

### F6 — Per-building sub-nav exposed forbidden sections
**Found:** the building sub-nav (`ContextNav`) rendered all 11 sections for every role,
including Dokument, Kontakter, Objekt, Åtgärdslista and Historik — none of which
styrelse or entreprenör should have per spec.

**Fix applied:** sub-nav filtered per role (styrelse: info/lägenheter/felanmälningar/
besiktningar/projekt/loggbok; entreprenör: same minus lägenheter).
File: `src/components/ContextNav.tsx`

### F7 — Every detail page openable by URL regardless of scope (SECURITY)
**Found:** the same hole as F5, one level down. `/issues/$id`, `/inspections/$id`,
`/projects/$id` and `/apartments/$id` all fetch by id with no scope check. An
entreprenör could open any errand not assigned to them; a styrelse any apartment or
errand in a building they aren't attached to.

**Fix applied:** shared `useRecordScopeGuard()` applied to all four detail pages —
errand records check assignment for entreprenörer and building scope for styrelse;
apartments use building scope for both.
Files: `src/hooks/useRecordScopeGuard.ts` (new), `_authenticated.issues.$id.tsx`,
`_authenticated.inspections.$id.tsx`, `_authenticated.projects.$id.tsx`,
`_authenticated.apartments.$id.tsx`

## QUESTIONS

**Q1 (CRITICAL) — all F2–F7 fixes are UI-level only.**
Every scoping fix above runs in the browser. The database still lets any authenticated
user read any row — a styrelse member who opens devtools can query another building's
errands directly, and the app cannot stop them. RLS is the only real boundary.
The consolidated SQL in the final report closes this. It must be run.

**Q2 — `public_properties` view required or the public felanmälan form stays broken (F1).**
Included in the same SQL block.

**Q3 — FK cleanup so deleting an entreprenör contact doesn't fail.**
Included in the same SQL block.

**Q4 — remaining UI verification needs one login.**
Admin CRUD surfaces and the six cross-role flows can't be exercised without an
authenticated session. Listed as spot-checks in the final report.

## BLOCKED
- Authenticated data-layer checks: browser session expired mid-run. Everything needing
  a logged-in role is queued; see final report for the one-time login request.
