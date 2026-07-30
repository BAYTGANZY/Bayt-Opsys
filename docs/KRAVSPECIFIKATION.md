# Kravspecifikation — BAYT Admin Portal

**Bilaga till avtal — Leverantörens åtagande**

| | |
|---|---|
| **System** | BAYT Admin Portal (BAYT Opsys) |
| **Systemtyp** | Webbaserad plattform för fastighetsförvaltning (BRF) |
| **Dokumentversion** | 2.0 |
| **Dokumentdatum** | 2026-07-26 |
| **Systemspråk** | Svenska |

---

## 1. Omfattning

Denna bilaga beskriver den funktionalitet Leverantören åtar sig att leverera. Avsnitt 3–9 utgör tillsammans leveransens omfattning. Leveransen anses fullgjord när funktionaliteten är driftsatt och verifierad enligt avsnitt 10.

Detaljerade lösningsval — teknisk struktur, datamodellens exakta utformning, gränssnittets detaljerade layout — beslutas av Leverantören inom ramen för nedan beskrivna funktioner.

---

## 2. Systemets syfte

BAYT Admin Portal är en molnbaserad förvaltningsplattform för svenska bostadsrättsföreningar och fastighetsförvaltare. Systemet samlar förvaltningens löpande arbete i ett gemensamt gränssnitt: fastighetsbestånd, lägenhetsregister, felanmälningar, besiktningar, projekt, dokument, kontakter, loggbok, ekonomiuppföljning och intern kommunikation. Boende kan anmäla fel via ett publikt formulär utan inloggning.

Systemet levereras som en responsiv webbapplikation med molnbaserad backend, och används på dator, surfplatta och mobil.

---

## 3. Användare och behörighet

Systemet har fyra användarkategorier.

**Administratör** — fastighetsförvaltare med full behörighet i hela systemet. Ensam behörighet att skapa och redigera poster, bjuda in användare och administrera behörigheter.

**Styrelse** — styrelseledamot med läsbehörighet, begränsad till de fastigheter en administratör kopplat till användaren. Begränsningen gäller genomgående i systemet. Styrelsen kan därutöver kommunicera med administratör via systemets meddelandefunktion.

**Entreprenör** — extern utförare med åtkomst till de ärenden där entreprenören är angiven som ansvarig, samt tillhörande fastighet i kontextsyfte. Entreprenören kan öppna och avsluta sina ärenden och kommunicera med administratör, men har i övrigt ingen redigeringsbehörighet.

**Boende** — hyresgäst eller bostadsrättshavare utan inloggning, med åtkomst till det publika felanmälningsformuläret.

**Krav på åtkomstkontroll:** behörighet ska upprätthållas både i gränssnittet och på databasnivå. Att dölja en funktion i menyn utgör inte i sig åtkomstkontroll — en användare ska inte kunna nå obehörig information genom direkt adressinmatning eller genom anrop utanför gränssnittet.

**Inloggning:** användare skapas genom inbjudan från administratör och sätter eget lösenord vid första inloggningen. Systemet hanterar sessioner, utloggning och lösenordsbyte.

---

## 4. Funktionella moduler

### 4.1 Översikt och startvy
Sammanfattande vy med nyckeltal för fastighetsbeståndet, aktiva ärenden och inkomna felanmälningar, samt genvägar vidare i systemet. Innehållet anpassas efter användarens roll.

### 4.2 Dagsrapport
Arbetsvy som samlar dagens aktuella ärenden och gör det möjligt att aktivera och avsluta dem direkt. Förändringar registreras i ärendets historik.

### 4.3 Fastigheter
Register över fastighetsbeståndet med grunduppgifter, bild och beskrivning. Varje fastighet har en egen vy med undersektioner för lägenheter, felanmälningar, åtgärdslista, dokument, besiktningar, kontakter, loggbok, projekt, objekt och historik. Vilka sektioner som visas styrs av användarens roll.

### 4.4 Lägenheter
Register över lägenheter med uppgifter om nummer, trapphus, våning, yta, status, hyresgäst och in- och utflyttningsdatum. Varje lägenhet har en egen vy med en kronologisk aktivitetshistorik som standardvy, samt sektioner för grunduppgifter, felanmälningar, besiktningar, dokument och loggbok.

