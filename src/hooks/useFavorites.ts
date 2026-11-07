import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

/**
 * Menyfavoriter (stjärnor). Sparas i `user_favorites` (supabase-functions/user-favorites.sql)
 * så att de följer med mellan mobil och dator.
 *
 * Tabellen kommer från en handkörd migration. Saknas den (läsfelet) faller vi tillbaka
 * på localStorage i stället för att tappa funktionen — favoriter gäller då bara i den
 * webbläsaren, men menyn går aldrig sönder av det. Samma princip som `contacts.active`.
 */

const lsKey = (uid: string) => `bayt.favorites.${uid}`;

function readLocal(uid: string): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(lsKey(uid)) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeLocal(uid: string, list: string[]) {
  try {
    window.localStorage.setItem(lsKey(uid), JSON.stringify(list));
  } catch {
    /* privat läge eller blockerad lagring — favoriter lever då bara i minnet */
  }
}

type FavState = { routes: string[]; db: boolean };

export function useFavorites() {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["favorites", uid],
    enabled: !!uid,
    staleTime: 60_000,
    queryFn: async (): Promise<FavState> => {
      const local = readLocal(uid!);
      const { data, error } = await supabase
        .from("user_favorites")
        .select("route, created_at")
        .eq("profile_id", uid!)
        .order("created_at", { ascending: true });
      if (error) return { routes: local, db: false };
      const routes = (data ?? []).map((r) => r.route as string);
      // Första gången tabellen finns: ta med stjärnor som sattes medan den saknades.
      if (routes.length === 0 && local.length > 0) {
        const up = await supabase
          .from("user_favorites")
          .upsert(local.map((route) => ({ profile_id: uid!, route })), { onConflict: "profile_id,route" });
        if (!up.error) return { routes: local, db: true };
      }
      return { routes, db: true };
    },
  });

  const routes = q.data?.routes ?? (uid ? readLocal(uid) : []);
  const db = q.data?.db ?? false;

  const toggle = useCallback(
    async (route: string) => {
      if (!uid) return;
      const has = routes.includes(route);
      const next = has ? routes.filter((r) => r !== route) : [...routes, route];
      writeLocal(uid, next);
      qc.setQueryData<FavState>(["favorites", uid], { routes: next, db });
      if (!db) return;
      // .select() — en skrivning som RLS stoppar ger 200 utan fel. Misslyckas den
      // hämtas sanningen om från databasen så att stjärnan inte ljuger.
      const res = has
        ? await supabase.from("user_favorites").delete().eq("profile_id", uid).eq("route", route).select("route")
        : await supabase.from("user_favorites").upsert({ profile_id: uid, route }, { onConflict: "profile_id,route" }).select("route");
      if (res.error || !res.data || (!has && res.data.length === 0)) {
        await qc.invalidateQueries({ queryKey: ["favorites", uid] });
      }
    },
    [uid, routes, db, qc],
  );

  const isFavorite = useCallback((route: string) => routes.includes(route), [routes]);

  return { routes, toggle, isFavorite };
}
