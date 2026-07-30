# Kravspecifikation — BAYT Admin Portal

**Bilaga till avtal — Leverantörens åtagande (Scope of Work)**

| | |
|---|---|
| **System** | BAYT Admin Portal (BAYT Opsys) |
| **Systemtyp** | Webbaserad SaaS-plattform för fastighetsförvaltning (BRF) |
| **Dokumentversion** | 1.0 |
| **Dokumentdatum** | 2026-07-26 |
| **Systemspråk** | Svenska (samtligt användargränssnitt) |
| **Avtalsroll** | Denna bilaga utgör den fullständiga funktionella och tekniska kravbilden för Leverantörens åtagande |

---

## 1. Syfte och omfattning

### 1.1 Dokumentets syfte

Detta dokument specificerar samtliga funktioner, sidor, affärsregler, databasstrukturer och integrationer som ingår i Leverantörens åtagande enligt avtalet. Punkterna i avsnitt 4–12 utgör tillsammans den kompletta leveransen. Leveransen anses fullgjord när samtliga krav i detta dokument är implementerade, driftsatta och verifierade enligt acceptanskriterierna i avsnitt 14.

### 1.2 Systemets syfte

BAYT Admin Portal är en molnbaserad förvaltningsplattform för svenska bostadsrättsföreningar och fastighetsförvaltare. Systemet samlar fastighetsbestånd, lägenhetsregister, felanmälningar, besiktningar, projekt, dokumenthantering, kontaktregister, loggbok, ekonomiuppföljning och intern kommunikation i ett gemensamt gränssnitt, samt tillhandahåller ett publikt felanmälningsformulär för boende utan inloggning.

### 1.3 Målgrupper

| Målgrupp | Åtkomst | Beskrivning |
|---|---|---|
| **Administratör** | Inloggning, full behörighet | Fastighetsförvaltare/driftansvarig. Full läs- och skrivbehörighet i hela systemet. |
| **Styrelse** | Inloggning, läsbehörighet | Styrelseledamot i bostadsrättsförening. Läsbehörighet begränsad till kopplade fastigheter. |
| **Entreprenör** | Inloggning, begränsad behörighet | Extern utförare. Åtkomst endast till ärenden där entreprenören är satt som Ansvarig. |
| **Boende** | Ingen inloggning | Hyresgäst/bostadsrättshavare. Åtkomst till publikt felanmälningsformulär. |

---

## 2. Teknisk plattform

### 2.1 Frontend

| Komponent | Teknik | Version |
|---|---|---|
| Byggverktyg | Vite | 8.x |
| UI-ramverk | React | 19.x |
| Språk | TypeScript | 5.8 |
| Routing | TanStack Router (filbaserad routing, automatisk kodsplittring) | 1.168 |
| Datahämtning/cache | TanStack Query | 5.83 |
| Styling | Tailwind CSS v4 samt inline-stilar med lokal färgpalett per vy | 4.2 |
| Komponentbibliotek | Radix UI (dialog, dropdown, select, tabs, tooltip, m.fl.) | 1.x–2.x |
| Ikoner | Hugeicons Free, Lucide React | — |
| Diagram | Recharts | 3.8 |
| Notiser (UI) | Sonner | 2.x |
| Formulär och validering | React Hook Form, Zod | 7.x / 3.x |
| Datumhantering | date-fns | 4.x |
| Kodkvalitet | ESLint 9, Prettier 3, TypeScript strict | — |

Applikationen är en ren klientrenderad SPA (Single Page Application). Ingen serverrendering (SSR) förekommer.

### 2.2 Backend

Backend levereras som Supabase-plattform (Backend-as-a-Service) omfattande:

- **PostgreSQL-databas** — samtliga tabeller i schemat `public`
- **Supabase Auth** — e-post/lösenordsautentisering, sessionshantering, tokenförnyelse
- **Supabase Storage** — filhantering i fem separata buckets
- **Supabase Edge Functions** — serverlösa Deno-funktioner för privilegierade operationer
- **Supabase Realtime** — live-uppdatering av chattmeddelanden och läskvitton
- **Row Level Security (RLS)** — behörighetskontroll på databasnivå

Klientanslutning sker via `@supabase/supabase-js` v2 med publicerbar API-nyckel. Sessionen persisteras i webbläsarens `localStorage` med automatisk tokenförnyelse.

### 2.3 Driftsättning

| Aspekt | Specifikation |
|---|---|
| Hosting frontend | GitHub Pages |
| CI/CD | GitHub Actions — automatisk build och deploy vid push till `main` |
| Byggsteg | `npm ci` → `npm run build` → publicering av `dist/` |
| SPA-fallback | `dist/index.html` kopieras till `dist/404.html` så att djuplänkar (t.ex. `/fastigheter/123`) laddar applikationen i stället för 404-sida |
| Bassökväg | `/Bayt-Opsys/` |
| Hosting backend | Supabase (managed) |

### 2.4 Designsystem

| Element | Specifikation |
|---|---|
| Typsnitt rubriker | Outfit |
| Typsnitt brödtext | Inter |
| Primärfärg (mörkgrön, sidomeny/varumärke) | `#0D2B1E` |
| Accentfärg (grön) | `#5CB84A` |
| Knappfärg (primär) | `#3D8A30` |
| Ramfärger | `#E5E7EB` / `#E9EBE9` |
| Hörnradie | 6–14 px beroende på komponenttyp |
| Responsivitet | Fullt responsiv — separat sidomeny för desktop, hopfällbar meny och bottennavigering för mobil |

---

## 3. Roller, behörighet och åtkomstkontroll

### 3.1 Rollmodell

Roll lagras i kolumnen `profiles.role` och antar exakt ett av värdena `admin`, `styrelse`, `entreprenor`.

### 3.2 Administratör (`admin`)

- Full läs- och skrivbehörighet i systemets samtliga moduler.
- Ensam behörighet att skapa nya poster (samtliga `/new`-vyer).
- Ensam behörighet att bjuda in användare, tilldela roller och administrera behörigheter.
- Ensam behörighet att skapa gruppkonversationer i Chatt.
- Ensam behörighet att radera chattmeddelanden skickade av annan användare.

### 3.3 Styrelse (`styrelse`)

