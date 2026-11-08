// Edge Function "phone-intake" — felanmälan per telefon via 46elks.
// Ligger utanför Vite-bygget; deployas med Supabase CLI eller dashboarden.
// verify_jwt = false (se supabase/config.toml): 46elks skickar ingen JWT och signerar
// inte sina anrop, så anropen legitimeras med en hemlighet i URL:en (?k=PHONE_WEBHOOK_SECRET).
//
// Flöde (varje steg är ett anrop från 46elks, nästa steg ligger i svarets `next`):
//   start    -> intro + fastighetsmeny (hoppas över om bara en fastighet)
//   property -> lägenhetsnummer (siffror, avsluta med #)
//   apt      -> trappnummer (siffror, avsluta med #)
//   trappa   -> "berätta vad som är fel" + inspelning
//   recording-> (körs i bakgrunden) ljud -> Whisper -> Claude -> ärende -> tack-SMS
//   done     -> tack i luren, lägg på
//
// Hemligheter: PHONE_WEBHOOK_SECRET, ELKS_API_USERNAME, ELKS_API_PASSWORD, OPENAI_API_KEY,
// ANTHROPIC_API_KEY. Valfria: ELKS_SMS_FROM (standard "BAYT"), PHONE_PROPERTY_IDS (kommaseparerade
// id:n som får finnas i menyn), PHONE_MODEL, OPENAI_STT_MODEL, OPENAI_TTS_MODEL, OPENAI_TTS_VOICE.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || "";
const SECRET = Deno.env.get("PHONE_WEBHOOK_SECRET") ?? "";
const ELKS_USER = Deno.env.get("ELKS_API_USERNAME") ?? "";
const ELKS_PASS = Deno.env.get("ELKS_API_PASSWORD") ?? "";
const ELKS_SMS_FROM = Deno.env.get("ELKS_SMS_FROM") || "BAYT";
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = Deno.env.get("PHONE_MODEL") || "claude-haiku-5-5";
const STT_MODEL = Deno.env.get("OPENAI_STT_MODEL") || "whisper-1";
const TTS_MODEL = Deno.env.get("OPENAI_TTS_MODEL") || "tts-1";
const TTS_VOICE = Deno.env.get("OPENAI_TTS_VOICE") || "alloy";
const ALLOWED_PROPERTY_IDS = (Deno.env.get("PHONE_PROPERTY_IDS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const FN_URL = `${SUPABASE_URL}/functions/v1/phone-intake`;
const CATEGORIES = [
  "VVS (vatten, avlopp, värme)", "El", "Ventilation", "Tak & fasad", "Fönster & dörrar",
  "Gemensamma utrymmen", "Lägenhet invändigt", "Hiss", "Markarbete", "Parkering", "Övrigt",
];
const MAX_MENU = 9;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" }, status: 200 });

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Bygg URL till ett nästa steg. Tillståndet (fastighet, lägenhet, trappa) bärs i URL:en. */
function stepUrl(step: string, state: Record<string, string> = {}): string {
  const q = new URLSearchParams({ step, k: SECRET, ...state });
  return `${FN_URL}?${q.toString()}`;
}

// MÅSTE vara identisk med normalizeTrappa() i src/lib/apartment-tokens.ts: bara siffror.
const digitsOnly = (s: string) => (s ?? "").toString().replace(/\D/g, "");

// ---------- Uppläst text (OpenAI TTS, cachad i Storage) ----------
// 46elks har ingen egen talsyntes, bara "play" av en ljudfil. Varje fast text görs till en mp3 en gång
// och återanvänds därefter.
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${TTS_MODEL}|${TTS_VOICE}|${s}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function say(text: string): Promise<string> {
  const path = `voice-prompts/${await sha256Hex(text)}.mp3`;
  const { data: pub } = supabase.storage.from("documents").getPublicUrl(path);
  try {
    const head = await fetch(pub.publicUrl, { method: "HEAD" });
    if (head.ok) return pub.publicUrl;
  } catch { /* skapas nedan */ }
  const r = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: TTS_MODEL, voice: TTS_VOICE, input: text, response_format: "mp3", speed: 0.95 }),
  });
  if (!r.ok) throw new Error(`tts ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  const { error } = await supabase.storage.from("documents").upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
  if (error) throw new Error(`upload prompt: ${error.message}`);
  return pub.publicUrl;
}

const T = {
  intro:
    "Hej, du har ringt BAYT felanmälan. Samtalet spelas in och skrivs ut som text, så att vi kan registrera ditt ärende. " +
    "Är det akut fara för liv eller egendom, lägg på och ring 112.",
  aptAsk: "Slå ditt lägenhetsnummer med knapparna. Avsluta med fyrkant.",
  trappaAsk: "Slå nu ditt trappnummer, alltså trappuppgångens nummer. Avsluta med fyrkant.",
  recordAsk: "Berätta vad som är fel och var. Tala efter pipet. Du kan lägga på när du är klar.",
  thanks: "Tack. Ditt ärende är mottaget och vi tar hand om det. Hej då.",
  invalid: "Det var inte ett giltigt val. Försök igen.",
  giveUp: "Vi uppfattade inte dina val. Ring gärna igen. Hej då.",
  error: "Något gick fel hos oss. Ring gärna igen om en stund. Hej då.",
};

// ---------- Fastighetsmeny ----------
type Prop = { id: string; name: string };
async function menuProperties(): Promise<Prop[]> {
  let q = supabase.from("properties").select("id, name").order("name");
  if (ALLOWED_PROPERTY_IDS.length) q = q.in("id", ALLOWED_PROPERTY_IDS);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as Prop[]).slice(0, MAX_MENU);
}

// ---------- 46elks ----------
const elksAuth = () => "Basic " + btoa(`${ELKS_USER}:${ELKS_PASS}`);

async function sendSms(to: string, message: string) {
  // Bara mobilnummer kan ta emot SMS. Dolt nummer / fast telefon hoppas över.
  if (!/^\+467\d{8}$/.test(to)) return;
  const r = await fetch("https://api.46elks.com/a1/sms", {
    method: "POST",
    headers: { Authorization: elksAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ from: ELKS_SMS_FROM, to, message }),
  });
  if (!r.ok) console.error("phone-intake: sms", r.status, (await r.text().catch(() => "")).slice(0, 200));
}

async function fetchRecording(url: string): Promise<Uint8Array> {
  const host = new URL(url).hostname;
  const headers: Record<string, string> = {};
  // Inloggningsuppgifterna skickas bara till 46elks egna adresser.
  if (host === "46elks.com" || host.endsWith(".46elks.com")) headers.Authorization = elksAuth();
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`recording ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

// ---------- Tal till text och sammanfattning ----------
async function transcribe(wav: Uint8Array): Promise<string> {
  const fd = new FormData();
  fd.append("file", new Blob([wav], { type: "audio/wav" }), "samtal.wav");
  fd.append("model", STT_MODEL);
  fd.append("language", "sv");
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}` },
    body: fd,
  });
  if (!r.ok) throw new Error(`stt ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
  const out = await r.json();
  return String(out?.text ?? "").trim();
}

