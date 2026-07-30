# Testplan — ärendeflöde

Kör stegen i ordning. Varje steg: **Gör** → **Ska hända**.
Stämmer det inte — skriv stegnumret och vad som hände istället.

Ha tre fönster öppna: **admin**, **styrelse**, **entreprenör**.

Innan du börjar, anteckna:
- **Fastighet A** = en fastighet styrelsen är kopplad till: ______________
- **Fastighet B** = en fastighet styrelsen **inte** är kopplad till: ______________
- **Lägenhet** i Fastighet A, nummer + trappa: ______________ / ______

---

## Menyn

**1.** Logga in som **styrelse**, titta på vänstermenyn.
→ Du ser: Fastigheter, Lägenheter, Felanmälningar, Besiktningar, Projekt, Loggbok, Chatt, Inställningar.
→ Du ser **inte**: Dag Rapport, Översikt, Dokument, Kontakter.

**2.** Logga in som **entreprenör**, titta på vänstermenyn.
→ Du ser: Dag Rapport, Fastigheter, Lägenheter, Felanmälningar, Besiktningar, Projekt, Loggbok, Chatt, Inställningar.
→ Du ser **inte**: Översikt, Dokument, Kontakter.

**3.** Som **styrelse**, öppna Felanmälningar / Besiktningar / Projekt.
→ Ingen "Ny"-knapp finns på någon av sidorna. chck 
c
**4.** Som **entreprenör**, öppna samma tre sidor.
→ Ingen "Ny"-knapp finns.

**5.** Som **entreprenör**, öppna Fastigheter.
→ Bara fastigheter där du har ett tilldelat ärende. Har du inga ärenden än: tom lista.

**6.** Som **styrelse**, öppna Fastigheter.
→ Fastighet A finns. Fastighet B finns **inte**.

---

## Publik felanmälan

**7.** Öppna `/felanmalan` i ett **inkognitofönster** (utloggad).
→ Sidan laddar och fastighetsmenyn är ifylld.

**8.** Fyll i: namn, adress, telefon, **Fastighet A**, ditt **lägenhetsnummer**, din **trappa**, kategori, rubrik, beskrivning. Skicka.
→ Bekräftelse visas.

**9.** Som **admin**, öppna Felanmälningar.
→ Ärendet ligger under **Fastighet A**.

**10.** Öppna ärendet.
→ Anmälarens namn, telefon och e-post finns med.
→ Ärendet är kopplat till **din lägenhet** (rätt nummer + trappa).

**11.** Öppna **Fastighet A → Lägenheter**.
→ Det finns fortfarande bara **en** lägenhet med det numret och den trappan. Ingen dubblett.

**12.** Öppna lägenheten → fliken **Tidslinje**.
→ Felanmälan syns i listan.

**13.** Öppna **Loggbok**.
→ En notering om den mottagna anmälan finns.

**14.** Skicka en ny anmälan från `/felanmalan` — samma lägenhetsnummer men en **trappa som inte finns**.
→ En **ny** lägenhet skapas, markerad som skapad via publikt formulär, och syns i lägenhetslistan.

---

## Felanmälan som admin

**15.** Som **admin**: Felanmälningar → **Ny felanmälan**. Fastighet A, din lägenhet, prioritet **normal**, **Ansvarig = din testentreprenör**. Spara.
→ Ärendet sparas och du landar på ärendesidan.

**16.** Öppna Felanmälningar.
→ Ärendet ligger under Fastighet A.

**17.** Öppna **Fastighet A → Felanmälningar**.
→ Samma ärende syns även här.

**18.** Öppna lägenheten → **Tidslinje**.
→ Ärendet syns.

**19.** Byt till **entreprenör**, öppna Fastigheter.
→ Fastighet A har dykt upp.

**20.** Som **entreprenör**, öppna Felanmälningar.
→ Ärendet syns. Inga andra ärenden syns.

**21.** Byt till **styrelse**, öppna ärendet.
→ Ärendet syns, men inga Spara- eller Radera-knappar finns.

---

## Akut och Dag Rapport

**22.** Som **admin**, skapa en felanmälan på Fastighet A med prioritet **akut**. Spara.
→ Ärendet sparas.

**23.** Titta i **admin**- och **entreprenörsfönstret** direkt efteråt.
→ En röd **AKUT**-popup visas.

**24.** Klicka på **klockan** uppe till höger.
→ Det akuta ärendet listas där.

**25.** Som **admin**, öppna **Dag Rapport**.
→ Det akuta ärendet syns.

**26.** Som **entreprenör**, öppna **Dag Rapport**.
→ Bara **dina egna** tilldelade ärenden syns. Inga andras.

**27.** Som **admin**, skapa ett ärende med **deadline igår** och tilldela entreprenören.
→ Ärendet syns på Dag Rapport hos både admin och entreprenören.

**28.** Skapa ett ärende med **deadline om en månad**.
→ Det syns **inte** på Dag Rapport.

---

## Besiktning

**29.** Som **admin**: Besiktningar → **Ny besiktning**. Fastighet A, din lägenhet, **Ansvarig = testentreprenören**, nästa besiktningsdatum **om en månad**. Spara.
→ Besiktningen sparas.

**30.** Kolla Besiktningar, **Fastighet A → Besiktningar**, och lägenhetens **Tidslinje**.
→ Besiktningen syns på alla tre ställena.

**31.** Titta på statusen på besiktningen.
→ Den visar **Ny**. Det finns **ingen** status-dropdown någonstans på sidan.

**32.** Ändra nästa besiktningsdatum till **igår**. Spara. Ladda om.
→ Status visar **Försenad** (röd).

