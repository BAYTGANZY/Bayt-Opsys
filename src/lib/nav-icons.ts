/**
 * Menyikoner som saknas i Hugeicons-paketet, ritade i samma format som TEKNIK_NAV_ICON så att de
 * fungerar i <HugeiconsIcon>. Syftet: varje menyval har en egen ikon. Tidigare delade fyra
 * ekonomi-/projektval portföljikonen och tre personval samma gruppikon, vilket gjorde menyn
 * svårläst. 24x24, linjestil, samma streckbredd som övriga ikoner.
 */
function icon(...paths: string[]) {
  return paths.map((d, i) => [
    "path",
    { d, stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", fill: "none", key: String(i) },
  ]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NavIcon = any;

/** Mynt med dollartecken: Ekonomi & Avgift. */
export const EKONOMI_NAV_ICON: NavIcon = icon(
  "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  "M14.6 9.3C14.1 8.4 13.2 8 12 8c-1.5 0-2.6.7-2.6 1.9 0 2.6 5.2 1.4 5.2 4 0 1.2-1.2 2-2.7 2-1.2 0-2.2-.5-2.7-1.4",
  "M12 6.5V8M12 16v1.5",
);

/** Stapeldiagram: Ekonomi – översikt. */
export const EKONOMI_OVERSIKT_NAV_ICON: NavIcon = icon("M4 20V11M10 20V4M16 20v-7M2.5 20h19");

/** Skiftnyckel: Underhållsplan. */
export const UNDERHALL_NAV_ICON: NavIcon = icon(
  "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.2-.6-.6-2.2 2.3-2.5z",
);

/** Jordklot: Hemsidechatt (chatten på den publika sajten). */
export const HEMSIDA_NAV_ICON: NavIcon = icon(
  "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  "M3 12h18",
  "M12 3c2.5 2.5 3.8 5.5 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z",
);

/** Två pilar: Andrahand (överlåtelse). */
export const ANDRAHAND_NAV_ICON: NavIcon = icon("M7 7h13l-3-3M17 17H4l3 3");

/** Skyddshjälm: Entreprenörer. */
export const ENTREPRENOR_NAV_ICON: NavIcon = icon("M4 18h16", "M5.5 18v-2a6.5 6.5 0 0 1 13 0v2", "M10 9.5V6h4v3.5");

/** En person: Kontakter. */
export const KONTAKT_NAV_ICON: NavIcon = icon("M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4.5 20c0-3.3 3.4-6 7.5-6s7.5 2.7 7.5 6");
