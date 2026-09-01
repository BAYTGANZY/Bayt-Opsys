// ===========================================================================
// Utskicket till entreprenören när en felanmälan tilldelas.
//
// Kravet (klient, 2026-09-01): den entreprenör som väljs som ansvarig på en
// felanmälan ska få ärendet mejlat till sig — att de fått ett ärende, och vad
// ärendet innehåller. Innan det går iväg ska adressen bekräftas, och rättas
// den ska den nya adressen sparas på entreprenören.
//
// Två steg, i den här ordningen, och ordningen är inte utbytbar:
//   1. gateEntreprenorEmail() — frågar, sparar en ev. ändrad adress på
//      kontakten, och svarar om utskicket får ske. Körs FÖRE skrivningen till
//      `issues`: säger admin nej ska ingen tilldelning bli kvar heller.
//      Annars hade "tilldelad" och "notifierad" kunnat glida isär, och nästa
//      sparning hade inte frågat igen (grinden reagerar bara på ett byte).
//   2. notifyEntreprenorAboutIssue() — anropar edge-funktionen
//      `notify-entreprenor`, som läser adressen ur kontakten (inte ur ett
//      anrop) och skickar. Körs EFTER skrivningen: mejlet innehåller ärendets
//      uppgifter och ska spegla det som faktiskt sparades.
//
// Steg 2 får misslyckas utan att sparningen rullas tillbaka — ärendet är
// sparat, mejlet är det som fattas. Anroparen rapporterar det i sin toast.
// ===========================================================================

import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { normalizeEmail } from "@/lib/contact-tokens";
import { askEntreprenorEmail } from "@/components/EntreprenorEmailDialog";
import { logEvent } from "@/lib/logbook";

export type EntreprenorMailGate =
  | { ok: true; email: string; name: string }
  /** Admin tryckte Avbryt — anroparen ska avbryta hela sparningen. */
  | { ok: false };

/**
 * Ställer bekräftelsefrågan för `contactId` och ser till att adressen som ska
 * användas står på kontakten när den återvänder.
 *
 * Kastar om kontakten inte går att läsa eller om adressen inte gick att spara
 * — då ska sparningen inte fortsätta, för utskicket skulle ändå gå till fel
 * adress.
 */
export async function gateEntreprenorEmail(opts: {
  contactId: string;
  qc: QueryClient;
  arendeTitle?: string | null;
  confirmLabel?: string;
}): Promise<EntreprenorMailGate> {
  const { data: contact, error } = await supabase
    .from("contacts")
    .select("id, full_name, company, email")
    .eq("id", opts.contactId)
    .maybeSingle();
  if (error) throw error;
  if (!contact) throw new Error("Entreprenörens kontaktpost hittades inte.");

  const name = (contact.full_name as string) || "Entreprenören";
  const current = (contact.email as string | null) ?? "";

  const answer = await askEntreprenorEmail({
    name,
    company: contact.company as string | null,
    email: current,
    arendeTitle: opts.arendeTitle ?? null,
    confirmLabel: opts.confirmLabel ?? "Skicka",
  });
  if (answer === null) return { ok: false };

  // Bara en faktisk ändring skriver — annars hade varje bekräftat utskick
  // rört kontakten i onödan (och synts som en ändring i historiken).
  if (normalizeEmail(answer) !== normalizeEmail(current)) {
    const { data: updated, error: upErr } = await supabase
      .from("contacts")
      .update({ email: answer } as never)
      .eq("id", opts.contactId)
      .select("id");
    if (upErr) throw upErr;
    // En UPDATE som RLS filtrerar bort är 200 med noll rader — utan den här
    // kontrollen hade adressen "sparats" utan att ha sparats (samma fälla som
    // statusknapparnas assertWritten).
    if (!updated?.length) {
      throw new Error("Du saknar behörighet att spara e-postadressen på entreprenören.");
    }
    // Två cachar, alltid båda: dropdownen läser ["contacts-entreprenorer"],
    // listorna ["contacts", …].
    opts.qc.invalidateQueries({ queryKey: ["contacts-entreprenorer"] });
    opts.qc.invalidateQueries({ queryKey: ["contacts"] });
  }

  return { ok: true, email: answer, name };
}

/** Svenskt felmeddelande ur ett funktionsanrop — supabase-js kastar en generisk
 *  "Edge Function returned a non-2xx status code" och lämnar kroppen i
 *  `error.context`, där funktionens egna `{ error: "..." }` ligger. */
async function functionErrorMessage(err: unknown, fallback: string): Promise<string> {
  const ctx = (err as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = await ctx.clone().json();
      if (body?.error) return String(body.error);
    } catch {
      /* kroppen var inte JSON — fall igenom */
    }
  }
  const msg = (err as { message?: string } | null)?.message;
  return msg && !/non-2xx/i.test(msg) ? msg : fallback;
}

/**
 * Mejlar ärendet till den tilldelade entreprenören och skriver en rad i
 * loggboken om att det gick iväg.
 *
 * Kastar med ett svenskt meddelande om utskicket misslyckas — ärendet är
 * redan sparat vid det laget, så anroparen ska rapportera felet, inte ångra
 * sparningen.
 */
export async function notifyEntreprenorAboutIssue(opts: {
  issueId: string;
  propertyId: string | null;
  apartmentId?: string | null;
  propertyObjectId?: string | null;
  title: string;
  contactName: string;
  email: string;
  createdBy?: string | null;
}): Promise<void> {
  const { data, error } = await supabase.functions.invoke("notify-entreprenor", {
    body: { issue_id: opts.issueId },
  });
  if (error) {
    throw new Error(await functionErrorMessage(error, `E-posten till ${opts.contactName} kunde inte skickas.`));
  }
  if (data?.error) throw new Error(String(data.error));

  // Best-effort spår av att mejlet faktiskt gick — "skickades det?" är annars
  // omöjligt att svara på i efterhand. logEvent sväljer sina egna fel.
  await logEvent({
    event_type: "entreprenor_notifierad",
    property_id: opts.propertyId,
    apartment_id: opts.apartmentId ?? null,
    property_object_id: opts.propertyObjectId ?? null,
    description: `${opts.title} — skickat till ${opts.contactName} (${opts.email})`,
    created_by: opts.createdBy ?? null,
  });
}
