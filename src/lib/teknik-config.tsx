// Teknik: sektioner och ikoner. Ikonerna är egna SVG:er (stroke = currentColor).

// Menyikon (blixt) i Hugeicons-format så den fungerar i HugeiconsIcon.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TEKNIK_NAV_ICON: any = [
  [
    "path",
    {
      d: "M13 3L5 14h6l-1 7 8-11h-6l1-7z",
      stroke: "currentColor",
      strokeWidth: "1.5",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      fill: "none",
      key: "0",
    },
  ],
];

export type TeknikSection = {
  key: string;
  label: string;
  kind: "checklist" | "link";
  href?: string;
};

export const TEKNIK_SECTIONS: TeknikSection[] = [
  { key: "ovk", label: "OVK", kind: "checklist" },
  { key: "ventilation", label: "Ventilation", kind: "checklist" },
  { key: "energi", label: "Energianalys", kind: "checklist" },
  { key: "belysning", label: "Belysning", kind: "checklist" },
  { key: "varme", label: "Värme", kind: "checklist" },
  { key: "vatten", label: "Vatten", kind: "checklist" },
  { key: "larm", label: "Larm", kind: "checklist" },
  { key: "dokument", label: "Dokument", kind: "link", href: "/dokument" },
  { key: "allmant", label: "Allmänt", kind: "checklist" },
];

export function TeknikIcon({ name, size = 34 }: { name: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "ovk":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="1.6" />
          {[0, 90, 180, 270].map((a) => (
            <path
              key={a}
              d="M12 10.4C10.4 7.6 10.4 4.6 12 3c1.6 1.6 1.6 4.6 0 7.4z"
              transform={`rotate(${a} 12 12)`}
            />
          ))}
        </svg>
      );
    case "ventilation":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="9" rx="2" />
          <path d="M7 9h10M7 16.5c0 1.2-.8 2-.8 3.5M12 16.5V20M17 16.5c0 1.2.8 2 .8 3.5" />
        </svg>
      );
    case "energi":
      return (
        <svg {...common}>
          <path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z" />
        </svg>
      );
    case "belysning":
      return (
        <svg {...common}>
          <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
        </svg>
      );
    case "varme":
      return (
        <svg {...common}>
          <path d="M10 4a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0V4z" />
          <path d="M12 9v7" />
        </svg>
      );
    case "vatten":
      return (
        <svg {...common}>
          <path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z" />
        </svg>
      );
    case "larm":
      return (
        <svg {...common}>
          <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case "dokument":
      return (
        <svg {...common}>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M4 8h9M17 8h3M4 16h3M11 16h9" />
          <path d="M15 6v4M9 14v4" />
        </svg>
      );
  }
}
