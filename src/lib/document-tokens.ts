// ===========================================================================
// Dokumentkategorier — en definition.
//
// Listan låg tidigare i två handskrivna kopior: DocumentUploadControls.tsx
// (fastighetens uppladdningsväljare) och _authenticated.apartments.$id.tsx
// (lägenhetens). Kategorifiltret på dokumentlistorna gör dem till tre ytor som
// måste hålla ihop — ett chip som filtrerar på en kategori uppladdningsformen
// inte längre erbjuder är ett filter som aldrig kan ge en träff.
// ===========================================================================

export const DOC_CATEGORIES: readonly string[] = [
  "avtal",
  "protokoll",
  "ritningar",
  "forsakringar",
  "garantier",
  "offerter",
  "driftinstruktioner",
  "besiktningsprotokoll",
  "ovrigt",
];

/** Nycklarna är slugar utan diakriter (kolumnvärdet i databasen); etiketterna
 *  är den svenska texten som faktiskt ska stå i gränssnittet. */
export const DOC_CATEGORY_LABEL: Record<string, string> = {
  avtal: "Avtal",
  protokoll: "Protokoll",
  ritningar: "Ritningar",
  forsakringar: "Försäkringar",
  garantier: "Garantier",
  offerter: "Offerter",
  driftinstruktioner: "Driftinstruktioner",
  besiktningsprotokoll: "Besiktningsprotokoll",
  ovrigt: "Övrigt",
};

/** Okända värden (äldre import) visas som de är hellre än att döljas. */
export function documentCategoryLabel(c: string | null | undefined): string {
  if (!c) return "Utan kategori";
  return DOC_CATEGORY_LABEL[c] ?? c;
}
