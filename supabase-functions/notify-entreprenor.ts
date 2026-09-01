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

const APP_URL = "https://app.bayt.se";
// Den publika entreprenörssidan (src/routes/mina-arenden.tsx). Länken finns med
// i mejlet därför att de flesta entreprenörer inte har någon inloggning alls —
// för dem leder knappen "Öppna ärendet i BAYT" bara till en inloggningsruta de
// inte kommer förbi. På /mina-arenden loggar de in med just den adress det här
// mejlet skickades till, och kan öppna och avsluta ärendet därifrån.
const PORTAL_URL = `${APP_URL}/mina-arenden`;

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

// Ett HTML-mejl helt utan text/plain-del är i sig en spamheuristik hos Gmail
// och Outlook (samma resonemang som i notify-progress). Innehållet speglar
// emailHtml() exakt, bara ostilat.
function emailText(opts: {
  title: string;
  rows: Row[];
  description: string | null;
  link: string;
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
    `Öppna ärendet: ${opts.link}`,
    "",
    `Har du ingen inloggning? Se och hantera dina ärenden på ${PORTAL_URL}`,
    "Du loggar in med den här e-postadressen och en kod vi mejlar dig.",
  ].join("\n");
}

function emailHtml(opts: {
  title: string;
  rows: Row[];
  description: string | null;
  link: string;
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
  <tr><td style="padding:24px 24px 28px;text-align:center;">
    <a href="${esc(opts.link)}" style="display:inline-block;background-color:#3D8A30;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:6px;font-family:Arial,Helvetica,sans-serif;">Öppna ärendet i BAYT</a>
    <div style="font-size:11px;color:#9AA0A6;margin-top:12px;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">
      Knappen kräver en inloggning i portalen.<br />
      Har du ingen? Se och hantera dina ärenden på
      <a href="${PORTAL_URL}" style="color:#3D8A30;font-weight:600;text-decoration:underline;">mina ärenden</a>
      — du loggar in med den här e-postadressen och en kod vi mejlar dig.
    </div>
  </td></tr>
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

    const link = issue.property_id
      ? `${APP_URL}/properties/${issue.property_id}/issues/${issue.id}`
      : `${APP_URL}/issues/${issue.id}`;

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
      link,
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
        subject: `Nytt ärende: ${bodyOpts.title}${propertyName ? ` — ${propertyName}` : ""}`,
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
