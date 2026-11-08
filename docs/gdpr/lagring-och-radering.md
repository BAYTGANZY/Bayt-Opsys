# Lagringstider och radering — förslag att besluta om

**Beslut behövs från BAYT.** Siffrorna nedan är förslag, utom där koden redan sätter en tid.

| Uppgift | Var | Nuvarande | Förslag |
|---|---|---|---|
| Hemsidechatt (samtal + meddelanden) | `webchat_*` | Chatten säger "sparas i 90 dagar" till besökaren | Behåll 90 dagar. **Kontrollera att en schemalagd radering finns**, annars är texten oriktig |
| Felanmälan från boende (namn, telefon, e-post) | `issues.reporter_*` | Ingen gräns | Rensa kontaktfälten 24 månader efter avslutat ärende; ärendet i övrigt kvar |
| Konton (inloggning) | `profiles`, auth | Raderas direkt på begäran | Oförändrat |
| Kontominne efter radering | `account_memory` (e-post, roll, tillhörighet) | **Ingen gräns** — sparas för att en återvändande entreprenör ska kopplas rätt | Radera efter 24 månader, eller på begäran. Kräver schemalagd rensning |
| Historik/audit | `audit_events` | Append-only, admin kan radera | Behåll så länge ärendet finns; rensas med ärendet vid avslut |
| Loggbok | `logbook_entries` | Ingen gräns | Samma som ärenden |
| Uppladdade filer | Storage | Raderas **inte** när raden raderas | Rensa bucket-objekt vid radering (kod behövs) |

## När samarbetet med en förening avslutas

1. Föreningen får en **exportfil** (zip) med alla dess ärenden, besiktningar, projekt, kontakter, loggbok och dokument. *(Exportfunktionen är inte byggd än.)*
2. Efter bekräftad mottagning: radera föreningens data inom **[30] dagar**, inklusive filer i lagringen.
3. Säkerhetskopior med föreningens data upphör enligt backup-schemat (se `backup-och-aterstallning.md`); det ska stå i PUB:en.
4. BAYT bekräftar raderingen skriftligt.

## Begäran från en enskild person (registerutdrag, radering)

Personen vänder sig till föreningen (personuppgiftsansvarig). BAYT hjälper föreningen inom **[10] arbetsdagar**. Admin kan söka på e-post/telefon i felanmälningar och kontakter.
