import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export type LaundryNotification = {
  id: string;
  kind: "ny" | "fastnat";
  reference: string;
  key: string; // "3-1001" — sökvärdet i Bokatvättid
  name: string;
  createdAt: string;
};

type Row = { id: string; status: string; reference: string; apartment_number: string; trappa: string; name: string; created_at: string; sent_by: string | null; sent_by_name: string | null };

/**
 * Förfrågningar om tvättstugekod som kräver något av styrelsen — bara för admin och styrelse.
 * `ny` = väntar på att någon skriver in pinen. `fastnat` = mejlet med koden gick inte iväg och måste skickas
 * för hand. Det är de två som hamnar i klockan; en skickad kod är inget att göra något åt och ger i stället
 * en toast, och bara när *någon annan* skickade den (den som tryckte vet redan).
 *
 * Realtime om tabellen finns i publikationen (tvattstuga-kod.sql); annars tar intervallet och fönsterfokus
 * över. Saknas tabellen är klockan bara tom, som med `sublet_applications`.
 */
export function useLaundryNotifications(): LaundryNotification[] {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const enabled = !!user?.id && (profile?.role === "admin" || profile?.role === "styrelse");
  const known = useRef<Map<string, string> | null>(null);

  const q = useQuery({
    queryKey: ["laundry-notifications", user?.id],
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<Row[]> => {
      const since = new Date(Date.now() - 2 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("laundry_code_requests")
        .select("id, status, reference, apartment_number, trappa, name, created_at, sent_by, sent_by_name")
        .or(`status.in.(ny,fastnat),and(status.eq.skickad,updated_at.gte.${since})`)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) return [];
      return (data ?? []) as Row[];
    },
  });

  const rows = q.data ?? [];

  useEffect(() => {
    if (!q.data) return;
    // Första laddningen: lär in vad som redan finns, annars poppar en toast per väntande rad vid varje inloggning.
    if (known.current === null) {
      known.current = new Map(q.data.map((r) => [r.id, r.status]));
      return;
    }
    for (const r of q.data) {
      const before = known.current.get(r.id);
      known.current.set(r.id, r.status);
      if (before === r.status) continue;
      const label = `lgh ${r.trappa}-${r.apartment_number}`;
      if (r.status === "ny" && before === undefined) {
        toast.success(`Ny förfrågan om tvättstugekod: ${label}`, {
          description: `${r.name} · ${r.reference}`,
          action: { label: "Visa", onClick: () => navigate({ to: "/tvattstuga" as never }) },
        });
      } else if (r.status === "fastnat") {
        toast.error(`Koden kunde inte skickas till ${r.name} (${label})`, {
          description: "Du behöver skicka den själv.",
          duration: 15000,
          action: { label: "Visa", onClick: () => navigate({ to: "/tvattstuga" as never }) },
        });
      } else if (r.status === "skickad" && r.sent_by !== user?.id) {
        toast.success(`${r.name} har fått sin kod (${label})`, { description: r.sent_by_name ? `Skickad av ${r.sent_by_name}` : undefined });
      }
    }
  }, [q.data, navigate, user?.id]);

  useEffect(() => {
    if (!enabled) return;
    const ch = supabase
      .channel("laundry-code-requests-bell")
      .on("postgres_changes", { event: "*", schema: "public", table: "laundry_code_requests" }, () => {
        void qc.invalidateQueries({ queryKey: ["laundry-notifications"] });
        void qc.invalidateQueries({ queryKey: ["laundry-requests"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [enabled, qc]);

  if (!enabled) return [];
  return rows
    .filter((r) => r.status === "ny" || r.status === "fastnat")
    .map((r) => ({
      id: r.id,
      kind: r.status as "ny" | "fastnat",
      reference: r.reference,
      key: `${r.trappa}-${r.apartment_number}`,
      name: r.name,
      createdAt: r.created_at,
    }))
    // Fastnade först — de kräver att någon gör jobbet själv.
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "fastnat" ? -1 : 1));
}
