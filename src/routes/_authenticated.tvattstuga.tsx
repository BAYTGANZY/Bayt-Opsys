import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useVisibleProperties } from "@/hooks/useVisibleProperties";
import { confirmDialog } from "@/components/ConfirmDialog";

/**
 * Förfrågningar om kod till tvättstugan (Bokatvättid) från /tvattstuga-kod (edge-funktionen submit-tvattstuga).
 * Halvautomatiskt: styrelsen slår upp lägenheten ("3-1001" = trappa-lägenhet) i Bokatvättid, skriver in pinen
 * här och funktionen mejlar den boende. Pinen sparas aldrig. Admin och styrelse (sin egen förening, via RLS)
 * ser listan; bara admin raderar. Se CLAUDE.md, "Tvättstugekod".
 */
export const Route = createFileRoute("/_authenticated/tvattstuga")({
  head: () => ({ meta: [{ title: "Tvättstugekod — BAYT" }] }),
  component: TvattstugaPage,
});

const INK = "#0D2B1E";
const GREEN = "#3D8A30";
const MUTED = "#6B7280";
const LINE = "#E3E7E2";
const GOLD = "#E8C464";
const GOLD_SOFT = "rgba(232,196,100,0.16)";
const BOKATVATTID_URL = "https://admin.bokatvattid.se";

type Status = "ny" | "skickad" | "fastnat" | "avvisad";
type Req = {
  id: string;
  reference: string;
  property_id: string;
  apartment_number: string;
  trappa: string;
  name: string;
  email: string;
  phone: string | null;
  status: Status;
  send_error: string | null;
  match_result: "epost" | "namn" | "ingen" | "okand" | null;
  sent_at: string | null;
  sent_by_name: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<Status, string> = { ny: "Väntar på kod", skickad: "Kod skickad", fastnat: "Kunde inte skickas", avvisad: "Avvisad" };
const STATUS_STYLE: Record<Status, { bg: string; fg: string }> = {
  ny: { bg: "#FEF3C7", fg: "#92400E" },
  skickad: { bg: "#DCFCE7", fg: "#166534" },
  fastnat: { bg: "#FEE2E2", fg: "#991B1B" },
  avvisad: { bg: "#F3F4F6", fg: "#374151" },
};

const MATCH: Record<string, { text: string; bg: string; fg: string }> = {
  epost: { text: "E-posten finns registrerad på lägenheten", bg: "#DCFCE7", fg: "#166534" },
  namn: { text: "Namnet stämmer med lägenhetsregistret", bg: "#DCFCE7", fg: "#166534" },
  ingen: { text: "Stämmer inte med lägenhetsregistret", bg: "#FEE2E2", fg: "#991B1B" },
  okand: { text: "Lägenheten saknar registrerade uppgifter", bg: "#F3F4F6", fg: "#374151" },
};

const STYLES = `
  .tk-btn { height: 36px; padding: 0 14px; border-radius: 8px; font-size: 13.5px; font-weight: 600; cursor: pointer; font-family: inherit; background: #fff; color: #0D2B1E; border: 1px solid #E3E7E2; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
  .tk-btn:hover { border-color: #3D8A30; }
  .tk-btn:disabled { opacity: .6; cursor: not-allowed; }
  .tk-btn.tk-primary { background: #3D8A30; border-color: #3D8A30; color: #fff; height: 40px; }
  .tk-btn.tk-danger { color: #B42318; }
  .tk-input { height: 40px; padding: 0 12px; border: 1px solid #E3E7E2; border-radius: 8px; font: inherit; font-size: 14px; background: #fff; min-width: 0; max-width: 100%; box-sizing: border-box; }
`;

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" });
const lookupKey = (r: Req) => `${r.trappa}-${r.apartment_number}`;

/** Väntetid i hela dygn sedan förfrågan kom in. Grå < 2 dygn, gul ≥ 2, röd ≥ 4. */
function waited(r: Req): { text: string; color: string } {
  const days = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86_400_000);
  const text = days < 1 ? "kom in idag" : `väntat ${days} dygn`;
  return { text, color: days >= 4 ? "#B42318" : days >= 2 ? "#92400E" : MUTED };
}

async function errorMessage(err: unknown, fallback: string): Promise<string> {
  try {
    const ctx = (err as { context?: Response })?.context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.json();
      if (body?.error) return String(body.error);
    }
  } catch {
    /* faller tillbaka */
  }
  return fallback;
}

