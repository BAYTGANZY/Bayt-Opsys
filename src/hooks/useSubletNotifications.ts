import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export type SubletNotification = {
  id: string;
  reference: string;
  apartment: string;
  applicant: string;
  createdAt: string;
};

/**
 * Ansökningar om andrahandsuthyrning som väntar på beslut — bara för admin och styrelse.
 * Läsningen begränsas av RLS (styrelse ser sin egen förening), så ingen egen filtrering behövs.
 * En ansökan försvinner härifrån när den är besvarad eller väntar på sökandens komplettering,
 * och dyker upp igen när kompletteringen kommer in (status går tillbaka till 'ny').
 *
 * Realtime om tabellen finns i publikationen (supabase-functions/andrahand-notiser.sql);
 * annars tar intervallet och fönsterfokus över, så klockan aldrig hänger på en enda mekanism.
 */
export function useSubletNotifications(): SubletNotification[] {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const enabled = !!user?.id && (profile?.role === "admin" || profile?.role === "styrelse");
  const key = ["sublet-notifications", user?.id];
  const known = useRef<Set<string> | null>(null);

  const q = useQuery({
    queryKey: key,
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<SubletNotification[]> => {
      const { data, error } = await supabase
        .from("sublet_applications")
        .select("id, reference, apartment_number, trappa, applicant_name, created_at, updated_at")
        .eq("status", "ny")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) return []; // tabellen kan saknas — då är klockan bara tom
      return (data ?? []).map((r) => ({
        id: r.id as string,
        reference: r.reference as string,
        apartment: `Lgh ${r.apartment_number}${r.trappa ? `, trappa ${r.trappa}` : ""}`,
        applicant: r.applicant_name as string,
        createdAt: r.created_at as string,
      }));
    },
  });

  const items = q.data ?? [];

  // Toast bara för en ansökan som inte fanns vid första laddningen, annars poppar en per väntande ansökan vid varje inloggning.
  useEffect(() => {
    if (!q.data) return;
    if (known.current === null) {
      known.current = new Set(q.data.map((n) => n.id));
      return;
    }
    for (const n of q.data) {
      if (known.current.has(n.id)) continue;
      known.current.add(n.id);
      toast.success(`Ny ansökan om andrahandsuthyrning: ${n.apartment}`, {
        description: `${n.applicant} · ${n.reference}`,
        action: { label: "Visa", onClick: () => navigate({ to: "/andrahand" }) },
      });
    }
  }, [q.data, navigate]);

  useEffect(() => {
    if (!enabled) return;
    const ch = supabase
      .channel("sublet-applications-bell")
      .on("postgres_changes", { event: "*", schema: "public", table: "sublet_applications" }, () => {
        void qc.invalidateQueries({ queryKey: ["sublet-notifications"] });
        void qc.invalidateQueries({ queryKey: ["sublet-apps"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [enabled, qc]);

  return enabled ? items : [];
}
