// ============================================================================
// notify-entreprenor — deploy this as a Supabase Edge Function named
// "notify-entreprenor" (by hand, like every other function in this folder —
// Supabase does not read from supabase-functions/).
//
// Skickar ärendeuppgifterna till den entreprenör som just tilldelats en
// felanmälan: "du har fått ett ärende" plus allt de behöver för att åka dit.
// Anropas från webben av en admin direkt efter att `assigned_contact_id`
// sparats på ärendet (src/lib/entreprenor-notify.ts) — inte av en DB-trigger,
// till skillnad från notify-progress. Skälet är kravet på en bekräftelseruta:
// adressen ska kunna rättas *innan* utskicket, och den frågan kan bara
// ställas där användaren står.
//
// Mottagaren är alltid `contacts.email` på den tilldelade kontakten. Adressen
// tas medvetet INTE emot som parameter — klienten sparar en ändrad adress på
// kontakten först och anropar sedan den här funktionen, så det som skickas är
// alltid det som står i registret. En "skicka till den här adressen"-parameter
// hade gjort funktionen till en generell mailrelä för vem som helst med ett
// admin-konto.
//
// SMTP-hemligheterna är samma som notify-progress redan använder (bayt.se:s
// egen brevlåda via denomailer, inte en tredjeparts e-post-API):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM (valfri)
// Inga nya secrets behöver sättas om notify-progress redan fungerar.
//
// verify_jwt = true. Utöver det kontrolleras rollen mot `profiles` här inne:
// bara admin får skicka.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Subject-raden kodas för hand — denomailer gör det fel
//
// denomailer 1.6.0 kodar en subject-rad som innehåller icke-ASCII till ETT
// enda encoded-word (`=?utf-8?Q?…?=`) och bryter det sedan var 74:e tecken
// med `=\r\n` — en "soft line break" som bara betyder något i en *brödtext*.
// I en header saknar fortsättningsraden inledande blanksteg, så mottagarens
// klient läser den som en ny (ogiltig) header, avslutar hela headerblocket
// där, och visar resten av meddelandet — From/To/Date/Content-Type, MIME-
// gränserna och alltihop — som brödtext. Det var därför mejlen kom fram som
// rå MIME i stället för som HTML. Brytningen äter dessutom upp ett par tecken
// mitt i en =XX-sekvens, så även rubriktexten blev fel.
//
// Vägen runt är att aldrig lämna över något till denomailer som triggar dess
// kodning: `quotedPrintableEncodeInline` rör bara strängar som innehåller
// icke-ASCII eller börjar med "=?" — ren ASCII skrivs ordagrant till tråden.
// Så vi returnerar antingen ren ASCII, eller egna base64-encoded-words
// (RFC 2047: ≤75 tecken var, vikta med CRLF + blanksteg) med ett inledande
// blanksteg så att strängen inte börjar med "=?". Blanksteget är
// vikningsblanksteg efter "Subject:" och kastas av varje klient.
//
// Kopior finns i notify-progress.ts och entreprenor-portal.ts och ska hållas
// byte-identiska — samma kontrakt som normalizeTrappa ↔ submit-felanmalan.ts.
// ---------------------------------------------------------------------------
const SUBJECT_MAX_CHARS = 160;

function encodeMailSubject(raw: string): string {
  // CR/LF i en subject-rad är header-injektion, och titeln är fritext från en
  // boende. Bort med dem före allt annat.
  let subject = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!subject) subject = "BAYT";
  const chars = Array.from(subject); // kodpunkter, så en emoji inte klipps itu
  if (chars.length > SUBJECT_MAX_CHARS) {
    subject = chars.slice(0, SUBJECT_MAX_CHARS - 1).join("").trimEnd() + "…";
  }

  // deno-lint-ignore no-control-regex
  if (!/[^\u0000-\u007f]/.test(subject) && !subject.startsWith("=?")) return subject;

  // 39 byte per encoded-word: base64 gör 39 byte till 52 tecken, plus
  // "=?utf-8?B?" + "?=" = 12 → 64. Encoded-word:et ryms i RFC 2047:s gräns på
  // 75, och "Subject:  " + 64 = 74 håller hela raden under RFC 5322:s 78.
  const bytes = new TextEncoder().encode(subject);
  const words: string[] = [];
  for (let i = 0; i < bytes.length;) {
    let end = Math.min(i + 39, bytes.length);
    // Varje encoded-word måste avkoda till giltig text på egen hand, så ett
    // flerbytestecken får aldrig delas. 0b10xxxxxx är en fortsättningsbyte —
    // backa tills vi står på en teckenstart.
    while (end > i && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    let bin = "";
    for (let j = i; j < end; j++) bin += String.fromCharCode(bytes[j]);
    words.push(`=?utf-8?B?${btoa(bin)}?=`);
    i = end;
  }
  return " " + words.join("\r\n ");
}

