# Felanmälan per telefon (46elks)

Den som ringer numret slår fastighet, lägenhet och trappa med knapparna, talar in sitt ärende, och får ett tack-SMS.
Ärendet skapas som en vanlig felanmälan (status *Ny*) och hanteras sedan som alla andra: admin tilldelar en
entreprenör, som då får sitt vanliga tilldelningsmejl.

## Kedjan
1. 46elks `voice_start` → Edge Function `phone-intake` (`?step=start`). Intro, fastighetsmeny (hoppas över om bara en).
2. Lägenhetsnummer (siffror, `#` avslutar) → trappnummer → inspelning (max 120 s, tystnad i 3 s avslutar).
3. `recording`-steget laddar ner ljudet, skriver ut det med OpenAI (`whisper-1`, svenska), låter Claude göra rubrik,
   kategori och akutflagga, och skapar ärendet. Tack-SMS skickas till den som ringde (bara mobilnummer).
4. Ingen ljudfil sparas hos BAYT. Kvar finns utskriften i ärendets beskrivning. 46elks behåller inspelningen i 72 timmar.

Lägenheten matchas på (fastighet, lägenhetsnummer, trappa). Hittas den inte skapas **ingen** ny lägenhet; ärendet
läggs på fastigheten och beskrivningen säger att uppgifterna ska kontrolleras.

## Uppsättning (görs en gång)
Supabase → Edge Functions → Secrets:

| Secret | Värde |
|---|---|
| `PHONE_WEBHOOK_SECRET` | en lång slumpad sträng (minst 32 tecken) |
| `ELKS_API_USERNAME` / `ELKS_API_PASSWORD` | från 46elks → Konto |
| `OPENAI_API_KEY` | för tal till text och uppläst text |
| `ANTHROPIC_API_KEY` | finns redan (chat-intake) |
| `ELKS_SMS_FROM` | valfritt, standard `BAYT` |
| `PHONE_PROPERTY_IDS` | valfritt: kommaseparerade fastighets-id som får finnas i menyn (max 9). Sätt den, annars hamnar testfastigheterna i menyn. |

Deploy: `npx supabase functions deploy phone-intake --use-api` (config.toml sätter `verify_jwt = false`).
Dashboarden: stäng av "Verify JWT" om du deployar där.

46elks → numret → *Voice start*:
`https://tixxacthedwaoqtjokdr.supabase.co/functions/v1/phone-intake?step=start&k=<PHONE_WEBHOOK_SECRET>`

## Begränsningar
- Menyn tar högst 9 fastigheter. Fler kräver en annan lösning (fastighetskod).
- Utskriften kan innehålla hörfel; originalutskriften ligger därför alltid kvar i ärendet.
- Ärendet tilldelas inte automatiskt någon entreprenör.
