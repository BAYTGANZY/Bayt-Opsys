import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/** Antal hemsidechatt-samtal som väntar på personalens svar (bara för admin). */
export function useWebchatBadge(enabled: boolean): number {
  const q = useQuery({
    queryKey: ["wc-needs-count"],
    enabled,
    refetchInterval: 30000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("webchat_conversations")
        .select("id", { count: "exact", head: true })
        .eq("status", "needs_human");
      if (error) throw error;
      return count ?? 0;
    },
  });
  return q.data ?? 0;
}
