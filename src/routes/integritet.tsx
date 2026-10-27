import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, h2 } from "@/components/LegalPage";

export const Route = createFileRoute("/integritet")({
  ssr: false,
  head: () => ({ meta: [{ title: "Integritetspolicy — BAYT" }] }),
  component: IntegritetPage,
});

function IntegritetPage() {
  return (
    <LegalPage title="Integritetspolicy" updated="2026-10-27">
      <p>
        Den här policyn beskriver hur BAYT behandlar personuppgifter i plattformen app.bayt.se (fastighetsförvaltning,
        felanmälan, besiktningar och projekt).
      </p>

      <h2 style={h2}>Personuppgiftsansvarig</h2>
      <p>
        Bayt AB, org.nr 559006-2708, Gärsvallsvägen 3, 238 34 Oxie. Kontakt i integritetsfrågor: info@bayt.se.
        För uppgifter som en bostadsrättsförening eller fastighetsägare lägger in om sina boende är kunden
        personuppgiftsansvarig och BAYT personuppgiftsbiträde. [BEKRÄFTA MED JURIST]
      </p>

      <h2 style={h2}>Vilka uppgifter vi behandlar</h2>
      <ul>
        <li>Kontouppgifter: namn, e-postadress, roll och telefonnummer för användare (admin, styrelse, entreprenör).</li>
        <li>Felanmälningar: den anmäldas namn, telefonnummer, e-postadress, lägenhet/trappa och beskrivning av felet.</li>
        <li>Ärendedata: kommentarer, bilder, protokoll och dokument som laddas upp, samt vem som laddat upp dem.</li>
        <li>Personliga dokument och mappar som användare själva lägger upp (syns för ägaren och BAYT:s administratörer).</li>
        <li>Meddelanden i plattformens chatt.</li>
        <li>Teknisk data: inloggningssession och loggar som behövs för drift och säkerhet.</li>
      </ul>

      <h2 style={h2}>Varför och på vilken rättslig grund</h2>
      <ul>
        <li>Tillhandahålla tjänsten och hantera ärenden: avtal och berättigat intresse.</li>
        <li>Skicka notiser och e-post om ärenden du är inblandad i: avtal och berättigat intresse.</li>
        <li>Säkerhet, felsökning och förebygga missbruk: berättigat intresse.</li>
        <li>Rättsliga skyldigheter, till exempel bokföring: rättslig förpliktelse.</li>
      </ul>

      <h2 style={h2}>Vem som ser uppgifterna</h2>
      <p>
        Åtkomst styrs av roll. Entreprenörer ser bara ärenden som tilldelats dem, styrelse bara sina fastigheter, och
        BAYT:s administratörer ser det som behövs för att förvalta fastigheten.
      </p>

      <h2 style={h2}>Underleverantörer (personuppgiftsbiträden)</h2>
      <ul>
        <li>Supabase (databas, inloggning och fillagring). Dataplats: [FYLL I REGION].</li>
        <li>GitHub Pages (webbhotell för appen).</li>
        <li>Inleed (e-post, avsändaradress info@bayt.se). [BEKRÄFTA vilken tjänst som skickar notismejlen]</li>
        <li>46elks (SMS), om felanmälan via SMS används.</li>
      </ul>
      <p>[KONTROLLERA att biträdesavtal finns med varje leverantör och om uppgifter förs ut ur EU/EES.]</p>

      <h2 style={h2}>Hur länge vi sparar uppgifter</h2>
      <p>
        Uppgifter sparas så länge kundförhållandet pågår och därefter så länge lagen kräver eller det behövs för att
        hantera krav. Konton och filer raderas på begäran när det inte finns skäl att behålla dem. [FYLL I EXAKTA TIDER]
      </p>

      <h2 style={h2}>Dina rättigheter</h2>
      <p>
        Du har rätt att begära tillgång till, rättelse och radering av dina uppgifter, att begränsa eller invända mot
        behandling och att få ut uppgifterna i ett läsbart format. Kontakta oss på info@bayt.se. Du kan också klaga
        till Integritetsskyddsmyndigheten (IMY), imy.se.
      </p>

      <h2 style={h2}>Cookies</h2>
      <p>Se vår sida om cookies.</p>
    </LegalPage>
  );
}
