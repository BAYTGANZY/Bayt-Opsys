import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

/**
 * The `contacts.id` linked to the signed-in entreprenör login.
 *
 * An entreprenör exists twice in the system: as a login (`profiles`) and as a
 * pickable name (`contacts`). `contacts.profile_id` joins them — that's what
 * lets us filter errands by `assigned_contact_id` for the logged-in user.
 *
 * Returns `undefined` while loading and `null` when there's no linked contact,
 * so callers can tell "not ready yet" apart from "definitely nothing".
 *
 * SELF-HEALING: a missing link used to be a dead end — the account showed
 * "inte kopplad till någon kontaktpost" and every list stayed empty, which is
 * exactly what happened to anyone who was deleted and invited back (a new
 * profiles.id matches nothing). Now an empty lookup falls through to
 * `ensure_my_contact_link()`, which relinks the contact by e-post — or creates
 * one — for `auth.uid()` and nobody else. See
 * supabase-functions/account-continuity.sql; the same rule runs DB-side as a
 * trigger on profiles, so this is the belt to that braces.
 */
export function useMyContactId() {
  const { user, profile } = useAuth();
  const enabled = profile?.role === "entreprenor" && !!user?.id;

  const q = useQuery({
    queryKey: ["my-contact-id", user?.id],
    enabled,
    queryFn: async () => {
      // limit(1) rather than maybeSingle(): two contacts pointing at the same
      // login is possible (relinked by hand at some point) and must not turn
      // into a thrown PGRST116 that empties the whole page.
      const { data, error } = await supabase
        .from("contacts")
        .select("id")
        .eq("profile_id", user!.id)
        .limit(1);
      if (error) throw error;

      const existing = (data ?? [])[0]?.id as string | undefined;
      if (existing) return existing;

      const { data: healed, error: healError } = await supabase.rpc("ensure_my_contact_link");
      if (healError) {
        // account-continuity.sql not applied yet (PGRST202 = no such function).
        // Degrade to the old behaviour instead of failing the page.
        console.warn("[useMyContactId] ensure_my_contact_link misslyckades:", healError.message);
        return null;
      }
      return (healed as string | null) ?? null;
    },
  });

  return {
    contactId: q.data,
    isLoading: enabled && q.isLoading,
    isEntreprenor: profile?.role === "entreprenor",
  };
}

/**
 * "Only my ärenden" as a reusable query filter.
 *
 * Client spec (2026-07-30): an entreprenör sees **every ärende assigned to them,
 * whatever its status, and nothing else** — not other contractors' work, not the
 * building's history, not a unit's old felanmälningar. Status is explicitly NOT
 * part of this: their own avslutade ärenden stay visible so they keep a record
 * of what they did.
 *
 * Before this, the apartment views (Tidslinje, felanmälnings- and
 * besiktningstabellen) and the akut-bell queried by `apartment_id` alone and
 * relied on RLS to narrow the result — which it does not: any logged-in user can
 * read every issue. An entreprenör assigned one felanmälan therefore saw every
 * felanmälan that unit ever had, finished ones included.
 *
 * Usage — every ärende read that is not already keyed on assignment:
 *   const { filterContactId, ready } = useMyArendeScope();
 *   useQuery({ queryKey: [..., filterContactId], enabled: ready, queryFn: async () => {
 *     let q = supabase.from("issues").select(...).eq("apartment_id", id);
 *     if (filterContactId) q = q.eq("assigned_contact_id", filterContactId);
 *     ...
 *
 * `filterContactId` is null for admin/styrelse (no narrowing — they are supposed
 * to see everything) and `"__none__"` for an entreprenör with no linked contact,
 * which matches nothing. It is deliberately a value rather than a query wrapper:
 * PostgREST builder generics do not survive being passed around.
 *
 * This is UI-level filtering only. The database still lets any authenticated
 * user read every ärende; closing that needs RLS on issues/inspections/projects
 * (deferred by decision on 2026-07-30). Don't mistake this for a boundary.
 */
export function useMyArendeScope() {
  const { contactId, isEntreprenor } = useMyContactId();
  return {
    filterContactId: isEntreprenor ? (contactId ?? "__none__") : null,
    /** False while the contact link is still resolving — don't query yet. */
    ready: !isEntreprenor || contactId !== undefined,
    isEntreprenor,
  };
}
