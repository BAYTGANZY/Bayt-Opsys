import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ConfirmDialog";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { isStyrelse } from "@/lib/permissions";
import { logEvent } from "@/lib/logbook";

export type ArendeKind = "issue" | "inspection" | "project";

/**
 * Whether Öppna applies at all. Exported because callers that render the button
 * inside a list — Dag Rapport's entreprenörsvy — need to know *before* rendering
 * whether an ärende has any action left, so a row can say so instead of showing
 * an empty action bar. Duplicating the predicate would let the two drift.
 *
 * `projektStatus` is the raw `projects.status` column, where pausad/avbruten
 * live — invisible to `arende_status`. Avbruten is terminal: no lifecycle
 * action remains. Pausad does NOT block here — the button stays rendered and
 * intercepts the click with a Återuppta-dialog instead (see below).
 */
export function canOppnaArende(
  kind: ArendeKind,
  currentStatus: string | null | undefined,
  projektStatus?: string | null,
): boolean {
  if (kind === "project" && projektStatus === "avbruten") return false;
  return currentStatus === "vilande" || (kind === "issue" && currentStatus === "ny");
}

/**
 * Turn a silently-ignored write into a real error.
 *
 * PostgREST does not fail an UPDATE that RLS filters away — it matches zero
 * rows and returns success. Without this check the mutation resolves, the
 * success toast fires, and the ärende never moved: the user is told the
 * opposite of what happened. `.select()` on the update returns the rows that
 * were actually written, so an empty array is the tell.
 *
 * Shared by both lifecycle buttons and ProjektStatusButtons — every status
 * write in the app goes through one of the three.
 */
export function assertWritten(rows: unknown[] | null): void {
  if (!rows || rows.length === 0) {
    throw new Error("Ändringen sparades inte — du har inte behörighet att ändra det här ärendet.");
  }
}

/**
 * OppnaArendeButton — flips a vilande errand to öppet.
 * - issues: writes `status = 'oppet'` (issue_status enum)
 * - inspections/projects: writes `arende_status = 'oppet'` (TEXT column)
 * Renders nothing unless the current status is vilande.
 *
 * Projekt carry a second, legacy status column (`projects.status`) where
 * pausad/avbruten live — pass it as `projektStatus` or the button is blind to
 * both: avbruten hides the button entirely (terminal), pausad keeps it but the
 * click asks "återuppta och öppna?" and, on confirm, writes both columns in ONE
 * update — two separate writes could leave the row open-and-paused at once.
 *
 * Hidden from styrelse for all three ärendetyper — styrelse is read-only by
 * spec (see permissions.ts) and lifecycle is not theirs to move. Gated here
 * rather than at each call site so no future surface can forget it; admin and
 * entreprenör (who work the ärende) keep the button.
 */
export function OppnaArendeButton({
  kind,
  id,
  currentStatus,
  title,
  propertyId,
  apartmentId = null,
  projektStatus = null,
  invalidateKeys = [],
  onDone,
}: {
  kind: ArendeKind;
  id: string;
  currentStatus: string | null | undefined;
  title: string;
  propertyId: string | null;
  /**
   * The ärende's apartment, when it has one. Without it the loggbok entry below
   * lands with property_id only, and the apartment Tidslinje — which filters on
   * apartment_id — never sees the transition. Projects have no apartment link,
   * so null is correct there.
   */
  apartmentId?: string | null;
  /**
   * Raw `projects.status` — where pausad/avbruten live, invisible to
   * `arende_status`. Only meaningful for kind="project"; leave unset otherwise.
   */
  projektStatus?: string | null;
  invalidateKeys?: readonly (readonly unknown[])[];
  /** Fired after a successful flip — lets a host sheet/dialog close itself. */
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const { user, profile } = useAuth();

  const isVilande = canOppnaArende(kind, currentStatus, projektStatus);
  const isReadOnlyRole = isStyrelse(profile?.role);
  const isPausadProjekt = kind === "project" && projektStatus === "pausad";

  const mut = useMutation({
    mutationFn: async (resumeProjekt: boolean) => {
      if (kind === "issue") {
        const { data, error } = await supabase
          .from("issues").update({ status: "oppet" }).eq("id", id).select("id");
        if (error) throw error;
        assertWritten(data);
        // Status is no longer editable by hand, so this button is the only
        // place a vilande→oppet transition can be recorded.
        await supabase.from("issue_status_history").insert({
          issue_id: id, old_status: currentStatus ?? null, new_status: "oppet", changed_by: user?.id ?? null,
        } as never);
      } else {
        const table = kind === "inspection" ? "inspections" : "projects";
        // Resuming a paused projekt writes both columns in ONE update: two
        // separate writes could leave {arende_status: 'oppet', status: 'pausad'}
        // if the second is refused, which is the very state this prevents.
        const patch = resumeProjekt
          ? { arende_status: "oppet", status: "aktiv" }
          : { arende_status: "oppet" };
        const { data, error } = await supabase
          .from(table).update(patch as never).eq("id", id).select("id");
        if (error) throw error;
        assertWritten(data);
      }
      await logEvent({
        event_type: "arende_status_andring",
        property_id: propertyId,
        apartment_id: apartmentId,
        description: resumeProjekt
          ? `${title} (pausad → aktiv, ${currentStatus ?? "?"} → oppet)`
          : `${title} (${currentStatus ?? "?"} → oppet)`,
        created_by: user?.id ?? null,
      });
    },
    onSuccess: (_r, resumeProjekt) => {
      toast.success(resumeProjekt ? "Projektet är återupptaget och ärendet är öppet" : "Ärendet är öppet");
      for (const key of invalidateKeys) qc.invalidateQueries({ queryKey: key as unknown[] });
      qc.invalidateQueries({ queryKey: ["oppna-arenden"] });
      qc.invalidateQueries({ queryKey: ["veckans-arenden"] });
      qc.invalidateQueries({ queryKey: ["mina-arenden"] });
      // The resume also wrote projects.status — same invalidation as
      // ProjektStatusButtons, the column's usual writer.
      if (resumeProjekt) qc.invalidateQueries({ queryKey: ["projects"] });
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message ?? "Kunde inte öppna ärendet"),
  });

  if (!isVilande || isReadOnlyRole) return null;

  // Pausad intercepts the click: a projekt must not end up open-and-paused at
  // once, so opening it means resuming it too — and that double-action gets an
  // explicit confirm (the app-standard dialog, same one the delete flows use).
  const onClick = async () => {
    if (isPausadProjekt) {
      const ok = await confirmDialog({
        title: "Projektet är pausat",
        message: "Vill du återuppta och öppna ärendet?",
        confirmLabel: "Återuppta och öppna",
      });
      if (!ok) return;
      mut.mutate(true);
    } else {
      mut.mutate(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={mut.isPending}
      style={{
        height: 40,
        padding: "0 18px",
        background: "#5CB84A",
        color: "#fff",
        border: "none",
        borderRadius: 10,
        fontSize: 14,
        fontWeight: 600,
        fontFamily: "Outfit, Inter, system-ui, sans-serif",
        cursor: mut.isPending ? "not-allowed" : "pointer",
        opacity: mut.isPending ? 0.7 : 1,
      }}
    >
      {mut.isPending ? "Öppnar…" : "Öppna ärende"}
    </button>
  );
}
