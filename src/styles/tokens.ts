// BAYT brand tokens — refreshed palette.
export const COLORS = {
  sidebarTop: "#0D2B1E",
  sidebarBottom: "#0D2B1E",
  sidebarDark: "#0D2B1E",
  darkCard: "#112E20",
  activeBg: "rgba(92, 184, 74, 0.15)",
  accent: "#5CB84A",
  accentSoft: "#E8F5E4",
  accentDark: "#3D8A30",
  primary: "#0D2B1E",
  primaryHover: "#3D8A30",
  bg: "#FFFFFF",
  card: "#FFFFFF",
  subtle: "#F7F8F6",
  border: "#E5E7EB",
  secondary: "#6B7280",
  label: "#9CA3AF",
  text: "#1A1A1A",
  danger: "#DC2626",
  rowAlt: "#FFFFFF",
  rowHover: "#F7F8F6",
  statusNew: "#E07B35",
  statusPending: "#D4A017",
  statusDone: "#9CA3AF",
  statusUrgent: "#DC2626",
} as const;

export const TOKENS = {
  cardRadius: 10,
  cardShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
  modalShadow: "0 8px 24px rgba(0,0,0,0.12)",
  cardBorder: `1px solid ${COLORS.border}`,
  cardPadding: 24,
  inputRadius: 10,
  inputHeight: 40,
  inputFocusRing: "0 0 0 3px rgba(92,184,74,0.15)",
  badgeRadius: 6,
  buttonRadius: 6,
  buttonHeight: 40,
} as const;

export const cardStyle: React.CSSProperties = {
  background: COLORS.card,
  border: TOKENS.cardBorder,
  borderRadius: TOKENS.cardRadius,
  boxShadow: TOKENS.cardShadow,
  padding: TOKENS.cardPadding,
};
