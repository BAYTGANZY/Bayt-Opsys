// Deploy this as a Supabase Edge Function named "track-felanmalan".
// Public, no login: lets a resident look up their own felanmälningar by the
// e-post they gave on /felanmalan (reporter_email — mandatory there since
// this function exists). No secret needs to be created: it reads the
// platform-provided SUPABASE_SERVICE_ROLE_KEY, same fallback order as
// submit-felanmalan.ts.
//
// Deliberately NOT a public RLS policy on `issues`: that table carries far
// more than a resident should ever be able to list (other reporters' phone
// numbers, internal assignment, deadlines…), and a `USING (true)` SELECT
// policy would let anyone holding the public anon key page through every
// ärende in the portfolio, not just rows matching the e-post they typed.
// Routing this through a service-role function keeps RLS on `issues` closed
// and returns only the handful of fields a status tracker needs.
//
// This file lives outside src/ — it runs on Deno in Supabase, not in the
// Vite app.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { email } = await req.json();
    const normalizedEmail = (email ?? "").toString().trim().toLowerCase();

    if (!normalizedEmail) {
      return new Response(JSON.stringify({ error: "E-post krävs." }), {
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

    // ilike with no wildcards in the pattern = case-insensitive exact match,
    // so "Anna@Example.se" finds a row saved as "anna@example.se".
    const { data, error } = await supabase
      .from("issues")
      .select("id, title, category, created_at, assigned_contact_id, deadline, status, properties(name)")
      .ilike("reporter_email", normalizedEmail)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Mirrors the "avslutat" bucket of LIFECYCLE_OF in src/lib/issue-tokens.ts
    // — must stay in sync, same reasoning as normalizeTrappa's duplicate here.
    const CLOSED_STATUSES = new Set(["stangd", "avslutat", "klar", "fakturerad"]);
    // "opened" = status left vilande/ny — an admin pressed "Öppna ärende"
    // (or the Dag Rapport quick-action equivalent), not merely viewed the
    // page. Mirrors OPENED_STATUSES in notify-progress.ts.
    const OPENED_STATUSES = new Set(["oppet", "pagande", "vantar"]);

    // Never return assigned_contact_id itself (an internal contacts FK) or the
    // raw status value — the tracker only needs to know THAT each milestone
    // happened, not who did it or the messy underlying enum.
    const issues = (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id,
      title: row.title,
      category: row.category,
      created_at: row.created_at,
      property_name: (row.properties as { name?: string } | null)?.name ?? null,
      opened: OPENED_STATUSES.has((row.status as string) ?? ""),
      assigned: row.assigned_contact_id != null,
      deadline: row.deadline ?? null,
      closed: CLOSED_STATUSES.has((row.status as string) ?? ""),
    }));

    return new Response(JSON.stringify({ success: true, issues }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const err = error as { message?: string; code?: string } | null;
    console.error("track-felanmalan failed:", JSON.stringify({ message: err?.message, code: err?.code }));
    return new Response(JSON.stringify({ error: err?.message ?? "Okänt fel" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