// ---------------------------------------------------------------------------
// Kontoinbjudans token — signerad, kortlivad, byte-identisk i
// notify-entreprenor och entreprenor-portal
//
// Gröna "Skapa konto"-knappen i tilldelningsmejlet leder till en publik sida.
// Utan bevis på att klicket kommer från just det mejlet vore den sidan en
// öppen ändpunkt: vem som helst hade kunnat be servern skapa konton åt
// godtyckliga adresser, och genom svaret dessutom läsa av vilka adresser som
// redan har konto hos BAYT. Token är beviset — den mintas när mejlet skickas
// och verifieras när sidan anropar portalen.
//
// Nyckeln härleds ur SERVICE_ROLE_KEY i stället för att vara en egen secret,
// så att inget nytt behöver sättas i dashboarden för att det här ska fungera.
// Den lämnar aldrig servern; bara signaturen gör det.
//
// Kopian i den andra filen ska hållas byte-identisk — samma kontrakt som
// normalizeTrappa ↔ submit-felanmalan och encodeMailSubject.
// ---------------------------------------------------------------------------
const ACCOUNT_TOKEN_TTL_DAYS = 14;

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(value: string): Uint8Array {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function accountTokenKey(serviceRoleKey: string): Promise<CryptoKey> {
  return crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(`bayt-konto-inbjudan|${serviceRoleKey}`))
    .then((material) =>
      crypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
    );
}

/** Mintar en token som säger "den här adressen får skapa konto", giltig i ACCOUNT_TOKEN_TTL_DAYS dygn. */
async function mintAccountToken(email: string, serviceRoleKey: string): Promise<string> {
  const payload = b64urlEncode(
    new TextEncoder().encode(
      JSON.stringify({ e: email, exp: Math.floor(Date.now() / 1000) + ACCOUNT_TOKEN_TTL_DAYS * 86400 }),
    ),
  );
  const key = await accountTokenKey(serviceRoleKey);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  return `${payload}.${b64urlEncode(sig)}`;
}

/** Returnerar adressen ur en giltig token, annars null. Kastar aldrig. */
async function readAccountToken(token: unknown, serviceRoleKey: string): Promise<string | null> {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    const key = await accountTokenKey(serviceRoleKey);
    const expected = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(parts[0])),
    );
    const given = b64urlDecode(parts[1]);
    if (given.length !== expected.length) return null;
    // Konstanttidsjämförelse: en tidig return hade läckt hur många byte av en
    // gissad signatur som stämde.
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ given[i];
    if (diff !== 0) return null;

    const data = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
    if (!data?.e || typeof data.exp !== "number" || data.exp * 1000 < Date.now()) return null;
    return String(data.e);
  } catch {
    return null;
  }
}

