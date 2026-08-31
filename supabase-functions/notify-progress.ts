// Deploy this as a Supabase Edge Function named "notify-progress".
// NOT called by the browser — only by the `issues_progress_notify_trigger`
// DB trigger (supabase-functions/issue-progress-notify.sql) via pg_net: once
// right when a felanmälan is submitted (step -1, "we got it, waiting for
// review" — none of the four /arendestatus dots lit yet), then again each
// time it crosses one of the four real milestones.
// Sends the resident a fresh email for that milestone via direct SMTP to
// bayt.se's own mailbox — deliberately NOT a third-party email API (Resend
// etc.): the point is to use a mailbox already owned, not sign up for a new
// service. denomailer is a pure-Deno SMTP client; Supabase's Edge Runtime
// allows outbound TCP so this works the same way a direct-Postgres-from-an-
// edge-function connection does.
//
// Secrets must be set by hand (Supabase Dashboard → Edge Functions →
// Secrets — MCP has no tool for this, same manual step as every other
// secret in this project):
//   NOTIFY_TRIGGER_SECRET — must match the Vault secret
//     'notify_progress_trigger_secret' the trigger sends as x-trigger-secret.
//     Without it (or on a mismatch) every call 401s — this is the only
//     thing stopping an arbitrary internet caller from spamming a resident.
//   SMTP_HOST, SMTP_PORT — bayt.se's mail host, from whoever hosts that
//     mailbox (Google Workspace/Microsoft 365 admin console, or the
//     hosting provider's mail settings page). Typically 465 (implicit TLS)
//     or 587 (STARTTLS) — this file picks TLS mode from the port.
//   SMTP_USER, SMTP_PASS — the mailbox's own login (an app-specific
//     password if the account has 2FA, which Workspace/365 both require
//     for SMTP login).
//   SMTP_FROM — optional, defaults to SMTP_USER. Set separately only if the
//     mailbox sends-as a different address than it authenticates as.
//
// This file lives outside src/ — it runs on Deno in Supabase, not in the
// Vite app.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-trigger-secret",
};

const TRACK_URL = "https://app.bayt.se/arendestatus";

// Mirrors issue_progress_step() in issue-progress-notify.sql and
// computeStepIndex()/CLOSED_STATUSES/OPENED_STATUSES in
// src/routes/arendestatus.tsx and track-felanmalan.ts — all must stay in
// sync, same reasoning as normalizeTrappa()'s duplicate.
const CLOSED_STATUSES = new Set(["stangd", "avslutat", "klar", "fakturerad"]);
// Step 0 ("Mottagen") is status leaving vilande/ny — an admin pressing
// "Öppna ärende" (OppnaArendeButton writes 'oppet') or the Dag Rapport
// quick-action equivalent ('pagande'), NOT merely opening the detail page.
// Loading the page sets viewed_at passively on every visit, which is too
// weak a signal for "someone actually looked at this" — an explicit button
// press is a real decision, so that's what this milestone is keyed on.
const OPENED_STATUSES = new Set(["oppet", "pagande", "vantar"]);

const STEP_LABELS = ["Mottagen", "Påbörjad", "Åtgärdad", "Avslutad"];

function computeStep(issue: {
  assigned_contact_id: string | null;
  deadline: string | null;
  status: string | null;
}): number {
  if (CLOSED_STATUSES.has(issue.status ?? "")) return 3;
  if (issue.deadline) return 2;
  if (issue.assigned_contact_id) return 1;
  if (OPENED_STATUSES.has(issue.status ?? "")) return 0;
  return -1;
}

function subjectForStep(step: number, title: string): string {
  switch (step) {
    case -1: return `Vi har tagit emot din felanmälan "${title}"`;
    case 0: return `Din felanmälan "${title}" är mottagen`;
    case 1: return `En entreprenör är tilldelad ditt ärende`;
    case 2: return `Ditt ärende har fått en tidsplan`;
    default: return `Ditt ärende är avslutat`;
  }
}

