// ============================================================================
// invite-user — bjud in / radera användare. Körs som Edge Function i Supabase.
//
// Deployad via Management API 2026-07-30. Källan hölls tidigare bara i
// dashboarden; den här filen är nu referenskopian, samma konvention som
// submit-felanmalan.ts. Redigera här → deploya om för hand (eller via API).
//
// Ändringar 2026-07-30 mot den gamla deployen:
//   * redirectTo pekar på https://app.bayt.se/accept-invite — inte localhost.
//     (Länken måste också finnas i Auth → URL Configuration → Redirect URLs.)
//   * Entreprenörskontakten SKAPAS INTE blint längre. Databasens
//     kontokontinuitet (account-continuity.sql) länkar/skapar redan kontakten
//     via trigger på profiles; en blind insert här gav en dubblettkontakt för
//     varje inbjuden entreprenör (två rader med samma profile_id — sågs live).
//     Nu: hitta befintlig kontakt på profile_id eller normaliserad e-post och
//     återaktivera/länka den; skapa bara om ingen finns.
//   * SERVICE_ROLE_KEY med fallback till SUPABASE_SERVICE_ROLE_KEY och ett
//     tydligt svenskt fel om ingen av dem finns — samma mönster som
//     submit-felanmalan (den här funktionen saknade fallback och har gått
//     sönder på just detta förr).
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_URL = 'https://app.bayt.se';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const body = await req.json();

    const serviceKey =
      Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!serviceKey) {
      throw new Error(
        'Servern saknar servicenyckel (SERVICE_ROLE_KEY). Lägg till den under Edge Functions → Secrets.',
      );
    }
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);

    if (body.action === 'delete') {
      const { id } = body;
      if (!id) throw new Error('Missing user id');
      // profiles raderas explicit FÖRE auth-användaren så att BEFORE DELETE-
      // triggern (profiles_remember_account) hinner fotografera kontot och
      // pensionera kontakten. Ändra inte ordningen.
      await supabase.from('profiles').delete().eq('id', id);
      const { error } = await supabase.auth.admin.deleteUser(id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const { email, role, full_name, property_ids } = body;
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { role, full_name },
      redirectTo: `${APP_URL}/accept-invite`,
    });
    if (error) throw error;

    if (role === 'styrelse' && Array.isArray(property_ids) && property_ids.length > 0 && data.user) {
      await supabase.from('styrelse_properties').insert(
        property_ids.map((property_id) => ({
          profile_id: data.user.id,
          property_id,
        })),
      );
    }

    if (role === 'entreprenor' && data.user) {
      // Samma regel som link_or_create_contact: befintlig länk → samma e-post
      // → annars ny. Blint INSERT här skapade dubbletter, eftersom
      // account-continuity-triggern på profiles också länkar/skapar.
      const emailNorm = (email ?? '').trim().toLowerCase();
      const { data: existing } = await supabase
        .from('contacts')
        .select('id, profile_id')
        .or(`profile_id.eq.${data.user.id},email.ilike.${emailNorm}`)
        .limit(1);
      if (existing && existing.length > 0) {
        await supabase
          .from('contacts')
          .update({ profile_id: data.user.id, active: true })
          .eq('id', existing[0].id);
      } else {
        await supabase.from('contacts').insert({
          property_id: null,
          full_name: full_name || email,
          email,
          contact_type: 'entreprenor',
          profile_id: data.user.id,
        });
      }
    }

    return new Response(JSON.stringify({ user: data.user }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
