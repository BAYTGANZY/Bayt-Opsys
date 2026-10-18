import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export type ArendeNotification = {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  readAt: string | null;
};

/** Projektnotiser till den inloggade (skapas av triggern notify_project_update_recipients). */
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
      const { data, error } = await supabase
        .from("project_update_notifications")
        .select("id, project_id, created_at, read_at")
        .eq("recipient_profile_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      const rows = data ?? [];

      const ids = Array.from(new Set(rows.map((r) => r.project_id as string)));
      const titles = new Map<string, string>();
      if (ids.length > 0) {
        const { data: ps } = await supabase.from("projects").select("id, title").in("id", ids);
        for (const p of ps ?? []) titles.set(p.id as string, (p.title as string) ?? "Projekt");
      }

      return rows.map((r) => ({
        id: r.id as string,
        projectId: r.project_id as string,
        title: titles.get(r.project_id as string) ?? "Projekt",
        createdAt: r.created_at as string,
        readAt: (r.read_at as string | null) ?? null,
      }));
    },
  });

  const items = q.data ?? [];
  const unreadCount = items.filter((i) => !i.readAt).length;

  const markRead = useCallback(
    async (id: string) => {
      await supabase
        .from("project_update_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
      void qc.invalidateQueries({ queryKey: key });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, user?.id],
  );

  const markAllRead = useCallback(async () => {
    if (!user?.id) return;
    await supabase
      .from("project_update_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_profile_id", user.id)
      .is("read_at", null);
    void qc.invalidateQueries({ queryKey: key });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, user?.id]);

  return { items, unreadCount, markRead, markAllRead };
}