Lägenheter kan registreras från flera ställen i systemet. Samtliga registreringsvägar ska tillämpa samma validering.

### 4.5 Felanmälningar
Hantering av felanmälningar med uppgift om fastighet, lägenhet, kategori, prioritet, beskrivning, deadline, ansvarig och anmälarens kontaktuppgifter. Bilder och filer kan bifogas. Ärendet har kommentarsfunktion och statushistorik.

Felanmälningar kan uppstå på två sätt: registrerade internt av administratör, eller inkomna via det publika formuläret. Systemet skiljer på ursprunget.

### 4.6 Besiktningar
Hantering av besiktningar med uppgift om typ, besiktningsman, senast utfört datum, intervall och nästa förfallodatum. Besiktningsprotokoll kan laddas upp och laddas ned.

### 4.7 Projekt
Hantering av projekt med titel, beskrivning, budget, start- och slutdatum samt ansvarig. Projektbilder kan laddas upp.

### 4.8 Objekt
Register över fastighetens objekt — hiss, vind, miljörum, källare, systematiskt brandskyddsarbete, tvättstuga, förråd och lokal. Objekt kan kopplas till lägenhet och ges en driftstatus. Statusändringar registreras automatiskt i loggboken.

### 4.9 Kontakter
Kontaktregister med uppgift om namn, typ, företag och kontaktuppgifter. Kontakter kan antingen kopplas till en enskild fastighet eller vara systemövergripande och därmed valbara som ansvarig i hela systemet. Ny kontakt ska kunna läggas till direkt i pågående formulär utan att arbetet avbryts.

### 4.10 Dokument
Dokumenthantering med uppladdning, kategorisering, filtrering och nedladdning. Dokument kan kopplas till fastighet eller lägenhet och nås från såväl den globala vyn som från respektive fastighet och lägenhet.

### 4.11 Loggbok
Löpande anteckningar kopplade till fastighet, lägenhet eller objekt. Systemet skapar automatiskt anteckningar vid väsentliga händelser, exempelvis inkommen felanmälan eller ändrad objektstatus. Loggboken presenteras som en sammanslagen tidslinje och stödjer kommentarer på enskilda händelser.

### 4.12 Ekonomi
Budgetuppföljning per fastighet och år, med kostnadskategorier, budgetposter samt jämförelse mellan budget, utfall och differens. Grafisk presentation ingår.

### 4.13 Meddelanden
Intern meddelandefunktion med direktkonversationer och gruppkonversationer. Meddelanden levereras i realtid och systemet visar lästmarkering.

Regelverk: administratör kan kommunicera med samtliga användare och är ensam behörig att skapa grupper. Styrelse och entreprenör kan kommunicera direkt med administratör, och entreprenör kan därutöver delta i grupper som administratör skapat. Regelverket ska upprätthållas på databasnivå.

### 4.14 Notiser
Notisfunktion i topplisten som visar olästa meddelanden och pågående akutärenden, både som panel och som tillfälliga popup-notiser. Notiser nollställs när användaren tagit del av innehållet.

### 4.15 Sökning
Global sökfunktion som söker samtidigt i fastigheter, dokument, felanmälningar, kontakter och projekt, med resultat grupperade per kategori.

### 4.16 Inställningar
Egen profil med namn, telefonnummer och profilbild, samt lösenordsbyte. Administratör har därutöver användaradministration: inbjudan av nya användare, tilldelning av roll, koppling av styrelseanvändare till fastigheter samt koppling av entreprenörsanvändare till kontaktpost.

### 4.17 Genomgående listfunktionalitet
Samtliga listvyer ska erbjuda sortering, filtrering, export till kalkylformat samt tydliga tomtillstånd. Listor presenteras responsivt och anpassas till skärmstorlek.

---

## 5. Publik felanmälan

Boende ska kunna anmäla fel utan inloggning via ett publikt formulär. Formuläret efterfrågar kontaktuppgifter, fastighet, lägenhetsnummer och trapphus samt en beskrivning av felet, med möjlighet att bifoga bilder.