**33.** Ändra datumet till **imorgon**. Spara. Ladda om.
→ Status visar **Brådskande**.

**34.** Byt till **entreprenör** → Besiktningar.
→ Besiktningen syns.

**35.** Byt till **styrelse** → öppna besiktningen.
→ Den syns, men går inte att ändra.

**36.** Som **admin**, skapa en besiktning på **Fastighet B**, utan ansvarig.
→ Varken styrelsen eller entreprenören ser den. Bara admin.

---

## Projekt

**37.** Som **admin**: Projekt → **Nytt projekt**. Fastighet A, slutdatum **om en månad**, **Ansvarig = testentreprenören**. Spara.
→ Projektet sparas.

**38.** Kolla Projekt och **Fastighet A → Projekt**.
→ Projektet syns på båda ställena.

**39.** Öppna lägenhetens **Tidslinje**.
→ Projektet syns **inte** där. (Projekt hör till byggnaden, inte lägenheten.)

**40.** Titta på statusen.
→ **Ny**.

**41.** Ändra slutdatum till **igår**. Spara. Ladda om.
→ **Försenad**.

**42.** Klicka **Pausa**.
→ Status visar **Pausad** — inte Försenad, trots att datumet passerat.

**43.** Klicka **Avbryt**.
→ Status visar **Avbruten**.

**44.** Ställ tillbaka projektet till aktivt.
→ Status visar **Försenad** igen.

**45.** Byt till **entreprenör** → Projekt.
→ Projektet syns.

**46.** Byt till **styrelse** → öppna projektet.
→ Det syns, men går inte att ändra.

---

## Öppna och avsluta — gör detta tre gånger

Kör **47–51** en gång på en **felanmälan**, en gång på en **besiktning**, en gång på ett **projekt**.

**47.** Som **admin**, öppna ärendet.
→ Knappen **Öppna ärende** finns. Knappen **Avsluta ärende** finns **inte**.

**48.** Klicka **Öppna ärende**.
→ Statusen blir **Pågående**. Öppna-knappen försvinner, **Avsluta ärende** dyker upp.

**49.** Klicka **Avsluta ärende**.
→ Statusen blir **Avslutad**. Båda knapparna är borta.

**50.** Gå tillbaka till listan, fastighetens flik, och lägenhetens tidslinje.
→ Alla ställen visar **Avslutad**. Ingen vy visar en gammal status.

**51.** Kolla ett avslutat ärende vars datum passerat.
→ Det visar **Avslutad**, inte Försenad.

**52.** Som **entreprenör**, öppna ett av dina ärenden.
→ Notera om du kan klicka Öppna/Avsluta. Skriv upp svaret.

**53.** Som **styrelse**, öppna samma ärende.
→ Knapparna går inte att använda.

---

## Historik

**54.** Som **admin**, öppna lägenheten → **Info** → skrolla längst ner, under Spara.
→ En historiklista visas.

**55.** Öppna en felanmälan, ändra **prioritet**, spara. Gå tillbaka till lägenhetens Info och skrolla ner.
→ En ny rad visar: vem som ändrade, att det var **Prioritet**, från vilket värde till vilket, och när.

**56.** Öppna ett ärende, ändra **ingenting**, gå tillbaka till Historik.
→ **Ingen ny rad** har tillkommit.

**57.** Låt **entreprenören** ändra något på sitt ärende. Kolla Historik som **admin**.
→ Raden visar entreprenörens namn och företag. Inte tomt, inte "okänd".

**58.** Ändra något på ett **projekt**. Kolla lägenhetens Historik.
→ Projektändringen syns **inte** där.

---

## Ansvarig-listan

**59.** Öppna ett ärende → **Ansvarig**-menyn.
→ Bara aktiva kontakter listas.

**60.** Kontakter → öppna testentreprenören → sätt **Status: Inaktiv**. Spara.
→ Sparas.

**61.** Öppna ett ärende som **redan** var tilldelat hen.
→ Namnet står kvar, märkt **"— inaktiv"**. Det står **inte** "Ej tilldelad".

**62.** Öppna Ansvarig-menyn på ett **annat** ärende.
→ Den inaktiva kontakten går inte att välja.

**63.** Sätt tillbaka kontakten till **Aktiv**. Gå till ett ärende och öppna Ansvarig-menyn.
→ Hen går att välja igen.

**64.** Inställningar → Användare → radera entreprenörens **inloggning**. Öppna sedan Ansvarig-menyn på ett ärende.
→ Personen är borta ur menyn.

---

## Åtkomst via URL

**65.** Kopiera URL:en till ett ärende i **Fastighet B**. Klistra in den i **styrelsens** fönster.
→ Du kastas ut till Fastigheter. Ingen data visas.

**66.** Kopiera URL:en till ett ärende som **inte** är tilldelat entreprenören. Klistra in i **entreprenörens** fönster.
→ Du kastas ut.

**67.** Som **styrelse**, gå till `/issues/new`, sedan `/inspections/new`, sedan `/projects/new`.
→ Ingen fungerande skapa-sida på någon av dem.

**68.** Som **entreprenör**, gå till samma tre URL:er.
→ Samma sak.

**69.** Som **styrelse**, gå till `/contacts`.
→ Blockerad.

**70.** Som **styrelse**, öppna Fastighet A → försök nå Dokument och Objekt via URL (`/properties/<id>/documents`, `/properties/<id>/objects`).
→ Blockerad på båda.

**71.** Som **entreprenör**, öppna **Lägenheter**.
→ Bara lägenheter där du har ett ärende. Inte hela lägenhetsregistret.

**72.** Som **styrelse**, öppna en lägenhet → **Info**.
→ Fälten går inte att skriva i. Ingen Spara- eller Radera-knapp.
