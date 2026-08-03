import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

type BuildingWorldValue = {
  /** The property id whose "world" is currently active, or null outside any world. */
  activeId: string | null;
  /** Explicitly leaves the world (used by the minimize button). */
  exit: () => void;
};

const BuildingWorldContext = createContext<BuildingWorldValue>({ activeId: null, exit: () => {} });

const FASTIGHETER_ID_RE = /^\/fastigheter\/([^/]+)(?:\/|$)/;
const PROPERTIES_ID_RE = /^\/properties\/([^/]+)(?:\/|$)/;

/**
 * Wraps <AppShell/> so the sidebar can know whether the user is inside a
 * building's "world" without every link under /properties/:id/* having to
 * carry that state explicitly. Entering /fastigheter/:id/** is the only way
 * in; it's remembered as `lastPortalId` so /properties/:id/** (shared with
 * Dag Rapport, Öppna ärenden, GlobalSearch, etc.) only counts as "inside"
 * when its id matches. Leaving both prefixes clears the memory automatically.
 */
export function BuildingWorldProvider({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [lastPortalId, setLastPortalId] = useState<string | null>(null);

  const fastigheterMatch = pathname.match(FASTIGHETER_ID_RE);
  const fastigheterId = fastigheterMatch && fastigheterMatch[1] !== "" ? fastigheterMatch[1] : null;
  const propertiesMatch = pathname.match(PROPERTIES_ID_RE);
  const propertiesId = propertiesMatch ? propertiesMatch[1] : null;

  useEffect(() => {
    if (fastigheterId) {
      setLastPortalId(fastigheterId);
    } else if (!(propertiesId && propertiesId === lastPortalId)) {
      setLastPortalId(null);
    }
    // Only the derived path pieces should retrigger this — lastPortalId is read, not depended on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fastigheterId, propertiesId]);

  const activeId =
    fastigheterId ?? (propertiesId && propertiesId === lastPortalId ? propertiesId : null);

  return (
    <BuildingWorldContext.Provider value={{ activeId, exit: () => setLastPortalId(null) }}>
      {children}
    </BuildingWorldContext.Provider>
  );
}

export function useBuildingWorld(): BuildingWorldValue {
  return useContext(BuildingWorldContext);
}
