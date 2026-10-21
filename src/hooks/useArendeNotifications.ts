import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export type ArendeNotification = {
  id: string;
  source: "project" | "arende";
  kind: "issue" | "inspection" | "project";
  arendeId: string;
  title: string;
  createdAt: string;
  readAt: string | null;
};

const TABLE = {
  project: "project_update_notifications",
  arende: "arende_notifications",
} as const;

export function useArendeNotifications() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["arende-notifications", user?.id];

  const q = useQuery({
    queryKey: key,
    enabled: !!user?.id,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<ArendeNotification[]> => {
      const [projRes, arRes] = await Promise.all([
        supabase
          .from("project_update_notifications")
          .select("id, project_id, created_at, read_at")
          .eq("recipient_profile_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("arende_notifications")
          .select("id, kind, arende_id, summary, created_at, read_at")
          .eq("recipient_profile_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(30),
      ]);
      if (projRes.error) throw projRes.error;

      const projRows = projRes.data ?? [];
      const arRows = arRes.error ? [] : (arRes.data ?? []);

      const ids = Array.from(new Set(projRows.map((r) => r.project_id as string)));
      const titles = new Map<string, string>();
      if (ids.length > 0) {
        const { data: ps } = await supabase.from("projects").select("id, title").in("id", ids);
        for (const p of ps ?? []) titles.set(p.id as string, (p.title as string) ?? "Projekt");
      }

      const fromProjects: ArendeNotification[] = projRows.map((r) => ({
        id: r.id as string,
        source: "project",
        kind: "project",
        arendeId: r.project_id as string,
        title: titles.get(r.project_id as string) ?? "Projekt",
        createdAt: r.created_at as string,
        readAt: (r.read_at as string | null) ?? null,
      }));

      const fromArenden: ArendeNotification[] = arRows.map((r) => {
        const k = String(r.kind);
        return {
          id: r.id as string,
          source: "arende",
          kind: (k === "issue" || k === "inspection" ? k : "project") as ArendeNotification["kind"],
          arendeId: r.arende_id as string,
          title: (r.summary as string) ?? "Ärende uppdaterat",
          createdAt: r.created_at as string,
          readAt: (r.read_at as string | null) ?? null,
        };
      });

      return [...fromProjects, ...fromArenden]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 40);
    },
  });

  const items = q.data ?? [];
  const unreadCount = items.filter((i) => !i.readAt).length;

  const markRead = useCallback(
    async (id: string) => {
      const item = (qc.getQueryData(key) as ArendeNotification[] | undefined)?.find((i) => i.id === id);
      const table = TABLE[item?.source ?? "project"];
      await supabase.from(table).update({ read_at: new Date().toISOString() }).eq("id", id);
      void qc.invalidateQueries({ queryKey: key });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, user?.id],
  );

  const markAllRead = useCallback(async () => {
    if (!user?.id) return;
    const now = new Date().toISOString();
    await Promise.all(
      (Object.values(TABLE) as string[]).map((t) =>
        supabase.from(t).update({ read_at: now }).eq("recipient_profile_id", user.id).is("read_at", null),
      ),
    );
    void qc.invalidateQueries({ queryKey: key });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, user?.id]);

  return { items, unreadCount, markRead, markAllRead };
}
