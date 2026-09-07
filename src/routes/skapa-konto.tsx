import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * /skapa-konto — gröna knappen i tilldelningsmejlet landar här.
 *
 * VARFÖR EN SIDA OCH INTE EN LÄNK SOM SKAPAR KONTOT DIREKT
 * Outlook, Defender och de flesta spamfilter förhandshämtar varje länk i ett
 * mejl för att kontrollera den. En GET som skapade kontot hade alltså skapat
 * det av sig själv, innan mottagaren ens öppnat mejlet — och sedan mejlat dem
 * en inbjudan de inte bett om. Det krävs ett klick av en människa, och det är
 * hela den här sidans uppgift.
 *
 * VARFÖR ?t= OCH INTE ?email=
 * Adressen som kontot skapas för läses ur den signerade token på servern,
 * aldrig ur URL:en. Utan det hade sidan varit en öppen ändpunkt: skriv in vems
 * adress som helst och be BAYT skapa ett konto. Token mintas av
 * notify-entreprenor när mejlet skickas och verifieras av entreprenor-portal.
 *
 * Nyttolasten är base64url-JSON, så adressen går att LÄSA här utan att
 * verifiera signaturen — det är bara till för att kunna visa "kontot skapas
 * för <adress>". Den avläsningen är inte ett bevis på något, och sidan
 * behandlar den inte som ett.
 */
export const Route = createFileRoute("/skapa-konto")({
  ssr: false,
  head: () => ({ meta: [{ title: "Skapa konto — BAYT" }] }),
  component: SkapaKontoPage,
});

const C = {
  border: "#E5E7EB",
  primary: "#3D8A30",
  dark: "#0D2B1E",
  secondary: "#6B7280",
  muted: "#8A94A0",
  text: "#1F2A37",
  error: "#DC2626",
  card: "#ffffff",
  wash: "#F9FAFB",
  accentBg: "#F0F7EE",
};

const baytLogo = `${import.meta.env.BASE_URL}assets/bayt-logo.png`;

/** Adressen ur tokens nyttolast, enbart för att kunna visa den. Se filhuvudet. */
function emailFromToken(token: string): string | null {
  try {
    const payload = token.split(".")[0];
    if (!payload) return null;
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const data = JSON.parse(json) as { e?: unknown };
    return data?.e ? String(data.e) : null;
  } catch {
    return null;
  }
}

type Steg = "fraga" | "skickar" | "klart";

function SkapaKontoPage() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get("t") ?? "", []);
  const email = useMemo(() => emailFromToken(token), [token]);
  const [steg, setSteg] = useState<Steg>("fraga");
  const [fel, setFel] = useState<string | null>(null);
  const [harKonto, setHarKonto] = useState(false);

  async function skapaKonto() {
    setSteg("skickar");
    setFel(null);
    setHarKonto(false);
    const { data, error } = await supabase.functions.invoke("entreprenor-portal", {
      body: { action: "create_account", token },
    });

    // functions.invoke lägger inte svarskroppen i `data` vid 4xx/5xx — den
    // ligger i error.context, som är Response-objektet. Utan uppackningen ser
    // användaren supabase-js generiska "non-2xx status code" i stället för
    // funktionens svenska förklaring. Samma mönster som callPortal i
    // mina-arenden.tsx.
    if (error) {
      const res = (error as { context?: Response }).context;
      const body = res && typeof res.json === "function" ? await res.json().catch(() => null) : null;
      setHarKonto(Boolean((body as { has_account?: boolean } | null)?.has_account));
      setFel(
        (body as { error?: string } | null)?.error ??
          "Kontot kunde inte skapas just nu. Försök igen om en stund.",
      );
      setSteg("fraga");
      return;
    }
    if ((data as { error?: string } | null)?.error) {
      setFel(String((data as { error?: string }).error));
      setSteg("fraga");
      return;
    }
    setSteg("klart");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.wash,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          minWidth: 0,
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: "32px 28px",
          boxShadow: "0 1px 3px rgba(16,24,40,.06)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <img src={baytLogo} alt="BAYT" style={{ height: 30, width: "auto" }} />
        </div>

        {!token || !email ? (
          <Meddelande
            rubrik="Länken fungerar inte"
            text="Länken saknar sin kod, eller har klippts av på vägen. Öppna det senaste ärendemejlet och klicka på knappen där."
            visaPortalLank
          />
        ) : steg === "klart" ? (
          <Meddelande
            rubrik="Kolla din inkorg"
            text={`Vi har mejlat en länk till ${email}. Klicka på den för att välja lösenord — sedan är du inne.`}
          />
        ) : (
          <>
            <h1
              style={{
                fontFamily: "Outfit, system-ui, sans-serif",
                fontSize: 21,
                fontWeight: 700,
                color: C.dark,
                margin: "0 0 8px",
                textAlign: "center",
              }}
            >
              Skapa ditt BAYT-konto
            </h1>
            <p
              style={{
                fontSize: 14,
                color: C.secondary,
                lineHeight: 1.6,
                margin: "0 0 20px",
                textAlign: "center",
              }}
            >
              Med ett konto ser du alla dina ärenden på ett ställe, och slipper be om en kod varje
              gång.
            </p>

            <div
              style={{
                background: C.accentBg,
                borderRadius: 8,
                padding: "12px 14px",
                marginBottom: 20,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 11, color: C.secondary, marginBottom: 2 }}>
                Kontot skapas för
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.dark, wordBreak: "break-all" }}>
                {email}
              </div>
            </div>

            {fel && (
              <div
                style={{
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  borderRadius: 8,
                  padding: "10px 12px",
                  marginBottom: 16,
                  fontSize: 13,
                  color: C.error,
                  lineHeight: 1.5,
                }}
              >
                {fel}
                {harKonto && (
                  <>
                    {" "}
                    <a href="/login" style={{ color: C.primary, fontWeight: 600 }}>
                      Logga in
                    </a>
                  </>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => void skapaKonto()}
              disabled={steg === "skickar"}
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: steg === "skickar" ? C.muted : C.primary,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "13px 16px",
                fontSize: 15,
                fontWeight: 600,
                cursor: steg === "skickar" ? "default" : "pointer",
              }}
            >
              {steg === "skickar" ? "Skapar konto…" : "Skapa konto"}
            </button>

            <p
              style={{
                fontSize: 12,
                color: C.muted,
                lineHeight: 1.6,
                margin: "16px 0 0",
                textAlign: "center",
              }}
            >
              Vi mejlar dig en länk där du väljer lösenord. Vill du hellre slippa konto kan du{" "}
              <a href="/mina-arenden" style={{ color: C.secondary, textDecoration: "underline" }}>
                fortsätta med engångskod
              </a>
              .
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Meddelande({
  rubrik,
  text,
  visaPortalLank,
}: {
  rubrik: string;
  text: string;
  visaPortalLank?: boolean;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <h1
        style={{
          fontFamily: "Outfit, system-ui, sans-serif",
          fontSize: 20,
          fontWeight: 700,
          color: C.dark,
          margin: "0 0 10px",
        }}
      >
        {rubrik}
      </h1>
      <p style={{ fontSize: 14, color: C.secondary, lineHeight: 1.6, margin: 0 }}>{text}</p>
      {visaPortalLank && (
        <p style={{ fontSize: 13, margin: "16px 0 0" }}>
          <a href="/mina-arenden" style={{ color: C.primary, fontWeight: 600 }}>
            Gå till Mina ärenden
          </a>
        </p>
      )}
    </div>
  );
}