- **Behörighetsnivå:** läsbehörighet. Ingen redigering, skapande eller radering någonstans i systemet.
- **Omfattning:** begränsad till de fastigheter som en administratör uttryckligen kopplat till användaren. Begränsningen gäller genomgående i hela applikationen — Fastigheter, Lägenheter, Felanmälningar, Besiktningar, Projekt, Dokument, Kontakter och Loggbok.
- **Tillgängliga vyer:** `/fastigheter`, `/properties/*`, `/apartments`, `/issues`, `/inspections`, `/projects`, `/loggbok`, `/installningar`, `/chatt`.
- **Fastighetsundersidor:** Info, Lägenheter, Felanmälningar, Besiktningar, Projekt, Loggbok. Objekt, Dokument, Kontakter, Åtgärdslista och Historik är ej åtkomliga.
- **Koppling till fastighet:** sätts vid inbjudan via flervalslista hämtad live från `properties`. Kopplingen kan därefter endast ändras av administratör via behörighetspanel nåbar från Inställningar → Användare. Ingen självbetjäning och ingen automatik — en nyskapad fastighet blir **inte** automatiskt synlig för befintliga styrelsemedlemmar.
- **Undantag:** Styrelse får skicka meddelanden i Chatt, dock endast i direktkonversation med administratör.

### 3.4 Entreprenör (`entreprenor`)

- **Omfattning:** samtliga felanmälningar, besiktningar och projekt — historiska, pågående och framtida — där entreprenören är satt som Ansvarig, samt tillhörande fastighet i kontextsyfte.
- **Tillgängliga vyer:** `/dag-rapport`, `/fastigheter`, `/properties/*`, `/issues`, `/inspections`, `/projects`, `/loggbok`, `/installningar`, `/chatt`.
- **Fastighetsundersidor:** Info, Felanmälningar, Besiktningar, Projekt, Loggbok.
- **Tillåtna åtgärder:** Öppna ärende och Avsluta ärende på samtliga tre ärendetyper. Kommentera loggbokshändelser kopplade till egna ärenden. Ingen övrig redigering.
- **Koppling login ↔ kontakt:** inbjudningsflödet ska innehålla ett steg som kopplar den nya inloggningen (`profiles`) till en befintlig eller nyskapad rad i `contacts`, så att ärenden kan filtreras på `assigned_contact_id` för det aktuella kontot.
- **Undantag:** Entreprenör får skicka meddelanden i Chatt — direktkonversation med administratör, samt deltagande i gruppkonversationer som administratör skapat.

### 3.5 Åtkomstkontrollens implementation

Åtkomstkontroll ska genomföras i tre oberoende lager:

1. **Navigationsfiltrering** — sidomeny, bottennavigering och `/start`-panelen renderar endast de sektioner rollen har åtkomst till. Otillåtna poster renderas inte alls (inte enbart inaktiverade).
2. **Route guard** — `beforeLoad` på layoutrutten kontrollerar session, `password_set`, giltig roll samt `canAccess(roll, sökväg)`. Vid otillåten sökväg omdirigeras användaren till rollens startsida (`admin` → `/dashboard`, `styrelse` → `/fastigheter`, `entreprenor` → `/dag-rapport`). Att dölja en menylänk utgör inte i sig åtkomstkontroll — URL-inmatning ska blockeras.
3. **Row Level Security** — behörighet ska dessutom vara upprätthållen på databasnivå genom RLS-policyer, så att direkta API-anrop utanför gränssnittet inte kan kringgå begränsningarna.

Skapandevyer (samtliga sökvägar som slutar på `/new`) ska vara spärrade för alla roller utom administratör.

### 3.6 Autentiseringsflöde

| Steg | Beskrivning |
|---|---|
| Inloggning | `/login` — e-post och lösenord mot Supabase Auth |
| Inbjudan | Administratör bjuder in via Edge Function `invite-user`, som skapar auth-användare och tillhörande `profiles`-rad |
| Första inloggning | Användare med `profiles.password_set = false` omdirigeras tvingande till `/accept-invite` för att sätta eget lösenord |
| Sessionshantering | Persistent session i `localStorage`, automatisk tokenförnyelse |
| Rollvalidering | Konto utan giltig roll loggas ut automatiskt med felmeddelandet "Åtkomst nekad." |
| Utloggning | Tillgänglig från sidomeny och Inställningar |

---

## 4. Sidkarta

### 4.1 Publika vyer (utan inloggning)

| Sökväg | Benämning | Beskrivning |
|---|---|---|
| `/login` | Inloggning | E-post och lösenord. Felhantering och statusmeddelanden på svenska. |
| `/accept-invite` | Aktivera konto | Sätt lösenord vid första inloggning efter inbjudan. |
| `/felanmalan` | Publik felanmälan | Formulär för boende. Se avsnitt 6. |
| `/boende` | Boendeportal | Publik ingångssida för boende. |
| `/styrelse` | Styrelseportal | Publik ingångssida för styrelse. |
| `/demo` | Demo | Demonstrationsvy av systemet. |

### 4.2 Inloggade vyer

| Sökväg | Benämning | Modul |
|---|---|---|
| `/` | — | Omdirigering till `/dashboard` |
| `/start` | Start | Kakelmeny över systemets sektioner |
| `/dashboard` | Översikt | Nyckeltalsdashboard |
| `/dag-rapport` | Dag Rapport | Dagens ärendehantering |
| `/chatt` | Chatt | Intern meddelandefunktion |
| `/fastigheter` | Fastigheter | Fastighetsöversikt (kortvy) |
| `/fastigheter/$id/installningar` | Fastighetsinställningar | Inställningar per fastighet |
| `/properties/new` | Ny fastighet | Skapandeformulär |
| `/properties/$id` | Fastighetsvy | Layout med 10 undersektioner (se 4.3) |
| `/apartments` | Lägenheter | Lägenhetsöversikt grupperad per fastighet |
| `/apartments/new` | Ny lägenhet | Skapandeformulär |
| `/apartments/$id` | Lägenhetsvy | Detaljvy med 6 flikar (se 4.4) |
| `/issues` | Felanmälningar | Översikt per fastighet |
| `/issues/new` | Ny felanmälan | Skapandeformulär |
| `/issues/$id` | Felanmälan | Detaljvy |
| `/felanmalningar` | Felanmälan | Sektionsöversikt per fastighet |
| `/inspections` | Besiktningar | Sektionsöversikt per fastighet |
| `/inspections/new` | Ny besiktning | Skapandeformulär |
| `/inspections/$id` | Besiktning | Detaljvy |
| `/projects` | Projekt | Sektionsöversikt per fastighet |
| `/projects/new` | Nytt projekt | Skapandeformulär |
| `/projects/$id` | Projekt | Detaljvy |
| `/oppna-arenden` | Öppna ärenden | Samlad vy över aktiva ärenden |
| `/contacts` | Kontakter | Kontaktregister |
| `/contacts/new` | Ny kontakt | Skapandeformulär |
| `/contacts/$id` | Kontakt | Detaljvy |
| `/dokument` | Dokument | Sektionsöversikt per fastighet |
| `/loggbok` | Loggbok | Sektionsöversikt per fastighet |
| `/ekonomi` | Ekonomi | Budget och utfall |
| `/installningar` | Inställningar | Profil, lösenord, användaradministration |

