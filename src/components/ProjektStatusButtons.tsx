import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { isStyrelse } from "@/lib/permissions";
import { logEvent } from "@/lib/logbook";
import { assertWritten } from "./OppnaArendeButton";

/**
 * Pausa / Återuppta / Avbryt for projekt.
 *
 * Everything else about a projekt's status is derived from slutdatum
 * (deriveProjectStatus), but "pausad" and "avbruten" are decisions a date can
 * never produce — a paused projekt is not late, it is deliberately stopped.
 * So they keep a button, exactly like Öppna/Avsluta, and this component is the
 * only writer of the legacy `projects.status` column.
 *
 * Renders nothing once the projekt is avslutat — a closed projekt has nothing
 * left to pause.
 */
export function ProjektStatusButtons({
  id,
  arendeStatus,
  status,
  title,
  propertyId,
  invalidateKeys = [],
}: {
  id: string;
  arendeStatus: string | null | undefined;
  status: string | null | undefined;
  title: string;
  propertyId: string | null;
  invalidateKeys?: readonly (readonly unknown[])[];
}) {
  const qc = useQueryClient();
  const { user, profile } = useAuth();

  const isClosed = arendeStatus === "avslutat" || status === "klar" || status === "avbruten";
  // Same rule as Öppna/Avsluta: styrelse is read-only and does not move a
  // projekt's status, by hand or otherwise.
  const isReadOnlyRole = isStyrelse(profile?.role);
  const isPaused = status === "pausad";

  const mut = useMutation({
    mutationFn: async (next: "pausad" | "aktiv" | "avbruten") => {
      const { data, error } = await supabase
        .from("projects").update({ status: next } as never).eq("id", id).select("id");
      if (error) throw error;
      assertWritten(data);
      await logEvent({
        event_type: "arende_status_andring",
        property_id: propertyId,
        description: `${title} (${status ?? "?"} → ${next})`,
        created_by: user?.id ?? null,
      });
    },
    onSuccess: (_r, next) => {
      toast.success(
        next === "pausad" ? "Projektet är pausat"
          : next === "avbruten" ? "Projektet är avbrutet"
            : "Projektet är återupptaget",
      );
      for (const key of invalidateKeys) qc.invalidateQueries({ queryKey: key as unknown[] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["oppna-arenden"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Kunde inte ändra projektets status"),
  });

  if (isClosed || isReadOnlyRole) return null;

  const btn = (bg: string, color: string, border?: string): React.CSSProperties => ({
    height: 40,
    padding: "0 18px",
    background: bg,
    color,
    border: border ?? "none",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "Outfit, Inter, system-ui, sans-serif",
    cursor: mut.isPending ? "not-allowed" : "pointer",
    opacity: mut.isPending ? 0.7 : 1,
  });

  return (
    <>
      {isPaused ? (
        <button type="button" onClick={() => mut.mutate("aktiv")} disabled={mut.isPending} style={btn("#5CB84A", "#fff")}>
          {mut.isPending ? "Återupptar…" : "Återuppta"}
        </button>
      ) : (
        <button type="button" onClick={() => mut.mutate("pausad")} disabled={mut.isPending} style={btn("transparent", "#6B7280", "1px solid #E5E7EB")}>
          {mut.isPending ? "Pausar…" : "Pausa"}
        </button>
      )}
      <button type="button" onClick={() => mut.mutate("avbruten")} disabled={mut.isPending} style={btn("transparent", "#B91C1C", "1px solid #E5E7EB")}>
        {mut.isPending ? "Avbryter…" : "Avbryt projekt"}
      </button>
    </>
  );
}
