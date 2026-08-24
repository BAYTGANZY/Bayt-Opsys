import {
  deriveIssueStatus, deriveInspectionStatus, deriveProjectStatus, worstArendeStatus,
  type ArendeForStatus, type BesiktningForStatus, type ProjektForStatus,
} from "./issue-tokens";

export const OBJECT_TYPES = [
  { value: "hiss", label: "Hiss" },
  { value: "vind", label: "Vind" },
  { value: "miljorum", label: "Miljörum" },
  { value: "kallare", label: "Källare" },
  { value: "sba", label: "Systematiskt Brandskyddsarbete" },
  { value: "tvatt", label: "Tvättstuga" },
  { value: "forrad", label: "Förråd" },
  { value: "lokal", label: "Lokal" },
  { value: "parkering", label: "Parkering" },
] as const;

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  OBJECT_TYPES.map((t) => [t.value, t.label]),
);

// Rule: never render raw "sba" / "SBA" — always the full Swedish label.
export const OBJECT_TYPE_LABEL: Record<string, string> = new Proxy(TYPE_LABEL, {
  get(target, key: string) {
    if (typeof key !== "string") return undefined;
    const k = key.toLowerCase();
    if (k === "sba") return "Systematiskt Brandskyddsarbete";
    return target[k] ?? target[key];
  },
});

export function objectTypeLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const k = value.toLowerCase();
  if (k === "sba") return "Systematiskt Brandskyddsarbete";
  return TYPE_LABEL[k] ?? value;
}

// --- Object health status ---
// Objektstatus is never picked from a dropdown — same "derived, never chosen"
// rule as issues/inspections/projects (see issue-tokens.ts). An objekt's
// health is the worst (most urgent) härledd status among its non-avslutade
// felanmälningar, besiktningar and projekt; with none active it's fine.
// The ranking and the pick itself live in issue-tokens' `worstArendeStatus`,
// shared with the fastighets- and lägenhetsvyerna.

// Narrower than DerivedStatusKey: pausad/avbruten/avslutat never survive
// ARENDE_URGENCY_RANK, so they can never become an objekts worst.
export type ObjectHealthStatusKey = "forsenad" | "bradskande" | "pagaende" | "ny" | "ok";

export type ObjectHealthStatus = { key: ObjectHealthStatusKey; label: string; color: string; bg: string; reason: string };

// Same urgency scale as ARENDE_URGENCY_RANK, extended with "ok" at the bottom
// so callers can sort a mixed list of objekt (some active, some fine) by
// urgency without a separate branch for the OK case.
export const OBJECT_STATUS_SORT_RANK: Record<ObjectHealthStatusKey, number> = {
  forsenad: 4, bradskande: 3, pagaende: 2, ny: 1, ok: 0,
};

const OBJECT_OK_STATUS: ObjectHealthStatus = {
  key: "ok", label: "OK", color: "#3D8A30", bg: "#E8F5E4", reason: "Inga aktiva ärenden kopplade till objektet.",
};

export function deriveObjectStatus(arenden: {
  issues?: ArendeForStatus[];
  inspections?: BesiktningForStatus[];
  projects?: ProjektForStatus[];
}): ObjectHealthStatus {
  const { status: worst } = worstArendeStatus([
    ...(arenden.issues ?? []).map(deriveIssueStatus),
    ...(arenden.inspections ?? []).map(deriveInspectionStatus),
    ...(arenden.projects ?? []).map(deriveProjectStatus),
  ]);
  if (!worst) return OBJECT_OK_STATUS;
  // ARENDE_URGENCY_RANK only has entries for forsenad/bradskande/pagaende/ny,
  // so `worst` can never be pausad/avbruten/avslutat.
  return { key: worst.key as ObjectHealthStatusKey, label: worst.label, color: worst.color, bg: worst.bg, reason: worst.reason };
}
