export const OBJECT_TYPES = [
  { value: "hiss", label: "Hiss" },
  { value: "vind", label: "Vind" },
  { value: "miljorum", label: "Miljörum" },
  { value: "kallare", label: "Källare" },
  { value: "sba", label: "Systematiskt Brandskyddsarbete" },
  { value: "tvatt", label: "Tvättstuga" },
  { value: "forrad", label: "Förråd" },
  { value: "lokal", label: "Lokal" },
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
export type ObjectStatus = "ok" | "behover_tillsyn" | "ur_funktion";

export const OBJECT_STATUSES: { value: ObjectStatus; label: string; color: string }[] = [
  { value: "ok", label: "OK", color: "#3D8A30" },
  { value: "behover_tillsyn", label: "Behöver tillsyn", color: "#D97706" },
  { value: "ur_funktion", label: "Ur funktion", color: "#DC2626" },
];

export const OBJECT_STATUS_META: Record<string, { label: string; color: string }> =
  Object.fromEntries(OBJECT_STATUSES.map((s) => [s.value, { label: s.label, color: s.color }]));

export function objectStatusMeta(value: string | null | undefined) {
  return (value && OBJECT_STATUS_META[value]) || { label: "—", color: "#9CA3AF" };
}
