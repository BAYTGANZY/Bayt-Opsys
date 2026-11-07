import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DashboardSquare01Icon,
  Building02Icon,
  DoorOpenIcon,
  AlertCircleIcon,
  ClipboardCheckIcon,
  File02Icon,
  UserGroupIcon,
  Briefcase01Icon,
  BookOpen01Icon,
  Settings01Icon,
  Menu01Icon,
  Logout01Icon,
  Cancel01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowLeft01Icon,
  GridViewIcon,
  CalendarCheckIn01Icon,
  Chatting01Icon,
  EyeIcon,
} from "@hugeicons/core-free-icons";
import { useAuth } from "@/lib/auth";
import { canAccess } from "@/lib/permissions";
import { GlobalSearch } from "@/components/GlobalSearch";
import { PropertyContextNav } from "@/components/ContextNav";
import { NotificationBell, NotificationToasts } from "@/components/NotificationCenter";
import { useSwipeBack } from "@/hooks/useSwipeBack";
import { useMyArendeDots, type ArendeDot } from "@/hooks/useMyArendeDots";
import { StatusDot } from "@/components/StatusDot";
import { useMyArenden } from "@/hooks/useMyArenden";
import { TEKNIK_NAV_ICON } from "@/lib/teknik-config";
import { PRESENTATION_NAV_ICON } from "@/lib/presentation-config";
import { useWebchatBadge } from "@/hooks/useWebchatBadge";
import { useFavorites } from "@/hooks/useFavorites";


type SubItem = { to: string; label: string };
type NavItem = {
  to: string;
  label: string;
  icon: typeof DashboardSquare01Icon;
  children?: SubItem[];
};
type NavSection = { label?: string; items: NavItem[] };

const SECTIONS: NavSection[] = [
  {
    items: [
      { to: "/styrelse", label: "Översikt", icon: GridViewIcon },
      { to: "/dag-rapport", label: "Dag Rapport", icon: CalendarCheckIn01Icon },
      { to: "/dashboard", label: "Start", icon: DashboardSquare01Icon },
      { to: "/chatt", label: "Chatt", icon: Chatting01Icon },
      { to: "/hemsidechatt", label: "Hemsidechatt", icon: Chatting01Icon },
    ],
  },
  {
    label: "Fastigheter",
    items: [
      { to: "/fastigheter", label: "Fastigheter", icon: Building02Icon },
      { to: "/apartments", label: "Lägenheter", icon: DoorOpenIcon },
      { to: "/objects", label: "Objekt", icon: Briefcase01Icon },
    ],
  },
  {
    label: "Drift",
    items: [
      { to: "/issues", label: "Felanmälningar", icon: AlertCircleIcon },
      { to: "/inspections", label: "Besiktningar", icon: ClipboardCheckIcon },
      { to: "/projects", label: "Projekt", icon: Briefcase01Icon },
      { to: "/underhallsplan", label: "Underhållsplan", icon: CalendarCheckIn01Icon },
      { to: "/ekonomi", label: "Ekonomi & Avgift", icon: Briefcase01Icon },
      { to: "/ekonomi-oversikt", label: "Ekonomi – översikt", icon: Briefcase01Icon },
      { to: "/andrahand", label: "Andrahand", icon: UserGroupIcon },
      { to: "/entreprenorer", label: "Entreprenörer", icon: UserGroupIcon },
      { to: "/genomgang-av-fastighet", label: "Genomgång av fastighet", icon: EyeIcon },
      { to: "/teknik", label: "Teknik", icon: TEKNIK_NAV_ICON },
      { to: "/fastighetspresentation", label: "Fastighetspresentation", icon: PRESENTATION_NAV_ICON },
    ],
  },
  {
    label: "Arkiv",
    items: [
      { to: "/dokument", label: "Dokument", icon: File02Icon },
      { to: "/contacts", label: "Kontakter", icon: UserGroupIcon },
      { to: "/loggbok", label: "Loggbok", icon: BookOpen01Icon },
    ],
  },
  {
    label: "System",
    items: [{ to: "/installningar", label: "Inställningar", icon: Settings01Icon }],
  },
];