type Summary = { title: string; description: string; category: string; akut: boolean; name: string };

async function summarize(transcript: string): Promise<Summary> {
  const fallback: Summary = {
    title: "Felanmälan via telefon",
    description: transcript,
    category: "Övrigt",
    akut: false,
    name: "",
  };
  if (!ANTHROPIC_KEY || !transcript) return fallback;
  const system =
    "Du hjälper en svensk fastighetsförvaltare att registrera felanmälningar som lämnats som talat meddelande. " +
    "Du får en automatisk utskrift av samtalet (kan innehålla hörfel). Svara ENBART med JSON: " +
    `{"title": kort rubrik, max 70 tecken, "description": saklig sammanfattning i 1-4 meningar utan att hitta på något, ` +
    `"category": exakt en av ${JSON.stringify(CATEGORIES)}, ` +
    `"akut": true bara vid tydlig pågående fara eller stor skada (vattenläcka som pågår, brand, gasdoft, strömlöst hus, instängd i hiss), annars false, ` +
    `"name": den ringandes namn om det sägs, annars tom sträng}.`;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 600, system, messages: [{ role: "user", content: transcript }] }),
    });
    if (!r.ok) throw new Error("anthropic " + r.status);
    const text: string = (await r.json())?.content?.[0]?.text ?? "";
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    const p = JSON.parse(text.slice(a, b + 1));
    return {
      title: String(p.title || fallback.title).slice(0, 100),
      description: String(p.description || transcript).slice(0, 2000),
      category: CATEGORIES.includes(p.category) ? p.category : "Övrigt",
      akut: p.akut === true,
      name: String(p.name ?? "").trim().slice(0, 80),
    };
  } catch (e) {
    console.error("phone-intake: summarize", (e as Error).message);
    return fallback;
  }
}