function bodyTextForStep(step: number, dateLabel: string | null): string {
  switch (step) {
    case -1: return "Din felanmälan väntar på att en ansvarig person granskar den.";
    case 0: return "Din felanmälan är mottagen och granskad av förvaltningen.";
    case 1: return "En entreprenör är nu tilldelad ditt ärende.";
    case 2: return dateLabel ? `Felanmälan förväntas vara klar senast ${dateLabel}.` : "Åtgärden pågår.";
    default: return "Ärendet är avslutat. Tack för din anmälan!";
  }
}

// Bulletproof-HTML-email pattern: plain <table>/<td> with inline styles and
// bgcolor fallbacks, no SVG or CSS gradients — Outlook's desktop rendering
// engine (still common among BRF boards) supports none of those reliably.
// This bar is a best-effort visual only; /arendestatus stays the accurate,
// authoritative view.
function progressBarHtml(step: number): string {
  const cells = STEP_LABELS.map((label, i) => {
    const reached = i <= step;
    const barColor = reached ? "#3D8A30" : "#E5E7EB";
    const textColor = reached ? "#1a1a1a" : "#6B7280";
    const weight = i === step ? "700" : "500";
    return `
      <td width="25%" style="padding:0 3px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td height="8" bgcolor="${barColor}" style="height:8px;line-height:8px;font-size:1px;background-color:${barColor};border-radius:4px;">&nbsp;</td>
        </tr></table>
        <div style="font-size:10px;text-align:center;margin-top:6px;color:${textColor};font-weight:${weight};font-family:Arial,Helvetica,sans-serif;">${label}</div>
      </td>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>`;
}

// A plain-text alternative isn't just a nicety — an HTML-only message with
// no text/plain part is a well-known spam heuristic on its own (Gmail,
// Outlook and most spam filters expect a proper multipart/alternative).
// Mirrors emailHtml()'s content exactly, just unstyled.
function emailText(opts: {
  title: string;
  category: string | null;
  propertyName: string | null;
  step: number;
  dateLabel: string | null;
  trackUrl: string;
}): string {
  const metaLine = [opts.propertyName, opts.category].filter(Boolean).join(" · ");
  const stepLine = STEP_LABELS.map((label, i) => (i <= opts.step ? `[x] ${label}` : `[ ] ${label}`)).join("  ");
  return [
    "BAYT",
    "",
    opts.title,
    metaLine || null,
    "",
    stepLine,
    "",
    bodyTextForStep(opts.step, opts.dateLabel),
    "",
    `Visa ärendestatus: ${opts.trackUrl}`,
  ].filter((line) => line !== null).join("\n");
}

function emailHtml(opts: {
  title: string;
  category: string | null;
  propertyName: string | null;
  step: number;
  dateLabel: string | null;
  trackUrl: string;
}): string {
  const metaLine = [opts.propertyName, opts.category].filter(Boolean).join(" · ");
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:#ffffff;border-radius:12px;font-family:Arial,Helvetica,sans-serif;">
  <tr><td style="padding:28px 24px 4px;text-align:center;">
    <img src="https://app.bayt.se/assets/bayt-logo-green.png" alt="BAYT" width="119" height="30" style="display:inline-block;width:119px;height:30px;border:0;" />
  </td></tr>
  <tr><td style="padding:12px 24px 4px;text-align:center;">
    <div style="font-size:16px;font-weight:600;color:#1a1a1a;">${opts.title}</div>
    ${metaLine ? `<div style="font-size:13px;color:#6B7280;margin-top:4px;">${metaLine}</div>` : ""}
  </td></tr>
  <tr><td style="padding:20px 24px 4px;">${progressBarHtml(opts.step)}</td></tr>
  <tr><td style="padding:20px 24px 4px;text-align:center;font-size:14px;color:#374151;line-height:1.5;">
    ${bodyTextForStep(opts.step, opts.dateLabel)}
  </td></tr>
  <tr><td style="padding:20px 24px 28px;text-align:center;">
    <a href="${opts.trackUrl}" style="display:inline-block;background-color:#3D8A30;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:6px;font-family:Arial,Helvetica,sans-serif;">Visa ärendestatus</a>
  </td></tr>
</table>
</td></tr>
</table>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const triggerSecret = Deno.env.get("NOTIFY_TRIGGER_SECRET") || "";
    const provided = req.headers.get("x-trigger-secret") || "";
    if (!triggerSecret || provided !== triggerSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const { issue_id } = await req.json();
    if (!issue_id) {
      return new Response(JSON.stringify({ error: "issue_id krävs." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || "";
    if (!serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Serverkonfiguration saknas: SERVICE_ROLE_KEY är inte satt." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
      );
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);

    const { data: issue, error } = await supabase
      .from("issues")
      .select("id, title, category, reporter_email, assigned_contact_id, deadline, status, properties(name)")
      .eq("id", issue_id)
      .maybeSingle();

    if (error) throw error;
    if (!issue || !issue.reporter_email) {
      // Nothing to send to — not an error, the trigger already filtered on
      // reporter_email but the row could have changed between fire and read.
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // -1 ("nothing reached yet") IS sent — it's the submission confirmation
    // fired straight from the INSERT trigger, worded as "waiting for review"
    // rather than skipped like an unrelated no-op update would be.
    const step = computeStep(issue as never);

    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");
    if (!smtpHost || !smtpUser || !smtpPass) {
      console.error("notify-progress: SMTP_HOST/SMTP_USER/SMTP_PASS not fully set — email not sent.");
      return new Response(
        JSON.stringify({ error: "Serverkonfiguration saknas: SMTP-uppgifter är inte satta." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
      );
    }
    const smtpPort = Number(Deno.env.get("SMTP_PORT") ?? "465");
    const fromAddr = Deno.env.get("SMTP_FROM") || smtpUser;

    const dateLabel = issue.deadline
      ? new Date(issue.deadline as string).toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" })
      : null;
    const propertyName = (issue.properties as { name?: string } | null)?.name ?? null;
    const trackUrl = `${TRACK_URL}?email=${encodeURIComponent(issue.reporter_email as string)}`;

    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: smtpPort,
        // 465 = implicit TLS from the start; anything else (587, 25) uses
        // STARTTLS, which denomailer negotiates automatically when tls=false
        // and the server advertises support for it.
        tls: smtpPort === 465,
        auth: { username: smtpUser, password: smtpPass },
      },
    });

    try {
      const bodyOpts = {
        title: (issue.title as string) || "Felanmälan",
        category: issue.category as string | null,
        propertyName,
        step,
        dateLabel,
        trackUrl,
      };
      await client.send({
        from: fromAddr,
        to: issue.reporter_email as string,
        subject: subjectForStep(step, (issue.title as string) || "Felanmälan"),
        content: emailText(bodyOpts),
        html: emailHtml(bodyOpts),
        // Without this, Inleed's Exim stamps a self-generated Message-ID on
        // @ns15.inleed.net — a From/Message-ID domain mismatch is a minor
        // spam signal on its own. Explicit here so it matches the From domain.
        headers: { "Message-ID": `<${crypto.randomUUID()}@bayt.se>` },
      });
    } catch (smtpErr) {
      console.error("notify-progress: SMTP send failed", (smtpErr as Error)?.message ?? smtpErr);
      return new Response(JSON.stringify({ error: "E-post kunde inte skickas." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 502,
      });
    } finally {
      await client.close();
    }

    return new Response(JSON.stringify({ success: true, step }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const err = error as { message?: string } | null;
    console.error("notify-progress failed:", JSON.stringify({ message: err?.message }));
    return new Response(JSON.stringify({ error: err?.message ?? "Okänt fel" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