function TvattstugaPage() {
  const isMobile = useIsMobile();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const canUse = isAdmin || profile?.role === "styrelse";
  const { allowedIds } = useVisibleProperties();
  const qc = useQueryClient();
  const [propertyId, setPropertyId] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [search, setSearch] = useState("");

  const propsQ = useQuery({
    queryKey: ["tvattstuga-properties", profile?.role],
    enabled: canUse,
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
  const properties = (propsQ.data ?? []).filter((p) => !allowedIds || allowedIds.has(p.id));
  const activeProperty = propertyId && properties.some((p) => p.id === propertyId) ? propertyId : properties[0]?.id ?? "";
  const propertyName = properties.find((p) => p.id === activeProperty)?.name ?? "";

  const q = useQuery({
    queryKey: ["laundry-requests", activeProperty],
    enabled: canUse && !!activeProperty,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("laundry_code_requests").select("*").eq("property_id", activeProperty).order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Req[];
    },
  });
  const all = q.data ?? [];
  const missingTable = !!q.error && /does not exist|relation|schema cache/i.test((q.error as Error).message);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["laundry-requests"] });
    void qc.invalidateQueries({ queryKey: ["laundry-notifications"] });
  };

  /** Statusändringar utan mejl. .select("id") — en UPDATE som RLS stoppar ger 200 med noll rader. */
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { data, error } = await supabase.from("laundry_code_requests").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Ändringen sparades inte (saknar behörighet).");
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from("laundry_code_requests").delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Raden raderades inte.");
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const copyLink = async () => {
    const url = `${window.location.origin}/tvattstuga-kod?forening=${activeProperty}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Länken till förfrågan är kopierad");
    } catch {
      window.prompt("Kopiera länken:", url);
    }
  };

  if (profile && !canUse) {
    return <div style={{ padding: 32, color: MUTED }}>Du har inte behörighet till den här sidan.</div>;
  }

  const needle = search.trim().toLowerCase();
  const matches = (r: Req) => !needle || [r.name, r.email, r.apartment_number, lookupKey(r), r.reference].some((v) => v.toLowerCase().includes(needle));
  // Fastnade överst: de kräver att någon gör jobbet själv. Sedan äldst först.
  const open = all.filter((r) => r.status === "ny" || r.status === "fastnat").sort((a, b) => (a.status === b.status ? a.created_at.localeCompare(b.created_at) : a.status === "fastnat" ? -1 : 1));
  const closed = all.filter((r) => r.status === "skickad" || r.status === "avvisad").sort((a, b) => b.created_at.localeCompare(a.created_at));
  const stuck = open.filter((r) => r.status === "fastnat").length;
  const longest = open.reduce((m, r) => Math.max(m, Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86_400_000)), 0);

  return (
    <div style={{ padding: isMobile ? 16 : 32, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Inter, system-ui, sans-serif" }}>
      <style>{STYLES}</style>

      <div style={{ position: "relative", overflow: "hidden", borderRadius: 18, color: "#e6efd8", padding: "22px 24px", background: "radial-gradient(ellipse at 15% 0%, #21503f 0%, #0f2a21 55%, #0b1d17 100%)", border: `2px solid ${GOLD}`, boxShadow: `0 0 0 4px ${GOLD_SOFT}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <span style={{ display: "inline-block", fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", color: INK, background: GOLD, borderRadius: 999, padding: "3px 10px", marginBottom: 8 }}>TVÄTTSTUGAN</span>
            <h1 style={{ fontFamily: "Outfit, Inter, system-ui, sans-serif", fontSize: 28, fontWeight: 800, color: "#fff", margin: 0 }}>Tvättstugekod</h1>
            <div style={{ fontSize: 14, color: "#c9d8c3", marginTop: 6, maxWidth: 640, lineHeight: 1.6 }}>
              Boende som ber om kod till Bokatvättid. Slå upp lägenheten, skriv in pinen och tryck Skicka koden. {propertyName}
            </div>
          </div>
          <select className="tk-input" style={{ maxWidth: 280 }} value={activeProperty} onChange={(e) => setPropertyId(e.target.value)} aria-label="Förening">
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {missingTable && (
        <div style={{ background: "#FFF7E6", border: "1px solid #F1D9A0", borderRadius: 10, padding: "12px 16px", fontSize: 14, color: "#7A4B00" }}>
          Förfrågningarna är inte aktiverade ännu. SQL-filen <strong>tvattstuga-kod.sql</strong> behöver köras en gång i Supabase.
        </div>
      )}
      {q.error && !missingTable && <div style={{ color: "#B91C1C", fontSize: 14 }}>Kunde inte hämta förfrågningarna: {(q.error as Error).message}</div>}

      {stuck > 0 && (
        <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 10, padding: "12px 16px", fontSize: 14.5, color: "#991B1B", lineHeight: 1.5 }}>
          <strong>{stuck === 1 ? "1 förfrågan" : `${stuck} förfrågningar`} där systemet inte kunde skicka koden.</strong> Du behöver skicka den själv.
        </div>
      )}
      {open.length > 0 && longest >= 4 && stuck === 0 && (
        <div style={{ background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 10, padding: "12px 16px", fontSize: 14.5, color: "#92400E" }}>
          Någon har väntat på sin kod i {longest} dygn.
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ fontSize: 14, color: MUTED }}>
          {open.length === 0 ? "Inga förfrågningar väntar." : `${open.length} ${open.length === 1 ? "förfrågan väntar" : "förfrågningar väntar"}.`}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {all.length > 3 && <input className="tk-input" style={{ width: 220 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Sök namn eller lägenhet" aria-label="Sök" />}
          <a className="tk-btn" href={BOKATVATTID_URL} target="_blank" rel="noopener noreferrer">Öppna Bokatvättid</a>
          <button type="button" className="tk-btn" onClick={copyLink} disabled={!activeProperty}>Kopiera länk till förfrågan</button>
        </div>
      </div>

      {q.isLoading && <div style={{ color: MUTED }}>Hämtar…</div>}
      <div style={{ display: "grid", gap: 10 }}>
        {open.filter(matches).map((r) => (
          <RequestCard key={r.id} r={r} isAdmin={isAdmin} update={update} remove={remove} refresh={refresh} profileName={profile?.full_name ?? null} />
        ))}
      </div>

      {closed.length > 0 && (
        <>
          <button type="button" className="tk-btn" style={{ justifySelf: "start" }} onClick={() => setShowDone((v) => !v)}>
            {showDone ? "Dölj" : "Visa"} skickade och avvisade ({closed.length})
          </button>
          {showDone && (
            <div style={{ display: "grid", gap: 10 }}>
              {closed.filter(matches).map((r) => (
                <RequestCard key={r.id} r={r} isAdmin={isAdmin} update={update} remove={remove} refresh={refresh} profileName={profile?.full_name ?? null} />
              ))}
            </div>
          )}
        </>
      )}

      <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
        Länken "Kopiera länk till förfrågan" lägger du på föreningens hemsida. Du får ett mejl och en notis i klockan för varje ny förfrågan, och ett mejl när koden är skickad eller om systemet inte kunde skicka den. Pinkoden sparas inte i plattformen, den finns bara i mejlet till den boende.
      </div>
    </div>
  );
}

type RowProps = {
  r: Req;
  isAdmin: boolean;
  update: { mutate: (v: { id: string; patch: Record<string, unknown> }) => void; isPending: boolean };
  remove: { mutate: (id: string) => void; isPending: boolean };
  refresh: () => void;
  profileName: string | null;
};

function RequestCard({ r, isAdmin, update, remove, refresh, profileName }: RowProps) {
  const [pin, setPin] = useState("");
  const [sending, setSending] = useState(false);
  const st = STATUS_STYLE[r.status];
  const w = waited(r);
  const key = lookupKey(r);
  const isOpen = r.status === "ny" || r.status === "fastnat";

  // Pinen ska inte ligga kvar i fältet när raden byter status.
  useEffect(() => {
    if (!isOpen) setPin("");
  }, [isOpen]);

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(key);
      toast.success(`${key} är kopierat — klistra in i sökrutan i Bokatvättid`);
    } catch {
      window.prompt("Sök på:", key);
    }
  };

  const send = async () => {
    const clean = pin.replace(/\s+/g, "");
    if (!/^[0-9A-Za-z]{3,12}$/.test(clean)) return void toast.error("Skriv in pinkoden från Bokatvättid först.");
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-tvattstuga", { body: { action: "send_code", id: r.id, pin: clean } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Koden kunde inte skickas.");
      toast.success(`Koden mejlades till ${r.email}`);
      if (data.marked === false) toast.warning("Koden gick iväg, men raden kunde inte markeras som skickad. Uppdatera sidan och markera den själv.");
      setPin("");
    } catch (e) {
      toast.error(await errorMessage(e, "Koden kunde inte skickas."));
    } finally {
      setSending(false);
      refresh();
    }
  };

  const reject = async () => {
    if (await confirmDialog({ title: "Avvisa förfrågan?", message: `${r.name} (lgh ${key}) får inget mejl. Raden ligger kvar som avvisad.`, confirmLabel: "Avvisa", danger: true })) {
      update.mutate({ id: r.id, patch: { status: "avvisad" } });
    }
  };
  const del = async () => {
    if (await confirmDialog({ title: "Radera helt?", message: `${r.name} (${r.reference}) raderas för alltid. Det går inte att ångra.`, confirmLabel: "Radera", danger: true })) {
      remove.mutate(r.id);
    }
  };
  const manual = async () => {
    if (await confirmDialog({ title: "Markera som skickad?", message: `Bekräfta att du har skickat koden till ${r.name} (${r.email}) på annat sätt.`, confirmLabel: "Ja, den är skickad" })) {
      update.mutate({ id: r.id, patch: { status: "skickad", sent_at: new Date().toISOString(), sent_by_name: profileName, send_error: null } });
    }
  };

  return (
    <div style={{ background: "#fff", border: `1px solid ${r.status === "fastnat" ? "#FCA5A5" : LINE}`, borderRadius: 14, padding: "14px 16px", display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <strong style={{ fontSize: 16, color: INK }}>{r.name}</strong>
            <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: st.bg, color: st.fg }}>{STATUS_LABEL[r.status]}</span>
          </div>
          <div style={{ fontSize: 13.5, color: MUTED, marginTop: 3, lineHeight: 1.55 }}>
            Sök i Bokatvättid: <strong style={{ color: INK, fontSize: 15 }}>{key}</strong> · {r.reference} · {fmtDate(r.created_at)}
            {isOpen && <> · <span style={{ color: w.color, fontWeight: 600 }}>{w.text}</span></>}
          </div>
          {isOpen && r.match_result && (
            <div style={{ marginTop: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: MATCH[r.match_result].bg, color: MATCH[r.match_result].fg }}>{MATCH[r.match_result].text}</span>
            </div>
          )}
          <div style={{ fontSize: 13.5, marginTop: 3 }}>
            <a href={`mailto:${r.email}`} style={{ color: GREEN }}>{r.email}</a>
            {r.phone ? <> · <a href={`tel:${r.phone}`} style={{ color: GREEN }}>{r.phone}</a></> : null}
          </div>
          {r.status === "skickad" && r.sent_at && (
            <div style={{ fontSize: 13, color: "#166534", marginTop: 4 }}>
              Koden skickades {fmtDate(r.sent_at)}{r.sent_by_name ? ` av ${r.sent_by_name}` : ""}.
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {isOpen && <button type="button" className="tk-btn" onClick={copyKey}>Kopiera {key}</button>}
          {isOpen && <a className="tk-btn" href={BOKATVATTID_URL} target="_blank" rel="noopener noreferrer">Öppna Bokatvättid</a>}
          {r.status === "avvisad" && <button type="button" className="tk-btn" disabled={update.isPending} onClick={() => update.mutate({ id: r.id, patch: { status: "ny" } })}>Återställ</button>}
          {isAdmin && <button type="button" className="tk-btn tk-danger" disabled={remove.isPending} onClick={del}>Radera</button>}
        </div>
      </div>

      {r.status === "fastnat" && (
        <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 10, padding: "10px 12px", fontSize: 14, color: "#991B1B", lineHeight: 1.5 }}>
          Systemet kunde inte mejla koden till {r.email}. Skicka den själv, eller försök igen nedan, och tryck sedan "Jag har skickat den".
          <div style={{ marginTop: 8 }}>
            <button type="button" className="tk-btn" disabled={update.isPending} onClick={manual}>Jag har skickat den</button>
          </div>
        </div>
      )}

      {isOpen && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            className="tk-input"
            style={{ width: 200 }}
            inputMode="numeric"
            autoComplete="off"
            placeholder="Pin från Bokatvättid"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
            aria-label={`Pinkod för ${key}`}
          />
          <button type="button" className="tk-btn tk-primary" disabled={sending || !pin.trim()} onClick={send}>{sending ? "Skickar…" : "Skicka koden"}</button>
          {r.status === "ny" && <button type="button" className="tk-btn tk-danger" disabled={update.isPending} onClick={reject}>Avvisa</button>}
        </div>
      )}
    </div>
  );
}
