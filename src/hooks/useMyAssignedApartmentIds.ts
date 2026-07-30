import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useMyContactId } from "@/hooks/useMyContactId";

/**
 * Apartments an entreprenör is allowed to open.
 *
 * Apartments carry no `assigned_contact_id`, so — exactly like
 * useVisibleProperties derives a contractor's building set — the apartment set
 * is derived from the ärenden assigned to their linked contact.
 *
 * Projects are deliberately absent: the `projects` table has no `apartment_id`
 * column at all, so a project can never grant apartment access.
 *
 * Mirrors the RLS helper `has_apartment_assignment()` in
 * supabase-functions/audit-events.sql. If one changes, change both — this hook
 * is UI-level defence only; the database is the real boundary.
 */
export function useMyAssignedApartmentIds() {
  const { contactId, isEntreprenor } = useMyContactId();

  const q = useQuery({
    queryKey: ["entreprenor-apartment-ids", contactId],
    enabled: isEntreprenor && !!contactId,
    queryFn: async () => {
      const [issues, inspections] = await Promise.all([
        supabase.from("issues").select("apartment_id")
          .eq("assigned_contact_id", contactId!).not("apartment_id", "is", null),
        supabase.from("inspections").select("apartment_id")
          .eq("assigned_contact_id", contactId!).not("apartment_id", "is", null),
      ]);
      const ids = new Set<string>();
      for (const res of [issues, inspections]) {
        for (const r of (res.data ?? []) as { apartment_id: string | null }[]) {
          if (r.apartment_id) ids.add(r.apartment_id);
        }
      }
      return ids;
    },
  });

  return {
    apartmentIds: q.data,
    // contactId === undefined means "still resolving". Without folding that into
    // isLoading we would briefly claim a contractor has no apartments and
    // redirect them off a page they are entitled to.
    isLoading: isEntreprenor && (contactId === undefined || q.isLoading),
    isEntreprenor,
  };
}