// ---------- Skapa ärendet (körs i bakgrunden efter inspelningen) ----------
async function processRecording(p: { callid: string; from: string; wav: string; propertyId: string; apt: string; trappa: string }) {
  const marker = `Samtals-ID: ${p.callid}`;
  // 46elks gör om anrop som inte får 2xx; samma samtal ska inte ge två ärenden.
  const { data: dup } = await supabase.from("issues").select("id").ilike("description", `%${marker}%`).limit(1);
  if (dup && dup.length) return;

  const transcript = await transcribe(await fetchRecording(p.wav));
  const s = await summarize(transcript);
  const todayIso = new Date().toISOString().slice(0, 10);

  const { data: apt } = await supabase
    .from("apartments").select("id")
    .eq("property_id", p.propertyId).eq("apartment_number", p.apt).eq("trappa", p.trappa).maybeSingle();
  // Ingen ny lägenhet skapas av en knapptryckning: ett felslaget nummer ska inte bli en spöklägenhet.
  const aptId = (apt?.id as string | undefined) ?? null;

  const description = [
    s.description || "(Tomt meddelande)",
    aptId ? "" : `Lägenhet och trappa enligt den som ringde: lgh ${p.apt}, trappa ${p.trappa}. Hittades inte i registret, kontrollera.`,
    transcript ? `Utskrift av samtalet (automatisk, kan innehålla fel):\n${transcript}` : "Inget tal kunde skrivas ut ur inspelningen.",
    marker,
  ].filter(Boolean).join("\n\n");

  const { data: inserted, error } = await supabase
    .from("issues")
    .insert({
      property_id: p.propertyId,
      apartment_id: aptId,
      trappa: p.trappa,
      title: s.title,
      description,
      category: s.category,
      priority: s.akut ? "akut" : "normal",
      status: "ny",
      reporter_name: s.name || "Okänd (telefon)",
      reporter_phone: /^\+\d{6,}$/.test(p.from) ? p.from : null,
      submission_source: "public_form",
    })
    .select("id")
    .single();
  if (error) throw error;

  try {
    await supabase.from("logbook_entries").insert({
      property_id: p.propertyId,
      apartment_id: aptId,
      content: `Felanmälan mottagen via telefon: ${s.title}`,
      entry_date: todayIso,
    });
  } catch { /* best effort, som i submit-felanmalan */ }

  await sendSms(p.from, "BAYT: Tack för din felanmälan. Ditt ärende är mottaget och bearbetas. Du får besked när något händer.");
  console.log("phone-intake: ärende skapat", inserted?.id);
}

