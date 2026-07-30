import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useMyContactId } from "@/hooks/useMyContactId";

/**
 * The set of property ids the signed-in user is allowed to see.
 *
 *  - admin       → every building (returns `null`, meaning "no filter")
 *  - styrelse    → only buildings linked via `styrelse_properties`
 *  - entreprenör → only buildings where they have an assigned errand
 *
 * Single source of truth on purpose: the same scoping is needed on Fastigheter and
 * on every section overview (Lägenheter / Felanmälningar / Besiktningar / Projekt /
 * Dokument / Loggbok). Duplicating it per page is how buildings leak into a role
 * that shouldn't see them.
 *
 * Returns `{ allowedIds, isLoading }` where `allowedIds === null` means unrestricted.
 * While loading, callers should render nothing rather than everything.
 */
export function useVisibleProperties() {
  const { user, profile } = useAuth();
  const role = profile?.role;
  const { contactId, isEntreprenor } = useMyContactId();

  const isStyrelse = role === "styrelse";

  const styrelseQ = useQuery({
    queryKey: ["styrelse-properties", user?.id],
    enabled: isStyrelse && !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("styrelse_properties")
        .select("property_id")
        .eq("profile_id", user!.id);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.property_id as string));
    },
  });

  const entreprenorQ = useQuery({
    queryKey: ["entreprenor-property-ids", contactId],
    enabled: isEntreprenor && !!contactId,
    queryFn: async () => {
      const [issues, inspections, projects] = await Promise.all([
        supabase.from("issues").select("property_id").eq("assigned_contact_id", contactId!),
        supabase.from("inspections").select("property_id").eq("assigned_contact_id", contactId!),
        supabase.from("projects").select("property_id").eq("assigned_contact_id", contactId!),
      ]);
      const ids = new Set<string>();
      for (const res of [issues, inspections, projects]) {
        for (const r of (res.data ?? []) as Array<{ property_id: string | null }>) {
          if (r.property_id) ids.add(r.property_id);
        }
      }
      return ids;
    },
  });

  if (role === "admin") return { allowedIds: null as Set<string> | null, isLoading: false };

  if (isStyrelse) {
    return { allowedIds: styrelseQ.data ?? new Set<string>(), isLoading: styrelseQ.isLoading };
  }

  if (isEntreprenor) {
    return {
      allowedIds: entreprenorQ.data ?? new Set<string>(),
      // contactId still resolving counts as loading — otherwise we'd briefly claim
      // "no buildings" for a user who actually has several.
      isLoading: contactId === undefined || entreprenorQ.isLoading,
    };
  }

  // Unknown role: deny by default.
  return { allowedIds: new Set<string>(), isLoading: !role };
}

/**
 * The buildings this user may see, already fetched — the building-picker grids
 * (Fastigheter / Felanmälningar / Besiktningar / Projekt / Lägenheter / Loggbok)
 * all start from this.
 *
 * Asks the database for exactly the allowed buildings instead of fetching every
 * building and discarding the rest. Same cards, same order, same
 * fastighet-först navigation — but a missing read rule on `properties` can no
 * longer turn a grid that has data into "Inga fastigheter hittades", which is
 * exactly what happened to entreprenörer (see
 * supabase-functions/entreprenor-read-scope.sql).
 *
 * `columns` is a PostgREST select list, so each page keeps the exact columns it
 * needs. Callers should still filter on `allowedIds` afterwards — cheap, and it
 * keeps the page honest if this hook is ever bypassed.
 */
export function useScopedProperties<T>(columns: string) {
  const { allowedIds, isLoading: scopeLoading } = useVisibleProperties();
  // Sorted so the key is stable regardless of Set iteration order — otherwise
  // every render risks a fresh cache entry and a refetch.
  const idsKey = allowedIds === null ? "all" : [...allowedIds].sort().join(",");

  const q = useQuery({
    // Prefixed "properties" on purpose: existing writers call
    // invalidateQueries({ queryKey: ["properties"] }) and must keep hitting this.
    queryKey: ["properties", "scoped", columns, idsKey],
    enabled: !scopeLoading,
    queryFn: async () => {
      // Nothing allowed → nothing to ask for. `.in("id", [])` is a round trip
      // that can only return zero rows.
      if (allowedIds !== null && allowedIds.size === 0) return [] as T[];
      let sel = supabase.from("properties").select(columns);
      if (allowedIds !== null) sel = sel.in("id", [...allowedIds]);
      const { data, error } = await sel.order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as T[];
    },
  });

  return {
    properties: q.data ?? ([] as T[]),
    allowedIds,
    isLoading: scopeLoading || q.isLoading,
    error: q.error as Error | null,
  };
}
