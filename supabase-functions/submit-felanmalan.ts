// Deploy this as a Supabase Edge Function named "submit-felanmalan".
// No secret needs to be created: the function reads the platform-provided
// SUPABASE_SERVICE_ROLE_KEY, which Supabase auto-injects into every function.
// This file lives outside src/ — it runs on Deno in Supabase, not in the Vite app.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const {
      property_id,
      apartment_number,
      trappa,
      resident_address,
      title,
      cause,
      description,
      category,
      priority,
      deadline,
      reporter_name,
      reporter_phone,
      reporter_email,
      files,
    } = await req.json();

    // Trimmed once here so the same values land on both the issue and — when the
    // apartment has to be created — on the apartment. A whitespace-only name
    // also has to fail the required-check below rather than slip through.
    const reporterName = (reporter_name ?? "").toString().trim();
    const reporterPhone = (reporter_phone ?? "").toString().trim();
    const reporterEmail = (reporter_email ?? "").toString().trim();
    const residentAddress = (resident_address ?? "").toString().trim();

    const aptNum = (apartment_number ?? "").toString().replace(/\D/g, "");
    // Letters only, uppercased — apartment numbers repeat across stairwells in
    // this portfolio, so (apartment_number, trappa) together are the real
    // per-property identity of a unit. Normalized server-side too, since the
    // client only enforces this on a best-effort basis.
    // MUST stay identical to normalizeTrappa() in src/lib/apartment-tokens.ts —
    // if the two drift, admin-created apartments stop matching resident
    // submissions and every felanmälan silently creates a duplicate unit.
    // Stairwells are ALWAYS letters, never numbers. Digits are stripped, so a
    // resident who types their apartment number here ends up with an empty
    // trappa and is rejected by the validation below — which is the intent:
    // better a clear error than a silently-created phantom apartment.
    const trappaNormalized = (trappa ?? "").toString().replace(/[^a-zA-ZåäöÅÄÖ]/g, "").toUpperCase();

    if (!property_id || !aptNum || !trappaNormalized || !reporterName || !reporterPhone) {
      return new Response(
        JSON.stringify({ error: "Fastighet, lägenhetsnummer, trappa, namn och telefonnummer krävs." }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    // Service role key. Order matters: the platform-provided
    // SUPABASE_SERVICE_ROLE_KEY comes FIRST because it is auto-injected into
    // every function and is always correct — it cannot be typo'd, forgotten,
    // or have its name and value swapped in the dashboard form. The custom
    // SERVICE_ROLE_KEY secret is only a fallback for the day Supabase drops
    // the deprecated default. Both past outages of this function were a
    // hand-made custom secret going wrong, so it must not take precedence.
    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || "";
    if (!serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Serverkonfiguration saknas: SERVICE_ROLE_KEY är inte satt." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
      );
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);

    const todayIso = new Date().toISOString().slice(0, 10);

    // Connect-or-create the apartment from the digits + stairwell the resident typed.
    let resolvedApartmentId: string | null = null;
    let apartmentWasCreated = false;
    {
      const { data: existing } = await supabase
        .from("apartments")
        .select("id")
        .eq("property_id", property_id)
        .eq("apartment_number", aptNum)
        .eq("trappa", trappaNormalized)
        .maybeSingle();
      if (existing?.id) {
        resolvedApartmentId = existing.id as string;
      } else {
        // The unit isn't registered, so this submission is the only thing the
        // system knows about it. Carry the resident's own details onto the new
        // apartment — otherwise the admin inherits a bare number+trappa shell
        // and has to retype a name/telefon/e-post the felanmälan already asked for.
        // CREATE ONLY: an apartment that already exists keeps whatever the admin
        // registered, so an anonymous form can never overwrite verified tenant data.
        const intakeNote = [
          `Lägenheten skapades automatiskt från en felanmälan ${todayIso}.`,
          residentAddress ? `Adress enligt boende: ${residentAddress}` : "",
          "Boendeuppgifterna är angivna av den boende via det publika formuläret och behöver granskas.",
        ]
          .filter(Boolean)
          .join("\n");

        const { data: created, error: aptErr } = await supabase
          .from("apartments")
          .insert({
            property_id,
            apartment_number: aptNum,
            trappa: trappaNormalized,
            status: "uthyrd",
            created_via: "public_form",
            tenant_name: reporterName,
            tenant_phone: reporterPhone,
            tenant_email: reporterEmail || null,
            notes: intakeNote,
          })
          .select("id")
          .single();
        if (aptErr) {
          // Likely a concurrent create hit the unique index — re-select the winner.
          const { data: retry } = await supabase
            .from("apartments")
            .select("id")
            .eq("property_id", property_id)
            .eq("apartment_number", aptNum)
            .eq("trappa", trappaNormalized)
            .maybeSingle();
          resolvedApartmentId = (retry?.id as string) ?? null;
        } else {
          resolvedApartmentId = created!.id as string;
          apartmentWasCreated = true;
        }
      }
    }

    const combinedDescription =
      [cause ? `Orsak: ${cause}` : "", description ?? ""].filter(Boolean).join("\n\n") || null;

    const resolvedTitle = (title && String(title).trim()) || `Felanmälan${category ? ` — ${category}` : ""}`;

    const { data: inserted, error: insertErr } = await supabase
      .from("issues")
      .insert({
        property_id,
        apartment_id: resolvedApartmentId,
        trappa: trappaNormalized,
        title: resolvedTitle,
        description: combinedDescription,
        category: category || null,
        priority: priority || "normal",
        deadline: deadline || null,
        status: "ny",
        reporter_name: reporterName,
        reporter_phone: reporterPhone,
        reporter_email: reporterEmail || null,
        submission_source: "public_form",
      })
      .select("id")
      .single();

    if (insertErr) throw insertErr;
    const issueId = inserted!.id as string;

    // Add an intake entry to the apartment's loggbok so the timeline records it.
    // Best-effort — never fail the submission if this insert is rejected.
    try {
      const entries = [
        {
          property_id,
          apartment_id: resolvedApartmentId,
          content: `Felanmälan mottagen via webbformulär: ${resolvedTitle}`,
          entry_date: todayIso,
        },
      ];
      // An auto-created unit is admin-review material — say so on its Tidslinje
      // rather than leaving the apartment to appear out of nowhere.
      if (apartmentWasCreated) {
        entries.unshift({
          property_id,
          apartment_id: resolvedApartmentId,
          content:
            `Lägenheten skapades automatiskt från en felanmälan. Boendeuppgifter angivna av den boende: ` +
            `${reporterName}, ${reporterPhone}${reporterEmail ? `, ${reporterEmail}` : ""}. Behöver granskas.`,
          entry_date: todayIso,
        });
      }
      await supabase.from("logbook_entries").insert(entries);
    } catch (_) { /* ignore */ }

    if (Array.isArray(files)) {
      for (const f of files) {
        if (!f?.base64 || !f?.name) continue;
        // Supabase Storage avvisar nycklar med icke-ASCII ("Invalid key") —
        // svenska filnamn som "Skärmbild ….png" försvann därför tyst här.
        // Nyckeln byggs nu av ett sanerat namn; originalnamnet behövs inte.
        const safeName = f.name
          .normalize("NFKD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/[^A-Za-z0-9._-]+/g, "_");
        const path = `issues/${issueId}/${Date.now()}-${safeName}`;
        const bytes = base64ToBytes(f.base64);
        const { error: upErr } = await supabase.storage
          .from("documents")
          .upload(path, bytes, { contentType: f.type || "application/octet-stream" });
        if (upErr) {
          // Sväljs inte längre tyst — syns i funktionens loggar i dashboarden.
          console.error(`Bilduppladdning misslyckades för "${f.name}": ${upErr.message}`);
          continue;
        }
        const { data: pub } = supabase.storage.from("documents").getPublicUrl(path);
        const { error: linkErr } = await supabase
          .from("issue_images")
          .insert({ issue_id: issueId, url: pub.publicUrl });
        if (linkErr) console.error(`issue_images-rad kunde inte skapas: ${linkErr.message}`);
      }
    }

    return new Response(JSON.stringify({ success: true, id: issueId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    // Supabase rejections are PostgrestError — a plain object, NOT an Error
    // instance — so `error instanceof Error` is false for every database
    // failure. Checking only that collapsed all of them to "Okänt fel" and
    // threw the cause away, leaving failed resident submissions undebuggable.
    const err = error as { message?: string; code?: string; details?: string; hint?: string } | null;
    const detail = err?.message ?? (typeof error === "string" ? error : null);
    console.error("submit-felanmalan failed:", JSON.stringify({
      message: err?.message, code: err?.code, details: err?.details, hint: err?.hint,
    }));
    return new Response(
      JSON.stringify({
        error: detail ?? "Okänt fel",
        code: err?.code ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    );
  }
});
