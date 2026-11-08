# Säkerhetskopiering — checklista

Fylls i av den som har tillgång till Supabase-projektet `tixxacthedwaoqtjokdr`.

## Att kontrollera i Supabase-konsolen

- [ ] **Plan:** (Free / Pro / Team) — Project Settings → Billing. *Free har inga automatiska backuper.*
- [ ] **Dagliga backuper aktiva:** Database → Backups. Antal dagar som sparas: ___
- [ ] **Point-in-time recovery (PITR):** på/av. Behövs om förlust av några timmars data är oacceptabelt.
- [ ] **Region:** Project Settings → General → Region: ___ (EU önskas)
- [ ] **Vem är ägare** av organisationen i Supabase (BAYT AB eller privat person)?

## Det som backuper inte täcker

- **Filer i Storage** ingår inte i databasbackuper. Behöver egen kopia (kan automatiseras med exportfunktionen).
- **Edge Functions-kod** ligger i Supabase *och* i repot (`supabase/functions/`). Repot är sanningen.
- **Databasschemat** är handkörda SQL-filer i `supabase-functions/`. Utan migrationshistorik går en ny miljö inte att bygga automatiskt — se TODO nedan.

## Test av återställning (minst varje halvår)

1. Skapa ett tillfälligt Supabase-projekt.
2. Återställ senaste backup dit.
3. Logga in och kontrollera att en känd förening, ett ärende och en fil finns.
4. Notera tiden det tog: ___ . Radera testprojektet.

## TODO i koden

- Samla schemat i `supabase/migrations/` (en fil per ändring, i körordning) så att databasen kan byggas om från repot.
- Exportfunktion som även kopierar Storage-filer.
