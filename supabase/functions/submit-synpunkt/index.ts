// submit-synpunkt — publik insamling av synpunkter, frågor och klagomål från medlemmar (allt boende vill kommentera: synpunkter, idéer, frågor, klagomål)
//
// Se CLAUDE.md, avsnittet "Synpunkter från medlemmar".

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


const APP_URL = "https://app.bayt.se";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

// All fritext (namn, skäl, anteckningar) kommer från en person — ett "<" skulle
// annars äta upp resten av mejlet.
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(value: unknown): string {
  if (!value) return "—";
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" });
}

type Row = [label: string, value: string];
type Mail = {
  to: string | string[];
  subject: string;
  intro: string;
  rows?: Row[];
  note?: { label: string; text: string } | null;
  cta?: { label: string; url: string } | null;
  outro?: string;
  /** Avsändarnamn i mejlhuvudet. Standard "BAYT"; boendemejlet bär föreningens namn i stället. */
  brand?: string;
  /** Hälsningsrad längst ned. Standard "BAYT — fastighetssamordning". */
  signoff?: string;
  /** Stor, markerad kod (pinkoden) under introt. */
  code?: string;
  /** Avsändarnamn i From-raden (bara ren ASCII används). */
  fromName?: string;
  /** Svara-adress. Bara en validerad e-postadress får hamna här (ingen CR/LF). */
  replyTo?: string;
  /** Dold kopia. Redan validerade adresser (ingen CR/LF). Syns inte för mottagaren. */
  bcc?: string[];
};

function mailText(m: Mail): string {
  const lines = [m.intro, ""];
  if (m.code) lines.push(`Kod: ${m.code}`, "");
  for (const [l, v] of m.rows ?? []) lines.push(`${l}: ${v}`);
  if (m.note?.text) lines.push("", `${m.note.label}:`, m.note.text);
  if (m.cta) lines.push("", `${m.cta.label}: ${m.cta.url}`);
  if (m.outro) lines.push("", m.outro);
  lines.push("", m.signoff ?? "BAYT — fastighetssamordning");
  return lines.join("\n");
}

