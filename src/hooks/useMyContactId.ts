import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

/**
 * Kontakt-id:t som matchar ingenting. En entreprenör utan kopplad kontaktpost
 * ska få en tom lista, inte hela registret — filtret måste alltså finnas kvar
 * och peka på något som aldrig kan träffa.
 */
export const NO_CONTACT = "__none__";

/**
 * Kontaktposterna den inloggade får arbeta som — normalt exakt en, men inte
 * alltid.
 *
 * En entreprenör finns två gånger i systemet: som inloggning (`profiles`) och
 * som valbart namn (`contacts`). `contacts.profile_id` binder ihop dem, och det
 * är den kopplingen som gör att ett ärendes `assigned_contact_id` kan filtreras
 * mot den som är inloggad.
 *
 * TVÅ VÄGAR IN I LISTAN, och skillnaden är hela poängen:
 *
 *   1. `contacts.profile_id = auth.uid()` — mina egna kontaktposter. Flera är
 *      möjligt (en kontakt som relänkats för hand vid något tillfälle).
 *   2. `contact_delegations` — kontaktposter som någon *annan* äger men som den
 *      här inloggningen också får arbeta som. Riktningen är enkelriktad: att
 *      plattformskontot får se en medarbetares ärenden ger inte medarbetaren
 *      något av plattformskontots. Se supabase-functions/account-delegation.sql;
 *      `my_contact_ids()` är samma regel i SQL och de två måste ändras ihop.
 *
 * Delegeringstabellen är en handkörd migration precis som resten av
 * supabase-functions/*.sql. Saknas den ska det bli "inga delegeringar", aldrig
 * "inga ärenden" — därför sväljs läsfelet här.
 *
 * Returnerar `undefined` under laddning och en tom lista när det definitivt
 * inte finns någon kontakt, så anropare kan skilja "vet inte än" från "inget".
 */
async function loadDelegatedContactIds(profileId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("contact_delegations")
    .select("contact_id")
    .eq("profile_id", profileId);
  if (error) {
    // PGRST205 (tabellen finns inte i schemacachen) om SQL:en inte är körd än.
    // Degraderar till "inga delegeringar" — att kasta här hade tömt varje
    // ärendelista i appen för en migration som bara vidgar.
    console.warn("[useMyContactIds] contact_delegations kunde inte läsas:", error.message);
    return [];
  }
  return (data ?? [])
    .map((r) => (r as { contact_id: string | null }).contact_id)
    .filter((id): id is string => !!id);
}

export function useMyContactIds() {
  const { user, profile } = useAuth();
  const enabled = profile?.role === "entreprenor" && !!user?.id;

  const q = useQuery({
    queryKey: ["my-contact-ids", user?.id],
    enabled,
    // En kontaktkoppling kan skapas medan användaren redan är inloggad — en
    // admin lägger upp entreprenören, eller delegerar ett konto. Utan de här
    // två skulle den inloggade behöva logga ut och in för att kopplingen ska
    // slå igenom, vilket är precis den buggen det här ska stänga.
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      // limit saknas med flit: två kontakter som pekar på samma inloggning är
      // möjligt och båda ska räknas. Tidigare togs den första och resten föll
      // tyst bort.
      const { data, error } = await supabase
        .from("contacts")
        .select("id")
        .eq("profile_id", user!.id);
      if (error) throw error;

      let own = (data ?? []).map((r) => r.id as string);

      // SJÄLVLÄKNING: en tom koppling var förr en återvändsgränd — kontot visade
      // "inte kopplad till någon kontaktpost" och varje lista stod tom, vilket
      // är exakt vad som hände den som raderats och bjudits in igen (ett nytt
      // profiles.id matchar ingenting). Ett tomt uppslag faller nu vidare till
      // ensure_my_contact_link(), som återlänkar — eller skapar — kontakten för
      // auth.uid() och ingen annan. Se supabase-functions/account-continuity.sql;
      // samma regel körs DB-sidan som en trigger på profiles, så det här är
      // livremmen till hängslena.
      if (own.length === 0) {
        const { data: healed, error: healError } = await supabase.rpc("ensure_my_contact_link");
        if (healError) {
          // account-continuity.sql inte körd än (PGRST202 = ingen sådan funktion).
          console.warn("[useMyContactIds] ensure_my_contact_link misslyckades:", healError.message);
        } else if (healed) {
          own = [healed as string];
        }
      }

      const delegated = await loadDelegatedContactIds(user!.id);

      // Sorterad och avduplicerad så cachenyckeln inte ändras av radordningen.
      return Array.from(new Set([...own, ...delegated])).sort();
    },
  });

  const contactIds = q.data;

  return {
    /** Alla kontaktposter jag får arbeta som. `undefined` = laddar än. */
    contactIds,
    /**
     * Min egen kontaktpost — den som ska stå som ansvarig när *jag* gör något.
     * Delegerade kontakter är någon annans; de får läsas, inte skrivas i.
     */
    contactId: contactIds === undefined ? undefined : (contactIds[0] ?? null),
    isLoading: enabled && q.isLoading,
    isEntreprenor: profile?.role === "entreprenor",
  };
}