const ALL_ITEMS = SECTIONS.flatMap((s) => s.items);

/**
 * Ljust tema (2026-11): beige bakgrund, ljus meny, mörkgrön text. Ljusgrönt är till
 * för stjärnor och detaljer — aldrig som textfärg på beige, där når det inte kontrast.
 */
const T = {
  bg: "#F6F1E7",
  side: "#FBF8F1",
  card: "#FFFDF8",
  line: "#E6DFD0",
  ink: "#0D2B1E",
  muted: "#6B7A70",
  star: "#5CB84A",
  btn: "#3D8A30",
  shadow: "0 1px 2px rgba(13,43,30,0.04), 0 8px 24px -12px rgba(13,43,30,0.12)",
};

/** Stjärna för favoriter. Ifylld ljusgrön = favorit, kontur = inte. */
function StarSvg({ on, size = 18 }: { on: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill={on ? T.star : "none"} stroke={on ? T.star : "#B3AD9F"} strokeWidth={1.7} strokeLinejoin="round">
      <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
    </svg>
  );
}

function FavStarButton({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      aria-label={on ? `Ta bort ${label} från favoriter` : `Lägg till ${label} i favoriter`}
      aria-pressed={on}
      title={on ? "Ta bort från favoriter" : "Lägg till i favoriter"}
      style={{ background: "transparent", border: "none", cursor: "pointer", padding: "0 12px", display: "flex", alignItems: "center", justifyContent: "center", minWidth: 44 }}
    >
      <StarSvg on={on} size={22} />
    </button>
  );
}

const BOTTOM_NAV: NavItem[] = [
  { to: "/dashboard", label: "Start", icon: DashboardSquare01Icon },
  { to: "/start", label: "Översikt", icon: GridViewIcon },
  { to: "/installningar", label: "Inställn.", icon: Settings01Icon },
];

/** Menyns storlek: tre steg, väljs med pilarna på menyns kant och minns per webbläsare. */
type NavSize = "small" | "normal" | "large";
const NAV_SIZES: Record<NavSize, { width: number; font: number; icon: number; padY: number; minH: number; head: number; label: number }> = {
  small: { width: 290, font: 17, icon: 22, padY: 11, minH: 48, head: 17, label: 13 },
  normal: { width: 340, font: 19, icon: 25, padY: 13, minH: 54, head: 19, label: 14 },
  large: { width: 400, font: 22, icon: 29, padY: 15, minH: 62, head: 22, label: 16 },
};
const NAV_ORDER: NavSize[] = ["small", "normal", "large"];

/** Sidor rollen får öppna — används av favoritknapparna på Start. */
export function allowedNavItems(role: string | null | undefined): NavItem[] {
  return sectionsForRole(role).flatMap((s) => s.items);
}

/** Drop links this role can't reach, then drop sections left empty. */
function sectionsForRole(role: string | null | undefined): NavSection[] {
  return SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => canAccess(role, i.to)) })).filter(
    (s) => s.items.length > 0,
  );
}
   const ENTREPRENOR_HIDDEN = new Set(["/fastigheter", "/apartments", "/objects", "/loggbok"]);
   const ERRAND_KIND_FOR_ROUTE: Record<string, string> = {
     "/issues": "issue",
     "/inspections": "inspection",
     "/projects": "project",
   };

   /** Entreprenör: bara ärendetyper hen faktiskt har något tilldelat i. */
   function sectionsForEntreprenor(sections: NavSection[], kinds: Set<string>): NavSection[] {
     return sections
       .map((s) => ({
         ...s,
         items: s.items.filter((i) => {
           if (ENTREPRENOR_HIDDEN.has(i.to)) return false;
           const kind = ERRAND_KIND_FOR_ROUTE[i.to];
           return kind ? kinds.has(kind) : true;
         }),
       }))
       .filter((s) => s.items.length > 0);
   }

type Breakpoint = "mobile" | "mini" | "full";

function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>("full");
  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      setBp(w < 768 ? "mobile" : w < 1024 ? "mini" : "full");
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);
  return bp;
}

