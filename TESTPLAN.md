
## Ställ upp

Öppna två fönster och låt båda stå öppna hela testet.

- **Fönster A** — inloggad som admin
- **Fönster B** — inloggad som entreprenör

---

## Testet

### 1. Entreprenör utan e-postadress

**Gör:** Öppna ett ärende i A. Välj i Ansvarig-rutan en entreprenör som saknar adress.

**Ska hända:** En ruta ber dig fylla i adressen direkt. Du kommer inte vidare utan den.

---

### 2. Tilldela och skicka

**Gör:** Välj entreprenören. Tryck Spara.

**Ska hända:** En ruta visar adressen och frågar om du vill skicka.

- Tryck **Avbryt** → ingenting sparas. Entreprenören står kvar som förut.
- Gör om. Tryck **Skicka och spara** → grön bekräftelse som säger vilken adress mejlet gick till.

---

### 3. Realtid

**Gör:** Titta på fönster B. Ladda **inte** om sidan.

**Ska hända:** Ärendet dyker upp inom några sekunder, med en notis. Ingen utloggning behövs.

---

### 4. Mejlet

**Gör:** Öppna entreprenörens inkorg.

**Ska hända:** Ett mejl med ärendets rubrik, fastighet, lägenhet, prioritet, beskrivning och en länk. Ligger i inkorgen, inte i skräpposten.

---

### 5. Portalen — logga in

**Gör:** Ny flik, ingen inloggning. Gå till `app.bayt.se/mina-arenden`. Skriv samma e-postadress.

**Ska hända:** En sexsiffrig kod kommer på mejl inom en minut. Skriv in koden → listan med ärenden syns, nyast först.

---

### 6. Portalen — fel kod

**Gör:** Skriv fel kod fem gånger. Testa också en adress som inte finns i systemet.

**Ska hända:** Koden dör efter fem försök, du måste begära en ny. En okänd adress får ingen kod och avslöjar ingenting.

---

### 7. Portalen — arbeta

**Gör:** Öppna ärendet från steg 2. Tryck Öppna. Tryck sedan Avsluta.

**Ska hända:** Ärendet flyttas. Kolla fönster A → samma ärende står som avslutat där också, och loggboken visar samma spår som om knappen tryckts inne i portalen.

---

### 8. Entreprenörer-sidan

**Gör:** I fönster A, gå till **Entreprenörer** i menyn.

**Ska hända:** Bara admin ser menyposten. Listan visar varje entreprenör, hur många ärenden de fått, statusen på dem, och en varning på dem som saknar konto eller e-postadress.

---

### 9. Kontokopplingen

**Gör:** Logga in som **plattform@bayt.se**.

**Ska hända:** Du ser både plattformens och makkins ärenden.

**Gör:** Logga in som **makkin@live.se**.

**Ska hända:** Du ser bara makkins egna. Inget från plattformskontot.

---

### 10. Att inget gammalt gick sönder

**Gör:** Skicka in en ny felanmälan på `/felanmalan` med din egen adress. Öppna den i A. Tilldela en entreprenör. Sätt deadline. Avsluta.

**Ska hända:** Boende får fortfarande sina stegmejl, och `/arendestatus` visar rätt steg.

---

## Två saker att veta

**Steg 10 visar en känd lucka.**
Sätter du entreprenör och deadline i samma Spara får boende bara mejlet om tidsplanen — mejlet om att en entreprenör tilldelats hoppas över. Spara dem var för sig om du vill se båda.

**Steg 2, 3 och 4 kräver att du är inloggad som admin.**
Bekräftelserutan och utskicket är avstängda för styrelse och entreprenör.
