import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { homeForRole } from "@/lib/permissions";
import { useVisibleProperties } from "@/hooks/useVisibleProperties";
import { useMyContactId } from "@/hooks/useMyContactId";
import { useMyAssignedApartmentIds } from "@/hooks/useMyAssignedApartmentIds";

/**
 * Blocks a detail page when the signed-in role isn't scoped to that record.
 *
 * List pages being filtered is not enough — every detail page is reachable by
 * pasting its id into the URL. Rules:
 *   - admin       → always allowed
 *   - styrelse    → the record's building must be one of theirs
 *   - entreprenör → the record must be assigned to their linked contact; for an
 *                   apartment (which carries no assignment of its own) they must
 *                   hold an ärende in that apartment — pass `apartmentId`
 *
 * Pass `undefined` while the record is still loading so we don't redirect early.
 * This is UI-level defence; the database is the real boundary (see RLS).
 *
 * `assignedContactId` has THREE meaningful states and they must stay distinct:
 *   - a string   → assigned to that contact
 *   - null       → assigned to nobody, so nobody but admin/styrelse may open it
 *   - undefined  → we do not KNOW yet (still loading, or the read failed)
 * Callers must therefore write `data ? (data.assigned_contact_id ?? null) : undefined`
 * and never `data?.assigned_contact_id ?? null` — the latter turns a failed read
 * into "assigned to nobody" and evicts an entreprenör from their own ärende.
 * That single `??` is what made an assigned felanmälan bounce to an empty page.
 */
export function useRecordScopeGuard({
  propertyId,
  assignedContactId,
  apartmentId,
  loading,
  redirectTo,
}: {
  propertyId: string | null | undefined;
  assignedContactId?: string | null;
  /** Set on apartment pages so an entreprenör is scoped to assigned units. */
  apartmentId?: string | null;
  loading: boolean;
  /**
   * Defaults to the role's own home page. Don't pass a section grid for an
   * entreprenör — those are building pickers and stay empty until they have
   * work, which reads as "the app lost my ärende".
   */
  redirectTo?: string;
}) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const role = profile?.role;
  const { allowedIds, isLoading: scopeLoading } = useVisibleProperties();
  const { contactId, isEntreprenor } = useMyContactId();
  const { apartmentIds, isLoading: aptScopeLoading } = useMyAssignedApartmentIds();

  const ready =
    !loading && !scopeLoading && !aptScopeLoading &&
    (!isEntreprenor || contactId !== undefined);

  let denied = false;
  if (ready && role !== "admin") {
    if (isEntreprenor && assignedContactId !== undefined) {
      // Errand-level records: assignment is what grants access.
      denied = !contactId || assignedContactId !== contactId;
    } else if (isEntreprenor && apartmentId) {
      // Apartments have no assignment column, so entitlement comes from holding
      // an ärende in the unit. Building scope would be far too broad here.
      denied = !apartmentIds?.has(apartmentId);
    } else if (allowedIds !== null && propertyId !== undefined) {
      // Same three-state rule as assignedContactId: `null` means the record has
      // no building and cannot be scope-checked, so deny; `undefined` means the
      // record never arrived, so decide nothing and let the page show its own
      // "hittades inte". Denying on undefined would evict a user from a record
      // they own the moment a query hiccups.
      denied = !propertyId || !allowedIds.has(propertyId);
    }
  }

  const target = redirectTo ?? homeForRole(role);

  useEffect(() => {
    if (denied) navigate({ to: target, replace: true });
  }, [denied, navigate, target]);

  return { denied, checking: !ready };
}
