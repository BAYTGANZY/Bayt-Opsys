export const CONTACT_TYPES = [
  "styrelse",
  "entreprenor",
  "leverantor",
  "ekonomisk_forvaltare",
  "forsakringsbolag",
  "jour",
  "lokalhyresgast",
  "ovrigt",
] as const;

export const CONTACT_TYPE_LABEL: Record<string, string> = {
  styrelse: "Styrelse",
  entreprenor: "Entreprenör",
  leverantor: "Leverantör",
  ekonomisk_forvaltare: "Ekonomisk förvaltare",
  forsakringsbolag: "Försäkringsbolag",
  jour: "Jour",
  lokalhyresgast: "Lokalhyresgäst",
  ovrigt: "Övrigt",
};

/**
 * Matching keys for the kontaktprofil's "Inskickade felanmälningar" heuristic:
 * an issue is considered submitted by a contact when the reporter's e-post or
 * telefon, normalized the same way on both sides, is equal. Heuristic, not an
 * identity — phone matching in particular is digits-only equality, so
 * "+46 70 …" and "070-…" do NOT match. Keep both normalizers here so the two
 * sides of the comparison can never drift apart.
 */

/** lower(trim(email)), or null when there is nothing to match on. */
export function normalizeEmail(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  return e || null;
}

/** Digits only, or null when there is nothing to match on. */
export function normalizePhoneDigits(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  return d || null;
}

export const CONTACT_TYPE_BADGE: Record<string, { bg: string; color: string }> = {
  styrelse: { bg: "#E8F5E4", color: "#3D8A30" },
  entreprenor: { bg: "#e8f0d8", color: "#2E6B24" },
  leverantor: { bg: "#FFFFFF", color: "#1a1a1a" },
  ekonomisk_forvaltare: { bg: "#ebebeb", color: "#555555" },
  forsakringsbolag: { bg: "#fff3cd", color: "#856404" },
  jour: { bg: "#fde8e8", color: "#DC2626" },
  lokalhyresgast: { bg: "#d1ecf1", color: "#0c5460" },
  ovrigt: { bg: "#f5f5f5", color: "#999999" },
};
