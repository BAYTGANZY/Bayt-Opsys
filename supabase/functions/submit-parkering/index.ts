// submit-parkering — publik kölista för parkeringsplatser (ställ dig i kö, följ din plats, lämna kön)
//
// Se CLAUDE.md, avsnittet "Parkeringskö".

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

type Db = ReturnType<typeof createClient>;

const digitsOnly = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const clean = (v: unknown, max = 500) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const KIND_LABEL: Record<string, string> = { parkering: "Parkeringsplats", garage: "Garageplats" };

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

/** Plats i kön: antal aktiva (väntar/erbjuden) i samma förening och typ som ställde sig före, plus ett. */
async function positionOf(db: Db, row: { property_id: string; kind: string; queued_at: string; status: string }): Promise<number | null> {
  if (row.status !== "vantar" && row.status !== "erbjuden") return null;
  const r = await db
    .from("parking_queue")
    .select("id", { count: "exact", head: true })
    .eq("property_id", row.property_id)
    .eq("kind", row.kind)
    .in("status", ["vantar", "erbjuden"])
    .lt("queued_at", row.queued_at);
  return (r.count ?? 0) + 1;
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

    // ---- Styrelsen erbjuder en plats: mejla sökanden (kräver inloggad admin/styrelse) ----
    if (action === "offer") {
      const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: userData } = await db.auth.getUser(jwt);
      const userId = userData?.user?.id;
      if (!userId) return json({ error: "Du måste vara inloggad." }, 401);
      const me = await db.from("profiles").select("role").eq("id", userId).maybeSingle();
      const role = (me.data as { role?: string } | null)?.role;
      if (role !== "admin" && role !== "medarbetare" && role !== "styrelse") return json({ error: "Du har inte behörighet." }, 403);
      const id = String(body.id ?? "");
      const found = await db.from("parking_queue").select("*").eq("id", id).maybeSingle();
      const row = found.data as Record<string, unknown> | null;
      if (!row) return json({ error: "Raden hittades inte." }, 404);
      if (role === "styrelse") {
        const link = await db.from("styrelse_properties").select("property_id").eq("profile_id", userId).eq("property_id", row.property_id as string);
        if (!link.data || link.data.length === 0) return json({ error: "Du har inte behörighet för den här föreningen." }, 403);
      }
      if (row.status !== "erbjuden") return json({ error: "Platsen är inte erbjuden." }, 409);
      const prop = await db.from("properties").select("name").eq("id", row.property_id as string).maybeSingle();
      const propertyName = String((prop.data as { name?: string } | null)?.name ?? "");
      const kindText = String(KIND_LABEL[String(row.kind)] ?? "parkering").toLowerCase();
      const spot = row.spot_label ? String(row.spot_label) : "";
      const ok = await sendMails([{
        to: String(row.email),
        subject: `Du har fått ett erbjudande om ${kindText}: ${propertyName}`,
        intro: `Hej ${row.name}! Styrelsen i ${propertyName} erbjuder dig nu en plats${spot ? ` (${spot})` : ""}. Öppna länken och svara om du tackar ja eller nej.`,
        rows: [["Förening", propertyName], ["Plats", spot || "Meddelas av styrelsen"], ["Referens", String(row.reference)]],
        cta: { label: "Svara på erbjudandet", url: `${APP_URL}/parkering-ko?token=${row.token}` },
        outro: "Tackar du nej står du kvar i kön med din plats. Hör inget från dig kan styrelsen erbjuda platsen vidare.",
      }]);
      if (!ok[0]) return json({ error: "Erbjudandet sparades men mejlet kunde inte skickas." }, 502);
      return json({ success: true }, 200);
    }

    // ---- Följ eller lämna kön via den personliga länken -----------------------
    if (action === "lookup" || action === "leave" || action === "respond") {
      const token = String(body.token ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(token)) return json({ error: "Länken är ogiltig." }, 404);
      const found = await db.from("parking_queue").select("*").eq("token", token).maybeSingle();
      const row = found.data as Record<string, unknown> | null;
      if (!row) return json({ error: "Länken är ogiltig." }, 404);
      const prop = await db.from("properties").select("name").eq("id", row.property_id as string).maybeSingle();
      const propertyName = String((prop.data as { name?: string } | null)?.name ?? "");

      if (action === "respond") {
        if (row.status !== "erbjuden") return json({ error: "Det finns inget erbjudande att svara på." }, 409);
        const accept = String(body.answer) === "accept";
        const patch = accept ? { status: "tilldelad" } : { status: "vantar", spot_label: null };
        const upd = await db.from("parking_queue").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", row.id as string).select("id");
        if (upd.error || !upd.data || upd.data.length === 0) throw new Error(upd.error?.message ?? "Kunde inte spara svaret.");
        const staff = await staffRecipients(db, row.property_id as string);
        if (staff.length) {
          await sendMails([{
            to: staff,
            subject: `${accept ? "Tackat ja" : "Tackat nej"} till parkeringserbjudande: ${row.reference} — ${propertyName}`,
            intro: accept
              ? `${row.name} har tackat ja till den erbjudna platsen${row.spot_label ? ` (${row.spot_label})` : ""}. Raden är markerad som tilldelad.`
              : `${row.name} har tackat nej till den erbjudna platsen${row.spot_label ? ` (${row.spot_label})` : ""} och står kvar i kön på sin plats.`,
            rows: [["Referens", String(row.reference)], ["Förening", propertyName], ["Lägenhet", `${row.apartment_number}${row.trappa ? `, trappa ${row.trappa}` : ""}`]],
            cta: { label: "Öppna kölistan", url: `${APP_URL}/parkering` },
          }]);
        }
        return json({ success: true }, 200);
      }

      if (action === "leave") {
        if (row.status === "struken") return json({ success: true }, 200);
        if (row.status === "tilldelad") return json({ error: "Du har redan fått en plats. Kontakta styrelsen om du vill säga upp den." }, 409);
        const upd = await db
          .from("parking_queue")
          .update({ status: "struken", updated_at: new Date().toISOString() })
          .eq("id", row.id as string)
          .select("id");
        if (upd.error || !upd.data || upd.data.length === 0) throw new Error(upd.error?.message ?? "Kunde inte lämna kön.");
        const staff = await staffRecipients(db, row.property_id as string);
        if (staff.length) {
          await sendMails([{
            to: staff,
            subject: `Lämnat parkeringskön: ${row.reference} — ${propertyName}`,
            intro: `${row.name} har själv lämnat kön för ${String(KIND_LABEL[String(row.kind)] ?? "parkering").toLowerCase()}. Raden ligger kvar i listan som struken.`,
            rows: [["Referens", String(row.reference)], ["Förening", propertyName], ["Lägenhet", `${row.apartment_number}${row.trappa ? `, trappa ${row.trappa}` : ""}`]],
            cta: { label: "Öppna kölistan", url: `${APP_URL}/parkering` },
          }]);
        }
        return json({ success: true }, 200);
      }

      return json({
        success: true,
        reference: row.reference, status: row.status, kind: row.kind,
        position: await positionOf(db, row as { property_id: string; kind: string; queued_at: string; status: string }),
        spot_label: row.spot_label ?? null,
        queued_at: row.queued_at, property_name: propertyName,
        apartment_number: row.apartment_number, trappa: row.trappa, name: row.name,
      }, 200);
    }

    // ---- Ställ dig i kö ------------------------------------------------------
    if (clean(body.website)) return json({ success: true }, 200); // honeypot

    const propertyId = String(body.property_id ?? "");
    const kind = String(body.kind ?? "parkering");
    const apartmentNumber = digitsOnly(body.apartment_number);
    const trappa = digitsOnly(body.trappa);
    const name = clean(body.name, 200);
    const email = clean(body.email, 200).toLowerCase();
    const phone = clean(body.phone, 50);
    const vehicleReg = clean(body.vehicle_reg, 20).toUpperCase();
    const note = clean(body.note, 1000);

    if (!propertyId) return json({ error: "Välj förening." }, 400);
    if (!(kind in KIND_LABEL)) return json({ error: "Välj typ av plats." }, 400);
    if (!apartmentNumber) return json({ error: "Ange lägenhetsnummer (siffror)." }, 400);
    if (!trappa) return json({ error: "Ange trappa (siffror)." }, 400);
    if (!name) return json({ error: "Ange ditt namn." }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Ange en giltig e-postadress." }, 400);

    const kindText = KIND_LABEL[kind];
    const prop = await db.from("properties").select("id, name").eq("id", propertyId).maybeSingle();
    const property = prop.data as { id: string; name: string } | null;
    if (!property) return json({ error: "Föreningen hittades inte." }, 404);

    // Samma person står bara en gång per förening och typ: finns hen redan får hen sin befintliga plats tillbaka.
    const existing = await db
      .from("parking_queue")
      .select("*")
      .eq("property_id", propertyId).eq("kind", kind).ilike("email", email.replace(/[\\%_]/g, "\\$&"))
      .in("status", ["vantar", "erbjuden"])
      .maybeSingle();
    const dup = existing.data as Record<string, unknown> | null;
    if (dup) {
      return json({
        success: true, already: true, reference: dup.reference, token: dup.token,
        position: await positionOf(db, dup as { property_id: string; kind: string; queued_at: string; status: string }),
      }, 200);
    }

    // Samma lägenhet kan inte stå i kön, eller redan ha en plats, två gånger per typ — oavsett vem i hushållet som anmäler.
    // Svaret nämner aldrig vem som står i kön och lämnar ingen länk: det är en annan persons uppgifter.
    const sameApt = await db
      .from("parking_queue")
      .select("status")
      .eq("property_id", propertyId).eq("kind", kind).eq("apartment_number", apartmentNumber).eq("trappa", trappa)
      .in("status", ["vantar", "erbjuden", "tilldelad"]);
    const hit = (sameApt.data ?? []) as Array<{ status: string }>;
    if (hit.length > 0) {
      const has = hit.some((h) => h.status === "tilldelad");
      return json({
        error: has
          ? `Lägenhet ${apartmentNumber} (trappa ${trappa}) har redan en ${kindText.toLowerCase()}. Kontakta styrelsen om du vill byta eller ha fler.`
          : `Lägenhet ${apartmentNumber} (trappa ${trappa}) står redan i kön för ${kindText.toLowerCase()}. Kontakta styrelsen om du vill ändra anmälan.`,
      }, 409);
    }

    // Enkel broms mot spam: högst fem nya köplatser per adress och dygn.
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const recent = await db.from("parking_queue").select("id", { count: "exact", head: true }).ilike("email", email.replace(/[\\%_]/g, "\\$&")).gte("queued_at", since);
    if ((recent.count ?? 0) >= 5) return json({ error: "Du har anmält dig flera gånger det senaste dygnet. Försök igen i morgon eller kontakta styrelsen." }, 429);

    const ins = await db
      .from("parking_queue")
      .insert({
        property_id: propertyId, kind, apartment_number: apartmentNumber, trappa,
        name, email, phone: phone || null, vehicle_reg: vehicleReg || null, note: note || null, source: "webb",
      })
      .select("*")
      .single();
    if (ins.error || !ins.data) throw new Error(ins.error?.message ?? "Anmälan kunde inte sparas.");
    const row = ins.data as Record<string, unknown>;
    const position = await positionOf(db, row as { property_id: string; kind: string; queued_at: string; status: string });
    const apt = `${apartmentNumber}, trappa ${trappa}`;

    const staff = await staffRecipients(db, propertyId);
    const mails: Mail[] = [
      {
        to: email,
        subject: `Du står nu i kö för ${kindText.toLowerCase()} (${row.reference})`,
        intro: `Hej ${name}! Du har ställt dig i kö för ${kindText.toLowerCase()} i ${property.name}. Styrelsen hör av sig när en plats blir ledig. Du kan följa din plats i kön, eller lämna kön, via knappen nedan.`,
        rows: [["Din plats i kön", String(position ?? "—")], ["Referens", String(row.reference)], ["Förening", property.name], ["Typ", kindText], ["Lägenhet", apt]],
        cta: { label: "Följ min plats", url: `${APP_URL}/parkering-ko?token=${row.token}` },
        outro: "Länken är personlig. Dela den inte med någon.",
      },
    ];
    if (staff.length > 0) {
      mails.push({
        to: staff,
        subject: `Ny i parkeringskön: ${row.reference} — ${property.name}`,
        intro: `${name} har ställt sig i kö för ${kindText.toLowerCase()}.`,
        rows: [
          ["Plats i kön", String(position ?? "—")], ["Referens", String(row.reference)], ["Förening", property.name], ["Typ", kindText], ["Lägenhet", apt],
          ["Kontakt", `${name}${phone ? `, ${phone}` : ""}, ${email}`],
          ...(vehicleReg ? ([["Registreringsnummer", vehicleReg]] as Row[]) : []),
        ],
        note: note ? { label: "Meddelande", text: note } : null,
        cta: { label: "Öppna kölistan", url: `${APP_URL}/parkering` },
      });
    }
    const sent = await sendMails(mails);

    return json({ success: true, reference: row.reference, token: row.token, position, confirmation_sent: sent[0] === true, staff_notified: staff.length > 0 && sent[1] === true }, 200);
  } catch (error) {
    const err = error as { message?: string } | null;
    console.error("submit-parkering failed:", err?.message);
    return json({ error: "Något gick fel. Försök igen eller kontakta styrelsen." }, 500);
  }
});
