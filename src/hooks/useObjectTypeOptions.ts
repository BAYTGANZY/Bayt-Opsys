import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { OBJECT_TYPES } from "@/lib/object-tokens";

const SEED_LABELS = OBJECT_TYPES.map((t) => t.label);

/**
 * Suggestion list for the objekt-typ combobox (EditableSelect): the original
 * 8 Swedish labels as a seed (so a fresh table still offers something), unioned
 * with every distinct value already saved on property_objects.type — which is
 * now free text, not an enum, so it grows with whatever admins have typed.
 */
export function useObjectTypeOptions(): string[] {
  const { data: saved = [] } = useQuery({
    queryKey: ["object-type-options"],
    queryFn: async () => {
      const { data } = await supabase.from("property_objects").select("type");
      const values = (data ?? []).map((r) => (r as { type: string }).type).filter(Boolean);
      return Array.from(new Set(values)).sort();
    },
  });

  return useMemo(() => Array.from(new Set([...SEED_LABELS, ...saved])), [saved]);
}