// ---------- Router ----------
Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (!SECRET || !safeEqual(url.searchParams.get("k") ?? "", SECRET)) {
    return new Response("forbidden", { status: 403 });
  }
  const step = url.searchParams.get("step") ?? "start";
  const body = new URLSearchParams(await req.text());
  const state = {
    p: url.searchParams.get("p") ?? "",
    a: url.searchParams.get("a") ?? "",
    n: url.searchParams.get("n") ?? "0",
  };
  const tries = Number(state.n) || 0;

  try {
    const hangup = async (text: string) => json({ play: await say(text), skippable: false });

    // Ett menyval kan behöva upprepas; efter två felförsök ger vi upp snällt.
    const failedInput = body.get("result") === "failed";

    if (step === "start") {
      const props = await menuProperties();
      if (!props.length) return await hangup(T.error);
      const intro = await say(T.intro);
      if (props.length === 1) {
        return json({ play: intro, skippable: false, next: { ivr: await say(T.aptAsk), digits: 8, next: stepUrl("apt", { p: props[0].id }) } });
      }
      const menu = props.map((x, i) => `Tryck ${i + 1} för ${x.name}.`).join(" ");
      return json({ play: intro, skippable: false, next: { ivr: await say(menu), digits: 1, next: stepUrl("property") } });
    }

    if (step === "property") {
      const props = await menuProperties();
      const idx = Number(body.get("result")) - 1;
      if (failedInput || !props[idx]) {
        if (tries >= 1) return await hangup(T.giveUp);
        const menu = props.map((x, i) => `Tryck ${i + 1} för ${x.name}.`).join(" ");
        return json({ play: await say(T.invalid), skippable: false, next: { ivr: await say(menu), digits: 1, next: stepUrl("property", { n: "1" }) } });
      }
      return json({ ivr: await say(T.aptAsk), digits: 8, next: stepUrl("apt", { p: props[idx].id }) });
    }

    if (step === "apt") {
      const apt = digitsOnly(body.get("result") ?? "");
      if (failedInput || !apt) {
        if (tries >= 1) return await hangup(T.giveUp);
        return json({ play: await say(T.invalid), skippable: false, next: { ivr: await say(T.aptAsk), digits: 8, next: stepUrl("apt", { p: state.p, n: "1" }) } });
      }
      return json({ ivr: await say(T.trappaAsk), digits: 4, next: stepUrl("trappa", { p: state.p, a: apt }) });
    }

    if (step === "trappa") {
      const trappa = digitsOnly(body.get("result") ?? "");
      if (failedInput || !trappa) {
        if (tries >= 1) return await hangup(T.giveUp);
        return json({ play: await say(T.invalid), skippable: false, next: { ivr: await say(T.trappaAsk), digits: 4, next: stepUrl("trappa", { p: state.p, a: state.a, n: "1" }) } });
      }
      return json({
        play: await say(T.recordAsk),
        skippable: false,
        next: {
          record: stepUrl("recording", { p: state.p, a: state.a, t: trappa }),
          timelimit: 120,
          next: stepUrl("done"),
        },
      });
    }

    if (step === "recording") {
      const wav = body.get("wav") ?? "";
      const callid = body.get("callid") ?? "";
      const from = body.get("from") ?? "";
      const t = url.searchParams.get("t") ?? "";
      if (wav && callid && state.p && state.a && t) {
        // Svara 46elks direkt; transkribering och ärendeskapande tar några sekunder.
        const work = processRecording({ callid, from, wav, propertyId: state.p, apt: state.a, trappa: t }).catch((e) =>
          console.error("phone-intake: processRecording", (e as Error)?.message ?? JSON.stringify(e))
        );
        // @ts-ignore EdgeRuntime finns i Supabase Edge Runtime
        if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work); else await work;
      }
      return new Response("ok", { status: 200 });
    }

    if (step === "done") return await hangup(T.thanks);

    return new Response("unknown step", { status: 400 });
  } catch (e) {
    console.error("phone-intake:", step, (e as Error)?.message ?? JSON.stringify(e));
    try {
      return await (async () => json({ play: await say(T.error), skippable: false }))();
    } catch {
      return json({ play: "sound/beep" });
    }
  }
});
