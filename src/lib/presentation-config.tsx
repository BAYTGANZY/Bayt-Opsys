// Fastighetspresentation: rutor och ikoner. Ikonerna är egna SVG:er (stroke = currentColor).

// Menyikon (bildskärm) i Hugeicons-format så den fungerar i HugeiconsIcon.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PRESENTATION_NAV_ICON: any = [
  [
    "path",
    {
      d: "M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z",
      stroke: "currentColor",
      strokeWidth: "1.5",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      fill: "none",
      key: "0",
    },
  ],
  [
    "path",
    {
      d: "M8 20h8M12 16v4",
      stroke: "currentColor",
      strokeWidth: "1.5",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      fill: "none",
      key: "1",
    },
  ],
];

export type PresentationTile = { key: string; label: string; href: string };

export const PRESENTATION_TILES: PresentationTile[] = [
  { key: "oversikt", label: "Översikt", href: "/fastigheter" },
  { key: "felanmalningar", label: "Felanmälningar", href: "/issues" },
  { key: "besiktningar", label: "Besiktningar", href: "/inspections" },
  { key: "projekt", label: "Projekt", href: "/projects" },
  { key: "teknik", label: "Teknik", href: "/teknik" },
  { key: "genomgang", label: "Genomgång av fastighet", href: "/genomgang-av-fastighet" },
  { key: "dokument", label: "Dokument", href: "/dokument" },
  { key: "loggbok", label: "Loggbok", href: "/loggbok" },
];

export const CUSTOM_ICON_CHOICES: Array<{ key: string; label: string }> = [
  { key: "note", label: "Anteckning" },
  { key: "star", label: "Stjärna" },
  { key: "tool", label: "Verktyg" },
  { key: "key", label: "Nyckel" },
  { key: "people", label: "Personer" },
  { key: "calendar", label: "Kalender" },
  { key: "chart", label: "Diagram" },
  { key: "camera", label: "Kamera" },
];

export function PresentationIcon({ name, size = 68 }: { name: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: size >= 48 ? 1 : 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "oversikt":
      return (
        <svg {...common}>
          <path d="M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M15 10h3a1 1 0 0 1 1 1v10M3 21h18" />
          <path d="M8 8h4M8 12h4M8 16h4" />
        </svg>
      );
    case "felanmalningar":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6M12 16.5v.01" />
        </svg>
      );
    case "besiktningar":
      return (
        <svg {...common}>
          <path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z" />
          <path d="M8 6H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2" />
          <path d="M9 14l2 2 4-4" />
        </svg>
      );
    case "projekt":
      return (
        <svg {...common}>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18" />
        </svg>
      );
    case "teknik":
      return (
        <svg {...common}>
          <path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z" />
        </svg>
      );
    case "genomgang":
      return (
        <svg {...common}>
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "dokument":
      return (
        <svg {...common}>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
        </svg>
      );
    case "loggbok":
      return (
        <svg {...common}>
          <path d="M12 6.5C10.5 5.3 8.2 4.8 5 5v13c3.2-.2 5.5.3 7 1.5 1.5-1.2 3.8-1.7 7-1.5V5c-3.200-.2-5.500.3-7 1.500z" />
          <path d="M12 6.5v13" />
        </svg>
      );
    case "star":
      return (
        <svg {...common}>
          <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9L3.500 9.700l5.900-.800L12 3.500z" />
        </svg>
      );
    case "tool":
      return (
        <svg {...common}>
          <path d="M14.5 6.5a4 4 0 0 0-5.200 5.100L4 17v3h3l5.400-5.300a4 4 0 0 0 5.100-5.200l-2.800 2.800-2.200-2.200 2.800-2.800z" />
        </svg>
      );
    case "key":
      return (
        <svg {...common}>
          <circle cx="8" cy="15" r="4" />
          <path d="M11 12l9-9M16 7l3 3M14 9l2 2" />
        </svg>
      );
    case "people":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3 20c0-3.300 2.700-6 6-6s6 2.700 6 6" />
          <path d="M16 5.200a3.200 3.200 0 0 1 0 5.600M18 14.300c1.800.8 3 2.600 3 4.700" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </svg>
      );
    case "camera":
      return (
        <svg {...common}>
          <path d="M4 8h3l1.500-2h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
          <circle cx="12" cy="13.500" r="3.500" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    default:
      // "note"
      return (
        <svg {...common}>
          <path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          <path d="M14 3v5h5M8.500 13h7M8.500 17h5" />
        </svg>
      );
  }
}
