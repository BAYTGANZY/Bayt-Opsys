import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useMyArendeScope } from "@/hooks/useMyContactId";

export type AkutRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  /** Only present on the realtime payload, used to scope the toast. */
  assigned_contact_id?: string | null;
};

async function fetchUnresolvedAkut(filterContactIds: string[] | null): Promise<AkutRow[]> {
  let q = supabase
    .from("issues")
    .select("id, title, status, priority")
    .eq("priority", "akut")
    .not("status", "in", "(klar,fakturerad,stangd,avslutat)");
  // An entreprenör must only be alerted about their own ärenden — the bell used
  // to list every akut felanmälan in the system for them (see useMyArendeScope).
  if (filterContactIds) q = q.in("assigned_contact_id", filterContactIds);
  const { data } = await q;
  return (data ?? []) as AkutRow[];
}

/**
 * Open akut-ärenden, kept live. Also fires the red toast when a new one lands.
 * Rendered by the top-bar bell (see NotificationCenter), which lists these
 * alongside chat notifications.
 */
export function useAkutIssues(): AkutRow[] {
  const navigate = useNavigate();
  const { filterContactIds, ready } = useMyArendeScope();
  const [items, setItems] = useState<AkutRow[]>([]);

  useEffect(() => {
    // Don't subscribe or fetch before we know whose ärenden these are — an
    // unscoped first fetch would flash every akut ärende in the system.
    if (!ready) return;
    let mounted = true;
    fetchUnresolvedAkut(filterContactIds).then((r) => mounted && setItems(r));
    const seen = new Set<string>();
    const ch = supabase
      .channel("akut-issues")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "issues" },
        (payload) => {
          const row = payload.new as AkutRow;
          // Realtime is unfiltered, so the same scope rule has to be applied to
          // the toast: an entreprenör must not be alarmed by someone else's akut
          // ärende. `assigned_contact_id` rides along in the INSERT payload.
          if (filterContactIds && !filterContactIds.includes(row?.assigned_contact_id ?? "")) return;
          if (row && row.priority === "akut" && !seen.has(row.id)) {
            seen.add(row.id);
            toast.error(`AKUT: ${row.title}`, {
              action: { label: "Visa", onClick: () => navigate({ to: "/issues/$id", params: { id: row.id } }) },
            });
            fetchUnresolvedAkut(filterContactIds).then((r) => mounted && setItems(r));
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "issues" },
        () => fetchUnresolvedAkut(filterContactIds).then((r) => mounted && setItems(r)),
      )
      .subscribe();
    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, [navigate, filterContactIds, ready]);

  return items;
}