### 4.3 Fastighetens undersektioner (`/properties/$id/...`)

| Nyckel | Benämning | Innehåll |
|---|---|---|
| `info` | Info | Grunduppgifter, redigerbara av administratör |
| `apartments` | Lägenheter | Lägenhetslista med inline-formulär för ny lägenhet |
| `issues` | Felanmälningar | Ärendelista med härledd status. Detaljvy och skapandeformulär som underrutter |
| `actions` | Åtgärdslista | Åtgärder kopplade till fastigheten |
| `documents` | Dokument | Dokumentlista med uppladdning och kategorisering |
| `inspections` | Besiktningar | Besiktningslista. Detaljvy och skapandeformulär som underrutter |
| `contacts` | Kontakter | Fastighetskopplade kontakter |
| `logbook` | Loggbok | Sammanslagen tidslinje med kommentarsfunktion |
| `projects` | Projekt | Projektlista. Detaljvy och skapandeformulär som underrutter |
| `history` | Historik | Förändringshistorik |
| `objects` | Objekt | Fastighetsobjekt (index, detaljvy, skapandeformulär) |

Navigering sker via brödsmulor och kontextmeny. Rubrik och tillbaka-länk anpassas efter aktiv sektion och djup.

### 4.4 Lägenhetens flikar (`/apartments/$id`)

| Nyckel | Benämning | Innehåll |
|---|---|---|
| `tidslinje` | Tidslinje | **Standardflik.** Sammanslagen kronologisk aktivitetshistorik |
| `info` | Info | Grunduppgifter med redigeringsläge |
| `felanmalningar` | Felanmälningar | Ärenden kopplade till lägenheten, med härledd status |
| `besiktningar` | Besiktningar | Besiktningar kopplade till lägenheten |
| `dokument` | Dokument | Dokument kopplade till lägenheten |
| `loggbok` | Loggbok | Loggboksanteckningar för lägenheten |

Aktiv flik speglas i URL:ens sökparameter så att vyn är direktlänkbar.

---

## 5. Funktionella krav per modul

### 5.1 Översikt (`/dashboard`)

- Nyckeltalskort för fastighetsbeståndet: antal fastigheter, lägenheter, dokument, öppna ärenden.
- Sektion för öppna ärenden med genvägslänk till `/oppna-arenden`.
- Sektion för felanmälningar med genvägslänk till `/felanmalningar`.
- Beståndsöversikt med klickbara poster som navigerar till respektive sektion.
- Grafisk presentation via Recharts.

### 5.2 Start (`/start`)

Kakelmeny med genvägar till Dashboard, Fastigheter, Lägenheter, Felanmälningar, Besiktningar, Projekt, Dokument, Kontakter och Loggbok. Kakel filtreras utifrån inloggad användares roll.

### 5.3 Dag Rapport (`/dag-rapport`)

- Arbetsvy som listar dagens relevanta felanmälningar.
- Möjlighet att markera ärende som aktivt respektive avslutat direkt från vyn.
- Varje statusändring loggas i `issue_status_history` med föregående status, ny status och användare.

### 5.4 Fastigheter

**Översikt (`/fastigheter`)**
- Kortbaserad presentation av samtliga fastigheter med namn, adress och bild.
- Sök- och filtreringsmöjlighet.
- Knapp för att skapa ny fastighet (endast administratör).

**Skapa/redigera fastighet**
- Fält: `name` (obligatoriskt), `address`, `designation` (fastighetsbeteckning), `unit_count`, `description`, `notes`.
- Bilduppladdning till bucket `property-images`.

**Fastighetsinställningar (`/fastigheter/$id/installningar`)**
- Inställningar och metadata per fastighet.

### 5.5 Lägenheter

**Översikt (`/apartments`)**
- Lägenheter grupperade per fastighet, med sortering och filtrering.
- Kolumnen Trappa visar röd markering **Saknas** för lägenheter utan registrerad trappa.

**Skapa lägenhet — tre separata skrivvägar som samtliga ska tillämpa identisk validering:**
1. `/apartments/new` — fristående formulär
2. Info-fliken på `/apartments/$id` — redigeringsläge
3. Inline-formulär i fastighetens Lägenheter-flik

**Fält:** `property_id` (obligatoriskt), `apartment_number` (obligatoriskt), `trappa` (obligatoriskt), `floor`, `area_sqm`, `status`, `tenant_name`, `tenant_phone`, `tenant_email`, `move_in_date`, `move_out_date`, `notes`.

**Dubblettskydd:** försök att spara en lägenhet som bryter mot unikhetsvillkoret ska fångas och presenteras som ett begripligt svenskt felmeddelande, inte som ett rått databasfel.

### 5.6 Felanmälningar (ärendetyp 1)

**Skapandeformulär (`/issues/new`)**
- Fält: `property_id`, `apartment_id`, `title`, `description`, `cause` (orsak, sammanfogas med beskrivning), `category`, `priority`, `deadline`, `trappa` (fritext), `assigned_contact_id` (Ansvarig), `reporter_name`, `reporter_phone`, `reporter_email`.
- Kategorival: VVS (vatten, avlopp, värme), El, Ventilation, Tak & fasad, Fönster & dörrar, Gemensamma utrymmen, Lägenhet invändigt, Hiss, Markarbete, Parkering, Övrigt.
- Prioritetsval med fullständiga svenska etiketter: Låg (kan vänta, ingen påverkan), Normal (åtgärdas inom 5 arbetsdagar), Hög (åtgärdas inom 48 timmar), AKUT (omedelbar åtgärd, säkerhetsrisk).
- Bilduppladdning med lagring i bucket `documents` och registrering i `issue_images`.
- `submission_source` sätts till `admin`.
- Automatisk loggboksanteckning av typen `felanmalan_mottagen`.

