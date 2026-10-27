import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, h2 } from "@/components/LegalPage";

export const Route = createFileRoute("/cookies")({
  ssr: false,
  head: () => ({ meta: [{ title: "Cookies — BAYT" }] }),
  component: CookiesPage,
});

function CookiesPage() {
  return (
    <LegalPage title="Cookies och lagring i webbläsaren" updated="[FYLL I DATUM]">
      <p>
        Plattformen sparar små mängder data i din webbläsare (cookies och lokal lagring). Vi använder bara sådant som
        behövs för att tjänsten ska fungera. Vi använder inga cookies för reklam eller spårning.
      </p>

      <h2 style={h2}>Nödvändig lagring</h2>
      <ul>
        <li>Inloggningssession: håller dig inloggad. Tas bort när du loggar ut.</li>
        <li>Inställningar du gör i appen, till exempel läst-status för notiser och val av fastighet.</li>
        <li>Ditt val i cookie-rutan, så att den inte visas igen.</li>
      </ul>
      <p>Detta kräver inget samtycke eftersom tjänsten inte fungerar utan det.</p>

      <h2 style={h2}>Analys och marknadsföring</h2>
      <p>Används inte i dag. Skulle vi införa det ber vi om ditt samtycke först och uppdaterar den här sidan.</p>

      <h2 style={h2}>Ta bort lagrad data</h2>
      <p>Du kan när som helst rensa webbplatsdata i webbläsarens inställningar. Då loggas du ut.</p>
    </LegalPage>
  );
}