/**
 * Bakåtkompatibel enkel-id-variant. Kvar för de anropare som verkligen menar
 * "min egen kontaktpost" (t.ex. vem som ska stå som avsändare) snarare än
 * "allt jag får se".
 *
 * För ett *urval* av ärenden: använd useMyArendeScope nedan. Filtrerar man på
 * ett enda id får en delegerad inloggning se hälften av sina ärenden, och
 * sidorna börjar motsäga varandra.
 */
export function useMyContactId() {
  const { contactId, isLoading, isEntreprenor } = useMyContactIds();
  return { contactId, isLoading, isEntreprenor };
}

/**
 * "Bara mina ärenden" som ett återanvändbart frågefilter.
 *
 * Klientkrav (2026-07-30): en entreprenör ser **varje ärende som är tilldelat
 * dem, oavsett status, och ingenting annat** — inte andra entreprenörers
 * arbete, inte byggnadens historik, inte en lägenhets gamla felanmälningar.
 * Status ingår uttryckligen inte: deras egna avslutade ärenden ska synas kvar
 * som kvitto på utfört arbete.
 *
 * Utvidgat 2026-09-01: urvalet är en *lista* kontakt-id, inte ett. Ett konto
 * kan ha delegerats en annan entreprenörs kontaktpost (se useMyContactIds), och
 * då hör båda kontakternas ärenden till "mina". Riktningen är enkelriktad — den
 * delegerade ser fortfarande bara sitt eget.
 *
 * Användning — varje ärendeläsning som inte redan är nycklad på tilldelning:
 *   const { filterContactIds, ready } = useMyArendeScope();
 *   useQuery({ queryKey: [..., filterContactIds], enabled: ready, queryFn: async () => {
 *     let q = supabase.from("issues").select(...).eq("apartment_id", id);
 *     if (filterContactIds) q = q.in("assigned_contact_id", filterContactIds);
 *     ...
 *
 * `filterContactIds` är null för admin/styrelse (ingen inskränkning — de ska se
 * allt) och `[NO_CONTACT]` för en entreprenör utan kopplad kontakt, vilket
 * matchar ingenting. Medvetet ett värde och inte en fråge-wrapper: PostgREST-
 * byggarnas generics överlever inte att skickas runt.
 *
 * Det här är filtrering i gränssnittet, inte en gräns. Databasen låter
 * fortfarande vilken inloggad användare som helst läsa varje ärende; att stänga
 * det kräver RLS på issues/inspections/projects (uppskjutet enligt beslut
 * 2026-07-30). Förväxla det inte med åtkomstkontroll.
 */
export function useMyArendeScope() {
  const { contactIds, isEntreprenor } = useMyContactIds();

  // Stabil referens: listan går in i queryKeys, och en ny array per render
  // skulle ge en ny cachepost per render.
  const filterContactIds = useMemo(() => {
    if (!isEntreprenor) return null;
    if (contactIds === undefined) return [NO_CONTACT];
    return contactIds.length > 0 ? contactIds : [NO_CONTACT];
  }, [isEntreprenor, contactIds]);

  return {
    filterContactIds,
    /** Falskt medan kontaktkopplingen fortfarande löses — fråga inte än. */
    ready: !isEntreprenor || contactIds !== undefined,
    isEntreprenor,
  };
}
