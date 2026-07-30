import { supabase } from "@/lib/supabase";

export const EVENT_LABEL: Record<string, string> = {
  felanmalan_mottagen: "Felanmälan mottagen",
  arende_status_andring: "Ärende status-ändring",
  besiktning_skapad: "Besiktning skapad",
  besiktning_utford: "Besiktning utförd",
  objekt_kopplad: "Objekt kopplad",
  objekt_frankopplad: "Objekt frånkopplad",
  dokument_uppladdat: "Dokument uppladdat",
  manuell: "Manuell anteckning",
};

export type LogEventInput = {
  event_type: keyof typeof EVENT_LABEL | string;
  property_id: string | null;
  apartment_id?: string | null;
  property_object_id?: string | null;
  description: string;
  created_by?: string | null;
};

export async function logEvent(input: LogEventInput): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from("logbook_entries").insert({
      property_id: input.property_id,
      apartment_id: input.apartment_id ?? null,
      property_object_id: input.property_object_id ?? null,
      event_type: input.event_type,
      content: input.description,
      entry_date: today,
      created_by: input.created_by ?? null,
    } as any);
  } catch {
    // best-effort; never break the caller
  }
}

export function formatLogTitle(event_type: string | null, content: string): string {
  if (!event_type || event_type === "manuell") return content;
  const label = EVENT_LABEL[event_type] ?? event_type;
  return `[${label}] — ${content}`;
}