**Krav på flödet:**

- Systemet kopplar automatiskt anmälan till rätt lägenhet utifrån de uppgifter den boende anger. Om lägenheten inte finns registrerad skapas den och märks för administratörsgranskning.
- Flödet ska aldrig kunna skapa dubbletter av en lägenhet.
- Av integritetsskäl får lägenhetsnummer inte presenteras som en valbar lista — den boende anger sitt eget nummer. Systemet ska inte exponera uppgifter om andra boende.
- Inkomna anmälningar ska hamna i ett granskningsläge där administratör kan justera uppgifterna och därefter godkänna eller avslå anmälan.
- Fel i inlämningen ska besvaras med begripliga svenska meddelanden.

---

## 6. Affärsregler

Följande regler är verksamhetskritiska och ingår som uttryckliga krav.

### 6.1 Ärendets livscykel
Felanmälningar, besiktningar och projekt delar en gemensam livscykel i tre steg: **inkommet → aktivt → avslutat**. Övergångarna sker genom uttrycklig handling av användaren, aldrig automatiskt, och varje övergång registreras i ärendets historik med tidpunkt och användare.

### 6.2 Härledd ärendestatus
Status på en felanmälan väljs inte manuellt utan härleds av systemet utifrån ärendets prioritet, skapandedatum och eventuell deadline. En satt deadline har alltid företräde. Saknas deadline beräknas den utifrån prioritetens tidsgräns.

Resulterande statusvärden är **Ny**, **Pågående**, **Brådskande**, **Försenad** och **Avslutad**. Varje status ska åtföljas av en förklaring på svenska som anger varför statusen gäller och vilket datum ärendet ska vara åtgärdat.

Statusen ska beräknas på ett och samma sätt i hela systemet, så att olika vyer aldrig kan visa motstridiga uppgifter om samma ärende.

### 6.3 Prioritet och tidsgränser
Prioritetsnivåerna är Låg, Normal, Hög och Akut, med tillhörande åtgärdstider. Prioritet Låg saknar tidsgräns och blir därmed aldrig försenad utan uttryckligt satt deadline.

### 6.4 Lägenhetsidentitet
En lägenhet identifieras entydigt av kombinationen fastighet, lägenhetsnummer och trapphus. Lägenhetsnummer återkommer mellan trapphus i samma fastighet och utgör därför inte ensamt en identitet.

Samtliga tre uppgifter är obligatoriska vid registrering av lägenhet, oavsett var i systemet registreringen sker. Uppgifterna normaliseras enhetligt så att den boendes inmatning i det publika formuläret matchar administratörens registrering. Trapphus betecknas alltid med bokstäver.

Kravet är avgörande för att publika felanmälningar ska kopplas till rätt lägenhet. Befintliga poster som saknar trapphus ska markeras tydligt i gränssnittet så att de kan revideras.

### 6.5 Ansvarig
Felanmälningar, besiktningar och projekt kan tilldelas en ansvarig från kontaktregistret. Tilldelningen utgör systemets koppling mellan ärende och utförare, och styr vilka ärenden en entreprenörsanvändare får åtkomst till.

---

## 7. Teknisk plattform

Systemet levereras som en responsiv webbapplikation byggd i React med TypeScript, mot en molnbaserad backend i Supabase omfattande databas, autentisering, filhantering, serverlösa funktioner och realtidsuppdatering.

Driftsättning sker automatiserat från projektets kodrepository. Källkod, databasmigrationer och serverlösa funktioner versionshanteras.

Tekniska val i övrigt — bibliotek, komponentstruktur, datamodellens detaljerade utformning — beslutas av Leverantören.

**Designprofil:** systemet följer ett enhetligt formspråk med BAYT:s gröna färgskala och definierade typsnitt för rubrik respektive brödtext.

---

## 8. Data och säkerhet

**Datalagring.** Systemets uppgifter lagras i en relationsdatabas med sammanhängande register för fastigheter, lägenheter, felanmälningar, besiktningar, projekt, objekt, kontakter, dokument, loggbok, åtgärder, ekonomi, användare och meddelanden, inklusive stödregister för bilder, protokoll, kommentarer och historik.