function getInitial(name: string | null | undefined): string {
  if (!name) return "?";
  return name.trim().charAt(0).toUpperCase();
}

/** Profilbild med initial som fallback (samma bild som i chatten). */
function UserAvatar({ url, initial, size = 36 }: { url: string | null; initial: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const base = {
    width: size,
    height: size,
    borderRadius: "50%",
    flexShrink: 0,
    display: "block",
  } as const;
  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        onError={() => setFailed(true)}
        style={{ ...base, objectFit: "cover" }}
      />
    );
  }
  return (
    <div
      style={{
        ...base,
        background: "#5CB84A",
        color: "#0D2B1E",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: Math.round(size * 0.39),
      }}
    >
      {initial}
    </div>
  );
}

/**
 * Statusprick i sidofältet: sektionen har ärenden tilldelade den inloggade
 * entreprenören. Samma <StatusDot> som fastighetskorten och sektionsknapparna,
 * så färg och pulsering betyder samma sak överallt — här bara inramad i mörkt
 * så den syns mot sidofältet, aktiv rad eller inte.
 */
function NavDot({ dot, mini = false }: { dot: ArendeDot; mini?: boolean }) {
  return (
    <span
      role="status"
      title={dot.title}
      aria-label={dot.title}
      style={{
        display: "inline-flex",
        flexShrink: 0,
        borderRadius: "50%",
        boxShadow: `0 0 0 2px ${T.side}`,
        ...(mini
          ? { position: "absolute" as const, top: 12, right: 13 }
          : { marginLeft: 6 }),
      }}
    >
      <StatusDot deadline={dot.earliestDueDate} unviewedCount={dot.count} size={8} />
    </span>
  );
}

