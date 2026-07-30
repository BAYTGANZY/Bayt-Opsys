import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PROPERTY_SECTIONS_FOR_ROLE } from "@/lib/permissions";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PROPERTY_SUB_NAV: { key: string; label: string; path: string }[] = [
  { key: "apartments", label: "Lägenheter", path: "apartments" },
  { key: "issues", label: "Felanmälningar", path: "issues" },
  { key: "inspections", label: "Besiktningar", path: "inspections" },
  { key: "projects", label: "Projekt", path: "projects" },
  { key: "documents", label: "Dokument", path: "documents" },
  { key: "logbook", label: "Loggbok", path: "logbook" },
  { key: "actions", label: "Åtgärdslista", path: "actions" },
  { key: "objects", label: "Objekt", path: "objects" },
  { key: "contacts", label: "Kontakter", path: "contacts" },
  // Sist med flit — arkivet över avslutade ärenden hör hemma efter allt aktivt.
  { key: "avslutat", label: "Avslutade", path: "avslutat" },
];

const APARTMENT_SUB_NAV: { key: string; label: string }[] = [
  { key: "tidslinje", label: "Tidslinje" },
  { key: "info", label: "Info" },
  { key: "felanmalningar", label: "Felanmälningar" },
  { key: "besiktningar", label: "Besiktningar" },
  { key: "dokument", label: "Dokument" },
  { key: "loggbok", label: "Loggbok" },
];

function parsePath(pathname: string): {
  propertyId: string | null;
  apartmentId: string | null;
  apartmentScope: "property" | "global" | null;
} {
  const parts = pathname.split("/").filter(Boolean);
  // /properties/:id/...
  if (parts[0] === "properties" && parts[1] && UUID_RE.test(parts[1])) {
    if (parts[2] === "apartments" && parts[3] && UUID_RE.test(parts[3])) {
      return { propertyId: parts[1], apartmentId: parts[3], apartmentScope: "property" };
    }
    return { propertyId: parts[1], apartmentId: null, apartmentScope: null };
  }
  // /apartments/:id
  if (parts[0] === "apartments" && parts[1] && UUID_RE.test(parts[1])) {
    return { propertyId: null, apartmentId: parts[1], apartmentScope: "global" };
  }
  return { propertyId: null, apartmentId: null, apartmentScope: null };
}

export function PropertyContextNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search as { tab?: string } });
  const { propertyId, apartmentId, apartmentScope } = parsePath(pathname);
  const { profile } = useAuth();
  const role = profile?.role;

  // Byggnadsmenyn startar hopfälld — att auto-veckla ut tio länkar per byggnad
  // gjorde sidomenyn oöverskådlig. Rubrikknappen fäller ut den vid behov.
  const [propOpen, setPropOpen] = useState(false);
  const [aptOpen, setAptOpen] = useState(true);

  const { data: property } = useQuery({
    queryKey: ["ctx-property", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data } = await supabase.from("properties").select("id, name").eq("id", propertyId!).maybeSingle();
      return data;
    },
  });

  const { data: apartment } = useQuery({
    queryKey: ["ctx-apartment", apartmentId],
    enabled: !!apartmentId,
    queryFn: async () => {
      const { data } = await supabase
        .from("apartments")
        .select("id, apartment_number, property_id, properties(id, name)")
        .eq("id", apartmentId!)
        .maybeSingle();
      return data as any;
    },
  });

  // Derive property from apartment if we're on /apartments/:id
  const effectivePropertyId = propertyId ?? apartment?.property_id ?? null;
  const effectivePropertyName = property?.name ?? apartment?.properties?.name ?? null;

  if (!effectivePropertyId && !apartmentId) return null;

  const activePropKey = (() => {
    if (!propertyId) return null;
    const seg = pathname.split("/")[3] ?? "apartments";
    return PROPERTY_SUB_NAV.find((n) => n.path === seg)?.key ?? "apartments";
  })();

  // Same constant the URL guard uses, so the menu and the guard can't disagree.
  const allowedSubNav = role && PROPERTY_SECTIONS_FOR_ROLE[role]
    ? PROPERTY_SUB_NAV.filter((n) => PROPERTY_SECTIONS_FOR_ROLE[role]!.includes(n.key))
    : PROPERTY_SUB_NAV;

  const activeAptTab = (TABS_KEYS.includes(search.tab ?? "tidslinje") ? search.tab : "tidslinje") as string;

  const sectionLabel: React.CSSProperties = {
    padding: "14px 20px 6px",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.4)",
  };

  const headerBtn: React.CSSProperties = {
    width: "100%",
    background: "transparent",
    border: "none",
    color: "#ffffff",
    fontSize: 13,
    fontWeight: 600,
    padding: "8px 17px",
    display: "flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left",
  };

  return (
    <div style={{ marginBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 8 }}>
      <div style={sectionLabel}>Aktiv fastighet</div>

      {effectivePropertyId && (
        <>
          <button type="button" style={headerBtn} onClick={() => setPropOpen((o) => !o)}>
            <HugeiconsIcon icon={propOpen ? ArrowDown01Icon : ArrowRight01Icon} size={12} />
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {effectivePropertyName ?? "Laddar…"}
            </span>
          </button>
          {propOpen && (
            <div style={{ paddingLeft: 22, marginLeft: 18, borderLeft: "1px solid rgba(255,255,255,0.08)" }}>
              {allowedSubNav.map((n) => {
                const active = activePropKey === n.key && !apartmentId;
                return (
                  <Link
                    key={n.key}
                    to={`/properties/${effectivePropertyId}/${n.path}` as never}
                    onClick={onNavigate}
                    style={{
                      display: "block",
                      padding: "6px 10px",
                      borderRadius: 6,
                      color: active ? "#ffffff" : "rgba(255,255,255,0.75)",
                      background: active ? "rgba(92,184,74,0.18)" : "transparent",
                      textDecoration: "none",
                      fontSize: 13,
                      fontWeight: active ? 600 : 500,
                    }}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}

      {apartmentId && (
        <>
          <button type="button" style={{ ...headerBtn, marginTop: 6 }} onClick={() => setAptOpen((o) => !o)}>
            <HugeiconsIcon icon={aptOpen ? ArrowDown01Icon : ArrowRight01Icon} size={12} />
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Lgh {apartment?.apartment_number ?? "…"}
            </span>
          </button>
          {aptOpen && (
            <div style={{ paddingLeft: 22, marginLeft: 18, borderLeft: "1px solid rgba(255,255,255,0.08)" }}>
              {APARTMENT_SUB_NAV.map((n) => {
                const active = activeAptTab === n.key;
                const base = apartmentScope === "property"
                  ? `/properties/${effectivePropertyId}/apartments/${apartmentId}`
                  : `/apartments/${apartmentId}`;
                return (
                  <Link
                    key={n.key}
                    to={base as never}
                    // Functional update keeps unknown params (e.g. ?from=, the
                    // return path set by ärende pages) alive across tab switches.
                    search={((prev: Record<string, unknown>) => ({ ...prev, tab: n.key })) as never}
                    onClick={onNavigate}
                    style={{
                      display: "block",
                      padding: "6px 10px",
                      borderRadius: 6,
                      color: active ? "#ffffff" : "rgba(255,255,255,0.75)",
                      background: active ? "rgba(92,184,74,0.18)" : "transparent",
                      textDecoration: "none",
                      fontSize: 13,
                      fontWeight: active ? 600 : 500,
                    }}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const TABS_KEYS = ["tidslinje", "info", "felanmalningar", "besiktningar", "dokument", "loggbok"];
