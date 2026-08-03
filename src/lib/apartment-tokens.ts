// ---------------------------------------------------------------------------
// Apartment identity: (property_id, apartment_number, trappa)
// ---------------------------------------------------------------------------
// Apartment numbers repeat across stairwells, so the number alone does not
// identify a unit. The /felanmalan public form connects residents to their
// apartment on exactly this triple (see supabase-functions/submit-felanmalan.ts),
// which only works if every write path normalizes the parts identically —
// "1102"/"A" typed by an admin has to land byte-for-byte on "1102"/"A" typed by
// a resident. Every apartment_number and trappa input in the app must go
// through these two functions.

/** Digits only. Leading zeros are significant ("0203" ≠ "203"). */
export function normalizeApartmentNumber(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Letters only, uppercased. Stairwells are ALWAYS letters in this system —
 * never numbers — so digits are stripped rather than kept: a digit in this
 * field is a typo (usually the apartment number typed into the wrong box),
 * and dropping it is what stops that typo from minting a phantom apartment.
 * Spaces and punctuation go too, so "Tr. A" and "A" resolve to the same unit.
 * Swedish å/ä/ö are kept — they are letters.
 */
export function normalizeTrappa(value: string): string {
  return value.replace(/[^a-zA-ZåäöÅÄÖ]/g, "").toUpperCase();
}

export const TRAPPA_PLACEHOLDER = "T.ex. A";

/** Swedish message for the (property_id, apartment_number, trappa) unique index. */
export const DUPLICATE_APARTMENT_MESSAGE =
  "Det finns redan en lägenhet med detta nummer och denna trappa i fastigheten.";

/** True when a Supabase error is the apartment identity unique-constraint violation. */
export function isDuplicateApartmentError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  return e.code === "23505" || /apartments_property_number/.test(e.message ?? "");
}

// Suggestions only, not an enum — apartments.status is free text so a
// custom value typed here is saved as-is (see EditableSelect).
export const APARTMENT_STATUSES = ["Ledig", "Uthyrd", "Renovering", "Reserverad"] as const;

export const APARTMENT_STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  Uthyrd: { bg: "#e8f0d8", color: "#2E6B24" },
  Ledig: { bg: "#E8F5E4", color: "#3D8A30" },
  Renovering: { bg: "#fff3cd", color: "#856404" },
  Reserverad: { bg: "#ebebeb", color: "#555555" },
};