/** Röd räknare vid Hemsidechatt: antal samtal som väntar på personalens svar. */
function CountBadge({ n, mini = false }: { n: number; mini?: boolean }) {
  return (
    <span
      role="status"
      title={`${n} samtal behöver svar`}
      aria-label={`${n} samtal behöver svar`}
      style={{
        background: "#C2334D",
        color: "#fff",
        fontSize: 11,
        fontWeight: 700,
        borderRadius: 999,
        minWidth: 18,
        height: 18,
        padding: "0 5px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        ...(mini ? { position: "absolute" as const, top: 6, right: 6 } : { marginLeft: 6 }),
      }}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function AppShell() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const bp = useBreakpoint();
  const isMobile = bp === "mobile";
  const isMini = bp === "mini";

  const isItemActive = (to: string) =>
    pathname === to || pathname.startsWith(to + "/");

  const initialExpanded: Record<string, boolean> = {};
  ALL_ITEMS.forEach((i) => {
    if (i.children && isItemActive(i.to)) initialExpanded[i.to] = true;
  });
  const [expanded, setExpanded] = useState<Record<string, boolean>>(initialExpanded);
  const toggle = (to: string) =>
    setExpanded((e) => ({ ...e, [to]: !e[to] }));

  // Hopfällda grupper (och Favoriter) minns man mellan besök, per webbläsare.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(window.localStorage.getItem("bayt.nav.collapsed") ?? "{}") as Record<string, boolean>;
    } catch {
      return {};
    }
  });
  const toggleCollapsed = (key: string) =>
    setCollapsed((c) => {
      const next = { ...c, [key]: !c[key] };
      try {
        window.localStorage.setItem("bayt.nav.collapsed", JSON.stringify(next));
      } catch {
        /* lagring blockerad — gruppen är hopfälld bara tills sidan laddas om */
      }
      return next;
    });
  const { routes: favRoutes, toggle: toggleFavorite, isFavorite } = useFavorites();

  const [navSize, setNavSize] = useState<NavSize>(() => {
    try {
      const v = window.localStorage.getItem("bayt.nav.size");
      return v === "small" || v === "large" ? v : "normal";
    } catch {
      return "normal";
    }
  });
  const stepNavSize = (dir: -1 | 1) =>
    setNavSize((cur) => {
      const next = NAV_ORDER[Math.min(NAV_ORDER.length - 1, Math.max(0, NAV_ORDER.indexOf(cur) + dir))];
      try {
        window.localStorage.setItem("bayt.nav.size", next);
      } catch {
        /* lagring blockerad — storleken gäller tills sidan laddas om */
      }
      return next;
    });
  const NS = NAV_SIZES[navSize];

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  const showOverlaySidebar = isMobile && open;
  const showFullSidebar = bp === "full" || showOverlaySidebar;
  const showMiniSidebar = isMini && !open;

  const initial = getInitial(profile?.full_name);
  // Loggan leder till rollens startsida: entreprenör → Snabbåtkomst, övriga → Översikt.
  // Loggan: på Start (/dashboard) går den till Översikt (/styrelse), och överallt annars till Start.
  // Styrelse har ingen Start-sida, de landar på Översikt; entreprenör på Mina uppdrag.
  const homeTo =
    profile?.role === "entreprenor"
      ? "/mina-uppdrag"
      : profile?.role === "admin" && pathname !== "/dashboard"
        ? "/dashboard"
        : "/styrelse";
  const sections = sectionsForRole(profile?.role);
  // Bara sådant rollen faktiskt får öppna — en gammal stjärna får aldrig öppna en dörr.
  const allowedItems = sections.flatMap((s) => s.items);
  const favItems = favRoutes
    .map((r) => allowedItems.find((i) => i.to === r))
    .filter((i): i is NavItem => !!i);
  // Tom karta för alla utom entreprenör — ingen extra fråga körs för dem.
  const arendeDots = useMyArendeDots();
  // Antal hemsidechatt-samtal som väntar på svar (bara admin).
  const webchatCount = useWebchatBadge(profile?.role === "admin");
  // Mittenknappen ("Start") går till rollens egen startsida.
  const bottomNav = BOTTOM_NAV.map((i) =>
    i.to === "/start" ? { ...i, to: profile?.role === "entreprenor" ? "/mina-uppdrag" : "/styrelse", label: profile?.role === "entreprenor" ? "Start" : i.label } : i,
  ).filter((i) => i.icon === GridViewIcon || canAccess(profile?.role, i.to));

  return (
    <div
      className="bayt-app"
      style={{
        display: "flex",
        height: "100vh",
        width: "100%",
        maxWidth: "100vw",
        overflowX: "hidden",
        background: T.bg,
        padding: isMobile ? 0 : 12,
        gap: isMobile ? 0 : 12,
        fontFamily: "Inter, system-ui, sans-serif",
        color: T.ink,
      }}
    >
      {/* Mobile overlay backdrop */}
      {isMobile && open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 40,
          }}
        />
      )}

      {/* Mini sidebar (768–1023px) */}
      {showMiniSidebar && (
        <aside
          style={{
            width: 64,
            background: T.side,
            position: "sticky",
            top: 12,
            alignSelf: "flex-start",
            height: "calc(100vh - 24px)",
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            borderRadius: 20,
            overflow: "hidden",
            boxShadow: T.shadow,
            border: `1px solid ${T.line}`,
          }}
        >
          <Link
            to={homeTo}
            title="Till startsidan"
            aria-label="Till startsidan"
            style={{
              height: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              padding: "0 10px",
              textDecoration: "none",
            }}
          >
            <img src={`${import.meta.env.BASE_URL}assets/bayt-icon-dark.png`} alt="BAYT" style={{ height: 28, width: "auto", display: "block" }} />
          </Link>
          <nav
            className="bayt-sidebar-nav"
            style={{ flex: 1, paddingTop: 8, width: "100%", overflowY: "auto" }}
          >
            {sections.flatMap((s) => s.items).map((item) => {
              const active = isItemActive(item.to);
              const dot = arendeDots[item.to];
              return (
                <div key={item.to} className="bayt-mini-group">
                  <Link
                    to={item.to}
                    title={dot ? `${item.label} — ${dot.title}` : item.label}
                    className="bayt-nav-item"
                    style={{
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: 48,
                      color: active ? "#fff" : T.ink,
                      background: active ? T.ink : "transparent",
                      borderRadius: 10,
                      margin: "2px 8px",
                      textDecoration: "none",
                    }}
                  >
                    <HugeiconsIcon icon={item.icon} size={20} />
                    {dot && <NavDot dot={dot} mini />}
                    {item.to === "/hemsidechatt" && webchatCount > 0 && <CountBadge n={webchatCount} mini />}
                  </Link>
                  {item.children && (
                    <div className="bayt-mini-flyout">
                      {item.children.map((child) => {
                        const childActive = pathname === child.to;
                        return (
                          <Link
                            key={child.to}
                            to={child.to}
                            style={{
                              display: "block",
                              padding: "8px 10px",
                              borderRadius: 6,
                              color: childActive
                                ? "#5CB84A"
                                : "rgba(255,255,255,0.85)",
                              background: childActive ? "rgba(92,184,74,0.15)" : "transparent",
                              textDecoration: "none",
                              fontSize: 13,
                              fontWeight: childActive ? 600 : 500,
                            }}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
          <button
            onClick={handleLogout}
            aria-label="Logga ut"
            title="Logga ut"
            style={{
              width: "100%",
              height: 56,
              background: "transparent",
              border: "none",
              color: T.muted,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <HugeiconsIcon icon={Logout01Icon} size={18} />
          </button>
        </aside>
      )}

      {/* Full sidebar (≥1024px, or mobile overlay) */}
      {showFullSidebar && (
        <aside
          style={{
            width: isMobile ? "min(86vw, 320px)" : NS.width,
            transition: "width 0.2s ease",
            background: T.side,
            position: isMobile ? "fixed" : "sticky",
            top: isMobile ? 0 : 12,
            left: isMobile ? 0 : undefined,
            alignSelf: isMobile ? undefined : "flex-start",
            height: isMobile ? "100vh" : "calc(100vh - 24px)",
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            borderRadius: isMobile ? 0 : 20,
            boxShadow: isMobile ? "none" : T.shadow,
            border: `1px solid ${T.line}`,
          }}
        >
          {!isMobile && (
            <div
              style={{
                position: "absolute",
                right: -15,
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 60,
                display: "flex",
                flexDirection: "column",
                background: T.card,
                border: `1px solid ${T.line}`,
                borderRadius: 999,
                boxShadow: T.shadow,
                overflow: "hidden",
              }}
            >
              {([
                { dir: 1 as const, icon: ArrowRight01Icon, label: "Gör menyn större", off: navSize === "large" },
                { dir: -1 as const, icon: ArrowLeft01Icon, label: "Gör menyn mindre", off: navSize === "small" },
              ]).map((b) => (
                <button
                  key={b.dir}
                  type="button"
                  onClick={() => stepNavSize(b.dir)}
                  disabled={b.off}
                  aria-label={b.label}
                  title={b.label}
                  style={{
                    width: 30,
                    height: 34,
                    background: "transparent",
                    border: "none",
                    cursor: b.off ? "default" : "pointer",
                    color: T.ink,
                    opacity: b.off ? 0.25 : 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <HugeiconsIcon icon={b.icon} size={16} />
                </button>
              ))}
            </div>
          )}
          <div
            style={{
              padding: "16px 20px 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              gap: 8,
            }}
          >
            <Link
              to={homeTo}
              onClick={() => setOpen(false)}
              title="Till startsidan"
              aria-label="Till startsidan"
              style={{ display: "inline-flex", textDecoration: "none" }}
            >
              <img src={`${import.meta.env.BASE_URL}assets/bayt-logo-green.png`} alt="BAYT" style={{ height: navSize === "small" ? 38 : navSize === "normal" ? 44 : 52, width: "auto", display: "block" }} />
            </Link>
            {isMobile && (
              <button
                onClick={() => setOpen(false)}
                aria-label="Stäng meny"
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: T.ink,
                  cursor: "pointer",
                  padding: 8,
                  minWidth: 40,
                  minHeight: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <HugeiconsIcon icon={Cancel01Icon} size={20} />
              </button>
            )}
          </div>
          <nav
            className="bayt-sidebar-nav"
            style={{ flex: 1, paddingTop: 4, paddingBottom: 12, overflowY: "auto" }}
          >
            <PropertyContextNav onNavigate={() => setOpen(false)} />
            {/* Favoriter: sidor man stjärnmarkerat, alltid överst. */}
            <div style={{ marginBottom: 6 }}>
              <button
                type="button"
                onClick={() => toggleCollapsed("__fav")}
                aria-expanded={!collapsed["__fav"]}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", cursor: "pointer", padding: "10px 22px 6px", color: T.ink, fontFamily: "inherit", fontSize: NS.head, fontWeight: 700, textAlign: "left" }}
              >
                <StarSvg on size={NS.icon} />
                <span style={{ flex: 1 }}>Favoriter{favItems.length > 0 ? ` (${favItems.length})` : ""}</span>
                <HugeiconsIcon icon={collapsed["__fav"] ? ArrowDown01Icon : ArrowRight01Icon} size={12} style={{ transform: collapsed["__fav"] ? "none" : "rotate(-90deg)", opacity: 0.6 }} />
              </button>
              {!collapsed["__fav"] && favItems.length === 0 && (
                <div style={{ padding: "2px 22px 8px", fontSize: NS.font - 2, color: T.muted, lineHeight: 1.5 }}>
                  Tryck på stjärnan vid en sida så hamnar den här.
                </div>
              )}
              {!collapsed["__fav"] &&
                favItems.map((item) => {
                  const active = isItemActive(item.to);
                  const dot = arendeDots[item.to];
                  return (
                    <div key={item.to} className="bayt-nav-item" style={{ display: "flex", alignItems: "stretch", background: active ? T.ink : "transparent", borderRadius: 10, margin: "2px 10px" }}>
                      <Link
                        to={item.to}
                        onClick={() => setOpen(false)}
                        style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, padding: `${NS.padY}px 8px ${NS.padY}px 12px`, color: active ? "#fff" : T.ink, textDecoration: "none", fontSize: NS.font, fontWeight: active ? 600 : 500, minHeight: NS.minH }}
                      >
                        <HugeiconsIcon icon={item.icon} size={NS.icon} />
                        <span style={{ flex: 1 }}>{item.label}</span>
                        {dot && <NavDot dot={dot} />}
                      </Link>
                      <FavStarButton on label={item.label} onToggle={() => toggleFavorite(item.to)} />
                    </div>
                  );
                })}
              <div style={{ borderBottom: `1px solid ${T.line}`, margin: "8px 20px 2px" }} />
            </div>
            {sections.map((section, sIdx) => (

              <div key={section.label ?? sIdx} style={{ marginBottom: 8 }}>
                {section.label && (
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(section.label!)}
                    aria-expanded={!collapsed[section.label]}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      padding: "14px 22px 6px",
                      fontFamily: "inherit",
                      fontSize: NS.label,
                      fontWeight: 700,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: T.muted,
                    }}
                  >
                    <span>{section.label}</span>
                    <HugeiconsIcon icon={collapsed[section.label] ? ArrowDown01Icon : ArrowRight01Icon} size={12} style={{ transform: collapsed[section.label] ? "none" : "rotate(-90deg)", opacity: 0.7 }} />
                  </button>
                )}
                {(section.label && collapsed[section.label] ? [] : section.items).map((item) => {
                  const active = isItemActive(item.to);
                  const hasChildren = !!item.children?.length;
                  const isOpen = !!expanded[item.to];
                  const dot = arendeDots[item.to];

                  return (
                    <div key={item.to} className="bayt-full-group">
                      <div
                        className="bayt-nav-item"
                        style={{
                          display: "flex",
                          alignItems: "stretch",
                          background: active && !hasChildren ? T.ink : "transparent",
                          borderRadius: 10,
                          margin: "2px 10px",
                        }}
                      >
                        <Link
                          to={item.to}
                          onClick={() => setOpen(false)}
                          style={{
                            flex: 1,
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            padding: `${NS.padY}px 8px ${NS.padY}px 12px`,
                            color: active && !hasChildren ? "#fff" : T.ink,
                            textDecoration: "none",
                            fontSize: NS.font,
                            fontWeight: active ? 600 : 500,
                            minHeight: NS.minH,
                          }}
                        >
                          <HugeiconsIcon icon={item.icon} size={NS.icon} />
                          <span style={{ flex: 1 }}>{item.label}</span>
                          {dot && <NavDot dot={dot} />}
                          {item.to === "/hemsidechatt" && webchatCount > 0 && <CountBadge n={webchatCount} />}
                          {!isMobile && hasChildren && (
                            <HugeiconsIcon
                              icon={ArrowRight01Icon}
                              size={14}
                              className="bayt-full-chevron"
                              style={{
                                opacity: 0.6,
                                transition: "transform 0.25s ease, opacity 0.25s ease",
                              }}
                            />
                          )}
                        </Link>
                        <FavStarButton on={isFavorite(item.to)} label={item.label} onToggle={() => toggleFavorite(item.to)} />
                        {isMobile && hasChildren && (
                          <button
                            type="button"
                            onClick={() => toggle(item.to)}
                            aria-label={isOpen ? "Fäll ihop" : "Expandera"}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "rgba(255,255,255,0.6)",
                              cursor: "pointer",
                              padding: "0 14px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <HugeiconsIcon
                              icon={isOpen ? ArrowDown01Icon : ArrowRight01Icon}
                              size={14}
                            />
                          </button>
                        )}
                      </div>
                      {!isMobile && hasChildren && (
                        <div className="bayt-full-flyout">
                          {item.children!.map((child) => {
                            const childActive = pathname === child.to;
                            return (
                              <Link
                                key={child.to}
                                to={child.to}
                                onClick={() => setOpen(false)}
                                style={{
                                  display: "block",
                                  padding: "8px 10px",
                                  borderRadius: 6,
                                  color: childActive
                                    ? "#ffffff"
                                    : "rgba(255,255,255,0.85)",
                                  background: childActive ? "rgba(92,184,74,0.15)" : "transparent",
                                  textDecoration: "none",
                                  fontSize: 13,
                                  fontWeight: childActive ? 600 : 500,
                                }}
                              >
                                {child.label}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                      {isMobile && hasChildren && isOpen && (
                        <div
                          style={{
                            paddingLeft: 30,
                            marginLeft: 18,
                            borderLeft: "1px solid rgba(255,255,255,0.1)",
                            marginTop: 2,
                            marginBottom: 4,
                          }}
                        >
                          {item.children!.map((child) => {
                            const childActive = pathname === child.to;
                            return (
                              <Link
                                key={child.to}
                                to={child.to}
                                onClick={() => setOpen(false)}
                                style={{
                                  display: "block",
                                  padding: "7px 12px",
                                  color: childActive
                                    ? "#ffffff"
                                    : "rgba(255,255,255,0.65)",
                                  background: childActive
                                    ? "rgba(92,184,74,0.15)"
                                    : "transparent",
                                  borderRadius: 6,
                                  textDecoration: "none",
                                  fontSize: 13,
                                  fontWeight: childActive ? 600 : 500,
                                }}
                              >
                                {child.label}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </nav>
          {/* Profile footer */}
          <div
            style={{
              borderTop: `1px solid ${T.line}`,
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Link
              to="/installningar"
              onClick={() => setOpen(false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flex: 1,
                minWidth: 0,
                textDecoration: "none",
                color: T.ink,
              }}
            >
              <UserAvatar url={profile?.avatar_url ?? null} initial={initial} size={36} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: NS.font - 3,
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {profile?.full_name ?? "—"}
                </div>
                <div
                  style={{
                    fontSize: NS.label - 2,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: T.muted,
                  }}
                >
                  {profile?.role ?? "användare"}
                </div>
              </div>
            </Link>
            <button
              onClick={handleLogout}
              aria-label="Logga ut"
              title="Logga ut"
              style={{
                background: "transparent",
                border: "none",
                color: T.muted,
                cursor: "pointer",
                padding: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <HugeiconsIcon icon={Logout01Icon} size={18} />
            </button>
          </div>
        </aside>
      )}

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          gap: isMobile ? 0 : 20,
        }}
      >
        {/* Topbar */}
        <header
          style={{
            height: 56,
            background: T.bg,
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            gap: 12,
            position: "sticky",
            top: isMobile ? 0 : 12,
            zIndex: 30,
            borderRadius: isMobile ? 0 : 16,
            boxShadow: "none",
            border: "none",
          }}
        >
          {isMobile && (
            <button
              onClick={() => setOpen(true)}
              aria-label="Öppna meny"
              style={{
                background: "transparent",
                border: "none",
                color: T.ink,
                cursor: "pointer",
                padding: 8,
                minWidth: 44,
                minHeight: 44,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <HugeiconsIcon icon={Menu01Icon} size={22} />
            </button>
          )}

          {/* Location is already shown on the page itself (Tillbaka-till link + breadcrumb),
              so the top bar no longer repeats it — this spacer just preserves the
              right-alignment of search/bell/avatar. */}
          <div style={{ flex: 1 }} />

          {/* Global search */}
          {!isMobile && <GlobalSearch />}

          <NotificationBell isMobile={isMobile} />

          <AvatarMenu initial={initial} avatarUrl={profile?.avatar_url ?? null} fullName={profile?.full_name ?? null} role={profile?.role ?? null} onLogout={handleLogout} />
        </header>

        {/* Slide-down popups for incoming chat messages, anchored under the top bar. */}
        <NotificationToasts isMobile={isMobile} />

        <MainWithSwipe isMobile={isMobile} />


        {/* Mobile bottom nav */}
        {isMobile && (
          <nav
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              height: 64,
              background: T.side,
              borderTop: `1px solid ${T.line}`,
              display: "flex",
              alignItems: "stretch",
              zIndex: 45,
            }}
          >
            {bottomNav.map((item) => {
              const active = isItemActive(item.to);
              const isStart = item.icon === GridViewIcon;
              if (isStart) {
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      textDecoration: "none",
                      color: T.ink,
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: -22,
                        width: 56,
                        height: 56,
                        borderRadius: "50%",
                        background: "#5CB84A",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 6px 16px rgba(0,0,0,0.3)",
                        border: `4px solid ${T.side}`,
                      }}
                    >
                      <HugeiconsIcon icon={item.icon} size={26} color="#FFFFFF" />
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, marginTop: 36 }}>{item.label}</span>
                  </Link>
                );
              }
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                    textDecoration: "none",
                    color: active ? T.btn : T.muted,
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                >
                  <HugeiconsIcon icon={item.icon} size={20} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}

function MainWithSwipe({ isMobile }: { isMobile: boolean }) {
  const ref = useSwipeBack(isMobile);
  return (
    <main
      ref={ref as React.RefObject<HTMLDivElement>}
      style={{
        flex: 1,
        minHeight: 0,
        background: T.card,
        padding: 0,
        paddingBottom: isMobile ? 72 : 0,
        borderRadius: isMobile ? 0 : 20,
        boxShadow: isMobile
          ? "none"
          : "0 1px 2px rgba(13,43,30,0.03), 0 10px 30px -12px rgba(13,43,30,0.10)",
        border: isMobile ? "none" : `1px solid ${T.line}`,
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      <Outlet />
    </main>
  );
}

function AvatarMenu({ initial, avatarUrl, fullName, role, onLogout }: { initial: string; avatarUrl: string | null; fullName: string | null; role: string | null; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Min profil"
        style={{
          width: 36, height: 36, borderRadius: "50%", padding: 0, background: "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          border: "none", cursor: "pointer",
        }}
      >
        <UserAvatar url={avatarUrl} initial={initial} size={36} />
      </button>
      {open && (
        <div className="bayt-avatar-menu" role="menu">
          <div style={{ padding: "8px 12px 6px", borderBottom: "1px solid #F3F4F6", marginBottom: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{fullName ?? "—"}</div>
            <div style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>{role ?? ""}</div>
          </div>
          <Link to="/installningar" onClick={() => setOpen(false)}>
            <HugeiconsIcon icon={Settings01Icon} size={14} /> Inställningar
          </Link>
          <button type="button" onClick={() => { setOpen(false); onLogout(); }}>
            <HugeiconsIcon icon={Logout01Icon} size={14} /> Logga ut
          </button>
        </div>
      )}
    </div>
  );
}
