// ============================================================================
// entreprenor-portal — deploy this as a Supabase Edge Function named
// "entreprenor-portal" (för hand, som allt annat i den här mappen — Supabase
// läser inte från supabase-functions/).
//
// Backend för /mina-arenden: den publika, inloggningsfria sidan där en
// entreprenör skriver den e-post som står på deras kontaktpost — samma adress
// som notify-entreprenor skickar tilldelningsmejlen till — och därefter ser och
// arbetar med sina felanmälningar.
//
// FEM ACTIONS I EN FUNKTION
//   request_code  { email }              → mejlar en sexsiffrig engångskod
//   verify_code   { email, code }        → byter koden mot ett sessionstoken
//   list          { token }              → entreprenörens felanmälningar, nyast först
//   open          { token, issue_id }    → vilande/ny → oppet
//   close         { token, issue_id }    → → stangd (avslutat)
// En funktion i stället för fem: alla delar sessionsuppslaget och SMTP-
// hemligheterna, och varje ny funktion är en ny manuell deploy att hålla reda på.
//
// VARFÖR SERVICE ROLE OCH INTE RLS
// Samma skäl som track-felanmalan.ts: `issues` har RLS på utan anon-policy, och
// en `USING (true)`-policy hade låtit vem som helst med den publika anon-nyckeln
// bläddra igenom hela beståndets ärenden. Här väger det tyngre än där, för den
// här funktionen *skriver* också. Varje skrivning kontrollerar därför själv att
// ärendet faktiskt är tilldelat sessionens kontakt innan den rör en rad.
//
// SECRETS: inga nya. SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM är
// samma brevlåda hos bayt.se som notify-progress och notify-entreprenor redan
// använder, och service role-nyckeln plockas upp i samma ordning som i
// submit-felanmalan.ts.
//
// verify_jwt lämnas på (default). Anropen kommer från webbappen via
// supabase.functions.invoke, som skickar den publika anon-nyckeln som JWT — den
// släpps igenom, precis som för track-felanmalan. Den riktiga behörighets-
// kontrollen är koden och sessionstoken här inne, inte plattformens JWT-grind.
//
// KÖR supabase-functions/entreprenor-portal.sql FÖRST — utan de två tabellerna
// svarar request_code med 500.
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
const PORTAL_URL = `${APP_URL}/mina-arenden`;

/** Så länge en obruten kod duger. Kort med flit: den ligger i en inkorg. */
const CODE_TTL_MINUTES = 15;
/** Gissningar per kod innan den dör. Sex siffror = 1 på 200 000 per försök. */
const CODE_MAX_ATTEMPTS = 5;
/** Kodbeställningar per adress och timme, så funktionen inte blir en mejlbomb. */
const CODE_MAX_PER_HOUR = 5;
/** Hur länge webbläsaren får slippa fråga igen. */
const SESSION_TTL_DAYS = 30;

// Speglar LIFECYCLE_OF i src/lib/issue-tokens.ts. Samma sorts kontrakt som
// normalizeTrappa ↔ submit-felanmalan.ts: ändras den ena måste den andra med,
// annars börjar den här sidan och portalen påstå olika saker om samma rad.
const LIFECYCLE_OF: Record<string, "vilande" | "oppet" | "avslutat"> = {
  ny: "vilande",
  vilande: "vilande",
  pagande: "oppet",
  oppet: "oppet",
  vantar: "oppet",
  klar: "avslutat",
  fakturerad: "avslutat",
  stangd: "avslutat",
  avslutat: "avslutat",
};

function lifecycleOf(status: unknown): "vilande" | "oppet" | "avslutat" {
  return LIFECYCLE_OF[String(status ?? "")] ?? "vilande";
}

// Vad OppnaArendeButton respektive AvslutaArendeButton skriver. Värdena är
// medvetet identiska med knapparnas — en entreprenör som avslutar här och en
// som avslutar inne i portalen ska lämna exakt samma spår efter sig.
const STATUS_OPEN = "oppet";
const STATUS_CLOSED = "stangd";

// Avsluta får tas direkt från vilande, utan att ärendet öppnas först. Det är
// samma medgivande som <AvslutaArendeButton allowVilande> i Dag Rapports
// entreprenörsvy: "det behövde inte göras" är ett riktigt och vanligt svar ute
// på fältet, och att tvinga fram ett Öppna först vore två klick teater.
function canOpen(status: unknown): boolean {
  return lifecycleOf(status) === "vilande";
}
function canClose(status: unknown): boolean {
  return lifecycleOf(status) !== "avslutat";
}