**Detaljvy (`/issues/$id`)**
- Redigerbara fält: rubrik, fastighet, lägenhet, kategori, prioritet, deadline, tilldelad.
- Visning av härledd status med tillhörande motivering (se avsnitt 7.1).
- Knapparna Öppna ärende / Avsluta ärende.
- Bildgalleri med lightbox-visning.
- Kommentarstråd (`issue_comments`).
- Statushistorik (`issue_status_history`).
- Radering med bekräftelsedialog (endast administratör).

### 5.7 Besiktningar (ärendetyp 2)

**Skapandeformulär (`/inspections/new`)**
- Fält: `property_id`, `apartment_id`, `trappa`, `inspection_type`, `inspector` (besiktningsman), `last_completed_date`, `next_due_date`, `interval_months`, `notes`, `assigned_contact_id`.
- Uppladdning av protokoll (huvudprotokoll samt valfritt antal ytterligare filer) till bucket `protocols`, registrerade i `inspection_protocols`.

**Detaljvy (`/inspections/$id`)**
- Redigering av samtliga fält.
- Protokollsektion med nedladdning och uppladdning av ytterligare protokoll.
- Knapparna Öppna ärende / Avsluta ärende.
- Intervallbaserad beräkning av nästa förfallodatum.

### 5.8 Projekt (ärendetyp 3)

**Skapandeformulär (`/projects/new`)**
- Fält: `property_id`, `title`, `description`, `status`, `budget` (SEK), `start_date`, `end_date`, `assigned_contact_id`.

**Detaljvy (`/projects/$id`)**
- Redigering av samtliga fält.
- Projektbilder med uppladdning till bucket `project-files`, registrerade i `project_images`.
- Knapparna Öppna ärende / Avsluta ärende.

### 5.9 Objekt (`/properties/$id/objects`)

- Åtta objekttyper: Hiss, Vind, Miljörum, Källare, Systematiskt Brandskyddsarbete, Tvättstuga, Förråd, Lokal.
- Förkortningen "SBA" får aldrig renderas i gränssnittet — full svensk benämning ska alltid visas.
- Valfri koppling till lägenhet (`apartment_id`).
- Statusvärden: OK, Behöver tillsyn, Ur funktion.
- Statusändring genererar automatiskt en loggboksanteckning.

### 5.10 Kontakter (`/contacts`)

- Fält: `full_name`, `contact_type`, `sub_type`, `company`, `phone`, `email`, `notes`, `property_id` (valfritt).
- Kontakter utan `property_id` är systemövergripande och valbara i samtliga Ansvarig-listor.
- Ansvarig-komponenten ska tillåta inline-skapande av ny entreprenörskontakt utan att lämna det pågående formuläret.

### 5.11 Dokument (`/dokument`)

- Fält: `name`, `category`, `file_url`, `file_type`, `file_size`, `property_id`, `apartment_id`.
- Uppladdning till bucket `documents`.
- Kategorisering, filtrering och sortering.
- Dokument nåbara både från global vy, fastighetsvy och lägenhetsvy.

### 5.12 Loggbok (`/loggbok`)

- Anteckningar med `content`, `entry_date`, `event_type`, `property_id`, `apartment_id`, `property_object_id`.
- Automatiska anteckningar genereras vid: mottagen felanmälan, nytt objekt kopplat, ändrad objektstatus, publik felanmälan via webbformulär.
- Kommentarsfunktion (`logbook_comments`) som stöder både verkliga loggboksrader och syntetiska händelser (besiktning/projekt) via `event_key`.
- Fastighetens loggbok visar en sammanslagen tidslinje av avslutade besiktningar, projekt och loggboksanteckningar.

### 5.13 Ekonomi (`/ekonomi`)

- Budgetuppföljning per fastighet och år.
- Kostnadskategorier med färgkodning (`cost_categories`).
- Budgetposter per månad och kategori (`budget_items`).
- Tabell med Budget, Utfall och Differens.
- Formulär för ny budgetpost.
- Grafisk översikt.

### 5.14 Chatt (`/chatt`)

- Direktkonversationer och gruppkonversationer.
- Deltagare är verkliga inloggningar (`profiles`), inte kontaktposter.
- **Regelverk för att starta konversation:**
  - Administratör: kan starta direktkonversation med vem som helst och är ensam behörig att skapa grupper.
  - Styrelse: endast direktkonversation med administratör.
  - Entreprenör: endast direktkonversation med administratör, men kan läggas till i grupper som administratör skapat.
- Återanvändning av befintlig direktkonversation i stället för att skapa dubbletter.
- Live-uppdatering av meddelanden via Supabase Realtime.
- Läskvitton baserade på `chat_participants.last_read_at`.
- Radering av meddelande via dedikerad databasfunktion som hanterar regeln administratör kontra gravsten (tombstone).
- Personsökning vid skapande av ny konversation.

### 5.15 Notiser

- Notisklocka i topplisten med räknare för olästa meddelanden.
- Rullgardinspanel som listar olästa chattmeddelanden samt öppna akutärenden.
- Nedglidande popup-notiser under topplisten, avfärdas genom skroll eller svep uppåt.
- Läsmarkering härleds från `chat_participants.last_read_at` — ingen separat notistabell förekommer.
- Funktionen "Markera alla som lästa" uppdaterar användarens egna deltagarrader.

### 5.16 Global sökning

- Sökruta i topplisten som söker samtidigt i Fastigheter, Dokument, Felanmälningar, Kontakter och Projekt.
- Resultat grupperade per kategori med länk "Visa alla …".
- Snabbnavigering till systemets sektioner direkt från sökpanelen.

### 5.17 Inställningar (`/installningar`)

**Min profil**
- Redigering av namn och telefonnummer.
- Uppladdning av profilbild till bucket `avatars`.
- Visning av tilldelad roll (ej redigerbar av användaren själv).

**Byt lösenord**
- Nytt lösenord med bekräftelsefält och validering.

