import { Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { useAuth } from "@/lib/auth";
import { useFavorites } from "@/hooks/useFavorites";
import { allowedNavItems } from "@/components/AppShell";

/**
 * Snabbknappar överst på Start: en stor knapp per stjärnmarkerad sida.
 * Bara sidor rollen faktiskt får öppna visas — en gammal stjärna öppnar aldrig en dörr.
 */
export function FavoritesBar() {
  const { profile } = useAuth();
  const { routes } = useFavorites();
  const allowed = allowedNavItems(profile?.role);
  const items = routes.map((r) => allowed.find((i) => i.to === r)).filter((i): i is NonNullable<typeof i> => !!i);

  const ink = "#0D2B1E";
  const line = "#E6DFD0";

  return (
    <section aria-label="Favoriter">
      {items.length === 0 ? (
        <div
          style={{
            border: `1px dashed ${line}`,
            borderRadius: 14,
            padding: "14px 18px",
            color: "#6B7A70",
            fontSize: 18,
            lineHeight: 1.5,
          }}
        >
          Tryck på stjärnan vid en sida i menyn så får du en snabbknapp till den här.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                minHeight: 72,
                padding: "12px 16px",
                background: "#FFFDF8",
                border: `1px solid ${line}`,
                borderRadius: 14,
                boxShadow: "0 1px 2px rgba(13,43,30,0.04), 0 8px 24px -12px rgba(13,43,30,0.12)",
                color: ink,
                textDecoration: "none",
                fontSize: 20,
                fontWeight: 600,
              }}
            >
              <HugeiconsIcon icon={item.icon} size={28} />
              <span style={{ flex: 1, minWidth: 0 }}>{item.label}</span>
              <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden="true" fill="#5CB84A" stroke="#5CB84A" strokeWidth={1.7} strokeLinejoin="round">
                <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
              </svg>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
