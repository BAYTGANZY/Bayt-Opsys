# GDPR, avtal, backup och ägande — arbetsmaterial

> **Utkast.** Allt i den här mappen är arbetsmaterial att ta till en jurist. Det är inte juridisk rådgivning och inget här är färdigt att skriva under utan granskning.

BAYT är **personuppgiftsbiträde** åt varje förening (föreningen är personuppgiftsansvarig). BAYT har egna underbiträden (Supabase m.fl.). Det är därför fyra saker hänger ihop: avtal, lagringstider, säkerhet/backup och rätten att få ut sin data.

| Dokument | Vad det är | Vem avgör |
|---|---|---|
| [integritetspolicy-utkast.md](integritetspolicy-utkast.md) | Text till `/integritet` med alla `[FYLL I]` besvarade eller markerade som beslut | Jurist + BAYT |
| [pub-utkast.md](pub-utkast.md) | Personuppgiftsbiträdesavtal BAYT ⇄ förening (GDPR art. 28) | Jurist |
| [underbitraden.md](underbitraden.md) | Register över BAYT:s underleverantörer och vad de ser | BAYT |
| [lagring-och-radering.md](lagring-och-radering.md) | Förslag på lagringstider, radering och utlämning vid avslut | BAYT beslutar |
| [backup-och-aterstallning.md](backup-och-aterstallning.md) | Checklista: vad som säkerhetskopieras, och test av återställning | BAYT (Supabase-inställningar) |
| [agande-checklista.md](agande-checklista.md) | Vem äger kod, databas, domän och konton | BAYT |

## Bekräftat 2026-11-08

- GitHub-kontot ägs av BAYT AB. Supabase: organisation `BaytFastighetOrg`, plan **Pro**, region **EU (Frankfurt)**, en enda Owner (`bayt.dev@outlook.com`).
- SMS via 46elks är planerat, inte i drift.
- Supabase Security Advisor visar **1 kritisk** varning: *Security Definer View* på `public.public_properties` (vyn som lämnar ut fastighetsnamn till felanmälningsformuläret). Troligen avsiktligt, men bör granskas (och ev. göras `security_invoker`) innan fler föreningar kopplas på. Övriga varningar är prestandatips (*Auth RLS Initialization Plan*), inte säkerhet.

## Status i koden (verifierat mot repot)

- **Isolering mellan föreningar** sker i vyerna (`styrelse_properties`, entreprenörens tilldelning) men **inte i databasen** för ärenden/besiktningar/projekt. Se `CLAUDE.md`, "Bara mina ärenden". Det är inte multi-tenancy i avtalsmening än.
- **Spårbarhet:** `audit_events` är byggt men var 2026-07-27 inte körd i databasen. Kontrollera.
- **Export** av en förenings data finns inte än.
- **Chattfunktionen** `chat-intake` låg bara i Supabase; den ligger nu i `supabase/functions/chat-intake/` (se nedan).
- **Chattens AI** skickar besökarens meddelanden till Anthropic. Anthropic ska stå som underbiträde.

## chat-intake i repot

`supabase/functions/chat-intake/index.ts` är den kod som körs i Supabase (version 3, 2026-11-08). Den ändrar inget förrän den deployas. `verify_jwt` är medvetet **inte** satt i `supabase/config.toml`: ta reda på nuvarande värde med `npx supabase functions list` och lägg in det innan nästa CLI-deploy, annars skriver CLI:t över det med `true`.

## Nästa kodsteg (utanför den här mappen)

1. Export av förening (zip: ärenden, besiktningar, projekt, kontakter, loggbok, dokumentfiler).
2. Aktivera/verifiera Historik (`audit_events`) och "godkänt av".
3. Multi-tenancy i databasen (kundnivå + RLS på alla tabeller), testat på två testföreningar först.
