# Integritetspolicy — utkast till `/integritet`

> **Utkast.** Ersätter texten i `src/routes/integritet.tsx` när jurist och BAYT godkänt den. Punkter markerade **[BESLUT]** kräver att BAYT väljer, **[BEKRÄFTA]** att något kontrolleras. Skillnader mot nuvarande sida finns längst ned.

## Personuppgiftsansvarig och personuppgiftsbiträde

Bayt AB, org.nr 559006-2708, Gräsvallsvägen 3, 238 34 Oxie, info@bayt.se, är personuppgiftsansvarig för uppgifter om BAYT:s egna användare, kunder och dem som kontaktar BAYT via hemsidan.

För uppgifter som en bostadsrättsförening eller fastighetsägare ("kunden") lägger in om sina boende, styrelse och entreprenörer är kunden personuppgiftsansvarig och BAYT personuppgiftsbiträde. Det regleras i ett personuppgiftsbiträdesavtal mellan BAYT och kunden.

## Vilka uppgifter vi behandlar

- **Konton:** namn, e-postadress, telefonnummer, roll (admin, styrelse, entreprenör), vilka fastigheter kontot hör till.
- **Felanmälningar:** den anmäldas namn, telefonnummer, e-postadress, lägenhet och trappa, beskrivning och bilder.
- **Ärenden, besiktningar och projekt:** kommentarer, bilder, protokoll, dokument, ansvarig entreprenör och vem som ändrat, öppnat eller avslutat.
- **Historik och loggbok:** vem som gjorde vad och när, kopplat till ärendet.
- **Chatt i plattformen:** meddelanden mellan användare.
- **Hemsidechatten på bayt.se:** det besökaren skriver i chatten. Besökaren uppmanas att inte skriva känsliga uppgifter. Samtalet sparas i **90 dagar** **[BEKRÄFTA att automatisk radering finns]**.
- **Kontominne:** när ett konto raderas sparas e-postadress och roll/tillhörighet så att en återvändande person kan kopplas till sina tidigare uppgifter. Raderas efter **[BESLUT: 24 månader]** eller på begäran.
- **Teknisk data:** inloggningssession och loggar för drift och säkerhet.

## Varför och rättslig grund

- Tillhandahålla tjänsten och hantera ärenden: avtal och berättigat intresse.
- Notiser och e-post om ärenden du är inblandad i: avtal och berättigat intresse.
- Svara på frågor via hemsidechatten: berättigat intresse (och avtal om du är kund).
- Säkerhet, felsökning, förebygga missbruk: berättigat intresse.
- Bokföring och andra rättsliga skyldigheter: rättslig förpliktelse.

## AI-assistent i hemsidechatten

Svaren i chatten på bayt.se genereras delvis av en AI-tjänst (Anthropic). Det du skriver skickas dit för att ett svar ska kunna skapas. Chatten är tydligt märkt som AI-assistent, och du kan alltid be att få prata med en människa. **[BEKRÄFTA]** Anthropic-kontots inställningar för dataanvändning och dataplats.

## Vem ser uppgifterna

Åtkomst styrs av roll. Entreprenörer ser ärenden som tilldelats dem, styrelse sina fastigheter, och BAYT:s administratörer det som behövs för att förvalta. **[OBS för jurist/utvecklare]** Skyddet i vyerna är starkare än skyddet i databasen för ärenden/besiktningar/projekt i dag; beskriv inte det som "tekniskt omöjligt att se" förrän databasnivån är åtgärdad.

## Underleverantörer

Se `underbitraden.md`. Publicera listan med leverantör, ändamål och dataplats. **[BEKRÄFTA]** Region för Supabase och om något förs utanför EU/EES (då krävs skyddsåtgärd, t.ex. standardavtalsklausuler).

## Hur länge vi sparar uppgifter

Se `lagring-och-radering.md`. Kort version: kundens data under avtalstiden; därefter export till kunden och radering inom **[BESLUT: 30 dagar]**; chatt 90 dagar; kontominne **[BESLUT]**.

## Dina rättigheter

Tillgång, rättelse, radering, begränsning, invändning och dataportabilitet. När kunden är ansvarig vänder du dig i första hand till kunden (din förening); BAYT hjälper kunden. Kontakt: info@bayt.se. Klagomål: Integritetsskyddsmyndigheten (IMY), imy.se.

---

## Skillnader mot nuvarande sida

1. Adressen på sidan stavades *Gärsvallsvägen*; rätt är **Gräsvallsvägen** (rättat i koden i samma PR).
2. Hemsidechatten och AI-tjänsten (Anthropic) saknas på nuvarande sida.
3. Kontominnet (`account_memory`) saknas.
4. Sidan nämner Inleed (stämmer troligen: e-post går via BAYT:s brevlåda hos Inleed) och 46elks. 46elks förekommer **bara** på själva policysidan, inte i koden. **[BEKRÄFTA]** om SMS används; annars ta bort raden.
5. Dokument och mappar "personliga" som nämns på sidan: **[BEKRÄFTA]** att funktionen finns, annars ta bort raden.