**Användaradministration (endast administratör)**
- Inbjudan av ny användare: namn, e-post, roll.
- Vid roll `styrelse`: flervalslista över fastigheter, hämtad live från `properties`.
- Vid roll `entreprenor`: koppling till kontaktpost.
- Tabell över samtliga användare med namn, e-post, roll, telefon och skapandedatum.
- Behörighetspanel för att i efterhand ändra en styrelseanvändares fastighetskoppling.

### 5.18 Genomgående listfunktionalitet

Samtliga listvyer ska tillhandahålla:
- Sortering (prioritet äldst först, prioritet nyast först, senast ändrad).
- Filtrering.
- CSV-export med semikolonseparator och BOM för korrekt teckenkodning i svenskt Excel.
- Tomtillstånd med förklarande svensk text.
- Responsiv presentation — tabell på desktop, kortvy på mobil.

---

## 6. Publik felanmälan — anslut-eller-skapa

Detta är systemets mest kritiska integrationsflöde och specificeras separat.

### 6.1 Formulär (`/felanmalan`, utan inloggning)

| Fält | Obligatoriskt | Anmärkning |
|---|---|---|
| Namn | Ja | |
| Telefonnummer | Ja | |
| E-post | Nej | |
| Adress | Ja | Används för sökmatchning mot fastighet |
| Fastighet | Ja | Rullgardinslista |
| Lägenhetsnummer | Ja | Endast siffror |
| Trappa | Ja | Endast bokstäver |
| Kategori | Nej | |
| Rubrik | Nej | Genereras automatiskt om tom |
| Orsak | Nej | |
| Beskrivning | Nej | |
| Bilder och filer | Nej | Flera filer tillåtna |

Lägenhetsnummer får **inte** presenteras som rullgardinslista, eftersom det skulle röja grannars lägenhetsnummer. Boende anger sitt nummer manuellt.

### 6.2 Serverflöde (Edge Function `submit-felanmalan`)

1. Normalisering: lägenhetsnummer reduceras till enbart siffror; trappa reduceras till enbart bokstäver och versaliseras.
2. Validering: fastighet, lägenhetsnummer, trappa, namn och telefonnummer krävs. Utebliven uppgift ger felmeddelande på svenska.
3. Uppslag mot `apartments` på nyckeln (`property_id`, `apartment_number`, `trappa`).
4. Om lägenheten saknas skapas den automatiskt med `created_via = 'public_form'` och `status = 'uthyrd'`, märkt för administratörsgranskning.
5. Vid samtidig skapning som bryter mot unikhetsindex görs ett omtag som hämtar den vinnande raden — ingen dubblett får uppstå.
6. Ärendet skapas i `issues` med `submission_source = 'public_form'`, `status = 'ny'`, upplöst `apartment_id` samt anmälaruppgifter.
7. Loggboksanteckning skapas (best effort — får aldrig fälla inskickningen).
8. Bifogade filer laddas upp till bucket `documents` och registreras i `issue_images`.
9. Vid databasfel returneras verkligt felmeddelande och felkod — aldrig ett generiskt "Okänt fel" som döljer orsaken.

### 6.3 Moderationskö

Publika inskickningar ska landa i ett granskningsläge. Administratör granskar varje inskickning, kan justera uppgifterna och därefter antingen godkänna (ärendet blir ett fullvärdigt ärende) eller avslå (ärendet förkastas). Omfattningen avser felanmälan, eftersom det är systemets enda publika intagsformulär.

### 6.4 Anonym läsbehörighet

- Anonym läsbehörighet på `properties` (endast namn och adress, via vyn `public_properties`) krävs för att fastighetslistan ska kunna fyllas.
- Anonym läsbehörighet på `apartments` ska vara **återkallad** av integritetsskäl.

### 6.5 Normaliseringskrav

Normaliseringslogiken för lägenhetsnummer och trappa finns implementerad på två ställen — i klienten och i Edge Function. De två implementationerna ska vara funktionellt identiska. Avvikelse mellan dem innebär att administratörsskapade lägenheter tyst upphör att matcha boendes inskickningar.

---

## 7. Affärsregler

### 7.1 Härledd ärendestatus

Status på en felanmälan får **aldrig** väljas manuellt i en rullgardinslista. Status ska härledas från tre uppgifter ärendet redan bär: prioritet, skapandedatum och deadline.

**Beräkningsregel:**

| Steg | Regel |
|---|---|
| 1 | Är ärendets livscykel `avslutat` returneras **Avslutad** — övriga regler prövas inte. |
| 2 | Explicit satt `deadline` har alltid företräde. |
| 3 | Saknas deadline beräknas förfallodatum som skapandedatum plus prioritetens tidsgräns. |
| 4 | Förfallodatum passerat → **Försenad** |
| 5 | Ett dygn eller mindre kvar → **Brådskande** |
| 6 | I övrigt avgör livscykeln: `oppet` → **Pågående**, annars **Ny** |

**Tidsgränser per prioritet:**

| Prioritet | Tidsgräns |
|---|---|
| Akut | 1 dygn |
| Hög | 2 dygn |
| Normal | 5 dygn |
| Låg | Ingen tidsgräns |

Prioritet Låg utan satt deadline blir därmed aldrig Brådskande eller Försenad.

**Statusetiketter och färgkodning:**

| Status | Textfärg | Bakgrund |
|---|---|---|
| Försenad | `#B91C1C` | `#FDE8E8` |
| Brådskande | `#856404` | `#FFF3CD` |
| Pågående | `#2E6B24` | `#E8F0D8` |
| Ny | `#3D8A30` | `#E8F5E4` |
| Avslutad | `#6B7280` | `#F3F4F6` |

Varje status ska åtföljas av en svensk motivering som anger varför statusen är den den är, vilket datum ärendet ska vara åtgärdat och varifrån det datumet kommer (satt deadline eller prioritetens tidsgräns).

**Krav på konsekvens:** samtliga vyer som visar en ärendestatus ska använda samma härledningsfunktion — ärendets detaljvy, fastighetens ärendeflik, lägenhetens felanmälningsflik och lägenhetens tidslinje. Ny vy som visar status ska anslutas på samma sätt.

### 7.2 Ärendets livscykel

Gemensam livscykel i tre steg för felanmälningar, besiktningar och projekt:

