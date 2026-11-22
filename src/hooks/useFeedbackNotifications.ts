import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { isStaff } from "@/lib/permissions";

export type FeedbackNotification = {
  id: string;
  reference: string;
  category: string;
  name: string;
  apartment: string;
  createdAt: string;
};

type Row = { id: string; reference: string; category: string; name: string; apartment_number: string; trappa: string; created_at: string };

/**
 * Nya synpunkter från medlemmar (member_feedback, status 'ny') — bara admin, medarbetare och styrelse.
 * RLS begränsar styrelse till sin förening. Raden försvinner ur klockan när någon markerar den som läst
 * (samma modell som akut-ärenden och tvättstugekod). Saknas tabellen är klockan bara tom.
 */
export function useFeedbackNotifications(): FeedbackNotification[] {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const enabled = !!user?.id && (isStaff(profile?.role) || profile?.role === "styrelse");
  const known = useRef<Set<string> | null>(null);

  const q = useQuery({
    queryKey: ["feedback-notifications", user?.id],
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("member_feedback")
        .select("id, reference, category, name, apartment_number, trappa, created_at")
        .eq("status", "ny")
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) return [];
      return (data ?? []) as Row[];
    },
  });

  useEffect(() => {
    if (!q.data) return;
    if (known.current === null) {
      known.current = new Set(q.data.map((r) => r.id));
      return;
    }
    for (const r of q.data) {
      if (known.current.has(r.id)) continue;
      known.current.add(r.id);
      toast.success(`Nytt meddelande från ${r.name}`, {
        description: `Lgh ${r.apartment_number} · ${r.reference}`,
        action: { label: "Visa", onClick: () => navigate({ to: "/synpunkter" as never }) },
      });
    }
  }, [q.data, navigate]);

  useEffect(() => {
    if (!enabled) return;
    const ch = supabase
      .channel("member-feedback-bell")
      .on("postgres_changes", { event: "*", schema: "public", table: "member_feedback" }, () => {
        void qc.invalidateQueries({ queryKey: ["feedback-notifications"] });
        void qc.invalidateQueries({ queryKey: ["member-feedback"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [enabled, qc]);

  if (!enabled) return [];
  return (q.data ?? []).map((r) => ({
    id: r.id,
    reference: r.reference,
    category: r.category,
    name: r.name,
    apartment: `${r.trappa}-${r.apartment_number}`,
    createdAt: r.created_at,
  }));
}
