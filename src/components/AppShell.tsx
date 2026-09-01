import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
  GridViewIcon,
  CalendarCheckIn01Icon,
  Chatting01Icon,
  Home01Icon,
  MinimizeScreenIcon,
  Package01Icon,
  HardHatIcon,
} from "@hugeicons/core-free-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { canAccess } from "@/lib/permissions";
import { GlobalSearch } from "@/components/GlobalSearch";
import { PropertyContextNav } from "@/components/ContextNav";
import { NotificationBell, NotificationToasts } from "@/components/NotificationCenter";
import { useSwipeBack } from "@/hooks/useSwipeBack";
import { useMyArendeDots, type ArendeDot } from "@/hooks/useMyArendeDots";
import { useArendeRealtime } from "@/hooks/useArendeRealtime";
import { StatusDot } from "@/components/StatusDot";
import { useBuildingWorld } from "@/lib/building-world";

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
      { to: "/dag-rapport", label: "Dag Rapport", icon: CalendarCheckIn01Icon },
      { to: "/dashboard", label: "Översikt", icon: DashboardSquare01Icon },
      { to: "/chatt", label: "Chatt", icon: Chatting01Icon },
    ],
  },
  {
    label: "Fastigheter",
    items: [
      { to: "/fastigheter", label: "Fastigheter", icon: Building02Icon },
      { to: "/apartments", label: "Lägenheter", icon: DoorOpenIcon },
      { to: "/objects", label: "Objekt", icon: Package01Icon },
    ],
  },
  {
    label: "Drift",
    items: [
      { to: "/issues", label: "Felanmälningar", icon: AlertCircleIcon },
      { to: "/inspections", label: "Besiktningar", icon: ClipboardCheckIcon },
      { to: "/projects", label: "Projekt", icon: Briefcase01Icon },
      // Admin-only i praktiken: canAccess släpper bara igenom admin, så posten
      // filtreras bort ur navigationen för styrelse och entreprenör.
      { to: "/entreprenorer", label: "Entreprenörer", icon: HardHatIcon },
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

const BOTTOM_NAV: NavItem[] = [
  { to: "/dashboard", label: "Översikt", icon: DashboardSquare01Icon },
  { to: "/start", label: "Start", icon: GridViewIcon },
  { to: "/installningar", label: "Inställn.", icon: Settings01Icon },
];

/** Drop links this role can't reach, then drop sections left empty. */
function sectionsForRole(role: string | null | undefined): NavSection[] {
  return SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => canAccess(role, i.to)),
  })).filter((s) => s.items.length > 0);
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
function UserAvatar({
  url,
  initial,
  size = 36,
}: {
  url: string | null;
  initial: string;
  size?: number;
}) {
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
        boxShadow: "0 0 0 2px rgba(13,43,30,0.95)",
        ...(mini ? { position: "absolute" as const, top: 12, right: 13 } : { marginLeft: 6 }),
      }}
    >
      <StatusDot deadline={dot.earliestDueDate} unviewedCount={dot.count} size={8} />
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

  const isItemActive = (to: string) => pathname === to || pathname.startsWith(to + "/");

  const initialExpanded: Record<string, boolean> = {};
  ALL_ITEMS.forEach((i) => {
    if (i.children && isItemActive(i.to)) initialExpanded[i.to] = true;
  });
  const [expanded, setExpanded] = useState<Record<string, boolean>>(initialExpanded);
  const toggle = (to: string) => setExpanded((e) => ({ ...e, [to]: !e[to] }));

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  const showOverlaySidebar = isMobile && open;
  const showFullSidebar = bp === "full" || showOverlaySidebar;
  const showMiniSidebar = isMini && !open;

  const initial = getInitial(profile?.full_name);
  const sections = sectionsForRole(profile?.role);
  // Tom karta för alla utom entreprenör — ingen extra fråga körs för dem.
  const arendeDots = useMyArendeDots();
  // Ett ärende som tilldelas mig ska dyka upp utan att jag loggar ut och in.
  // Monterad här, en gång, eftersom AppShell omsluter varje inloggad sida.
  useArendeRealtime();
  const bottomNav = BOTTOM_NAV.filter((i) => i.to === "/start" || canAccess(profile?.role, i.to));

  // Inside a building's "world" (entered via /fastigheter/$id, the portal home),
  // the sidebar/topbar collapse to a minimal shell: no global nav, no search —
  // the only ways to move are the home button below, each page's own back-link,
  // and the tiles on the building's home screen itself.
  const { activeId: bwId, exit: bwExit } = useBuildingWorld();
  const { data: bwProperty } = useQuery({
    queryKey: ["bw-property", bwId],
    enabled: !!bwId,
    queryFn: async () => {
      const { data } = await supabase
        .from("properties")
        .select("id, name, address")
        .eq("id", bwId!)
        .maybeSingle();
      return data as { id: string; name: string; address: string | null } | null;
    },
  });
  const inBuildingWorld = !!bwId;
  const exitBuildingWorld = () => {
    bwExit();
    navigate({ to: "/fastigheter" });
  };

  return (
    <div
      className="bayt-app"
      style={{
        display: "flex",
        height: "100vh",
        width: "100%",
        maxWidth: "100vw",
        overflowX: "hidden",
        background: "linear-gradient(180deg, #FBFBFA 0%, #F6F7F5 100%)",
        padding: isMobile ? 0 : 12,
        gap: isMobile ? 0 : 12,
        fontFamily: "Inter, system-ui, sans-serif",
        color: "#1a1a1a",
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
            background: "linear-gradient(180deg, #123526 0%, #0D2B1E 55%, #0B241A 100%)",
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
            boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
            border: "1px solid rgba(255,255,255,0.04)",
          }}
        >
          <div
            style={{
              height: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              padding: "0 10px",
            }}
          >
            <img
              src={`${import.meta.env.BASE_URL}assets/bayt-icon.png`}
              alt="BAYT"
              style={{ height: 28, width: "auto", display: "block" }}
            />
          </div>
          <nav
            className="bayt-sidebar-nav"
            style={{ flex: 1, paddingTop: 8, width: "100%", overflowY: "auto" }}
          >
            {inBuildingWorld ? (
              <>
                <Link
                  to="/fastigheter/$id"
                  params={{ id: bwId! }}
                  title="Byggnadens hem"
                  className="bayt-nav-item"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: 48,
                    color: "rgba(255,255,255,0.7)",
                    textDecoration: "none",
                  }}
                >
                  <HugeiconsIcon icon={Home01Icon} size={20} />
                </Link>
                <button
                  type="button"
                  onClick={exitBuildingWorld}
                  title="Minimera — tillbaka till fastigheter"
                  aria-label="Minimera — tillbaka till fastigheter"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: 48,
                    width: "100%",
                    color: "rgba(255,255,255,0.7)",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <HugeiconsIcon icon={MinimizeScreenIcon} size={20} />
                </button>
              </>
            ) : (
              sections
                .flatMap((s) => s.items)
                .map((item) => {
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
                          color: active ? "#5CB84A" : "rgba(255,255,255,0.7)",
                          background: active ? "rgba(92,184,74,0.15)" : "transparent",
                          borderLeft: active ? "3px solid #5CB84A" : "3px solid transparent",
                          textDecoration: "none",
                        }}
                      >
                        <HugeiconsIcon icon={item.icon} size={20} />
                        {dot && <NavDot dot={dot} mini />}
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
                                  color: childActive ? "#5CB84A" : "rgba(255,255,255,0.85)",
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
                })
            )}
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
              color: "rgba(255,255,255,0.7)",
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
            width: 240,
            background: "linear-gradient(180deg, #123526 0%, #0D2B1E 55%, #0B241A 100%)",
            position: isMobile ? "fixed" : "sticky",
            top: isMobile ? 0 : 12,
            left: isMobile ? 0 : undefined,
            alignSelf: isMobile ? undefined : "flex-start",
            height: isMobile ? "100vh" : "calc(100vh - 24px)",
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            borderRadius: isMobile ? 0 : 20,
            boxShadow: isMobile ? "none" : "0 4px 16px rgba(0,0,0,0.08)",
            border: "1px solid rgba(255,255,255,0.04)",
          }}
        >
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
            <img
              src={`${import.meta.env.BASE_URL}assets/bayt-logo.png`}
              alt="BAYT"
              style={{ height: 32, width: "auto", display: "block" }}
            />
            {inBuildingWorld && !isMobile && (
              <button
                onClick={exitBuildingWorld}
                aria-label="Minimera — tillbaka till fastigheter"
                title="Minimera — tillbaka till fastigheter"
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "#ffffff",
                  cursor: "pointer",
                  padding: 8,
                  minWidth: 40,
                  minHeight: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <HugeiconsIcon icon={MinimizeScreenIcon} size={18} />
              </button>
            )}
            {isMobile && (
              <button
                onClick={() => (inBuildingWorld ? exitBuildingWorld() : setOpen(false))}
                aria-label={inBuildingWorld ? "Minimera — tillbaka till fastigheter" : "Stäng meny"}
                title={inBuildingWorld ? "Minimera — tillbaka till fastigheter" : undefined}
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "#ffffff",
                  cursor: "pointer",
                  padding: 8,
                  minWidth: 40,
                  minHeight: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <HugeiconsIcon
                  icon={inBuildingWorld ? MinimizeScreenIcon : Cancel01Icon}
                  size={20}
                />
              </button>
            )}
          </div>
          <nav
            className="bayt-sidebar-nav"
            style={{ flex: 1, paddingTop: 4, paddingBottom: 12, overflowY: "auto" }}
          >
            {inBuildingWorld ? (
              <div style={{ padding: "6px 20px 16px" }}>
                <Link
                  to="/fastigheter/$id"
                  params={{ id: bwId! }}
                  onClick={() => setOpen(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: "rgba(92,184,74,0.12)",
                    border: "1px solid rgba(92,184,74,0.3)",
                    color: "#ffffff",
                    textDecoration: "none",
                    fontSize: 14,
                    fontWeight: 600,
                    marginBottom: 16,
                  }}
                >
                  <HugeiconsIcon icon={Home01Icon} size={18} />
                  Byggnadens hem
                </Link>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.4)",
                    marginBottom: 6,
                  }}
                >
                  Aktiv fastighet
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#ffffff",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {bwProperty?.name ?? "…"}
                </div>
                {bwProperty?.address && (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
                    {bwProperty.address}
                  </div>
                )}
              </div>
            ) : (
              <>
                <PropertyContextNav onNavigate={() => setOpen(false)} />
                {sections.map((section, sIdx) => (
                  <div key={section.label ?? sIdx} style={{ marginBottom: 8 }}>
                    {section.label && (
                      <div
                        style={{
                          padding: "14px 20px 6px",
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                          color: "rgba(255,255,255,0.4)",
                        }}
                      >
                        {section.label}
                      </div>
                    )}
                    {section.items.map((item) => {
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
                              background:
                                active && !hasChildren ? "rgba(92,184,74,0.15)" : "transparent",
                              borderLeft:
                                active && !hasChildren
                                  ? "3px solid #5CB84A"
                                  : "3px solid transparent",
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
                                padding: "10px 12px 10px 17px",
                                color: active ? "#5CB84A" : "rgba(255,255,255,0.85)",
                                textDecoration: "none",
                                fontSize: 14,
                                fontWeight: active ? 600 : 500,
                                minHeight: 40,
                              }}
                            >
                              <HugeiconsIcon icon={item.icon} size={18} />
                              <span style={{ flex: 1 }}>{item.label}</span>
                              {dot && <NavDot dot={dot} />}
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
                                      color: childActive ? "#ffffff" : "rgba(255,255,255,0.85)",
                                      background: childActive
                                        ? "rgba(92,184,74,0.15)"
                                        : "transparent",
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
                                      color: childActive ? "#ffffff" : "rgba(255,255,255,0.65)",
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
              </>
            )}
          </nav>
          {/* Profile footer */}
          <div
            style={{
              borderTop: "1px solid rgba(255,255,255,0.06)",
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
                color: "#ffffff",
              }}
            >
              <UserAvatar url={profile?.avatar_url ?? null} initial={initial} size={36} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 13,
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
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "rgba(255,255,255,0.5)",
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
                color: "rgba(255,255,255,0.6)",
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
          gap: isMobile ? 0 : 8,
        }}
      >
        {/* Topbar */}
        <header
          style={{
            height: 56,
            background: "#0D2B1E",
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            gap: 12,
            position: "sticky",
            top: isMobile ? 0 : 0,
            zIndex: 30,
            borderRadius: isMobile ? 0 : 16,
            boxShadow: isMobile ? "none" : "0 4px 16px rgba(0,0,0,0.08)",
            border: isMobile ? "none" : "1px solid rgba(255,255,255,0.04)",
          }}
        >
          {isMobile && (
            <button
              onClick={() => setOpen(true)}
              aria-label="Öppna meny"
              style={{
                background: "transparent",
                border: "none",
                color: "#ffffff",
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

          {/* Global search — hidden inside a building's world, it's a direct route to global pages. */}
          {!isMobile && !inBuildingWorld && <GlobalSearch />}

          <NotificationBell isMobile={isMobile} />

          <AvatarMenu
            initial={initial}
            avatarUrl={profile?.avatar_url ?? null}
            fullName={profile?.full_name ?? null}
            role={profile?.role ?? null}
            onLogout={handleLogout}
          />
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
              background: "#0D2B1E",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              display: "flex",
              alignItems: "stretch",
              zIndex: 45,
            }}
          >
            {inBuildingWorld ? (
              <>
                <Link
                  to="/fastigheter/$id"
                  params={{ id: bwId! }}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    textDecoration: "none",
                    color: "#FFFFFF",
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
                      border: "4px solid #0D2B1E",
                    }}
                  >
                    <HugeiconsIcon icon={Home01Icon} size={26} color="#FFFFFF" />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, marginTop: 36 }}>Hem</span>
                </Link>
                <button
                  type="button"
                  onClick={exitBuildingWorld}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                    background: "transparent",
                    border: "none",
                    color: "rgba(255,255,255,0.65)",
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <HugeiconsIcon icon={MinimizeScreenIcon} size={20} />
                  <span>Minimera</span>
                </button>
              </>
            ) : (
              bottomNav.map((item) => {
                const active = isItemActive(item.to);
                const isStart = item.to === "/start";
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
                        color: "#FFFFFF",
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
                          border: "4px solid #0D2B1E",
                        }}
                      >
                        <HugeiconsIcon icon={item.icon} size={26} color="#FFFFFF" />
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 600, marginTop: 36 }}>
                        {item.label}
                      </span>
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
                      color: active ? "#5CB84A" : "rgba(255,255,255,0.65)",
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  >
                    <HugeiconsIcon icon={item.icon} size={20} />
                    <span>{item.label}</span>
                  </Link>
                );
              })
            )}
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
        background: "#FFFFFF",
        padding: 0,
        paddingBottom: isMobile ? 72 : 0,
        borderRadius: isMobile ? 0 : 20,
        boxShadow: isMobile
          ? "none"
          : "0 1px 2px rgba(13,43,30,0.03), 0 10px 30px -12px rgba(13,43,30,0.10)",
        border: isMobile ? "none" : "1px solid #E5E7EB",
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      <Outlet />
    </main>
  );
}

function AvatarMenu({
  initial,
  avatarUrl,
  fullName,
  role,
  onLogout,
}: {
  initial: string;
  avatarUrl: string | null;
  fullName: string | null;
  role: string | null;
  onLogout: () => void;
}) {
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
          width: 36,
          height: 36,
          borderRadius: "50%",
          padding: 0,
          background: "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "none",
          cursor: "pointer",
        }}
      >
        <UserAvatar url={avatarUrl} initial={initial} size={36} />
      </button>
      {open && (
        <div className="bayt-avatar-menu" role="menu">
          <div
            style={{ padding: "8px 12px 6px", borderBottom: "1px solid #F3F4F6", marginBottom: 4 }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{fullName ?? "—"}</div>
            <div
              style={{
                fontSize: 11,
                color: "#6B7280",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {role ?? ""}
            </div>
          </div>
          <Link to="/installningar" onClick={() => setOpen(false)}>
            <HugeiconsIcon icon={Settings01Icon} size={14} /> Inställningar
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <HugeiconsIcon icon={Logout01Icon} size={14} /> Logga ut
          </button>
        </div>
      )}
    </div>
  );
}
