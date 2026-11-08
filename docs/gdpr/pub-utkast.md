# Personuppgiftsbiträdesavtal (PUB) — utkast

> **Utkast att granskas av jurist innan det används.** Strukturen följer det som GDPR artikel 28.3 kräver att ett biträdesavtal innehåller. Hakparenteser är val eller uppgifter att fylla i.

**Parter**

- Personuppgiftsansvarig: [Brf ___, org.nr ___] ("Föreningen")
- Personuppgiftsbiträde: Bayt AB, org.nr 559006-2708, Gräsvallsvägen 3, 238 34 Oxie ("BAYT")

## 1. Bakgrund och ämne
BAYT tillhandahåller fastighetssamordning och plattformen app.bayt.se åt Föreningen enligt [huvudavtal, datum]. I det arbetet behandlar BAYT personuppgifter för Föreningens räkning.

## 2. Behandlingens art, ändamål och varaktighet
Hantering av felanmälningar, besiktningar, projekt, kontakter, dokument och loggbok för Föreningens fastighet(er), samt kommunikation med boende, styrelse och entreprenörer. Pågår så länge huvudavtalet gäller, samt tiden för utlämning och radering enligt punkt 9.

## 3. Typer av personuppgifter och registrerade
- **Registrerade:** boende/medlemmar, styrelseledamöter, entreprenörer och deras kontaktpersoner, besökare som kontaktar BAYT.
- **Uppgifter:** namn, e-post, telefon, lägenhetsnummer och trappa, ärendetexter och bilder, roll/tillhörighet, åtgärdshistorik. **Inga** känsliga personuppgifter (art. 9) avses; parterna ska inte be om sådana.

## 4. BAYT:s skyldigheter
BAYT ska:
1. behandla uppgifterna endast enligt Föreningens dokumenterade instruktioner (detta avtal och huvudavtalet), även vid överföring till tredje land;
2. säkerställa att personer som behandlar uppgifterna har tystnadsplikt;
3. vidta lämpliga tekniska och organisatoriska säkerhetsåtgärder (punkt 5);
4. följa villkoren för anlitande av underbiträden (punkt 6);
5. bistå Föreningen att besvara registrerades begäran (tillgång, rättelse, radering m.m.) inom [10] arbetsdagar;
6. bistå Föreningen med säkerhet, incidentrapportering, konsekvensbedömning och förhandssamråd i den utsträckning som biträdets roll motiverar;
7. radera eller återlämna uppgifterna vid avtalets slut (punkt 9);
8. ge Föreningen den information som behövs för att visa att skyldigheterna följs, och medge granskning/revision med rimlig framförhållning.

## 5. Säkerhetsåtgärder (art. 32) — beskrivning att verifiera mot verkligheten
- Rollbaserad åtkomst (admin, styrelse, entreprenör); inloggning krävs. **[Skriv inte "isolerad per förening i databasen" förrän det är genomfört.]**
- Krypterad överföring (HTTPS) och lagring hos underbiträde.
- Spårbarhet av ändringar (historik/loggbok). [Bekräfta att audit-funktionen är aktiv.]
- Säkerhetskopiering [dagligen, ___ dagars retention, ___] och rutin för återställningstest.
- Lösenordslös åtkomst för entreprenörer sker via engångskod; konton kan raderas omedelbart.
- Incidenthantering: BAYT meddelar Föreningen utan onödigt dröjsmål och senast inom **[48 timmar]** efter att ha upptäckt en personuppgiftsincident.

## 6. Underbiträden
Föreningen ger ett **[allmänt]** godkännande för de underbiträden som anges i bilaga 1. BAYT informerar Föreningen **[30 dagar]** före byte eller tillägg; Föreningen kan invända. BAYT ansvarar för sina underbiträden som för sig själv och ska ha motsvarande avtal med dem.

## 7. Överföring till tredje land
Uppgifter behandlas inom EU/EES **[bekräfta region]**. Om underbiträde behandlar uppgifter utanför EU/EES ska lämplig skyddsåtgärd finnas (t.ex. standardavtalsklausuler) och anges i bilaga 1.

## 8. Ansvar
[Ansvarsfördelning och begränsning — juristens uppgift att skriva; följ huvudavtalet.]

## 9. Avslut, utlämning och radering
Vid avtalets upphörande:
1. BAYT lämnar ut Föreningens data i ett strukturerat, allmänt använt format (zip med ärenden, besiktningar, projekt, kontakter, loggbok och dokument) inom **[14]** dagar efter begäran.
2. Efter Föreningens bekräftelse raderar BAYT uppgifterna inom **[30]** dagar, inklusive filer i fillagringen, och bekräftar skriftligt.
3. Uppgifter i säkerhetskopior upphör enligt backupschemat, senast **[___]** dagar efter radering.
4. Undantag endast där lag kräver fortsatt lagring.

## 10. Giltighet och ändringar
Gäller så länge BAYT behandlar uppgifter för Föreningen. Ändringar ska vara skriftliga.

---

### Bilaga 1 — Godkända underbiträden
Se `underbitraden.md` (leverantör, ändamål, plats, skyddsåtgärd).

### Bilaga 2 — Kontakt
BAYT: info@bayt.se, 040-630 46 00. Föreningen: [namn, e-post].
