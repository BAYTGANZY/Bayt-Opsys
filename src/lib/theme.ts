/**
 * BAYT:s delade designvärden. Tidigare stod färgerna som en egen `const C = {…}` i varje fil,
 * så en färgändring blev många ändringar och sidorna drev isär. Nya och rörda filer hämtar härifrån;
 * äldre sidor flyttas över i takt med att de ändå ändras. Inget här ändrar något utseende av sig själv.
 */
export const BRAND = {
  /** Mörkgrön: sidomeny, hemsidor, ikon. */
  dark: "#0D2B1E",
  /** Accentgrön: markeringar, hus i symbolen. */
  accent: "#5CB84A",
  /** Primärknapp. */
  primary: "#3D8A30",
  /** Guld: varning/uppmärksamhet och diagram. */
  gold: "#E8C464",
  /** Varm bakgrund på ljusa hemsidor. */
  beige: "#F6F1E7",
  /** Symbolens vita. */
  cream: "#FCF8F2",
} as const;

export const INK = { strong: "#0D2B1E", muted: "#6B7280", faint: "#9CA3AF" } as const;
export const LINE = { soft: "#E9EBE9", normal: "#E5E7EB", grid: "#E3E7E2" } as const;

/** Härledd status → färg. Samma uppsättning som prickarna i menyn och diagrammen. */
export const STATUS_COLOR = {
  forsenad: "#E5534B",
  bradskande: "#E8C464",
  pagaende: "#5CB84A",
  ny: "#7BB8E8",
  pausad: "#9AA7A0",
} as const;

export const RADIUS = { sm: 6, md: 10, lg: 14, pill: 999 } as const;
export const SHADOW = { card: "0 1px 2px rgba(13,43,30,0.06), 0 8px 24px -12px rgba(13,43,30,0.18)" } as const;

/** Minsta textstorlekar: styrelse och entreprenör läser ofta på mobil och i högre ålder. */
export const TEXT = { body: 16, small: 14, label: 12 } as const;