const APP_URL = "https://app.bayt.se";
// Den publika entreprenörssidan (src/routes/mina-arenden.tsx). Länken finns med
// i mejlet därför att de flesta entreprenörer inte har någon inloggning alls —
// för dem leder knappen "Öppna ärendet i BAYT" bara till en inloggningsruta de
// inte kommer förbi. På /mina-arenden loggar de in med just den adress det här
// mejlet skickades till, och kan öppna och avsluta ärendet därifrån.
const PORTAL_URL = `${APP_URL}/mina-arenden`;
// Entreprenörens landningssida när de VÄL har en inloggning (HOME_FOR_ROLE i
// src/lib/permissions.ts). Mejlet länkar dit, inte till det enskilda ärendet:
// den som redan har konto ska se hela sin arbetsdag, inte bara raden vi råkade
// mejla om.
const HOME_URL = `${APP_URL}/dag-rapport`;
// Bekräftelsesidan för kontoskapande (src/routes/skapa-konto.tsx). Att den är
// en SIDA och inte en direktlänk som skapar kontot är avsiktligt: Outlook och
// Defender förhandshämtar länkar i mejl, så en GET som skapar konton hade
// skapat dem av sig själv innan mottagaren ens öppnat mejlet.
const SIGNUP_URL = `${APP_URL}/skapa-konto`;

const PRIORITY_LABEL: Record<string, string> = {
  akut: "Akut",
  hog: "Hög",
  normal: "Normal",
  lag: "Låg",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

// Rubrik och beskrivning är fritext från en boende eller en admin — ett "<"
// i "temperatur < 15 grader" skulle annars äta upp resten av mejlet.
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type Db = ReturnType<typeof createClient>;

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Har adressen en inloggning?
 *
 * Jämförelsen görs i JS, inte med `.ilike("email", email)` — i LIKE betyder
 * `_` "vilket tecken som helst", så `anna_larsson@firman.se` hade matchat även
 * `annaXlarsson@firman.se`. Här avgör träffen vilka knappar mejlet får, och en
 * adress med understreck ska inte kunna ärva någon annans kontostatus. Samma
 * resonemang och samma lösning som contactsForEmail i entreprenor-portal.
 *
 * Ett läsfel svarar false: då visas kontoknapparna. Det är rätt väg att falla —
 * en entreprenör som redan har konto och ändå får "Skapa konto" möts av ett
 * tydligt "adressen har redan ett konto" när de klickar, medan motsatsen hade
 * dolt enda vägen in för någon som saknar konto.
 */
async function hasAccountForEmail(supabase: Db, email: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.from("profiles").select("id, email");
    if (error) return false;
    return ((data ?? []) as Record<string, unknown>[]).some(
      (p) => normalizeEmail(p.email) === email,
    );
  } catch {
    return false;
  }
}

function fmtDate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" });
}

type Row = { label: string; value: string };

// Bulletproof-HTML: <table>/<td> med inline-stilar, inga CSS-grids eller SVG.
// Outlook på Windows renderar inget av det senare pålitligt, och en
// entreprenör läser ofta mejlet i just Outlook eller en mobilklient.
function detailRowsHtml(rows: Row[]): string {
  return rows
    .map(
      (r) => `
      <tr>
        <td style="padding:7px 0;font-size:12px;color:#6B7280;font-family:Arial,Helvetica,sans-serif;white-space:nowrap;vertical-align:top;width:130px;">${esc(r.label)}</td>
        <td style="padding:7px 0;font-size:14px;color:#1a1a1a;font-family:Arial,Helvetica,sans-serif;vertical-align:top;">${esc(r.value)}</td>
      </tr>`,
    )
    .join("");
}

// ---------------------------------------------------------------------------
// Knapparna i mejlet beror på om adressen har en inloggning
//
// Har den ett konto: en enda grön knapp till mina sidor. Inget val att göra.
//
// Har den inget konto: två knappar, och skillnaden mellan dem är avsiktligt
// visuell. Grön och fylld = skapa konto, för det är den väg som ger dem hela
// portalen och slipper en engångskod vid varje besök. Vit och tunn = fortsätt
// utan konto via /mina-arenden, som fungerar men kräver en sexsiffrig kod varje
// gång. Båda leder till ärendet; den ena är bara billigare för oss att stödja
// och bekvämare för dem i längden.
//
// De två knapparna visas ALDRIG för en adress som redan har konto — då är
// "skapa konto" en återvändsgränd och portalen en sämre väg till samma sida.
// ---------------------------------------------------------------------------
type Cta =
  | { kind: "har_konto"; homeUrl: string }
  | { kind: "inget_konto"; signupUrl: string; portalUrl: string };