// ---------------------------------------------------------------------------
// De tre ärendetyperna
//
// Portalen visade länge bara felanmälningar, men besiktningar och projekt
// tilldelas på exakt samma sätt (assigned_contact_id) och är lika mycket
// entreprenörens jobb. Skillnaden som gör dem besvärliga är att tabellerna
// inte är överens om någonting: felanmälan bär sin livscykel i `status`
// (issue_status-enumet), besiktning och projekt i `arende_status` (fri TEXT).
// Normaliseringen sker här och ingen annanstans.
// ---------------------------------------------------------------------------
type ArendeKind = "issue" | "inspection" | "project";

const ARENDE_TABLE: Record<ArendeKind, string> = {
  issue: "issues",
  inspection: "inspections",
  project: "projects",
};

/** Kolumnen som bär livscykeln. Felanmälan är undantaget. */
const LIFECYCLE_COLUMN: Record<ArendeKind, string> = {
  issue: "status",
  inspection: "arende_status",
  project: "arende_status",
};

const ARENDE_NOT_FOUND: Record<ArendeKind, string> = {
  issue: "Felanmälan hittades inte.",
  inspection: "Besiktningen hittades inte.",
  project: "Projektet hittades inte.",
};

/** Vad OppnaArendeButton/AvslutaArendeButton skriver för respektive typ. */
const OPEN_VALUE: Record<ArendeKind, string> = {
  issue: STATUS_OPEN,
  inspection: "oppet",
  project: "oppet",
};
const CLOSE_VALUE: Record<ArendeKind, string> = {
  issue: STATUS_CLOSED,
  inspection: "avslutat",
  project: "avslutat",
};

/**
 * Livscykeln för vilken ärendetyp som helst.
 *
 * Reglerna är desamma som deriveInspectionStatus/deriveProjectStatus i
 * src/lib/issue-tokens.ts, inklusive fallbacken för rader som är äldre än
 * `arende_status` — de får sin livscykel ur den gamla status-kolumnen, där
 * bara `klar` (och för projekt även `avbruten`) betydde avslutat.
 */
function arendeLifecycle(kind: ArendeKind, row: Record<string, unknown>): "vilande" | "oppet" | "avslutat" {
  if (kind === "issue") return lifecycleOf(row.status);
  const arende = row.arende_status as string | null;
  if (arende) return LIFECYCLE_OF[arende] ?? "vilande";
  const legacy = String(row.status ?? "");
  if (kind === "inspection") return legacy === "klar" ? "avslutat" : "oppet";
  return legacy === "klar" || legacy === "avbruten" ? "avslutat" : "oppet";
}

/**
 * Ett avbrutet projekt har ingen livscykel kvar att flytta — samma regel som
 * canOppnaArende/canAvslutaArende, som båda returnerar false för det.
 */
function arendeCanOpen(kind: ArendeKind, row: Record<string, unknown>): boolean {
  if (kind === "project" && row.status === "avbruten") return false;
  return arendeLifecycle(kind, row) === "vilande";
}
function arendeCanClose(kind: ArendeKind, row: Record<string, unknown>): boolean {
  if (kind === "project" && row.status === "avbruten") return false;
  return arendeLifecycle(kind, row) !== "avslutat";
}

// Speglar INSPECTION_TYPES i src/lib/inspection-tokens.ts, och ska hållas
// synkad med den. En besiktning har ingen title-kolumn — typen är namnet.
const INSPECTION_TYPE_LABEL: Record<string, string> = {
  ovk: "OVK (ventilationskontroll)",
  sba: "Systematiskt brandskyddsarbete (SBA)",
  hiss: "Hiss",
  el: "El",
  tak: "Tak",
  fasad: "Fasad",
  ventilation: "Ventilation",
  radon: "Radon",
  fukt: "Fukt",
  ovrigt: "Övrigt",
};