```
vilande (inkommet/nytt) → oppet (aktivt ärende) → avslutat
```

| Ärendetyp | Lagring |
|---|---|
| Felanmälningar | Kolumnen `status` av enum-typ med värdena `ny`, `pagande`, `vantar`, `klar`, `fakturerad`, `stangd`, som avbildas mot de tre livscykelstegen |
| Besiktningar och projekt | Kolumnen `arende_status` (TEXT) med de bokstavliga värdena `vilande`, `oppet`, `avslutat` |

**Avbildningsregel för felanmälningar:**

| Databasvärde | Livscykel |
|---|---|
| `ny` | vilande |
| `pagande`, `vantar` | oppet |
| `klar`, `fakturerad`, `stangd` | avslutat |

**Styrande komponenter:** knapparna Öppna ärende och Avsluta ärende är de **enda** som får skriva till ett ärendes statuskolumn. Varje sådan ändring ska samtidigt registrera en rad i `issue_status_history`. Övriga delar av systemet behandlar statuskolumnen som skrivskyddad. Respektive knapp renderas endast i det livscykelsteg där den är giltig.

### 7.3 Lägenhetsidentitet

Kombinationen (`property_id`, `apartment_number`, `trappa`) utgör en lägenhets unika identitet och ska upprätthållas av ett unikt databasindex.

- Lägenhetsnummer återkommer mellan trapphus i samma fastighet — numret ensamt utgör därför **inte** en identitet.
- Samtliga tre delar är obligatoriska på varje skrivväg för lägenheter.
- **Lägenhetsnummer** normaliseras till enbart siffror. Inledande nollor är signifikanta: `0203` är inte samma lägenhet som `203`.
- **Trappa** normaliseras till enbart bokstäver, versaliserade. Svenska tecken å, ä och ö bevaras. Trapphus betecknas alltid med bokstäver, aldrig med siffror — inmatade siffror strippas, vilket avsiktligt leder till ett valideringsfel i stället för att en felaktig lägenhet skapas.
- Äldre poster utan trappa ska markeras tydligt i gränssnittet och kunna revideras. Databasvillkoret `NOT NULL` införs när beståndet är rensat.

`trappa` på felanmälningar och besiktningar är däremot beskrivande fritext och utgör ingen matchningsnyckel.

### 7.4 Ansvarig

- Kolumnen `assigned_contact_id` på felanmälningar, besiktningar och projekt, med främmande nyckel mot `contacts`.
- Utgör en intern referenstilldelning. Får inte förväxlas med kolumnerna `assigned_to` och `contractor_id`, vilka pekar mot `profiles` (intern personal).

### 7.5 Anmälaruppgifter

Fälten `reporter_name`, `reporter_phone` och `reporter_email` på felanmälningar är obligatoriska i det publika formuläret (undantaget e-post) och valfria i det interna administratörsformuläret. Kolumnen `submission_source` anger ursprunget: `admin` eller `public_form`.

### 7.6 Formulärlayout

Formulär byggs som rutnät innehållande rullgardinslistor. Systemet ska säkerställa att en rullgardinslistas bredaste alternativ (långa prioritetsetiketter, kategorinamn, fastighetsnamn) inte kan tvinga ut fältkolumnen utanför sitt kort. Ett globalt skyddslager finns i den gemensamma stilmallen för inloggade vyer. Publika vyer ligger utanför detta lager och ska hantera samma sak i sina egna stilar.

---

## 8. Datamodell

Samtliga tabeller ligger i PostgreSQL-schemat `public`.

### 8.1 Kärntabeller

| Tabell | Innehåll |
|---|---|
| `profiles` | Användarprofiler. Kolumner: `id` (mot auth-användare), `full_name`, `role`, `phone`, `avatar_url`, `password_set`, `created_at` |
| `properties` | Fastigheter. Kolumner: `id`, `name`, `address`, `designation`, `unit_count`, `description`, `notes`, `image_url`, `created_by`, `created_at` |
| `apartments` | Lägenheter. Kolumner: `id`, `property_id`, `apartment_number`, `trappa`, `floor`, `area_sqm`, `status`, `tenant_name`, `tenant_phone`, `tenant_email`, `move_in_date`, `move_out_date`, `notes`, `created_via`, `created_by`, `created_at` |
| `issues` | Felanmälningar. Kolumner: `id`, `property_id`, `apartment_id`, `title`, `description`, `category`, `priority`, `status`, `deadline`, `trappa`, `assigned_contact_id`, `assigned_to`, `contractor_id`, `reporter_name`, `reporter_phone`, `reporter_email`, `submission_source`, `viewed_at`, `created_by`, `created_at` |
| `inspections` | Besiktningar. Kolumner: `id`, `property_id`, `apartment_id`, `trappa`, `inspection_type`, `inspector`, `last_completed_date`, `next_due_date`, `interval_months`, `notes`, `status`, `arende_status`, `assigned_contact_id`, `viewed_at`, `created_by`, `created_at` |
| `projects` | Projekt. Kolumner: `id`, `property_id`, `title`, `description`, `status`, `arende_status`, `budget`, `start_date`, `end_date`, `assigned_contact_id`, `viewed_at`, `created_by`, `created_at` |
| `contacts` | Kontaktregister. Kolumner: `id`, `property_id` (nullbar), `full_name`, `contact_type`, `sub_type`, `company`, `phone`, `email`, `notes`, `created_by`, `created_at` |
| `documents` | Dokument. Kolumner: `id`, `property_id`, `apartment_id`, `name`, `category`, `file_url`, `file_type`, `file_size`, `uploaded_by`, `created_at` |
| `property_objects` | Fastighetsobjekt. Kolumner: `id`, `property_id`, `type`, `name`, `apartment_id`, `status`, `description`, `created_by`, `created_at` |
| `logbook_entries` | Loggboksanteckningar. Kolumner: `id`, `property_id`, `apartment_id`, `property_object_id`, `content`, `entry_date`, `event_type`, `status`, `created_by`, `created_at` |
| `actions` | Åtgärdslista. Kolumner: `id`, `property_id`, `title`, `status`, `due_date`, `assigned_to` |

### 8.2 Stödtabeller

