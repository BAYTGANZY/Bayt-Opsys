import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { isStyrelse } from "@/lib/permissions";
import { logEvent } from "@/lib/logbook";
import { assertWritten, canOppnaArende, type ArendeKind } from "./OppnaArendeButton";

/**
 * Whether Avsluta applies at all. Exported for the same reason as
 * `canOppnaArende` — list surfaces need to know whether a row has any action
 * left before they render an action bar for it.
 *
 * `allowVilande` opts into the direct close: a vilande ärende may be closed in
 * one click without being opened first. Off by default — the three detail pages
 * keep the strict vilande → oppet → avslutat ladder. Only Dag Rapport's
 * entreprenörsvy turns it on, where "det här behövde inte göras" is a real and
 * frequent answer and forcing Öppna first would be two clicks of theatre.
 *
 * `projektStatus` is the raw `projects.status` column — avbruten is terminal
 * (ProjektStatusButtons already hides itself there), so no lifecycle action
 * remains. Same rule as canOppnaArende; keep the two in step.
 */
export function canAvslutaArende(
  kind: ArendeKind,
  currentStatus: string | null | undefined,
  opts: { allowVilande?: boolean; projektStatus?: string | null } = {},
): boolean {
  if (kind === "project" && opts.projektStatus === "avbruten") return false;
  if (opts.allowVilande && canOppnaArende(kind, currentStatus, opts.projektStatus)) return true;
  return kind === "issue"
    ? currentStatus === "oppet" || currentStatus === "pagande" || currentStatus === "vantar"
    : currentStatus === "oppet";
}

/**
 * AvslutaArendeButton — flips an öppet errand to avslutat.
 * - issues: writes `status = 'stangd'` (issue_status enum; maps to avslutat via LIFECYCLE_OF)
 * - inspections/projects: writes `arende_status = 'avslutat'` (TEXT column)
 * Renders nothing unless the current status is öppet — unless `allowVilande` is
 * set, in which case a vilande ärende can be closed straight off. The label is
 * "Avsluta ärende" in both cases: closing without opening first is the same
 * outcome, and two names for one action just made people wonder what the
 * difference was. Already-closed errands show nothing either way.
 *
 * The transition written is identical in both cases (same status write, same
 * issue_status_history row, same loggboksrad), so the loggbok shows
 * `vilande → avslutat` and nobody has to guess whether the work was done.
 *
 * Hidden from styrelse for all three ärendetyper — same rule as
 * OppnaArendeButton; keep the two in step.
 */
export function AvslutaArendeButton({
  kind,
  id,
  currentStatus,
  title,
  propertyId,
  apartmentId = null,
  projektStatus = null,
  invalidateKeys = [],
  allowVilande = false,
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
  /** Låt ett vilande ärende stängas direkt, utan att öppnas först. */
  allowVilande?: boolean;
  /** Fired after a successful flip — lets a host sheet/dialog close itself. */
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const { user, profile } = useAuth();

  const canClose = canAvslutaArende(kind, currentStatus, { allowVilande, projektStatus });
  const isReadOnlyRole = isStyrelse(profile?.role);

  const mut = useMutation({
    mutationFn: async () => {
      if (kind === "issue") {
        const { data, error } = await supabase
          .from("issues").update({ status: "stangd" }).eq("id", id).select("id");
        if (error) throw error;
        assertWritten(data);
        // Status is no longer editable by hand, so this button is the only
        // place an oppet→avslutat transition can be recorded.
        await supabase.from("issue_status_history").insert({
          issue_id: id, old_status: currentStatus ?? null, new_status: "stangd", changed_by: user?.id ?? null,
        } as never);
      } else {
        const table = kind === "inspection" ? "inspections" : "projects";
        const { data, error } = await supabase
          .from(table).update({ arende_status: "avslutat" } as never).eq("id", id).select("id");
        if (error) throw error;
        assertWritten(data);
      }
      await logEvent({
        event_type: "arende_status_andring",
        property_id: propertyId,
        apartment_id: apartmentId,
        description: `${title} (${currentStatus ?? "?"} → avslutat)`,
        created_by: user?.id ?? null,
      });
    },
    onSuccess: () => {
      toast.success("Ärendet är avslutat");
      for (const key of invalidateKeys) qc.invalidateQueries({ queryKey: key as unknown[] });
      qc.invalidateQueries({ queryKey: ["oppna-arenden"] });
      qc.invalidateQueries({ queryKey: ["veckans-arenden"] });
      qc.invalidateQueries({ queryKey: ["mina-arenden"] });
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message ?? "Kunde inte avsluta ärendet"),
  });

  if (!canClose || isReadOnlyRole) return null;

  return (
    <button
      type="button"
      onClick={() => mut.mutate()}
      disabled={mut.isPending}
      style={{
        height: 40,
        padding: "0 18px",
        background: "#0D2B1E",
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
      {mut.isPending ? "Avslutar…" : "Avsluta ärende"}
    </button>
  );
}
