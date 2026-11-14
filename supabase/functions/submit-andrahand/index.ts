// submit-andrahand — publik ansökan om andrahandsuthyrning (och komplettering av en ansökan)
//
// Se CLAUDE.md, avsnittet "Andrahandsuthyrning — ansökan och beslut".

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

const REASON_LABEL = (reason: string, text?: string | null) => (text ? `${reason} — ${text}` : reason);

type Db = ReturnType<typeof createClient>;

const MAX_FILES = 8;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXT = ["pdf", "jpg", "jpeg", "png", "heic", "doc", "docx"];
const BUCKET = "sublet-applications";

function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Samma regel som normalizeApartmentNumber / normalizeTrappa i src/lib/apartment-tokens.ts.
const digitsOnly = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const clean = (v: unknown, max = 500) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const isIsoDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00`).getTime());

type FileIn = { name?: string; type?: string; base64?: string };

async function saveFiles(db: Db, applicationId: string, files: unknown, addedBy: string): Promise<{ saved: number; skipped: number }> {
  let saved = 0;
  let skipped = 0;
  if (!Array.isArray(files)) return { saved, skipped };
  let total = 0;
  for (const f of (files as FileIn[]).slice(0, MAX_FILES)) {
    if (!f?.base64 || !f?.name) continue;
    const ext = String(f.name).split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXT.includes(ext)) { skipped++; continue; }
    const bytes = base64ToBytes(f.base64);
    total += bytes.length;
    if (total > MAX_TOTAL_BYTES) { skipped++; continue; }
    // Storage avvisar nycklar med icke-ASCII — se submit-felanmalan.
    const safeName = String(f.name).normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_");
    const path = `${applicationId}/${crypto.randomUUID()}-${safeName}`;
    const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: f.type || "application/octet-stream" });
    if (up.error) { console.error(`Bilaga "${f.name}" kunde inte laddas upp: ${up.error.message}`); skipped++; continue; }
    const ins = await db.from("sublet_application_files").insert({
      application_id: applicationId, file_path: path, file_name: String(f.name).slice(0, 200), file_size: bytes.length, added_by: addedBy,
    });
    if (ins.error) { console.error(`Bilagans rad kunde inte sparas: ${ins.error.message}`); await db.storage.from(BUCKET).remove([path]); skipped++; continue; }
    saved++;
  }
  return { saved, skipped };
}

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!serviceRoleKey) return json({ error: "Serverkonfiguration saknas: SERVICE_ROLE_KEY är inte satt." }, 500);
    const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Ogiltig förfrågan." }, 400);
    const action = String(body.action ?? "submit");

    // ---- Hämta en ansökan via sin länk (komplettera-sidan) ------------------
    if (action === "lookup" || action === "supplement") {
      const token = String(body.token ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(token)) return json({ error: "Länken är ogiltig." }, 404);
      const found = await db
        .from("sublet_applications")
        .select("id, reference, status, decision_note, apartment_number, trappa, applicant_name, applicant_email, tenant_name, start_date, end_date, property_id, created_at, decided_at")
        .eq("token", token)
        .maybeSingle();
      const app = found.data as Record<string, unknown> | null;
      if (!app) return json({ error: "Länken är ogiltig." }, 404);
      const prop = await db.from("properties").select("name").eq("id", app.property_id as string).maybeSingle();
      const propertyName = String((prop.data as { name?: string } | null)?.name ?? "");

      if (action === "lookup") {
        return json({
          success: true,
          reference: app.reference, status: app.status, note: app.decision_note ?? null,
          created_at: app.created_at, decided_at: app.decided_at ?? null,
          property_name: propertyName, apartment_number: app.apartment_number, trappa: app.trappa,
          applicant_name: app.applicant_name, start_date: app.start_date, end_date: app.end_date,
        }, 200);
      }

      if (app.status !== "komplettering") return json({ error: "Den här ansökan väntar inte på komplettering." }, 409);
      const message = clean(body.message, 2000);
      const { saved, skipped } = await saveFiles(db, app.id as string, body.files, "sokande");
      if (saved === 0 && !message) return json({ error: "Skriv en kommentar eller bifoga minst en fil." }, 400);
      const upd = await db
        .from("sublet_applications")
        .update({ status: "ny", supplement_note: message || null, updated_at: new Date().toISOString() })
        .eq("id", app.id as string)
        .select("id");
      if (upd.error || !upd.data || upd.data.length === 0) throw new Error(upd.error?.message ?? "Kunde inte spara komplettering.");

      const staff = await staffRecipients(db, app.property_id as string);
      const sent = staff.length
        ? await sendMails([{
            to: staff,
            subject: `Komplettering inkommen: ${app.reference} — ${propertyName}`,
            intro: `${app.applicant_name} har kompletterat sin ansökan om andrahandsuthyrning. Den ligger nu under "Ny" i ansökningslistan och väntar på beslut.`,
            rows: [["Ärendenummer", String(app.reference)], ["Förening", propertyName], ["Lägenhet", `${app.apartment_number}${app.trappa ? `, trappa ${app.trappa}` : ""}`], ["Nya bilagor", String(saved)]],
            note: message ? { label: "Kommentar från sökande", text: message } : null,
            cta: { label: "Öppna ansökan", url: `${APP_URL}/andrahand` },
          }])
        : [false];
      return json({ success: true, files_saved: saved, files_skipped: skipped, mail_sent: sent[0] === true }, 200);
    }

    // ---- Ny ansökan ----------------------------------------------------------
    if (clean(body.website)) return json({ success: true }, 200); // honeypot: botar fyller i dolda fält

    const propertyId = String(body.property_id ?? "");
    const apartmentNumber = digitsOnly(body.apartment_number);
    const trappa = digitsOnly(body.trappa);
    const applicantName = clean(body.applicant_name, 200);
    const applicantEmail = clean(body.applicant_email, 200).toLowerCase();
    const applicantPhone = clean(body.applicant_phone, 50);
    const tenantName = clean(body.tenant_name, 200);
    const tenantContact = clean(body.tenant_contact, 200);
    const reason = clean(body.reason, 200);
    const reasonText = clean(body.reason_text, 2000);
    const startDate = body.start_date;
    const endDate = body.end_date;

    if (!propertyId) return json({ error: "Välj förening." }, 400);
    if (!apartmentNumber) return json({ error: "Ange lägenhetsnummer (siffror)." }, 400);
    if (!trappa) return json({ error: "Ange trappa (siffror)." }, 400);
    if (!applicantName) return json({ error: "Ange ditt namn." }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(applicantEmail)) return json({ error: "Ange en giltig e-postadress." }, 400);
    if (!tenantName) return json({ error: "Ange vem som ska hyra lägenheten." }, 400);
    if (!reason) return json({ error: "Ange skäl till uthyrningen." }, 400);
    if (!isIsoDate(startDate) || !isIsoDate(endDate)) return json({ error: "Ange start- och slutdatum." }, 400);
    if (String(endDate) < String(startDate)) return json({ error: "Slutdatum kan inte ligga före startdatum." }, 400);

    const prop = await db.from("properties").select("id, name").eq("id", propertyId).maybeSingle();
    const property = prop.data as { id: string; name: string } | null;
    if (!property) return json({ error: "Föreningen hittades inte." }, 404);

    // Enkel broms mot spam: högst fem ansökningar per adress och dygn.
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const recent = await db.from("sublet_applications").select("id", { count: "exact", head: true }).eq("applicant_email", applicantEmail).gte("created_at", since);
    if ((recent.count ?? 0) >= 5) return json({ error: "Du har skickat in flera ansökningar den senaste dygnet. Försök igen i morgon eller kontakta styrelsen." }, 429);

    const ins = await db
      .from("sublet_applications")
      .insert({
        property_id: propertyId, apartment_number: apartmentNumber, trappa,
        applicant_name: applicantName, applicant_email: applicantEmail, applicant_phone: applicantPhone || null,
        tenant_name: tenantName, tenant_contact: tenantContact || null,
        start_date: startDate, end_date: endDate, reason, reason_text: reasonText || null,
      })
      .select("id, reference, token")
      .single();
    if (ins.error || !ins.data) throw new Error(ins.error?.message ?? "Ansökan kunde inte sparas.");
    const app = ins.data as { id: string; reference: string; token: string };

    const { saved, skipped } = await saveFiles(db, app.id, body.files, "sokande");

    const apt = `${apartmentNumber}, trappa ${trappa}`;
    const period = `${fmtDate(startDate)} – ${fmtDate(endDate)}`;
    const staff = await staffRecipients(db, propertyId);
    const mails: Mail[] = [
      {
        to: applicantEmail,
        subject: `Vi har tagit emot din ansökan om andrahandsuthyrning (${app.reference})`,
        intro: `Hej ${applicantName}! Vi har tagit emot din ansökan om andrahandsuthyrning och skickat den vidare till styrelsen i ${property.name}. Du får ett nytt mejl varje gång något händer med ansökan, och kan när som helst följa status via knappen nedan.`,
        rows: [["Status", "Mottagen — väntar på styrelsens beslut"], ["Ärendenummer", app.reference], ["Förening", property.name], ["Lägenhet", apt], ["Period", period], ["Hyresgäst", tenantName], ["Bifogade filer", String(saved)]],
        cta: { label: "Följ din ansökan", url: `${APP_URL}/ansok-andrahand?token=${app.token}` },
        outro: "Länken är personlig. Dela den inte med någon. Spara mejlet och ange ärendenumret om du kontaktar styrelsen.",
      },
    ];
    if (staff.length > 0) {
      mails.push({
        to: staff,
        subject: `Ny ansökan om andrahandsuthyrning: ${app.reference} — ${property.name}`,
        intro: `${applicantName} har ansökt om att få hyra ut sin lägenhet i andra hand. Ansökan väntar på styrelsens beslut: godkänn, neka eller begär komplettering.`,
        rows: [
          ["Ärendenummer", app.reference], ["Förening", property.name], ["Lägenhet", apt], ["Period", period],
          ["Sökande", `${applicantName}${applicantPhone ? `, ${applicantPhone}` : ""}, ${applicantEmail}`],
          ["Hyresgäst", `${tenantName}${tenantContact ? `, ${tenantContact}` : ""}`],
          ["Skäl", REASON_LABEL(reason, reasonText)], ["Bifogade filer", String(saved)],
        ],
        cta: { label: "Öppna ansökan", url: `${APP_URL}/andrahand` },
      });
    }
    const sent = await sendMails(mails);

    return json({ success: true, reference: app.reference, files_saved: saved, files_skipped: skipped, confirmation_sent: sent[0] === true, staff_notified: staff.length > 0 && sent[1] === true }, 200);
  } catch (error) {
    const err = error as { message?: string } | null;
    console.error("submit-andrahand failed:", err?.message);
    return json({ error: "Något gick fel. Försök igen eller kontakta styrelsen." }, 500);
  }
});
