# Ägande av kod, data och konton — checklista

Målet: BAYT AB ska äga allt som verksamheten vilar på, och ingen enskild person ska vara ensam nyckelbärare.

| Tillgång | Ägs av idag (fyll i) | Ska ägas av | Åtgärd |
|---|---|---|---|
| GitHub-repot `BAYTGANZY/Bayt-Opsys` | **BAYT AB** (bekräftat 2026-11-08) | BAYT AB | Kontrollera att det är ett bolagskonto/en organisation och inte en persons inloggning; lägg till en andra ägare |
| Supabase-organisation `BaytFastighetOrg`, projekt *BAYT Platform* (Pro, produktion) | Organisationen har **en** medlem: `bayt.dev@outlook.com` (Owner) | BAYT AB, minst två Owners | Bekräfta att `bayt.dev@outlook.com` är en bolagsbrevlåda; lägg till en andra Owner (Manage members), annars är en glömd inloggning ett enkelt-fel-läge |
| Domän `bayt.se` / DNS | ___ | BAYT AB | Registrant = BAYT AB |
| Anthropic-konto (AI-chatten) | ___ | BAYT AB | Betalning och ägare på bolagskonto |
| E-post/SMTP-brevlåda `info@bayt.se` | ___ | BAYT AB | Admin-åtkomst hos minst två personer |
| Secrets (API-nycklar) | Supabase → Edge Functions → Secrets | BAYT AB | Lista vilka som finns, vem som kan rotera dem. Aldrig i repot |

## Källkod

- [ ] Lägg till en `LICENSE`-fil (förslag: proprietär, "Alla rättigheter förbehållna BAYT AB") så att ägandet är uttalat.
- [ ] Konsulter/utvecklare som bidragit: kontrollera att avtal överlåter upphovsrätten till BAYT AB.
- [ ] Koden bygger på en Lovable-export: kontrollera Lovables villkor för äganderätt till genererad kod.
- [ ] Vad som körs men inte ligger i repot: databasschema (handkörda SQL-filer), Supabase-inställningar, secrets. Dokumentera.