**Filhantering.** Dokument, besiktningsprotokoll, projektfiler, fastighetsbilder och profilbilder lagras i separata utrymmen i molntjänstens fillagring.

**Säkerhetskrav.**

- Behörighetskontroll ska vara upprätthållen på databasnivå, inte enbart i gränssnittet.
- Publik åtkomst begränsas till det minimum det publika formuläret kräver. Uppgifter om lägenheter och boende får inte vara åtkomliga utan inloggning.
- Privilegierade nycklar får aldrig förekomma i klientkoden.
- Personuppgifter i användarregistret exponeras endast i den utsträckning gränssnittet faktiskt kräver.

---

## 9. Övriga krav

| Område | Krav |
|---|---|
| Språk | Samtligt användargränssnitt, felmeddelanden och systemtexter på svenska |
| Responsivitet | Fullt användbart på dator, surfplatta och mobil, med anpassad navigering |
| Webbläsare | Aktuella versioner av Chrome, Edge, Safari och Firefox |
| Prestanda | Sidor laddas stegvis och data cachas för att hålla gränssnittet responsivt |
| Felhantering | Fel presenteras med begriplig orsak, inte som generiska meddelanden |
| Tillgänglighet | Tangentbordsnavigerbara menyer och dialoger, semantisk uppmärkning |
| Datum | Systemet räknar i svensk lokal tid |
| Kodkvalitet | Projektet ska bygga och typkontrolleras utan fel |

---

## 10. Acceptanskriterier

Leveransen anses fullgjord när följande är uppfyllt och verifierat:

1. Samtliga moduler enligt avsnitt 4 är åtkomliga och fungerar för avsedd användarkategori.
2. Behörighetsmodellen enligt avsnitt 3 fungerar, inklusive att obehörig åtkomst blockeras även utanför gränssnittet.
3. Styrelseanvändare ser uteslutande data för de fastigheter som kopplats till kontot.
4. Entreprenörsanvändare ser uteslutande ärenden där kontot är angivet som ansvarig, och kan öppna och avsluta dessa.
5. Ärendets livscykel och härledda status fungerar enhetligt i hela systemet enligt avsnitt 6.
6. Lägenhetsidentitet enligt avsnitt 6.4 upprätthålls i samtliga registreringsvägar.
7. Publik felanmälan enligt avsnitt 5 kopplar anmälan till rätt lägenhet, skapar inga dubbletter, hanterar bilagor och landar i granskningsläge.
8. Meddelandefunktionens regelverk upprätthålls på databasnivå.
9. Filuppladdning och nedladdning fungerar i samtliga moduler där det ingår.
10. Sortering, filtrering och export fungerar i systemets listvyer.
11. Systemet är fullt användbart på dator, surfplatta och mobil, och gränssnittet är genomgående på svenska.
12. Systemet är driftsatt i produktionsmiljö och överlämningsdokumentation är levererad.

---

## 11. Avgränsningar

Följande ingår inte om det inte avtalats separat i skriftlig tilläggsbeställning:

- Integration mot externa ekonomi- eller fastighetssystem, eller mot BankID.
- Automatiserade e-post- eller SMS-utskick till boende.
- Separat mobilapplikation för iOS eller Android — systemet levereras som responsiv webbapplikation.
- Migrering av historiska data från tidigare system.
- Utbildningsinsatser utöver överlämningsdokumentation.
- Löpande drift, support och förvaltning efter godkänd leverans.

---

## 12. Beställarens åtaganden

Leveransen förutsätter att Beställaren:

- Tillhandahåller och bekostar konto för molntjänst och hosting.
- Tillhandahåller domännamn och eventuella certifikat.
- Utser en kontaktperson med mandat att fatta beslut om funktionsutformning.
- Levererar grunddata — fastighetsbestånd, lägenhetsregister och kontaktuppgifter — i överenskommet format.
- Genomför acceptanstest inom överenskommen tid efter leveransanmälan.
- Ansvarar för revidering av befintliga lägenhetsuppgifter som saknar trapphus.

---

*Slut på kravspecifikation.*
