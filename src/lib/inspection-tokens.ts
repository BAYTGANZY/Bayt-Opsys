// Must match the `inspection_type` enum in the DB exactly — an unlisted value
// 400s the insert/update with "invalid input value for enum inspection_type".
export const INSPECTION_TYPES = [
  { value: "ovk", label: "OVK (ventilationskontroll)" },
  { value: "sba", label: "Systematiskt brandskyddsarbete (SBA)" },
  { value: "hiss", label: "Hiss" },
  { value: "el", label: "El" },
  { value: "tak", label: "Tak" },
  { value: "fasad", label: "Fasad" },
  { value: "ventilation", label: "Ventilation" },
  { value: "radon", label: "Radon" },
  { value: "fukt", label: "Fukt" },
  { value: "ovrigt", label: "Övrigt" },
] as const;

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  INSPECTION_TYPES.map((t) => [t.value, t.label]),
);

export function inspectionTypeLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return TYPE_LABEL[value] ?? value;
}

/** Chip-/badge-etikett: samma namn som TYPE_LABEL, men utan den parentes som
 *  bara två typer bär. En filterchip står i en rad med 3–5 andra och måste
 *  vara ett ord — "OVK" är dessutom prefix i "OVK (ventilationskontroll)", så
 *  chipen och tabellcellen läser fortfarande som samma typ. Alla övriga typer
 *  är redan ettordiga och delas ordagrant med TYPE_LABEL: det finns bara en
 *  källa till besiktningstypernas namn, och den ligger i den här filen. */
const TYPE_SHORT_LABEL: Record<string, string> = {
  ovk: "OVK",
  sba: "SBA",
};

export function inspectionTypeShortLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return TYPE_SHORT_LABEL[value] ?? inspectionTypeLabel(value);
}