function mailHtml(m: Mail): string {
  const rows = (m.rows ?? [])
    .map(
      ([l, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#6B7280;font-size:14px;vertical-align:top;white-space:nowrap">${esc(l)}</td>` +
        `<td style="padding:6px 0;color:#0D2B1E;font-size:14px;font-weight:600">${esc(v)}</td></tr>`,
    )
    .join("");
  const note = m.note?.text
    ? `<div style="margin:16px 0 0;padding:12px 14px;background:#F3F9F1;border:1px solid #CFE7C6;border-radius:8px;color:#0D2B1E;font-size:14px;line-height:1.55">` +
      `<div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6B7280;margin-bottom:4px">${esc(m.note.label)}</div>${esc(m.note.text).replace(/\n/g, "<br>")}</div>`
    : "";
  const cta = m.cta
    ? `<p style="margin:22px 0 0"><a href="${esc(m.cta.url)}" style="display:inline-block;background:#3D8A30;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px">${esc(m.cta.label)}</a></p>`
    : "";
  const code = m.code
    ? `<div style="margin:16px 0;padding:14px;text-align:center;background:#F3F9F1;border:1px solid #CFE7C6;border-radius:10px;color:#0D2B1E;font-size:34px;font-weight:700;letter-spacing:.14em">${esc(m.code)}</div>`
    : "";
  const outro = m.outro ? `<p style="margin:18px 0 0;color:#6B7280;font-size:13.5px;line-height:1.55">${esc(m.outro)}</p>` : "";
  return `<!doctype html><html><body style="margin:0;background:#F4F6F3;font-family:Inter,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#0D2B1E;color:#fff;font-size:20px;font-weight:700;letter-spacing:.12em;padding:16px 20px;border-radius:12px 12px 0 0">${esc(m.brand ?? "BAYT")}</div>
<div style="background:#fff;padding:22px 20px;border-radius:0 0 12px 12px;border:1px solid #E5E7EB;border-top:none">
<p style="margin:0 0 14px;color:#0D2B1E;font-size:15px;line-height:1.55">${esc(m.intro)}</p>
${code}<table style="border-collapse:collapse">${rows}</table>${note}${cta}${outro}${m.signoff ? `<p style="margin:18px 0 0;color:#0D2B1E;font-size:14px">${esc(m.signoff)}</p>` : ""}
</div></div></body></html>`;
}

/** "Brf RTB <info@bayt.se>" när namnet är ren ASCII, annars bara adressen. Ingen CR/LF/citationstecken släpps igenom. */
function fromHeader(fromAddr: string, name?: string): string {
  const addr = (fromAddr.match(/<([^>]+)>/)?.[1] ?? fromAddr).trim();
  const n = String(name ?? "").replace(/\s+/g, " ").trim();
  // deno-lint-ignore no-control-regex
  if (!n || !/^[\x20-\x7e]+$/.test(n) || /["<>\\]/.test(n)) return fromAddr;
  return `"${n}" <${addr}>`;
}

async function sendMails(mails: Mail[]): Promise<boolean[]> {
  const smtpHost = Deno.env.get("SMTP_HOST");
  const smtpUser = Deno.env.get("SMTP_USER");
  const smtpPass = Deno.env.get("SMTP_PASS");
  if (!smtpHost || !smtpUser || !smtpPass) {
    console.error("SMTP_HOST/SMTP_USER/SMTP_PASS not fully set — email not sent.");
    return mails.map(() => false);
  }
  const smtpPort = Number(Deno.env.get("SMTP_PORT") ?? "465");
  const fromAddr = Deno.env.get("SMTP_FROM") || smtpUser;
  const client = new SMTPClient({
    connection: {
      hostname: smtpHost,
      port: smtpPort,
      tls: smtpPort === 465,
      auth: { username: smtpUser, password: smtpPass },
    },
  });
  const out: boolean[] = [];
  try {
    for (const m of mails) {
      try {
        await client.send({
          from: fromHeader(fromAddr, m.fromName),
          to: m.to,
          ...(m.bcc && m.bcc.length ? { bcc: m.bcc } : {}),
          subject: encodeMailSubject(m.subject),
          content: mailText(m),
          html: mailHtml(m),
          headers: { "Message-ID": `<${crypto.randomUUID()}@bayt.se>`, ...(m.replyTo ? { "Reply-To": m.replyTo } : {}) },
        });
        out.push(true);
      } catch (e) {
        console.error("SMTP send failed:", (e as Error)?.message ?? e);
        out.push(false);
      }
    }
  } finally {
    await client.close();
  }
  return out;
}


type Db = ReturnType<typeof createClient>;

const digitsOnly = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const clean = (v: unknown, max = 500) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Mottagare hos styrelsen. Finns ingen styrelseinloggning kopplad till föreningen går mejlet till admin. */
async function staffRecipients(db: Db, propertyId: string): Promise<string[]> {
  const links = await db.from("styrelse_properties").select("profile_id").eq("property_id", propertyId);
  const ids = (links.data ?? []).map((r: { profile_id: string }) => r.profile_id);
  let emails: string[] = [];
  if (ids.length > 0) {
    const p = await db.from("profiles").select("email").in("id", ids).eq("role", "styrelse");
    emails = (p.data ?? []).map((r: { email: string | null }) => String(r.email ?? "").trim()).filter(Boolean);
  }
  if (emails.length === 0) {
    const a = await db.from("profiles").select("email").eq("role", "admin");
    emails = (a.data ?? []).map((r: { email: string | null }) => String(r.email ?? "").trim()).filter(Boolean);
  }
  return [...new Set(emails.map((e) => e.toLowerCase()))];
}



// Ämnet för det här formuläret. Byt här (och i src/routes/lamna-synpunkt.tsx) när det gäller något annat.
const TOPIC = "allmant";

const CATEGORY_LABEL: Record<string, string> = { synpunkt: "Synpunkt", fraga: "Fråga", ide: "Idé", klagomal: "Klagomål" };

const MAX_MESSAGE = 5000;
// Styrelsens svar får vara längre än medlemmens meddelande.
const MAX_REPLY = 20000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!serviceRoleKey) return json({ error: "Serverkonfiguration saknas: SERVICE_ROLE_KEY är inte satt." }, 500);
    const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Ogiltig förfrågan." }, 400);

    // ---- Styrelsen svarar medlemmen: plattformen skickar mejlet (kräver inloggad personal/styrelse i föreningen) ----
    // Svaret går från plattformens brevlåda med föreningens namn som avsändare, och föreningens egen adress
    // (property_letterhead.email) som Reply-To, så att medlemmens svar landar i föreningens brevlåda.
    if (body.action === "reply") {
      const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: userData } = await db.auth.getUser(jwt);
      const userId = userData?.user?.id;
      if (!userId) return json({ error: "Du måste vara inloggad." }, 401);
      const me = await db.from("profiles").select("role, full_name").eq("id", userId).maybeSingle();
      const meRow = me.data as { role?: string; full_name?: string | null } | null;
      const role = meRow?.role;
      if (role !== "admin" && role !== "medarbetare" && role !== "styrelse") return json({ error: "Du har inte behörighet." }, 403);
      const found = await db.from("member_feedback").select("*").eq("id", String(body.id ?? "")).maybeSingle();
      const fb = found.data as Record<string, unknown> | null;
      if (!fb) return json({ error: "Meddelandet hittades inte." }, 404);
      if (role === "styrelse") {
        const link = await db.from("styrelse_properties").select("property_id").eq("profile_id", userId).eq("property_id", fb.property_id as string);
        if (!link.data || link.data.length === 0) return json({ error: "Du har inte behörighet för den här föreningen." }, 403);
      }
      // deno-lint-ignore no-control-regex
      const text = String(body.message ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/\r\n/g, "\n").trim();
      if (text.length < 2) return json({ error: "Skriv ditt svar." }, 400);
      if (text.length > MAX_REPLY) return json({ error: `Svaret är för långt (högst ${MAX_REPLY} tecken).` }, 400);
      const prop = await db.from("properties").select("name").eq("id", fb.property_id as string).maybeSingle();
      const propertyName = String((prop.data as { name?: string } | null)?.name ?? "");
      // Läsfelet sväljs (tabellen kommer från en handkörd migration): saknas adressen får personalen ett tydligt besked.
      const lh = await db.from("property_letterhead").select("*").eq("property_id", fb.property_id as string).maybeSingle();
      // Dold kopia: högst fem giltiga adresser, utan dubbletter och utan mottagaren själv.
      const bccRaw: unknown[] = Array.isArray(body.bcc) ? body.bcc : String(body.bcc ?? "").split(/[,;\s]+/);
      const bcc: string[] = [];
      for (const v of bccRaw) {
        const a = String(v ?? "").trim().toLowerCase();
        if (!a) continue;
        if (!/^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/.test(a) || a.length > 200) return json({ error: `Adressen "${a.slice(0, 60)}" ser inte ut som en e-postadress.` }, 400);
        if (a !== String(fb.email).toLowerCase() && !bcc.includes(a)) bcc.push(a);
      }
      // Föreningens standardadress för dold kopia (kolumnen kommer från en handkörd migration — saknas den hoppas den över).
      const defBcc = String((lh.data as { reply_bcc?: string | null } | null)?.reply_bcc ?? "").trim().toLowerCase();
      if (/^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/.test(defBcc) && defBcc !== String(fb.email).toLowerCase() && !bcc.includes(defBcc)) bcc.unshift(defBcc);
      if (bcc.length > 5) return json({ error: "Du kan ange högst fem adresser i dold kopia." }, 400);
      const replyTo = String((lh.data as { email?: string | null } | null)?.email ?? "").trim().toLowerCase();
      if (!/^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/.test(replyTo)) {
        return json({ error: "Föreningens svarsadress är inte inlagd. Lägg in den högst upp på sidan Synpunkter och försök igen.", code: "no_reply_address" }, 400);
      }
      const ok = await sendMails([{
        to: String(fb.email),
        subject: `Svar på ditt meddelande (${fb.reference})`,
        intro: `Hej ${fb.name}! Här är svaret från styrelsen i ${propertyName} på ditt meddelande.`,
        rows: [["Referens", String(fb.reference)]],
        note: { label: "Svar från styrelsen", text },
        outro: `Du kan svara direkt på det här mejlet, så når svaret ${propertyName}.`,
        brand: propertyName,
        signoff: `Vänliga hälsningar, styrelsen i ${propertyName}`,
        fromName: propertyName,
        replyTo,
        bcc,
      }]);
      if (!ok[0]) return json({ error: "Mejlet kunde inte skickas just nu. Försök igen om en stund." }, 502);
      const handler = meRow?.full_name ?? null;
      const base = { status: "besvarad", handled_at: new Date().toISOString(), handled_by_name: handler };
      // reply_text kommer från en handkörd migration — saknas kolumnen markeras ärendet ändå.
      let upd = await db.from("member_feedback").update({ ...base, reply_text: text }).eq("id", fb.id as string).select("id");
      if (upd.error) upd = await db.from("member_feedback").update(base).eq("id", fb.id as string).select("id");
      // Svarshistorik: varje skickat svar sparas som en egen rad. Saknas tabellen (handkörd migration) hoppas det över.
      const logged = await db.from("member_feedback_replies").insert({
        feedback_id: fb.id,
        property_id: fb.property_id,
        body: text,
        sent_to: String(fb.email),
        copied_to: bcc.length ? bcc.join(", ") : null,
        sent_by_name: handler,
      }).select("id");
      if (logged.error) console.error("reply log failed:", logged.error.message);
      return json({ success: true, marked: !upd.error && (upd.data?.length ?? 0) > 0, reply_to: replyTo }, 200);
    }

    if (clean(body.website)) return json({ success: true }, 200); // honeypot

    const propertyId = String(body.property_id ?? "");
    const apartmentNumber = digitsOnly(body.apartment_number);
    const trappa = digitsOnly(body.trappa);
    const name = clean(body.name, 200);
    const email = clean(body.email, 200).toLowerCase();
    const category = String(body.category ?? "synpunkt");
    // Meddelandet behåller radbrytningar; bara kontrolltecken och överlånga texter rensas.
    // deno-lint-ignore no-control-regex
    const message = String(body.message ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/\r\n/g, "\n").trim();

    if (!propertyId) return json({ error: "Välj förening." }, 400);
    if (!apartmentNumber) return json({ error: "Ange lägenhetsnummer (siffror)." }, 400);
    if (!trappa) return json({ error: "Ange trappa (siffror)." }, 400);
    if (!name) return json({ error: "Ange ditt namn." }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Ange en giltig e-postadress." }, 400);
    if (!CATEGORY_LABEL[category]) return json({ error: "Välj vad ditt meddelande gäller." }, 400);
    if (message.length < 5) return json({ error: "Skriv ditt meddelande." }, 400);
    if (message.length > MAX_MESSAGE) return json({ error: `Meddelandet är för långt (högst ${MAX_MESSAGE} tecken).` }, 400);

    const prop = await db.from("properties").select("id, name").eq("id", propertyId).maybeSingle();
    const property = prop.data as { id: string; name: string } | null;
    if (!property) return json({ error: "Föreningen hittades inte." }, 404);

    // Enkel broms mot spam: högst fem meddelanden per adress och dygn.
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const recent = await db.from("member_feedback").select("id", { count: "exact", head: true }).ilike("email", email.replace(/[\\%_]/g, "\\$&")).gte("created_at", since);
    if ((recent.count ?? 0) >= 5) return json({ error: "Du har skickat flera meddelanden det senaste dygnet. Försök igen i morgon." }, 429);

    const ins = await db
      .from("member_feedback")
      .insert({ property_id: propertyId, topic: TOPIC, category, apartment_number: apartmentNumber, trappa, name, email, message })
      .select("*")
      .single();
    if (ins.error || !ins.data) throw new Error(ins.error?.message ?? "Meddelandet kunde inte sparas.");
    const row = ins.data as Record<string, unknown>;

    const staff = await staffRecipients(db, propertyId);
    const mails: Mail[] = [
      {
        to: email,
        subject: `Vi har tagit emot ditt meddelande (${row.reference})`,
        intro: `Hej ${name}! Tack för att du hör av dig. Styrelsen i ${property.name} har tagit emot ditt meddelande och läser alla meddelanden. Du behöver inte göra något mer, och du behöver inte ringa.`,
        rows: [["Lägenhet", `${apartmentNumber}, trappa ${trappa}`], ["Gäller", CATEGORY_LABEL[category]], ["Referens", String(row.reference)]],
        note: { label: "Ditt meddelande", text: message },
        outro: "Om styrelsen behöver fråga något mer hör de av sig till den här e-postadressen. Det här är ett automatiskt bekräftelsemejl.",
        brand: property.name,
        signoff: `Vänliga hälsningar, styrelsen i ${property.name}`,
        fromName: property.name,
      },
    ];
    if (staff.length > 0) {
      mails.push({
        to: staff,
        subject: `Nytt meddelande (${CATEGORY_LABEL[category].toLowerCase()}): lgh ${apartmentNumber} — ${property.name}`,
        intro: `${name} har lämnat ${CATEGORY_LABEL[category] === "Fråga" ? "en fråga" : CATEGORY_LABEL[category] === "Klagomål" ? "ett klagomål" : CATEGORY_LABEL[category] === "Idé" ? "en idé" : "en synpunkt"}. Tryck Svara i det här mejlet för att svara direkt till medlemmen.`,
        rows: [
          ["Namn", name], ["E-post", email], ["Lägenhet", `${apartmentNumber}, trappa ${trappa}`],
          ["Gäller", CATEGORY_LABEL[category]], ["Referens", String(row.reference)],
        ],
        note: { label: "Meddelande", text: message },
        cta: { label: "Öppna synpunkterna", url: `${APP_URL}/synpunkter` },
        replyTo: email,
      });
    }
    const sent = await sendMails(mails);

    return json({ success: true, reference: row.reference, confirmation_sent: sent[0] === true, staff_notified: staff.length > 0 && sent[1] === true }, 200);
  } catch (error) {
    const err = error as { message?: string } | null;
    console.error("submit-synpunkt failed:", err?.message);
    return json({ error: "Något gick fel. Försök igen om en stund." }, 500);
  }
});