| Tabell | Innehåll |
|---|---|
| `issue_images` | Bilder på felanmälningar. Kolumner: `id`, `issue_id`, `url`, `uploaded_by` |
| `issue_comments` | Kommentarer på felanmälningar |
| `issue_status_history` | Statushistorik. Kolumner: `id`, `issue_id`, `old_status`, `new_status`, `changed_by`, `created_at` |
| `inspection_protocols` | Besiktningsprotokoll. Kolumner: `id`, `inspection_id`, `protocol_url`, `completed_date`, `uploaded_by` |
| `project_images` | Projektbilder |
| `logbook_comments` | Kommentarer på loggbokshändelser. Kolumner: `id`, `logbook_entry_id` (nullbar), `event_key` (nullbar), `content`, `created_by`, `created_at`. Villkor: exakt ett av `logbook_entry_id` och `event_key` ska vara satt |
| `property_history` | Fastighetens förändringshistorik. Kolumner: `id`, `property_id`, `description`, `created_by`, `created_at` |
| `styrelse_properties` | Kopplingstabell styrelseanvändare ↔ fastighet. Kolumner: `profile_id`, `property_id`. Många-till-många |

### 8.3 Ekonomitabeller

| Tabell | Innehåll |
|---|---|
| `cost_categories` | Kostnadskategorier. Kolumner: `id`, `name`, `color` |
| `property_budgets` | Budget per fastighet och år |
| `budget_items` | Budgetposter. Kolumner: `id`, `budget_id`, `category_id`, `budgeted_amount`, `description`, `month`, `year` |

### 8.4 Chattabeller

| Tabell | Innehåll |
|---|---|
| `chat_conversations` | Konversationer. Kolumner: `id`, `type` (`direct` eller `group`), `name`, `created_by`, `created_at` |
| `chat_participants` | Deltagare. Kolumner: `conversation_id`, `profile_id`, `last_read_at`, `joined_at`. Primärnyckel: (`conversation_id`, `profile_id`) |
| `chat_messages` | Meddelanden. Kolumner: `id`, `conversation_id`, `sender_id`, `body`, `created_at` |

### 8.5 Vyer

| Vy | Innehåll |
|---|---|
| `public_properties` | `id`, `name`, `address` från `properties`. Exponerad för anonym läsning i det publika felanmälningsformuläret |

### 8.6 Index och villkor

| Objekt | Definition |
|---|---|
| `apartments_property_number_trappa_uidx` | Unikt index på (`property_id`, `apartment_number`, `trappa`) |
| `chat_messages_conversation_created_idx` | Index på (`conversation_id`, `created_at`) |
| `chat_participants_profile_idx` | Index på `profile_id` |
| `logbook_comments_one_target` | CHECK-villkor: exakt ett av `logbook_entry_id` och `event_key` ska vara satt |
| `apartments.trappa NOT NULL` | Införs efter datarensning av äldre poster |

### 8.7 Databasfunktioner

| Funktion | Typ | Syfte |
|---|---|---|
| `is_admin()` | SECURITY DEFINER | Rollkontroll i RLS-policyer |
| `is_chat_participant(conversation_id)` | SECURITY DEFINER, STABLE | Medlemskapskontroll i chattens RLS-policyer. Måste vara SECURITY DEFINER — en policy som direkt frågar sin egen tabell orsakar oändlig rekursion (Postgres-fel 42P17) |
| `shares_chat_with(profile_id)` | SECURITY DEFINER, STABLE | Avgör om två användare delar konversation. Underlag för läsbehörighet på `profiles` utan att öppna hela tabellen |
| `create_chat_conversation(deltagare, är_grupp, namn)` | SECURITY DEFINER | Central plats för regelverket om vem som får starta vilken konversationstyp. Återanvänder befintlig direktkonversation |
| `delete_chat_message(meddelande_id)` | SECURITY DEFINER | Radering av chattmeddelande enligt regeln administratör kontra gravsten |

### 8.8 Storage buckets

| Bucket | Innehåll |
|---|---|
| `documents` | Dokument samt bilagor till felanmälningar |
| `protocols` | Besiktningsprotokoll |
| `project-files` | Projektbilder och projektfiler |
| `avatars` | Profilbilder |
| `property-images` | Fastighetsbilder |

---

## 9. Edge Functions

Serverlösa funktioner som körs på Deno i Supabase-miljön. Källkoden versionshanteras i projektets repository men ingår **inte** i frontendbygget — driftsättning sker separat i Supabase.

| Funktion | Syfte |
|---|---|
| `invite-user` | Skapar auth-användare samt tillhörande `profiles`-rad vid inbjudan |
| `submit-felanmalan` | Publikt intag av felanmälan enligt avsnitt 6 |

**Krav på nyckelhantering:** båda funktionerna kräver service role-nyckel för att kringgå RLS. Plattformens automatiskt injicerade `SUPABASE_SERVICE_ROLE_KEY` ska användas i första hand, med en manuellt skapad `SERVICE_ROLE_KEY` som reserv. Saknas båda ska funktionen returnera HTTP 500 med ett uttryckligt svenskt felmeddelande i stället för att fela tyst.

---

## 10. Säkerhet

| Krav | Specifikation |
|---|---|
| Autentisering | Supabase Auth med e-post och lösenord |
| Row Level Security | Aktiverad på samtliga tabeller innehållande verksamhetsdata |
| Chattens RLS | Läsning av konversationer, deltagare och meddelanden endast för deltagare. Insättning av meddelande kräver att avsändaren är den inloggade användaren och deltagare i konversationen. Ingen UPDATE- eller DELETE-policy exponeras över REST-API:et — radering sker uteslutande via databasfunktion |
| Läsbehörighet på `profiles` | Utökad för icke-administratörer endast till administratörsprofiler samt medparter i egna konversationer, eftersom tabellen innehåller e-post och telefonnummer |
| Anonym åtkomst | Begränsad till fastighetsnamn och adress via `public_properties`. Anonym läsning av `apartments` ska vara återkallad |
| Rekursionsskydd | Samtliga medlemskapskontroller i RLS-policyer ska gå via SECURITY DEFINER-funktioner |
| Klientnyckel | Endast publicerbar nyckel får förekomma i klientkoden. Service role-nyckel får aldrig exponeras i frontend |
| Sessionshantering | Persistent session med automatisk tokenförnyelse. Utloggning rensar lokal session |

---

## 11. Realtidsfunktionalitet

