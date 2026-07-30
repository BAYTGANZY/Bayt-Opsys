# Testlogg — ren databas 2026-07-29

Databasen tömdes med `supabase-functions/reset-testdata.sql`. Konton, kontakter och
kostnadskategorier behölls; allt annat innehåll är borta.

Berätta vad du ser under testet så för jag in det här — en rad per fel, med
tillräckligt mycket detalj för att kunna återskapa det.

## Status

| # | Vad | Var | Status |
|---|-----|-----|--------|
| — | *inga fel rapporterade ännu* | | |

---

## Fel

<!-- Mall — kopiera per fel:

### 1. Kort rubrik
- **Var:** roll + sida/URL, t.ex. `admin · /properties/:id/issues`
- **Gjorde:** stegen som ledde dit
- **Förväntat:**
- **Blev:**
- **Orsak:** (fylls i när jag hittat den)
- **Fix:** (fil + rad, eller SQL)
- **Status:** öppen / fixad / kan inte återskapa

-->

---

## Kända lägen — INTE buggar

Skriv inte upp dessa, de är väntade efter en reset:

- **Styrelsekonton ser noll fastigheter.** `styrelse_properties` tömdes. Koppla
  om under Inställningar → Användare.
- **Entreprenörskonton ser noll fastigheter och tom Dag Rapport.** De ser bara
  byggnader där de har ett tilldelat ärende — innan du tilldelat något finns
  ingenting att visa.
- **Historik-fliken är tom överallt.** `audit_events` är enligt CLAUDE.md inte
  applicerad i databasen; funktionen är kod utan tabell bakom sig.
- **Föräldralösa filer i Storage.** Dokumentposterna raderades, blobbarna
  ligger kvar tills bucketarna töms för hand.
