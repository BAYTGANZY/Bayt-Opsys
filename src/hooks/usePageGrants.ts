import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

/** Sidor som aldrig kan stängas av — annars kan en användare låsas ute. */
export const ALWAYS_ALLOWED = ["/styrelse", "/mina-uppdrag", "/chatt", "/installningar"];

/**
 * Vilka sidor admin har släppt in den här användaren på (tabellen user_page_access).
 * `null` = inga begränsningar: admin, ingen rad, eller tabellen finns inte ännu —
 * ett fel får aldrig ge en tom meny, så det räknas också som "ingen begränsning".
 */
export function usePageGrants(): { grants: Set<string> | null; ready: boolean } {
  const { user, profile } = useAuth();
  const restricted = !!user && !!profile?.role && profile.role !== "admin";
  const q = useQuery({
    queryKey: ["page-grants", user?.id],
    enabled: restricted,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_page_access").select("page_key").eq("profile_id", user!.id);
      if (error || !data || data.length === 0) return null;
      return data.map((r) => String(r.page_key));
    },
  });
  if (!restricted) return { grants: null, ready: true };
  return { grants: q.data ? new Set(q.data) : null, ready: !q.isLoading };
}

export function pageAllowed(grants: Set<string> | null, to: string): boolean {
  if (!grants) return true;
  if (ALWAYS_ALLOWED.some((a) => to === a || to.startsWith(a + "/"))) return true;
  return [...grants].some((g) => to === g || to.startsWith(g + "/"));
}