| Tabell | Publikation | Användning |
|---|---|---|
| `chat_messages` | `supabase_realtime` | Live-leverans av nya meddelanden till öppna konversationer och till notissystemet |
| `chat_participants` | `supabase_realtime` | Live-uppdatering av läskvitton |

Notissystemet lyssnar globalt på nya chattmeddelanden. Ingen serversidig filtrering tillämpas, eftersom RLS redan begränsar strömmen till konversationer användaren deltar i. Medlemskap kontrolleras därutöver på klientsidan.

---

## 12. Icke-funktionella krav

| Krav | Specifikation |
|---|---|
| Språk | Samtligt användargränssnitt, felmeddelanden, valideringstexter, tomtillstånd och notiser ska vara på svenska |
| Responsivitet | Fullt fungerande på desktop, surfplatta och mobil. Separat mobilnavigering med bottenmeny och hopfällbar sidomeny |
| Webbläsarstöd | Aktuella versioner av Chrome, Edge, Safari och Firefox |
| Prestanda | Automatisk kodsplittring per rutt. Cachning av datahämtning via TanStack Query |
| Kodkvalitet | Projektet ska passera `npx tsc --noEmit` utan typfel och `npm run build` utan byggfel |
| Felhantering | Databasfel ska presenteras med verkligt orsaksmeddelande, aldrig som generisk text som döljer felkoden |
| Tillgänglighet | Semantisk uppmärkning, tangentbordsnavigerbara dialoger och menyer via Radix UI |
| Datumhantering | Systemet räknar i svenska kalenderdygn i lokal tidszon, inte UTC |
| Tomtillstånd | Varje lista och vy ska ha ett definierat tomtillstånd med förklarande text |

---

## 13. Avgränsningar och Beställarens åtaganden

### 13.1 Avgränsningar

Följande ingår inte i Leverantörens åtagande om det inte avtalats separat i skriftlig tilläggsbeställning:

- Integration mot externa ekonomisystem, fastighetssystem eller BankID.
- Automatiserad e-post- eller SMS-utskick till boende.
- Mobilapplikation för iOS eller Android (systemet levereras som responsiv webbapplikation).
- Migrering av historiska data från tidigare system.
- Utbildningsinsatser utöver överlämningsdokumentation.
- Löpande förvaltning, support och drift efter godkänd leverans.

### 13.2 Beställarens åtaganden

Leverantörens leverans förutsätter att Beställaren:

- Tillhandahåller och bekostar Supabase-konto samt hosting.
- Tillhandahåller domännamn och eventuella certifikat.
- Utser en kontaktperson med mandat att fatta beslut om funktionsutformning.
- Levererar grunddata (fastighetsbestånd, lägenhetsregister, kontaktuppgifter) i överenskommet format.
- Genomför acceptanstest inom överenskommen tid efter leveransanmälan.
- Ansvarar för att befintliga lägenhetsposter som saknar trappa revideras, då databasvillkoret `NOT NULL` inte kan aktiveras dessförinnan.

---

## 14. Acceptanskriterier

Leveransen anses fullgjord när samtliga nedanstående kriterier är uppfyllda och verifierade.

| Nr | Kriterium |
|---|---|
| 1 | Samtliga sidor enligt sidkartan i avsnitt 4 är nåbara och renderar utan fel. |
| 2 | Rollerna admin, styrelse och entreprenör fungerar enligt avsnitt 3, inklusive att otillåten sökväg blockeras vid direkt URL-inmatning. |
| 3 | Styrelseanvändare ser uteslutande data för de fastigheter en administratör kopplat till kontot, i samtliga moduler. |
| 4 | Entreprenörsanvändare ser uteslutande ärenden där kontot är satt som Ansvarig, och kan öppna och avsluta dessa. |
| 5 | Härledd ärendestatus enligt avsnitt 7.1 ger identiskt resultat i samtliga vyer som visar status. |
| 6 | Ärendets livscykel enligt avsnitt 7.2 fungerar för samtliga tre ärendetyper, och varje statusändring registreras i statushistoriken. |
| 7 | Lägenhetsidentitet enligt avsnitt 7.3 upprätthålls av unikt databasindex och tillämpas på samtliga tre skrivvägar. |
| 8 | Publik felanmälan enligt avsnitt 6 skapar korrekt ärende, kopplar till rätt lägenhet, skapar saknad lägenhet utan dubblett, laddar upp bilagor och skriver loggboksanteckning. |
| 9 | Moderationskön för publika felanmälningar fungerar med granskning, redigering, godkännande och avslag. |
| 10 | Chattens regelverk enligt avsnitt 5.14 upprätthålls på databasnivå och kan inte kringgås via direkta API-anrop. |
| 11 | Notissystemet visar korrekt räknare, panel och popup-notiser, och läsmarkering nollställs vid öppnad konversation. |
| 12 | Global sökning returnerar träffar från samtliga fem sökbara moduler. |
| 13 | Filuppladdning fungerar mot samtliga fem storage buckets, och uppladdade filer är nedladdningsbara. |
| 14 | CSV-export fungerar från samtliga listvyer och öppnas korrekt med svenska tecken i Excel. |
| 15 | Systemet är fullt användbart på mobil, surfplatta och desktop. |
| 16 | Samtligt användargränssnitt är på svenska. |
| 17 | Projektet passerar `npx tsc --noEmit` och `npm run build` utan fel. |
| 18 | Automatisk driftsättning via GitHub Actions fungerar, och djuplänkar laddar applikationen korrekt. |
| 19 | Row Level Security är aktiverad enligt avsnitt 10, verifierat genom test med direkta API-anrop utanför gränssnittet. |
| 20 | Överlämningsdokumentation avseende driftsättning av Edge Functions och hantering av databasmigrationer är levererad. |

---

## 15. Underhållskrav på databasmigrationer

Databasförändringar levereras som SQL-filer i projektets repository. Följande gäller:

- Migrationsfiler ska läsas igenom före körning — samtliga är inte säkra att köra om utan vidare.
- Migrationer som kräver datarensning före aktivering av villkor ska innehålla ett läsande kontrollsteg som körs och granskas separat innan det förändrande steget körs.
- Ändringar i Edge Functions kräver manuell driftsättning i Supabase och ingår inte i frontendbygget.

---

*Slut på kravspecifikation.*
