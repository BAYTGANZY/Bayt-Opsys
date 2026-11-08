# Ägande av kod, data och konton — checklista

Målet: BAYT AB ska äga allt som verksamheten vilar på, och ingen enskild person ska vara ensam nyckelbärare.

| Tillgång | Ägs av idag (fyll i) | Ska ägas av | Åtgärd |
|---|---|---|---|
| GitHub-repot `BAYTGANZY/Bayt-Opsys` | ___ (användare eller organisation?) | BAYT AB (GitHub-organisation) | Skapa organisation, överför repot (Settings → Transfer), minst två ägare |
| Supabase-organisation/projekt | ___ | BAYT AB | Lägg till BAYT AB:s e-post som Owner, minst två Owners |
| Domän `bayt.se` / DNS | ___ | BAYT AB | Registrant = BAYT AB |
| Anthropic-konto (AI-chatten) | ___ | BAYT AB | Betalning och ägare på bolagskonto |
| E-post/SMTP-brevlåda `info@bayt.se` | ___ | BAYT AB | Admin-åtkomst hos minst två personer |
| Secrets (API-nycklar) | Supabase → Edge Functions → Secrets | BAYT AB | Lista vilka som finns, vem som kan rotera dem. Aldrig i repot |

## Källkod

- [ ] Lägg till en `LICENSE`-fil (förslag: proprietär, "Alla rättigheter förbehållna BAYT AB") så att ägandet är uttalat.
- [ ] Konsulter/utvecklare som bidragit: kontrollera att avtal överlåter upphovsrätten till BAYT AB.
- [ ] Koden bygger på en Lovable-export: kontrollera Lovables villkor för äganderätt till genererad kod.
- [ ] Vad som körs men inte ligger i repot: databasschema (handkörda SQL-filer), Supabase-inställningar, secrets. Dokumentera.
