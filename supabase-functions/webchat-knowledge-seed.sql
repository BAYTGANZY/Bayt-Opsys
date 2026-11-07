-- Hemsidechatten: grundkunskap från bayt.se (/hemsidechatt → Kunskap)
-- ---------------------------------------------------------------------------
-- Körs EN gång för hand i Supabase → SQL Editor. Säker att köra om: en post läggs
-- bara in om det inte redan finns en med samma rubrik, och befintliga poster rörs inte.
--
-- Bara fakta som står på hemsidan eller har lämnats av BAYT. Det som SAKNAS i
-- underlaget (öppettider, exakt väg för felanmälan, definition av akut, startdatum,
-- månadspris, jourens nummer) är medvetet inte inlagt — lägg till det i
-- Kunskap-fliken när svaret finns, så svarar chatten det i stället för att gissa.
-- ---------------------------------------------------------------------------

insert into public.webchat_knowledge (title, body, sort_order)
select v.title, v.body, v.sort_order
from (values
  (10,  'Vad är BAYT?', 'BAYT AB är ett fastighetssamordningsföretag i Malmö som har arbetat med fastighetssamordning sedan 2015. Vi är styrelsens extra resurs, med en kontaktperson som tar hand om felanmälan, leverantörer och uppföljning. Vårt motto är "En kontakt. Ansvar hela vägen."'),
  (20,  'Vilka jobbar ni för?', 'Vi jobbar för bostadsrättsföreningar och fastighetsägare i Malmö. Det finns ingen övre gräns för hur stor föreningen är eller hur många lägenheter den har.'),
  (30,  'Vilka tjänster erbjuder ni?', 'Vi erbjuder drift och tillsyn, service och ärenden, samordning samt uppföljning. Det innebär veckorondering av fastigheten, felanmälan och bedömning, samordning av hantverkare och leverantörer samt dokumentation av varje ärende. Styrelsen får en veckologg.'),
  (40,  'Vad ingår i drift och tillsyn?', 'Veckorondering av fastigheten, tillsyn av soprum, portar och belysning samt felanmälan och bedömning av om ett ärende är akut eller kan planeras.'),
  (50,  'Vad ingår i service och ärenden?', 'Boende felanmäler till oss, så slipper styrelsen ta emot samtalen. Ni får en kontaktperson och snabb återkoppling, och vi ser till att felet åtgärdas.'),
  (60,  'Vad ingår i samordning?', 'Vi samordnar hantverkare, entreprenörer och leverantörer, till exempel för OVK, hiss, städ och snöröjning. Ni behöver inte jaga dem själva.'),
  (70,  'Vad ingår i uppföljning?', 'Vi följer upp att jobbet blir gjort och dokumenterar varje ärende. Styrelsen får en veckologg, och besluten följs upp till nästa möte.'),
  (80,  'Vad är en veckologg?', 'Veckologgen är en sammanställning till styrelsen över vad som är gjort och vad som är planerat. Då behöver styrelsen inte jaga någon för att få veta läget.'),
  (90,  'Har ni egen personal för el, VVS eller OVK?', 'Nej. Vi utför inte själva el, VVS eller OVK. Vi är oberoende och väljer rätt certifierad partner för varje jobb, och vi leder och följer upp arbetet.'),
  (100, 'Måste vi byta ut våra nuvarande leverantörer eller avtal?', 'Nej. Ni behåller era befintliga avtal om ni vill, och vi samordnar dem.'),
  (110, 'Tar ni över styrelsens ansvar?', 'Nej. Styrelsen beslutar. Vi driver besluten vidare, följer upp och dokumenterar i loggen, så att styrelsen alltid har full insyn.'),
  (120, 'Arbetar ni utanför Malmö?', 'Nej, vi arbetar bara i Malmö. Det gör vi för att hinna vara på plats snabbt.'),
  (130, 'Vad kostar det?', 'Löpande drift har ett fast månadspris som ni får efter platsbesöket. Enstaka ärenden debiteras med cirka 1 200 kr per timme. Fasta kunder har timpris från cirka 600 kr, beroende på tjänst. Alla priser är exklusive moms.'),
  (140, 'Har ni bindningstid?', 'Nej. Uppsägningstiden är tre månader, om inget annat anges i avtalet.'),
  (150, 'Hur blir vi kund?', 'Boka ett kostnadsfritt platsbesök via formuläret "Boka kostnadsfritt platsbesök" på bayt.se eller mejla info@bayt.se. Ange förening eller företag, namn och telefon, och gärna e-post och ett meddelande. Vi svarar inom en arbetsdag och ringer för att hitta en tid. Efter besöket får ni ett fast månadspris.'),
  (160, 'Vad händer vid platsbesöket?', 'Vi kommer förbi i cirka 30 minuter, kostnadsfritt. Vi går igenom fastigheten, soprum och portar. Det är inget säljmöte och ni förbinder er inte till något.'),
  (170, 'Hur snabbt svarar ni på en förfrågan?', 'Vi svarar på förfrågningar inom en arbetsdag.'),
  (180, 'Hur felanmäler jag?', 'Boende felanmäler till BAYT och inte till styrelsen. Du når oss på telefon 040-630 46 00 eller e-post info@bayt.se.'),
  (190, 'Vad händer när jag har felanmält?', 'Vi bedömer om ärendet är akut eller kan planeras, och ser till att det åtgärdas. Vi samordnar hantverkare och följer upp att jobbet blir gjort, och varje ärende dokumenteras. Styrelsen kan följa vad som är gjort i veckologgen.'),
  (200, 'Vad gör jag vid akuta fel?', 'Vi har beredskap dygnet runt. Hur akut-jouren läggs upp anpassar vi efter föreningens behov och skriver in i avtalet.'),
  (210, 'Hur kontaktar jag er?', 'Telefon 040-630 46 00 och e-post info@bayt.se. Adress: BAYT AB, Gräsvallsvägen 3, 238 34 Oxie. Organisationsnummer 559006-2708.'),
  (220, 'Var finns ni?', 'Vi har adress på Gräsvallsvägen 3, 238 34 Oxie, och arbetar i Malmö.'),
  (230, 'Vad är era ordningsregler? Var hittar jag stadgar och boendeinformation?', 'Ordningsregler, stadgar och boendeinformation tillhör den enskilda föreningen och finns inte på BAYT:s hemsida. Fråga din förenings styrelse. Vill du ha hjälp att komma vidare kan du kontakta BAYT på telefon 040-630 46 00 eller e-post info@bayt.se.'),
  (240, 'Hur hanterar ni personuppgifter?', 'Vi behandlar de uppgifter du skickar in i formuläret för att kontakta dig. Det står närmare i vår integritetspolicy på bayt.se/integritetspolicy.'),
  (250, 'Varför ska vi anlita en fastighetssamordnare?', 'Utan fast rutin lägger styrelsen kvällar och helger på felanmälan. Boende hör av sig direkt till styrelsens privata mobiler, ingen vet vem som gjorde vad senast, och hissen kan stå eller soprummet svämma över på helgen. Med BAYT tar vi felanmälan, hantverkare och uppföljning.'),
  (260, 'Vad kostar det att inte ha ordning på fastigheten?', 'Det som kostar är inte själva fastighetssamordningen. Det är kvällarna i styrelsen, felanmälningarna som aldrig tar slut och boende som inte får svar. Det kallar vi den dolda kostnaden: styrelsens tid och missnöjda boende.'),
  (270, 'Vad får vi med BAYT?', 'Du får en kontakt som svarar inom en arbetsdag, ett fast månadspris efter platsbesöket, veckologg och bilder till styrelsen. Vi tar felanmälan, hantverkare och uppföljning.'),
  (280, 'Är det någon bindningstid?', 'Nej. Uppsägningstiden är tre månader, om inget annat anges i avtalet.'),
  (290, 'Varför bara Malmö?', 'Vi är inte rikstäckande, vi är i Malmö. Därför kan vi vara på plats när det behövs, vi känner leverantörerna och vi tar ansvar hela vägen.'),
  (300, 'Är det bara för stora föreningar?', 'Nej. Vi är öppna för alla bostadsrättsföreningar och fastighetsägare i Malmö, stora som små.'),
  (310, 'Vad gör SBF Skydd?', 'SBF Skydd är ett brandskyddsföretag som vänder sig till bostadsrättsföreningar, fastighetsägare och företag. De hjälper till med systematiskt brandskyddsarbete (SBA), alltså rutiner, riskinventeringar och regelbundna kontroller. De sköter också service, installation och underhåll av brandlarm, sprinklersystem, nödljus, rökluckor, stigarledningar och släcksystem. Dessutom gör de brandtätning och brandskyddsbeskrivningar och säljer och installerar brandklassade laddskåp och förvaringsskåp.'),
  (320, 'Behöver vi jaga hantverkare själva?', 'Nej. Det gör vi åt er. Ni ska ha ordning, inte jaga hantverkare.'),
  (330, 'Vad är BRF RTB?', 'BRF RTB är en bostadsrättsförening i Malmö med 104 lägenheter och cirka 8 lokaler.')
) as v(sort_order, title, body)
where not exists (select 1 from public.webchat_knowledge k where k.title = v.title);

-- Kontroll: antal poster (ska vara minst 33).
-- select count(*) from public.webchat_knowledge;
