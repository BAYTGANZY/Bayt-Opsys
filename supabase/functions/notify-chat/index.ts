// notify-chat — mejlar mottagarna när någon skrivit i chatten (admin, styrelse och entreprenör).
//
// Anropas från webben av avsändaren direkt efter att meddelandet sparats. Funktionen tar bara
// meddelandets id: avsändare, samtal och mottagare läses ur databasen, aldrig ur anropet, och
// anroparen måste vara meddelandets avsändare — annars vore den en öppen mailrelä.
// Mejlet går bara till en mottagare som inte redan har ett oläst meddelande i samtalet,
// så en lång tråd ger ett mejl och inte ett per rad.

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
};

function mailText(m: Mail): string {
  const lines = [m.intro, ""];
  for (const [l, v] of m.rows ?? []) lines.push(`${l}: ${v}`);
  if (m.note?.text) lines.push("", `${m.note.label}:`, m.note.text);
  if (m.cta) lines.push("", `${m.cta.label}: ${m.cta.url}`);
  if (m.outro) lines.push("", m.outro);
  lines.push("", "BAYT — fastighetssamordning");
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
  const outro = m.outro ? `<p style="margin:18px 0 0;color:#6B7280;font-size:13.5px;line-height:1.55">${esc(m.outro)}</p>` : "";
  return `<!doctype html><html><body style="margin:0;background:#F4F6F3;font-family:Inter,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#0D2B1E;color:#fff;font-size:20px;font-weight:700;letter-spacing:.12em;padding:16px 20px;border-radius:12px 12px 0 0">BAYT</div>
<div style="background:#fff;padding:22px 20px;border-radius:0 0 12px 12px;border:1px solid #E5E7EB;border-top:none">
<p style="margin:0 0 14px;color:#0D2B1E;font-size:15px;line-height:1.55">${esc(m.intro)}</p>
<table style="border-collapse:collapse">${rows}</table>${note}${cta}${outro}
</div></div></body></html>`;
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
          from: fromAddr,
          to: m.to,
          subject: encodeMailSubject(m.subject),
          content: mailText(m),
          html: mailHtml(m),
          headers: { "Message-ID": `<${crypto.randomUUID()}@bayt.se>` },
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

const clean = (v: unknown, max = 200) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!serviceRoleKey) return json({ error: "Serverkonfiguration saknas: SERVICE_ROLE_KEY är inte satt." }, 500);
    const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const who = token ? await db.auth.getUser(token) : null;
    const callerId = who?.data?.user?.id;
    if (!callerId) return json({ error: "Inte inloggad." }, 401);

    const body = await req.json().catch(() => null);
    const messageId = String(body?.message_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(messageId)) return json({ error: "Ogiltigt meddelande." }, 400);

    const m = await db.from("chat_messages").select("id, conversation_id, sender_id, body, attachment_url, created_at").eq("id", messageId).maybeSingle();
    const msg = m.data as { id: string; conversation_id: string; sender_id: string; body: string | null; attachment_url: string | null; created_at: string } | null;
    if (!msg) return json({ error: "Meddelandet hittades inte." }, 404);
    if (msg.sender_id !== callerId) return json({ error: "Bara avsändaren kan skicka avisering." }, 403);

    const sender = await db.from("profiles").select("full_name").eq("id", callerId).maybeSingle();
    const senderName = clean((sender.data as { full_name?: string } | null)?.full_name, 80) || "Någon";

    const parts = await db.from("chat_participants").select("profile_id, last_read_at").eq("conversation_id", msg.conversation_id).neq("profile_id", callerId);
    const others = (parts.data ?? []) as Array<{ profile_id: string; last_read_at: string | null }>;
    if (others.length === 0) return json({ success: true, sent: 0 }, 200);

    const profs = await db.from("profiles").select("id, email, role").in("id", others.map((o) => o.profile_id));
    const emailOf = new Map(
      ((profs.data ?? []) as Array<{ id: string; email: string | null; role: string | null }>)
        .filter((p) => p.email && ["admin", "medarbetare", "styrelse", "entreprenor"].includes(String(p.role)))
        .map((p) => [p.id, String(p.email).trim()]),
    );

    const preview = clean(msg.body, 240) || (msg.attachment_url ? "(bifogad bild)" : "");
    const mails: Mail[] = [];
    for (const o of others) {
      const to = emailOf.get(o.profile_id);
      if (!to) continue;
      // Hade mottagaren redan något oläst från andra i samtalet har hen redan fått ett mejl för det.
      let unread = db.from("chat_messages").select("id", { count: "exact", head: true }).eq("conversation_id", msg.conversation_id).neq("sender_id", o.profile_id);
      if (o.last_read_at) unread = unread.gt("created_at", o.last_read_at);
      const c = await unread;
      if (!c.error && (c.count ?? 0) > 1) continue;
      mails.push({
        to,
        subject: `Nytt meddelande i BAYT från ${senderName}`,
        intro: `${senderName} har skrivit till dig i chatten.`,
        note: preview ? { label: "Meddelande", text: preview } : null,
        cta: { label: "Öppna chatten", url: `${APP_URL}/chatt` },
        outro: "Du får bara ett mejl tills du har läst det du fått.",
      });
    }
    const results = mails.length ? await sendMails(mails) : [];
    return json({ success: true, sent: results.filter(Boolean).length, failed: results.filter((r) => !r).length }, 200);
  } catch (e) {
    console.error(`notify-chat: ${e instanceof Error ? e.message : e}`);
    return json({ error: "Aviseringen kunde inte skickas." }, 500);
  }
});
