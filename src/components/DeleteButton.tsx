import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { confirmDialog } from "@/components/ConfirmDialog";

/**
 * Child tables that a cascade takes with the parent, in the order an admin
 * would think of them. Mirrors the FK sweep in
 * supabase-functions/admin-delete.sql — if a table is added there, add it here
 * or the confirm dialog will under-report what is about to disappear.
 *
 * property_objects.apartment_id is SET NULL, not CASCADE, so objekt are
 * deliberately absent from the apartment list.
 */
const CASCADE_CHILDREN: Record<string, ReadonlyArray<[table: string, column: string, label: string]>> = {
  properties: [
    ["apartments", "property_id", "lägenheter"],
    ["issues", "property_id", "felanmälningar"],
    ["actions", "property_id", "åtgärder"],
    ["inspections", "property_id", "besiktningar"],
    ["projects", "property_id", "projekt"],
    ["property_objects", "property_id", "objekt"],
    ["documents", "property_id", "dokument"],
    ["logbook_entries", "property_id", "loggboksposter"],
  ],
  apartments: [
    ["issues", "apartment_id", "felanmälningar"],
    ["inspections", "apartment_id", "besiktningar"],
    ["logbook_entries", "apartment_id", "loggboksposter"],
  ],
};

/** "3 lägenheter, 12 felanmälningar och 5 loggboksposter" — zero-count tables are dropped. */
async function describeCascade(table: string, id: string): Promise<string | null> {
  const children = CASCADE_CHILDREN[table];
  if (!children) return null;

  const counts = await Promise.all(
    children.map(async ([child, column, label]) => {
      const { count } = await supabase
        .from(child)
        .select("id", { count: "exact", head: true })
        .eq(column, id);
      return { label, n: count ?? 0 };
    }),
  );

  const parts = counts.filter((c) => c.n > 0).map((c) => `${c.n} ${c.label}`);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} och ${parts[parts.length - 1]}`;
}

/**
 * Admin-only delete for a top-level record (fastighet, felanmälan, lägenhet,
 * projekt, besiktning). Renders nothing for non-admins — deletion is never
 * offered to styrelse or entreprenör.
 *
 * Deleting a fastighet or lägenhet CASCADES (client decision, 2026-07-27): the
 * confirm dialog counts the children first and names them, because the button
 * is the last thing standing between an admin and an entire building's history.
 * The database side is supabase-functions/admin-delete.sql — without it this
 * button either raises 23503 or, worse, deletes nothing and reports success.
 */
export function DeleteButton({
  table,
  id,
  label,
  invalidateKeys,
  onDeleted,
  variant = "icon",
}: {
  /** Supabase table name, e.g. "properties" | "issues" | "apartments" | "projects" | "inspections" */
  table: string;
  id: string;
  /** Human name shown in the confirm dialog, e.g. the building or errand title */
  label: string;
  /** Query keys to invalidate so lists refresh after the row is gone */
  invalidateKeys?: string[][];
  onDeleted?: () => void;
  variant?: "icon" | "full";
}) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  if (profile?.role !== "admin") return null;

  async function handleDelete() {
    setBusy(true);
    try {
      // Counted before the confirm, not after: "detta går inte att ångra" is
      // only meaningful if the admin can see how much "detta" is.
      const cascade = await describeCascade(table, id);
      const warning = cascade
        ? `Detta raderar även ${cascade}.\n\n`
        : "";
      const ok = await confirmDialog({
        title: `Radera "${label}"?`,
        message: `${warning}Detta går inte att ångra.`,
        confirmLabel: "Radera",
        danger: true,
      });
      if (!ok) {
        setBusy(false);
        return;
      }

      // .select() so a delete that RLS silently refused is distinguishable
      // from one that worked. Without it PostgREST returns 200 for both and
      // the toast lies.
      const { data, error } = await supabase.from(table).delete().eq("id", id).select("id");
      if (error) throw error;
      if ((data?.length ?? 0) === 0) {
        throw new Error(
          "Databasen tillät inte borttagningen. Kör supabase-functions/admin-delete.sql.",
        );
      }

      for (const key of invalidateKeys ?? []) qc.invalidateQueries({ queryKey: key });
      toast.success("Raderad");
      onDeleted?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Kunde inte radera";
      // An FK violation now means a table the cascade sweep did not reach.
      toast.error(
        /foreign key|violates/i.test(msg)
          ? "Kan inte raderas — det finns kopplad data kvar. Kör supabase-functions/admin-delete.sql."
          : msg,
      );
    } finally {
      setBusy(false);
    }
  }

  if (variant === "full") {
    return (
      <button
        type="button"
        onClick={handleDelete}
        disabled={busy}
        style={{
          height: 40,
          padding: "0 16px",
          background: "transparent",
          color: "#DC2626",
          border: "1px solid #DC2626",
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          cursor: busy ? "not-allowed" : "pointer",
          opacity: busy ? 0.6 : 1,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Trash2 size={16} /> {busy ? "Raderar…" : "Radera"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={busy}
      title={`Radera ${label}`}
      aria-label={`Radera ${label}`}
      style={{
        background: "transparent",
        border: "none",
        color: "#DC2626",
        cursor: busy ? "not-allowed" : "pointer",
        padding: 6,
        opacity: busy ? 0.5 : 1,
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      <Trash2 size={16} />
    </button>
  );
}
