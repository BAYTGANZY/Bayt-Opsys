export const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  medarbetare: "Medarbetare",
  styrelse: "Styrelse",
  entreprenor: "Entreprenör",
};

export const ROLE_BADGE: Record<string, { bg: string; color: string }> = {
  admin: { bg: "#0D2B1E", color: "#5CB84A" },
  medarbetare: { bg: "#DDEBFA", color: "#1F4E8C" },
  styrelse: { bg: "#e8f0d8", color: "#2E6B24" },
  entreprenor: { bg: "#ebebeb", color: "#555555" },
};
