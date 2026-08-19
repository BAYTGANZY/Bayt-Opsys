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

/**
 * The sub-kinds an `arende_status_andring` entry splits into.
 *
 * "Ärende status-ändring" is one event_type covering five materially different
 * actions, so filtering on event_type alone would put "öppnade" and "avbröt" in
 * the same bucket. The status the ärende moved *to* is the action — it is the
 * only part of the transition the reader cares about.
 */
const STATUS_ACTION_KIND: Record<string, string> = {
  oppet: "oppnad",
  avslutat: "avslutad",
  aktiv: "aterupptagen",
  pausad: "pausad",
  avbruten: "avbruten",
};

/** Swedish label per key returned by `actionKindOf` — event_types and the
 *  status sub-kinds together, so a filter never has to know which it holds. */
export const ACTION_KIND_LABEL: Record<string, string> = {
  ...EVENT_LABEL,
  oppnad: "Öppnade ärende",
  avslutad: "Avslutade ärende",
  aterupptagen: "Återupptog ärende",
  pausad: "Pausade ärende",
  avbruten: "Avbröt ärende",
  // Rows a loggbok list derives from the ärende itself rather than from a
  // logbook_entries row (the merged fastighets-/allbyggnadsfeed).
  projekt: "Projekt",
};

export function actionKindLabel(kind: string): string {
  return ACTION_KIND_LABEL[kind] ?? kind;
}

/**
 * A stable filter key for one loggbokspost.
 *
 * For every event_type except `arende_status_andring` the key *is* the
 * event_type. Status changes are split further by parsing the target status out
 * of the entry text, which `OppnaArendeButton`, `AvslutaArendeButton`,
 * `ProjektStatusButtons` and dag-rapport all write as
 * `"<titel> (<från> → <till>)"` — the trailing arrow is the contract, and
 * OppnaArendeButton's resume variant ("(pausad → aktiv, vilande → oppet)")
 * puts the status that matters last for exactly this reason.
 *
 * Never throws and never returns empty: an unparseable or unmapped entry falls
 * back to its raw event_type, so the row keeps a bucket instead of vanishing
 * from a filter that claims to show everything.
 */
export function actionKindOf(event_type: string | null | undefined, content: string | null | undefined): string {
  const type = (event_type ?? "").trim() || "manuell";
  if (type !== "arende_status_andring") return type;
  const match = /→\s*([\p{L}_]+)\s*\)\s*$/u.exec(content ?? "");
  const target = match?.[1]?.toLowerCase();
  return (target && STATUS_ACTION_KIND[target]) || type;
}

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
