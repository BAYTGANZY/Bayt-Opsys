// decide-andrahand — styrelsen eller admin godkänner, nekar eller begär komplettering av en ansökan om andrahandsuthyrning
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
type Decision = "godkand" | "nekad" | "komplettering";

const SUBJECT: Record<Decision, string> = {
  godkand: "Din ansökan om andrahandsuthyrning är godkänd",
  nekad: "Besked om din ansökan om andrahandsuthyrning",
  komplettering: "Styrelsen behöver en komplettering av din ansökan",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!serviceRoleKey) return json({ error: "Serverkonfiguration saknas: SERVICE_ROLE_KEY är inte satt." }, 500);
    const db: Db = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);

    // Vem anropar? Bara inloggad admin eller styrelse i just den här föreningen.
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await db.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "Inte inloggad." }, 401);
    const userId = userData.user.id;
    const me = await db.from("profiles").select("role, full_name").eq("id", userId).maybeSingle();
    const role = (me.data as { role?: string } | null)?.role;
    const myName = String((me.data as { full_name?: string } | null)?.full_name ?? "").trim() || userData.user.email || "Styrelsen";
    if (role !== "admin" && role !== "styrelse") return json({ error: "Du har inte behörighet att besluta om ansökningar." }, 403);

    const body = await req.json().catch(() => null);
    const id = String(body?.id ?? "");
    const decision = String(body?.decision ?? "") as Decision;
    const note = String(body?.note ?? "").trim().slice(0, 2000);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Ogiltigt ärende." }, 400);
    if (!["godkand", "nekad", "komplettering"].includes(decision)) return json({ error: "Ogiltigt beslut." }, 400);
    if (decision !== "godkand" && !note) {
      return json({ error: decision === "nekad" ? "Skriv en motivering till avslaget." : "Skriv vad som behöver kompletteras." }, 400);
    }

    const found = await db.from("sublet_applications").select("*").eq("id", id).maybeSingle();
    const app = found.data as Record<string, unknown> | null;
    if (!app) return json({ error: "Ansökan hittades inte." }, 404);

    if (role === "styrelse") {
      const link = await db.from("styrelse_properties").select("property_id").eq("profile_id", userId).eq("property_id", app.property_id as string);
      if (!link.data || link.data.length === 0) return json({ error: "Ansökan hör till en annan förening." }, 403);
    }
    if (app.status !== "ny" && app.status !== "komplettering") {
      return json({ error: "Beslut är redan fattat i den här ansökan." }, 409);
    }

    const prop = await db.from("properties").select("name").eq("id", app.property_id as string).maybeSingle();
    const propertyName = String((prop.data as { name?: string } | null)?.name ?? "");

    // Godkännande skapar uthyrningen i registret. Misslyckas det godkänns ansökan ändå —
    // beslutet är fattat — och styrelsen får veta att registerraden fick läggas in för hand.
    let subletId: string | null = null;
    let registryError: string | null = null;
    if (decision === "godkand") {
      const apt = await db
        .from("apartments").select("id")
        .eq("property_id", app.property_id as string)
        .eq("apartment_number", app.apartment_number as string)
        .eq("trappa", (app.trappa as string) ?? "")
        .maybeSingle();
      const ins = await db
        .from("sublettings")
        .insert({
          property_id: app.property_id,
          apartment_id: (apt.data as { id?: string } | null)?.id ?? null,
          member_name: app.applicant_name,
          tenant_name: app.tenant_name,
          tenant_contact: app.tenant_contact,
          start_date: app.start_date,
          end_date: app.end_date,
          reason: REASON_LABEL(String(app.reason), app.reason_text as string | null),
          insurance_ok: false,
          note: `Skapad från ansökan ${app.reference}. Lägenhet ${app.apartment_number}, trappa ${app.trappa ?? "—"}.`,
        })
        .select("id")
        .single();
      if (ins.error || !ins.data) registryError = ins.error?.message ?? "okänt fel";
      else subletId = String((ins.data as { id: unknown }).id);
    }

    const upd = await db
      .from("sublet_applications")
      .update({
        status: decision,
        decision_note: note || null,
        decided_by: userId,
        decided_by_name: myName,
        decided_at: new Date().toISOString(),
        sublet_id: subletId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id");
    if (upd.error || !upd.data || upd.data.length === 0) {
      if (subletId) await db.from("sublettings").delete().eq("id", subletId);
      throw new Error(upd.error?.message ?? "Beslutet kunde inte sparas.");
    }

    const period = `${fmtDate(app.start_date)} – ${fmtDate(app.end_date)}`;
    const statusLabel = decision === "godkand" ? "Godkänd" : decision === "nekad" ? "Nekad" : "Väntar på din komplettering";
    const statusUrl = `${APP_URL}/ansok-andrahand?token=${app.token}`;
    const rows: Row[] = [
      ["Status", statusLabel], ["Ärendenummer", String(app.reference)], ["Förening", propertyName],
      ["Lägenhet", `${app.apartment_number}${app.trappa ? `, trappa ${app.trappa}` : ""}`], ["Period", period],
    ];
    const mail: Mail =
      decision === "godkand"
        ? {
            to: String(app.applicant_email), subject: `${SUBJECT.godkand} (${app.reference})`,
            intro: `Hej ${app.applicant_name}! Styrelsen i ${propertyName} har godkänt din ansökan om att hyra ut din lägenhet i andra hand.`,
            rows, note: note ? { label: "Meddelande från styrelsen", text: note } : null,
            cta: { label: "Se din ansökan", url: statusUrl },
            outro: "Spara det här mejlet och ange ärendenumret om du behöver kontakta styrelsen.",
          }
        : decision === "nekad"
          ? {
              to: String(app.applicant_email), subject: `${SUBJECT.nekad} (${app.reference})`,
              intro: `Hej ${app.applicant_name}! Styrelsen i ${propertyName} har inte godkänt din ansökan om andrahandsuthyrning.`,
              rows, note: { label: "Motivering från styrelsen", text: note },
              cta: { label: "Se din ansökan", url: statusUrl },
              // Granskas av föreningens jurist: bostadsrättslagen ger medlemmen möjlighet att
              // begära hyresnämndens prövning om styrelsen nekar. Texten ska inte lova utgång.
              outro: "Om du inte är överens med beslutet kan du kontakta styrelsen eller läsa om möjligheten att få uthyrningen prövad hos hyresnämnden.",
            }
          : {
              to: String(app.applicant_email), subject: `${SUBJECT.komplettering} (${app.reference})`,
              intro: `Hej ${app.applicant_name}! Styrelsen i ${propertyName} behöver en komplettering innan den kan besluta om din ansökan om andrahandsuthyrning.`,
              rows, note: { label: "Det här behöver kompletteras", text: note },
              cta: { label: "Komplettera ansökan", url: statusUrl },
              outro: "Länken är personlig. Dela den inte med någon.",
            };
    const sent = await sendMails([mail]);

    return json({ success: true, status: decision, mail_sent: sent[0] === true, registry_error: registryError }, 200);
  } catch (error) {
    const err = error as { message?: string } | null;
    console.error("decide-andrahand failed:", err?.message);
    return json({ error: err?.message ?? "Okänt fel" }, 400);
  }
});