function arendeTitle(kind: ArendeKind, row: Record<string, unknown>): string {
  if (kind === "inspection") {
    const t = String(row.inspection_type ?? "");
    return INSPECTION_TYPE_LABEL[t] ?? t ?? "Besiktning";
  }
  return (row.title as string) || (kind === "project" ? "Projekt" : "Felanmälan");
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

async function sha256hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Koden hashas tillsammans med adressen, så en läckt hash inte går att slå upp
 *  i en färdig tabell över alla en miljon sexsiffriga tal. */
function codeFingerprint(email: string, code: string): Promise<string> {
  return sha256hex(`${email}:${code}`);
}

function generateCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Kodmejlet
// ---------------------------------------------------------------------------
// Bulletproof-HTML (<table> + inline-stilar), av samma skäl som i
// notify-entreprenor: en entreprenör läser det här i Outlook eller på en mobil.
function codeEmailHtml(code: string, name: string): string {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="460" cellpadding="0" cellspacing="0" style="max-width:460px;width:100%;background-color:#ffffff;border-radius:12px;font-family:Arial,Helvetica,sans-serif;">
  <tr><td style="padding:28px 24px 4px;text-align:center;">
    <img src="${APP_URL}/assets/bayt-logo-green.png" alt="BAYT" width="119" height="30" style="display:inline-block;width:119px;height:30px;border:0;" />
  </td></tr>
  <tr><td style="padding:16px 24px 0;text-align:center;">
    ${name ? `<div style="font-size:13px;color:#6B7280;">Hej ${esc(name)},</div>` : ""}
    <div style="font-size:17px;font-weight:700;color:#1a1a1a;margin-top:6px;">Din inloggningskod</div>
    <div style="font-size:13px;color:#6B7280;margin-top:6px;line-height:1.5;">Skriv in koden på sidan för att se dina ärenden.</div>
  </td></tr>
  <tr><td style="padding:20px 24px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F0F7EE;border-radius:8px;">
      <tr><td align="center" style="padding:18px 16px;font-size:32px;font-weight:700;letter-spacing:8px;color:#0D2B1E;font-family:Arial,Helvetica,sans-serif;">${esc(code)}</td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:14px 24px 28px;text-align:center;">
    <div style="font-size:12px;color:#6B7280;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">
      Koden gäller i ${CODE_TTL_MINUTES} minuter.<br />
      Har du inte begärt den kan du strunta i det här mejlet — ingen kommer åt dina ärenden utan koden.
    </div>
  </td></tr>
</table>
</td></tr>
</table>`;
}

// Ett HTML-mejl helt utan text/plain-del är i sig en spamheuristik hos Gmail och
// Outlook — samma resonemang som i notify-progress och notify-entreprenor.
function codeEmailText(code: string, name: string): string {
  return [
    "BAYT",
    "",
    ...(name ? [`Hej ${name},`, ""] : []),
    "Din inloggningskod:",
    "",
    code,
    "",
    `Koden gäller i ${CODE_TTL_MINUTES} minuter.`,
    `Skriv in den på ${PORTAL_URL} för att se dina ärenden.`,
    "",
    "Har du inte begärt koden kan du strunta i det här mejlet.",
  ].join("\n");
}

async function sendMail(to: string, subject: string, text: string, html: string): Promise<void> {
  const smtpHost = Deno.env.get("SMTP_HOST");
  const smtpUser = Deno.env.get("SMTP_USER");
  const smtpPass = Deno.env.get("SMTP_PASS");
  if (!smtpHost || !smtpUser || !smtpPass) {
    throw new Error("Serverkonfiguration saknas: SMTP-uppgifter är inte satta.");
  }
  const smtpPort = Number(Deno.env.get("SMTP_PORT") ?? "465");
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
      from: Deno.env.get("SMTP_FROM") || smtpUser,
      to,
      subject: encodeMailSubject(subject),
      content: text,
      html,
      // Utan detta stämplar mailservern ett eget Message-ID på sin egen domän;
      // From och Message-ID på olika domäner är en spamsignal i sig.
      headers: { "Message-ID": `<${crypto.randomUUID()}@bayt.se>` },
    });
  } finally {
    await client.close();
  }
}

// ---------------------------------------------------------------------------
// Sessioner
// ---------------------------------------------------------------------------
type Session = {
  email: string;
  /** Alla aktiva entreprenörskontakter som bär adressen — se .sql om varför flera. */
  contactIds: string[];
  /** Första kontakten med en kopplad inloggning, för created_by i loggboken. */
  profileId: string | null;
  displayName: string | null;
};

type Db = ReturnType<typeof createClient>;

/**
 * Alla kontaktposter som den här adressen får agera som.
 *
 * Jämförelsen görs i JS, inte med `.ilike("email", email)`, trots att det
 * senare är kortare och är vad track-felanmalan gör. ilike är LIKE, och i LIKE
 * betyder `_` "vilket tecken som helst" — så `anna_larsson@firman.se` hade
 * matchat även `annaXlarsson@firman.se`. På en läsande spårningssida är det en
 * kuriositet; här avgör träffen *vem sessionen är*, och då får en adress med
 * understreck inte kunna öppna någon annans ärenden. Kontaktregistret är
 * dessutom litet nog att hämta helt.
 */
async function contactsForEmail(supabase: Db, email: string): Promise<Record<string, unknown>[]> {
  // select("*") med flit: `active` läggs till av en handkörd migration
  // (contacts-active-flag.sql), och att namna kolumnen explicit hade 400:at hela
  // uppslaget om frontend hinner före SQL:en. Samma skäl som i AnsvarigDropdown.
  const { data, error } = await supabase.from("contacts").select("*").eq("contact_type", "entreprenor");
  if (error) throw error;
  const all = (data ?? []) as Record<string, unknown>[];

  // active !== false, inte active === true: kolumnen kan saknas eller vara
  // null på gamla rader, och de ska räknas som aktiva.
  const active = all.filter((c) => c.active !== false);
  const own = active.filter((c) => normalizeEmail(c.email) === email);

  // DELEGERADE KONTAKTER — samma regel som my_contact_ids() i SQL och
  // useMyContactIds i klienten (account-delegation.sql). Ett konto kan ha fått
  // en annan entreprenörs kontaktpost delegerad till sig, och då hör den
  // kontaktens ärenden till adressen som loggar in här också. Riktningen är
  // enkelriktad: den delegerade kontakten får inget tillbaka.
  //
  // Utan det här skulle portalen och den inloggade appen svara olika på samma
  // fråga — och ett konto som *bara* har delegeringar (ingen egen kontaktpost
  // med den adressen) hade inte ens kunnat begära en kod.
  const delegated = await delegatedContactIds(supabase, email);
  if (delegated.size === 0) return own;

  const seen = new Set(own.map((c) => String(c.id)));
  const extra = active.filter((c) => delegated.has(String(c.id)) && !seen.has(String(c.id)));
  return [...own, ...extra];
}

/**
 * Kontakt-id:n som delegerats till inloggningen bakom `email`.
 *
 * Delegeringstabellen är en handkörd migration. Saknas den ska svaret bli "inga
 * delegeringar" — aldrig ett 500 som låser ute varenda entreprenör ur portalen.
 */
async function delegatedContactIds(supabase: Db, email: string): Promise<Set<string>> {
  const empty = new Set<string>();
  try {
    const { data: profileRows, error: profileError } = await supabase
      .from("profiles")
      .select("id, email");
    if (profileError) return empty;

    const profileIds = ((profileRows ?? []) as Record<string, unknown>[])
      .filter((p) => normalizeEmail(p.email) === email)
      .map((p) => String(p.id));
    if (profileIds.length === 0) return empty;

    const { data, error } = await supabase
      .from("contact_delegations")
      .select("contact_id")
      .in("profile_id", profileIds);
    if (error) return empty;

    const ids = new Set<string>();
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      if (row.contact_id) ids.add(String(row.contact_id));
    }
    return ids;
  } catch {
    return empty;
  }
}

async function resolveSession(supabase: Db, token: unknown): Promise<Session | null> {
  const raw = String(token ?? "").trim();
  if (!raw) return null;

  const { data, error } = await supabase
    .from("entreprenor_sessions")
    .select("id, email, expires_at")
    .eq("token_hash", await sha256hex(raw))
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (new Date(String(data.expires_at)).getTime() < Date.now()) return null;

  // Kontakterna slås upp på nytt vid varje anrop, aldrig cachade i sessionen:
  // blir kontakten inaktiverad, eller får ett nytt ärende tilldelat, ska det slå
  // igenom direkt — inte om trettio dagar när token går ut.
  const contacts = await contactsForEmail(supabase, String(data.email));
  if (contacts.length === 0) return null;

  await supabase
    .from("entreprenor_sessions")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  const linked = contacts.find((c) => c.profile_id);
  return {
    email: String(data.email),
    contactIds: contacts.map((c) => String(c.id)),
    profileId: linked ? String(linked.profile_id) : null,
    displayName:
      (contacts[0].full_name as string | null) ?? (contacts[0].company as string | null) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Ärendeuppslag
// ---------------------------------------------------------------------------
// properties(name) är den enda embedden — den FK:n är deklarerad och används
// redan av notify-progress och notify-entreprenor. apartments och
// property_objects hämtas separat: en odeklarerad FK 400:ar hela queryn i
// stället för att bara tappa ett fält (samma skäl som lägenhetslabeln i
// useMyArenden).
async function decorateArenden(supabase: Db, kind: ArendeKind, rows: Record<string, unknown>[]) {
  const apartmentIds = [...new Set(rows.map((r) => r.apartment_id).filter(Boolean))] as string[];
  const objectIds = [...new Set(rows.map((r) => r.property_object_id).filter(Boolean))] as string[];

  const apartments = new Map<string, string>();
  if (apartmentIds.length > 0) {
    const { data } = await supabase
      .from("apartments")
      .select("id, apartment_number, trappa")
      .in("id", apartmentIds);
    for (const a of (data ?? []) as Record<string, unknown>[]) {
      apartments.set(
        String(a.id),
        [`Lgh ${a.apartment_number}`, a.trappa ? `Trappa ${a.trappa}` : null].filter(Boolean).join(" · "),
      );
    }
  }

  const objects = new Map<string, string>();
  if (objectIds.length > 0) {
    const { data } = await supabase.from("property_objects").select("id, name, type").in("id", objectIds);
    for (const o of (data ?? []) as Record<string, unknown>[]) {
      objects.set(String(o.id), String(o.name || o.type || ""));
    }
  }

  // Fastighetsnamnet hämtas separat i stället för med properties(name).
  // Embedden är deklarerad för issues men inte nödvändigtvis för de andra
  // två, och en odeklarerad FK 400:ar hela queryn i stället för att bara
  // tappa ett fält.
  const propertyIds = [...new Set(rows.map((r) => r.property_id).filter(Boolean))] as string[];
  const properties = new Map<string, string>();
  if (propertyIds.length > 0) {
    const { data } = await supabase.from("properties").select("id, name").in("id", propertyIds);
    for (const p of (data ?? []) as Record<string, unknown>[]) {
      properties.set(String(p.id), String(p.name ?? ""));
    }
  }

  return rows.map((row) => ({
    kind,
    id: row.id,
    title: arendeTitle(kind, row),
    description: (kind === "inspection" ? row.notes : row.description) ?? null,
    lifecycle: arendeLifecycle(kind, row),
    created_at: row.created_at ?? null,
    trappa: row.trappa ?? null,
    property_id: row.property_id ?? null,
    property_name: row.property_id ? properties.get(String(row.property_id)) ?? null : null,
    apartment_label: row.apartment_id ? apartments.get(String(row.apartment_id)) ?? null : null,
    object_label: row.property_object_id ? objects.get(String(row.property_object_id)) ?? null : null,

    // Rådata för den härledda statusen. Klienten kör samma deriveXStatus som
    // resten av appen — badgen får aldrig räknas ut på två ställen med två
    // regler, då börjar portalen och portalen inne i appen säga emot varandra.
    status: row.status ?? null,
    arende_status: row.arende_status ?? null,

    // Felanmälan
    category: row.category ?? null,
    priority: row.priority ?? null,
    deadline: row.deadline ?? null,
    // Anmälarens kontaktuppgifter är hela poängen för den som ska åka dit och
    // ringa på. Det är också därför sidan kräver en kod och inte bara adressen.
    reporter_name: row.reporter_name ?? null,
    reporter_phone: row.reporter_phone ?? null,
    reporter_email: row.reporter_email ?? null,

    // Besiktning
    next_due_date: row.next_due_date ?? null,
    last_completed_date: row.last_completed_date ?? null,
    interval_months: row.interval_months ?? null,
    inspector: row.inspector ?? null,

    // Projekt
    start_date: row.start_date ?? null,
    end_date: row.end_date ?? null,
    budget: row.budget ?? null,

    can_open: arendeCanOpen(kind, row),
    can_close: arendeCanClose(kind, row),
  }));
}

// ---------------------------------------------------------------------------
// Livscykelskrivningen
// ---------------------------------------------------------------------------
/**
 * Skriver om ett ärendes status och lämnar exakt samma spår som
 * OppnaArendeButton/AvslutaArendeButton gör inne i portalen: en rad i
 * issue_status_history och en loggbokspost.
 *
 * Loggbokstexten är `"<titel> (<från> → <till>)"`. Det formatet är ett kontrakt
 * — `actionKindOf` i src/lib/logbook.ts läser ut målstatusen ur den avslutande
 * pilen för att skilja "öppnade" från "avslutade" i loggboksfiltret. Ändras
 * formatet degraderas filtret tyst.
 */
async function writeStatus(
  supabase: Db,
  session: Session,
  kind: ArendeKind,
  issue: Record<string, unknown>,
  nextStatus: string,
  lifecycleLabel: string,
): Promise<void> {
  // Felanmälan bär livscykeln i `status`, besiktning och projekt i
  // `arende_status`. Att skriva fel kolumn hade sett ut att fungera —
  // uppdateringen går igenom — men ärendet hade inte flyttat sig.
  const column = LIFECYCLE_COLUMN[kind];
  const currentStatus = (issue[column] as string | null) ?? null;

  // Villkorat på nuvarande status: två snabba tryck, eller en admin som avslutar
  // ärendet i samma sekund, ska inte kunna skriva över varandra. Träffar noll
  // rader om någon hann före, och då säger vi det i klartext i stället för att
  // rapportera en lyckad ändring som inte skedde — samma resonemang som
  // assertWritten() i OppnaArendeButton.
  let update = supabase
    .from(ARENDE_TABLE[kind])
    .update({ [column]: nextStatus })
    .eq("id", issue.id as string);
  if (currentStatus !== null) update = update.eq(column, currentStatus);
  const { data: written, error: updateError } = await update.select("id");
  if (updateError) throw updateError;
  if (!written || written.length === 0) {
    throw new Error("Ärendet hann ändras av någon annan. Ladda om sidan och försök igen.");
  }

  // Bäst-möjliga-fall härifrån och ner: statusändringen är gjord, och en
  // misslyckad historikrad får inte få anropet att se ut att ha misslyckats.
  // issue_status_history finns bara för felanmälan. Besiktning och projekt
  // har ingen motsvarande tabell — deras spår är loggboksposten nedan, precis
  // som när OppnaArendeButton skriver dem inne i appen.
  if (kind === "issue") {
  try {
    await supabase.from("issue_status_history").insert({
      issue_id: issue.id,
      old_status: currentStatus,
      new_status: nextStatus,
      // Har entreprenörens kontaktpost en kopplad inloggning skrivs den som
      // upphovsman, så loggboken kan säga vem. Saknas kopplingen blir det null
      // och loggboken visar "Okänd" — hellre det än fel namn.
      changed_by: session.profileId,
    });
  } catch (e) {
    console.error("entreprenor-portal: issue_status_history misslyckades", (e as Error)?.message);
  }
  }

  try {
    await supabase.from("logbook_entries").insert({
      property_id: issue.property_id ?? null,
      // Utan apartment_id landar posten med bara property_id, och lägenhetens
      // Tidslinje — som filtrerar på apartment_id — ser aldrig övergången.
      apartment_id: issue.apartment_id ?? null,
      property_object_id: issue.property_object_id ?? null,
      event_type: "arende_status_andring",
      // Formatet "<titel> (<från> → <till>)" är ett kontrakt — actionKindOf i
      // src/lib/logbook.ts läser målstatusen ur den avslutande pilen.
      content: `${arendeTitle(kind, issue)} (${currentStatus ?? "?"} → ${lifecycleLabel})`,
      entry_date: new Date().toISOString().slice(0, 10),
      created_by: session.profileId,
    });
  } catch (e) {
    console.error("entreprenor-portal: loggbokspost misslyckades", (e as Error)?.message);
  }
}

// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const serviceRoleKey =
      Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!serviceRoleKey) {
      return json({ error: "Serverkonfiguration saknas: SERVICE_ROLE_KEY är inte satt." }, 500);
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    // ======================= create_account ================================
    // Gröna knappen i tilldelningsmejlet, via bekräftelsesidan /skapa-konto.
    //
    // Ingen session krävs — beviset är den signerade token som mejlet bar med
    // sig. Adressen tas UR token, aldrig ur anropet: annars hade sidan kunnat
    // be om ett konto åt vilken adress som helst med en token som råkade vara
    // giltig för en annan.
    //
    // Själva inbjudan görs inte här utan av invite-user, anropad med
    // servicenyckeln. Den funktionen äger redan regeln för hur en entreprenörs
    // kontaktpost hittas, återaktiveras eller skapas (samma regel som
    // link_or_create_contact), och den regeln ska finnas på ett ställe.
    if (action === "create_account") {
      const email = await readAccountToken(body?.token, serviceRoleKey);
      if (!email) {
        return json(
          {
            error:
              "Länken är ogiltig eller har gått ut. Öppna det senaste ärendemejlet, eller logga in med kod på sidan Mina ärenden.",
          },
          400,
        );
      }

      // Redan konto: säg det rakt ut. Det är ingen läcka — den som håller en
      // giltig token har redan bevisat att adressen är deras.
      const { data: profileRows, error: profileError } = await supabase
        .from("profiles")
        .select("id, email");
      if (profileError) throw profileError;
      const already = ((profileRows ?? []) as Record<string, unknown>[]).some(
        (p) => normalizeEmail(p.email) === email,
      );
      if (already) {
        return json({ error: "Adressen har redan ett konto. Logga in i stället.", has_account: true }, 409);
      }

      // Bara en aktiv entreprenörskontakt får bli konto den här vägen. Utan
      // kontrollen hade en token från en sedan dess pensionerad kontakt kunnat
      // återuppliva en inloggning som medvetet tagits bort.
      const contacts = await contactsForEmail(supabase, email);
      if (contacts.length === 0) {
        return json(
          { error: "Adressen finns inte som aktiv entreprenör hos BAYT. Kontakta din förvaltare." },
          403,
        );
      }
      const fullName = String(contacts[0].full_name ?? contacts[0].company ?? "") || email;

      const inviteRes = await fetch(`${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1/invite-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
        },
        body: JSON.stringify({ email, role: "entreprenor", full_name: fullName }),
      });
      if (!inviteRes.ok) {
        const detail = await inviteRes.text().catch(() => "");
        console.error("entreprenor-portal: invite-user svarade", inviteRes.status, detail);
        return json({ error: "Kontot kunde inte skapas just nu. Försök igen om en stund." }, 502);
      }

      return json({ success: true, email }, 200);
    }

    // ======================= request_code ==================================
    if (action === "request_code") {
      const email = normalizeEmail(body?.email);
      if (!email || !email.includes("@")) return json({ error: "Ange en giltig e-postadress." }, 400);

      // try/catch, inte .catch(): supabase-js returnerar en thenable byggare, och
      // om den saknar .catch kastar själva anropet innan något körts. Städningen
      // är dessutom rent underhåll — den får aldrig stoppa en inloggning.
      try {
        await supabase.rpc("purge_entreprenor_auth");
      } catch {
        /* purge_entreprenor_auth saknas (SQL:en inte körd) eller misslyckades */
      }

      // Taket räknas på adressen, inte på om den finns i registret — annars hade
      // "för många försök" i sig avslöjat vilka adresser som är entreprenörer
      // hos BAYT.
      const hourAgo = new Date(Date.now() - 3600_000).toISOString();
      const { count } = await supabase
        .from("entreprenor_login_codes")
        .select("id", { count: "exact", head: true })
        .eq("email", email)
        .gte("created_at", hourAgo);
      if ((count ?? 0) >= CODE_MAX_PER_HOUR) {
        return json({ error: "För många kodförsök. Vänta en stund och försök igen." }, 429);
      }

      const contacts = await contactsForEmail(supabase, email);
      const contact = contacts[0] ?? null;
      const code = generateCode();

      // En ny kod dödar de gamla. Utan det hade fem obrukade koder gett
      // 5 × CODE_MAX_ATTEMPTS gissningar i stället för CODE_MAX_ATTEMPTS.
      await supabase
        .from("entreprenor_login_codes")
        .update({ consumed_at: new Date().toISOString() })
        .eq("email", email)
        .is("consumed_at", null);

      // Raden skrivs även när adressen inte tillhör någon entreprenör. Det är vad
      // som gör svaret nedan lika i båda fallen: samma arbete, samma text, ingen
      // ledtråd om vem som finns i registret.
      const { error: insertError } = await supabase.from("entreprenor_login_codes").insert({
        email,
        contact_id: contact ? contact.id : null,
        code_hash: await codeFingerprint(email, code),
        expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString(),
      });
      if (insertError) throw insertError;

      if (contact) {
        const name = String(contact.full_name ?? contact.company ?? "");
        try {
          await sendMail(
            email,
            `Din inloggningskod till BAYT: ${code}`,
            codeEmailText(code, name),
            codeEmailHtml(code, name),
          );
        } catch (mailError) {
          // Ett SMTP-fel är serverns problem, inte användarens, och måste synas —
          // annars sitter entreprenören och väntar på ett mejl som aldrig
          // skickades. Att felet bara kan uppstå för riktiga adresser är
          // avsiktligt; det är också bara då det finns något att rapportera.
          console.error("entreprenor-portal: kodmejl misslyckades", (mailError as Error)?.message);
          return json({ error: "Koden kunde inte skickas just nu. Försök igen om en stund." }, 502);
        }
      }

      // Samma svar oavsett om adressen fanns eller inte.
      return json({ success: true, expires_in_minutes: CODE_TTL_MINUTES }, 200);
    }

    // ======================= verify_code ===================================
    if (action === "verify_code") {
      const email = normalizeEmail(body?.email);
      const code = String(body?.code ?? "").replace(/\D/g, "");
      if (!email || code.length !== 6) {
        return json({ error: "Fyll i din e-post och den sexsiffriga koden." }, 400);
      }

      const { data: rows, error: codeError } = await supabase
        .from("entreprenor_login_codes")
        .select("id, code_hash, expires_at, attempts")
        .eq("email", email)
        .is("consumed_at", null)
        .order("created_at", { ascending: false })
        .limit(1);
      if (codeError) throw codeError;

      const row = (rows ?? [])[0];
      const expired = row ? new Date(String(row.expires_at)).getTime() < Date.now() : true;
      // Ett och samma svar för "ingen kod begärd", "utgången" och "fel kod": tre
      // olika texter hade gjort funktionen till ett orakel över vilka adresser
      // som just nu har en kod på väg.
      const generic = { error: "Koden stämmer inte eller har gått ut. Begär en ny." };

      if (!row || expired) return json(generic, 401);

      if (Number(row.attempts ?? 0) >= CODE_MAX_ATTEMPTS) {
        await supabase
          .from("entreprenor_login_codes")
          .update({ consumed_at: new Date().toISOString() })
          .eq("id", row.id as string);
        return json({ error: "För många felaktiga försök. Begär en ny kod." }, 429);
      }

      if (String(row.code_hash) !== (await codeFingerprint(email, code))) {
        await supabase
          .from("entreprenor_login_codes")
          .update({ attempts: Number(row.attempts ?? 0) + 1 })
          .eq("id", row.id as string);
        return json(generic, 401);
      }

      const contacts = await contactsForEmail(supabase, email);
      if (contacts.length === 0) return json(generic, 401);

      await supabase
        .from("entreprenor_login_codes")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", row.id as string);

      const token = generateToken();
      const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000).toISOString();
      const { error: sessionError } = await supabase.from("entreprenor_sessions").insert({
        email,
        token_hash: await sha256hex(token),
        expires_at: expiresAt,
      });
      if (sessionError) throw sessionError;

      return json(
        {
          success: true,
          token,
          expires_at: expiresAt,
          name:
            (contacts[0].full_name as string | null) ?? (contacts[0].company as string | null) ?? null,
        },
        200,
      );
    }

    // ======================= logout ========================================
    // Före sessionsuppslaget: att logga ut ska fungera även med ett token som
    // redan gått ut, annars ligger raden kvar tills städningen tar den.
    if (action === "logout") {
      await supabase
        .from("entreprenor_sessions")
        .delete()
        .eq("token_hash", await sha256hex(String(body?.token ?? "")));
      return json({ success: true }, 200);
    }

    // ===== Allt nedanför kräver en giltig session ===========================
    const session = await resolveSession(supabase, body?.token);
    if (!session) {
      // 401 är signalen klienten glömmer sitt token på och visar
      // inloggningsformuläret igen.
      return json({ error: "Din inloggning har gått ut. Logga in igen." }, 401);
    }

    // ======================= list ==========================================
    if (action === "list") {
      // select("*") för alla tre: kolumnuppsättningen skiljer mellan
      // tabellerna och flera kolumner kommer från handkörda migrationer
      // (inspections.trappa, inspections.deadline). Att namna dem explicit
      // 400:ar hela queryn om en enda saknas.
      const kinds: ArendeKind[] = ["issue", "inspection", "project"];
      const perKind = await Promise.all(
        kinds.map(async (k) => {
          const { data, error } = await supabase
            .from(ARENDE_TABLE[k])
            .select("*")
            .in("assigned_contact_id", session.contactIds)
            .order("created_at", { ascending: false });
          if (error) throw error;
          return decorateArenden(supabase, k, (data ?? []) as Record<string, unknown>[]);
        }),
      );

      // En lista, nyast först, oavsett typ. Att dela upp den i tre sektioner
      // hade tvingat entreprenören att leta på tre ställen efter dagens jobb —
      // typen syns på varje rad i stället.
      const arenden = perKind.flat().sort((a, b) => {
        const at = a.created_at ? String(a.created_at) : "";
        const bt = b.created_at ? String(b.created_at) : "";
        return bt.localeCompare(at);
      });

      return json(
        {
          success: true,
          name: session.displayName,
          email: session.email,
          arenden,
          // Kvar för en klient som ännu inte deployats om: den läser `issues`
          // och ska då fortsätta se precis det den alltid sett.
          issues: arenden.filter((a) => a.kind === "issue"),
        },
        200,
      );
    }

    // ======================= open / close ==================================
    if (action === "open" || action === "close") {
      // issue_id är den gamla formen och betyder felanmälan.
      const kind: ArendeKind = body?.issue_id ? "issue" : (body?.kind as ArendeKind);
      const arendeId = String(body?.issue_id ?? body?.id ?? "");
      if (!arendeId) return json({ error: "id krävs." }, 400);
      if (!ARENDE_TABLE[kind]) return json({ error: `Okänd ärendetyp: ${String(body?.kind)}` }, 400);

      const { data: issue, error: issueError } = await supabase
        .from(ARENDE_TABLE[kind])
        .select("*")
        .eq("id", arendeId)
        .maybeSingle();
      if (issueError) throw issueError;
      if (!issue) return json({ error: ARENDE_NOT_FOUND[kind] }, 404);

      // Kärnkontrollen: sessionen ger ingen rätt till ett ärende som inte är
      // tilldelat den. Utan den här raden vore ett giltigt token en nyckel till
      // hela beståndets ärenden, eftersom service role går förbi all RLS.
      if (!session.contactIds.includes(String(issue.assigned_contact_id ?? ""))) {
        return json({ error: "Ärendet är inte tilldelat dig." }, 403);
      }

      const row = issue as Record<string, unknown>;
      if (action === "open") {
        if (!arendeCanOpen(kind, row)) return json({ error: "Ärendet går inte att öppna." }, 409);
        await writeStatus(supabase, session, kind, row, OPEN_VALUE[kind], "oppet");
        return json({ success: true, status: OPEN_VALUE[kind], lifecycle: "oppet" }, 200);
      }

      if (!arendeCanClose(kind, row)) return json({ error: "Ärendet går inte att avsluta." }, 409);
      await writeStatus(supabase, session, kind, row, CLOSE_VALUE[kind], "avslutat");
      return json({ success: true, status: CLOSE_VALUE[kind], lifecycle: "avslutat" }, 200);
    }

    return json({ error: `Okänd action: ${action}` }, 400);
  } catch (error) {
    const err = error as { message?: string; code?: string } | null;
    console.error("entreprenor-portal failed:", JSON.stringify({ message: err?.message, code: err?.code }));
    return json({ error: err?.message ?? "Okänt fel" }, 400);
  }
});