// Ett HTML-mejl helt utan text/plain-del är i sig en spamheuristik hos Gmail
// och Outlook (samma resonemang som i notify-progress). Innehållet speglar
// emailHtml() exakt, bara ostilat.
function emailText(opts: {
  title: string;
  rows: Row[];
  description: string | null;
  cta: Cta;
  contactName: string;
}): string {
  return [
    "BAYT",
    "",
    opts.contactName ? `Hej ${opts.contactName},` : "Hej,",
    "",
    "Du har tilldelats ett ärende i BAYT.",
    "",
    opts.title,
    "",
    ...opts.rows.map((r) => `${r.label}: ${r.value}`),
    ...(opts.description ? ["", "Beskrivning:", opts.description] : []),
    "",
    ...(opts.cta.kind === "har_konto"
      ? [`Öppna mina sidor: ${opts.cta.homeUrl}`]
      : [
          `Skapa konto: ${opts.cta.signupUrl}`,
          "Med ett konto ser du alla dina ärenden och slipper koden.",
          "",
          `Fortsätt utan konto: ${opts.cta.portalUrl}`,
          "Vi mejlar då en sexsiffrig kod till den här adressen varje gång.",
        ]),
  ].join("\n");
}

function emailHtml(opts: {
  title: string;
  rows: Row[];
  description: string | null;
  cta: Cta;
  contactName: string;
}): string {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#ffffff;border-radius:12px;font-family:Arial,Helvetica,sans-serif;">
  <tr><td style="padding:28px 24px 4px;text-align:center;">
    <img src="${APP_URL}/assets/bayt-logo-green.png" alt="BAYT" width="119" height="30" style="display:inline-block;width:119px;height:30px;border:0;" />
  </td></tr>
  <tr><td style="padding:16px 24px 0;text-align:center;">
    <div style="font-size:13px;color:#6B7280;">${opts.contactName ? `Hej ${esc(opts.contactName)},` : "Hej,"}</div>
    <div style="font-size:17px;font-weight:700;color:#1a1a1a;margin-top:6px;">Du har tilldelats ett ärende</div>
  </td></tr>
  <tr><td style="padding:18px 24px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F0F7EE;border-radius:8px;">
      <tr><td style="padding:14px 16px;font-size:16px;font-weight:600;color:#0D2B1E;font-family:Arial,Helvetica,sans-serif;">${esc(opts.title)}</td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:8px 24px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${detailRowsHtml(opts.rows)}</table>
  </td></tr>
  ${
    opts.description
      ? `<tr><td style="padding:14px 24px 0;">
    <div style="font-size:12px;color:#6B7280;font-family:Arial,Helvetica,sans-serif;">Beskrivning</div>
    <div style="font-size:14px;color:#1a1a1a;line-height:1.55;margin-top:4px;white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif;">${esc(opts.description)}</div>
  </td></tr>`
      : ""
  }
  ${
    opts.cta.kind === "har_konto"
      ? `<tr><td style="padding:24px 24px 28px;text-align:center;">
    <a href="${esc(opts.cta.homeUrl)}" style="display:inline-block;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:6px;font-family:Arial,Helvetica,sans-serif;background-color:#3D8A30;color:#ffffff;">Öppna mina sidor</a>
    <div style="font-size:11px;color:#9AA0A6;margin-top:8px;line-height:1.5;font-family:Arial,Helvetica,sans-serif;">Du har redan ett konto hos BAYT — logga in med den här adressen.</div>
  </td></tr>`
      : `<tr><td style="padding:24px 24px 4px;text-align:center;">
    <a href="${esc(opts.cta.signupUrl)}" style="display:inline-block;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:6px;font-family:Arial,Helvetica,sans-serif;background-color:#3D8A30;color:#ffffff;">Skapa konto</a>
    <div style="font-size:11px;color:#9AA0A6;margin-top:8px;line-height:1.5;font-family:Arial,Helvetica,sans-serif;">Med ett konto ser du alla dina ärenden på ett ställe och slipper koden.</div>
  </td></tr>
  <tr><td style="padding:10px 24px 0;text-align:center;font-size:11px;color:#C4C8CC;font-family:Arial,Helvetica,sans-serif;">eller</td></tr>
  <tr><td style="padding:10px 24px 28px;text-align:center;">
    <a href="${esc(opts.cta.portalUrl)}" style="display:inline-block;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:6px;font-family:Arial,Helvetica,sans-serif;background-color:#ffffff;color:#0D2B1E;border:1px solid #D8DCD8;">Fortsätt utan konto</a>
    <div style="font-size:11px;color:#9AA0A6;margin-top:8px;line-height:1.5;font-family:Arial,Helvetica,sans-serif;">Vi mejlar då en sexsiffrig kod till den här adressen varje gång.</div>
  </td></tr>`
  }
</table>
</td></tr>
</table>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const serviceRoleKey =
      Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!serviceRoleKey) {
      return json({ error: "Serverkonfiguration saknas: SERVICE_ROLE_KEY är inte satt." }, 500);
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);

    // ---- vem frågar? -------------------------------------------------------
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Du måste vara inloggad." }, 401);
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "Du måste vara inloggad." }, 401);

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role, full_name")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (profile?.role !== "admin") {
      return json({ error: "Endast administratörer kan skicka ut ärenden till entreprenörer." }, 403);
    }

    const { issue_id } = await req.json();
    if (!issue_id) return json({ error: "issue_id krävs." }, 400);

    // ---- ärendet -----------------------------------------------------------
    // properties(name) är den enda embedden — den FK:n är deklarerad och
    // används redan av notify-progress. apartments/property_objects/contacts
    // hämtas som separata uppslag: en saknad FK-deklaration 400:ar hela
    // queryn i stället för att bara tappa ett fält (samma skäl som
    // lägenhetslabeln i useMyArenden).
    const { data: issue, error: issueErr } = await supabase
      .from("issues")
      .select(
        "id, title, description, category, priority, deadline, created_at, trappa, property_id, apartment_id, property_object_id, assigned_contact_id, reporter_name, reporter_phone, reporter_email, properties(name)",
      )
      .eq("id", issue_id)
      .maybeSingle();
    if (issueErr) throw issueErr;
    if (!issue) return json({ error: "Felanmälan hittades inte." }, 404);
    if (!issue.assigned_contact_id) {
      return json({ error: "Ärendet har ingen tilldelad entreprenör." }, 400);
    }

    const { data: contact } = await supabase
      .from("contacts")
      .select("id, full_name, company, email")
      .eq("id", issue.assigned_contact_id)
      .maybeSingle();
    if (!contact) return json({ error: "Entreprenörens kontaktpost hittades inte." }, 404);

    const toAddress = (contact.email ?? "").trim();
    if (!toAddress) {
      // Klienten ska ha spärrat det här långt tidigare (AnsvarigDropdown
      // kräver e-post innan en entreprenör går att välja). Backstoppen finns
      // för de vägar som inte går genom formuläret.
      return json(
        { error: `${contact.full_name ?? "Entreprenören"} saknar e-postadress — lägg till en på kontakten först.` },
        400,
      );
    }

    let apartmentLabel: string | null = null;
    if (issue.apartment_id) {
      const { data: apt } = await supabase
        .from("apartments")
        .select("apartment_number, trappa")
        .eq("id", issue.apartment_id)
        .maybeSingle();
      if (apt) {
        apartmentLabel = [`Lgh ${apt.apartment_number}`, apt.trappa ? `Trappa ${apt.trappa}` : null]
          .filter(Boolean)
          .join(" · ");
      }
    }

    let objectLabel: string | null = null;
    if (issue.property_object_id) {
      const { data: obj } = await supabase
        .from("property_objects")
        .select("name, type")
        .eq("id", issue.property_object_id)
        .maybeSingle();
      if (obj) objectLabel = (obj.name || obj.type) ?? null;
    }

    const propertyName = (issue.properties as { name?: string } | null)?.name ?? null;
    const reporter = [issue.reporter_name, issue.reporter_phone, issue.reporter_email]
      .filter((v) => v && String(v).trim())
      .join(" · ");

    const rows: Row[] = [
      { label: "Fastighet", value: propertyName ?? "—" },
      ...(apartmentLabel ? [{ label: "Lägenhet", value: apartmentLabel }] : []),
      ...(!apartmentLabel && issue.trappa ? [{ label: "Trappa", value: issue.trappa as string }] : []),
      ...(objectLabel ? [{ label: "Objekt", value: objectLabel }] : []),
      ...(issue.category ? [{ label: "Kategori", value: issue.category as string }] : []),
      {
        label: "Prioritet",
        value: PRIORITY_LABEL[(issue.priority as string) ?? ""] ?? ((issue.priority as string) || "—"),
      },
      { label: "Tidsgräns", value: fmtDate(issue.deadline as string | null) ?? "Ingen satt" },
      { label: "Anmäld", value: fmtDate(issue.created_at as string) ?? "—" },
      ...(reporter ? [{ label: "Anmälare", value: reporter }] : []),
    ];

    // Har adressen en inloggning avgör hela knappraden — se kommentaren vid Cta.
    // Uppslaget görs på den adress mejlet faktiskt går till, inte på kontaktens
    // profile_id: en entreprenör kan ha ett konto utan att contacts.profile_id
    // hunnit länkas (det är precis vad account-continuity finns till för), och
    // då hade en profile_id-koll erbjudit dem att skapa ett konto de redan har.
    const hasAccount = await hasAccountForEmail(supabase, normalizeEmail(toAddress));

    const cta: Cta = hasAccount
      ? { kind: "har_konto", homeUrl: HOME_URL }
      : {
          kind: "inget_konto",
          // Token bevisar att klicket kommer från det här mejlet. Utan den vore
          // /skapa-konto en öppen ändpunkt — se kommentaren vid mintAccountToken.
          signupUrl: `${SIGNUP_URL}?t=${encodeURIComponent(
            await mintAccountToken(normalizeEmail(toAddress), serviceRoleKey),
          )}`,
          portalUrl: PORTAL_URL,
        };

    // ---- skicka ------------------------------------------------------------
    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");
    if (!smtpHost || !smtpUser || !smtpPass) {
      console.error("notify-entreprenor: SMTP_HOST/SMTP_USER/SMTP_PASS not fully set — email not sent.");
      return json({ error: "Serverkonfiguration saknas: SMTP-uppgifter är inte satta." }, 500);
    }
    const smtpPort = Number(Deno.env.get("SMTP_PORT") ?? "465");
    const fromAddr = Deno.env.get("SMTP_FROM") || smtpUser;

    const bodyOpts = {
      title: (issue.title as string) || "Felanmälan",
      rows,
      description: (issue.description as string | null)?.trim() || null,
      cta,
      contactName: (contact.full_name as string) || "",
    };

    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: smtpPort,
        // 465 = implicit TLS; allt annat (587, 25) STARTTLS, som denomailer
        // förhandlar själv när tls=false.
        tls: smtpPort === 465,
        auth: { username: smtpUser, password: smtpPass },
      },
    });

    try {
      await client.send({
        from: fromAddr,
        to: toAddress,
        subject: encodeMailSubject(`Nytt ärende: ${bodyOpts.title}${propertyName ? ` — ${propertyName}` : ""}`),
        content: emailText(bodyOpts),
        html: emailHtml(bodyOpts),
        // Utan detta stämplar mailservern ett eget Message-ID på sin egen
        // domän; From/Message-ID på olika domäner är en spamsignal i sig.
        headers: { "Message-ID": `<${crypto.randomUUID()}@bayt.se>` },
      });
    } catch (smtpErr) {
      console.error("notify-entreprenor: SMTP send failed", (smtpErr as Error)?.message ?? smtpErr);
      return json({ error: `E-posten kunde inte skickas till ${toAddress}.` }, 502);
    } finally {
      await client.close();
    }

    return json({ success: true, sent_to: toAddress, contact_name: contact.full_name ?? null }, 200);
  } catch (error) {
    const err = error as { message?: string } | null;
    console.error("notify-entreprenor failed:", JSON.stringify({ message: err?.message }));
    return json({ error: err?.message ?? "Okänt fel" }, 400);
  }
});
