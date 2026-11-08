# Underbiträden (utkast)

Vilka tjänster som behandlar personuppgifter för BAYT:s räkning. Kolumnen "Att bekräfta" är det som måste verifieras av BAYT innan listan lämnas till en förening.

| Leverantör | Vad den gör | Vilka uppgifter den ser | Att bekräfta |
|---|---|---|---|
| **Supabase** | Databas, inloggning, fillagring, Edge Functions | Allt i portalen: namn, e-post, telefon, ärenden, loggbok, dokument | Region (EU?), plan, DPA godkänt i Supabase-konsolen |
| **GitHub** (Pages + repo) | Driftar den publika webbapp-koden | Ingen personuppgift lagras; IP-adresser i åtkomstloggar | DPA/villkor, vem som äger kontot |
| **Anthropic** | AI-svar i hemsidechatten (`chat-intake`) | Besökarens chattmeddelanden (kan innehålla namn/kontaktuppgifter som besökaren själv skriver) | DPA, att API-data inte används för träning enligt kontoinställning, dataplats |
| **Inleed (e-post/SMTP)** | Utskick av notiser och inbjudningar via `info@bayt.se` | Mottagaradress, ärendetext | Mest sannolikt **Inleed**: koden skickar via BAYT:s egen SMTP-brevlåda (`SMTP_*`-hemligheter) och en kodkommentar i `notify-progress` nämner Inleeds mailserver. Bekräfta hos Inleed samt att biträdesavtal finns |
| **Domän/DNS** | `bayt.se`, `app.bayt.se` | Ingen | Vem registrerar domänen |

Regel: ny leverantör ⇒ ny rad här och information till föreningarna enligt PUB.
