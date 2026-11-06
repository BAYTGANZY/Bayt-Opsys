import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { COLORS } from "@/components/property-tabs";

export const Route = createFileRoute("/_authenticated/hemsidechatt")({
  head: () => ({ meta: [{ title: "Hemsidechatt — BAYT" }] }),
  component: HemsideChatt,
});

const INK = "#0D2B1E";
const GREEN = "#3D8A30";
const MUTED = "#6B7280";
const LINE = "#E3E7E2";
const GOLD = "#E8C464";
const HOT = "#C2334D";

type Conv = {
  id: string;
  status: "open" | "needs_human" | "closed";
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  ticket_id: string | null;
  created_at: string;
  last_message_at: string;
};
type Msg = { id: string; conversation_id: string; sender: "visitor" | "ai" | "staff"; body: string; created_at: string };
type KB = { id: string; title: string; body: string; active: boolean; sort_order: number };

const STATUS_LABEL: Record<Conv["status"], string> = { open: "Öppen", needs_human: "Behöver svar", closed: "Avslutad" };
const SENDER_LABEL: Record<Msg["sender"], string> = { visitor: "Besökare", ai: "AI-assistent", staff: "Personal" };

const STYLES = `
  .fp-btn { height: 36px; padding: 0 14px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; background: #fff; color: #0D2B1E; border: 1px solid #E3E7E2; }
  .fp-btn:hover { border-color: #3D8A30; }
  .fp-btn.fp-primary { background: #3D8A30; border-color: #3D8A30; color: #fff; }
  .fp-btn.fp-danger { color: #B91C1C; border-color: #F1C0C0; }
  .fp-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .fp-label { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #6B7280; margin-bottom: 6px; display: block; }
  .fp-input, .fp-textarea { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px; font-size: 15px; font-family: inherit; background: #fff; color: #0D2B1E; border: 1px solid #E3E7E2; }
  .fp-textarea { resize: vertical; line-height: 1.5; }
`;

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

type Tab = "samtal" | "kunskap" | "installningar";
type Filter = "alla" | "behover" | "oppna" | "avslutade";

function HemsideChatt() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [tab, setTab] = useState<Tab>("samtal");

  if (profile && !isAdmin) {
    return <div style={{ padding: 32, color: COLORS.secondary }}>Du har inte behörighet till den här sidan.</div>;
  }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Inter, system-ui, sans-serif" }}>
      <style>{STYLES}</style>
      <div>
        <h1 style={{ fontFamily: "Outfit, Inter, system-ui, sans-serif", fontSize: 28, fontWeight: 800, color: INK, margin: 0 }}>Hemsidechatt</h1>
        <div style={{ fontSize: 14, color: MUTED, marginTop: 4 }}>Samtal från besökare på hemsidan. De svar du skriver här visas för besökaren i chatten.</div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {([["samtal", "Samtal"], ["kunskap", "Kunskapsbas"], ["installningar", "Inställningar"]] as Array<[Tab, string]>).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} style={{ height: 34, padding: "0 14px", borderRadius: 999, font: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1px solid ${tab === k ? INK : LINE}`, background: tab === k ? INK : "#fff", color: tab === k ? "#fff" : MUTED }}>
            {l}
          </button>
        ))}
      </div>
      {tab === "samtal" && isAdmin && <Conversations />}
      {tab === "kunskap" && isAdmin && <Knowledge />}
      {tab === "installningar" && isAdmin && <SettingsPanel />}
    </div>
  );
}

function Conversations() {
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("alla");
  const [selId, setSelId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  const convsQ = useQuery({
    queryKey: ["wc-convs"],
    refetchInterval: 8000,
    queryFn: async () => {
      const { data, error } = await supabase.from("webchat_conversations").select("*").order("last_message_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as Conv[];
    },
  });
  const convs = convsQ.data ?? [];
  const needs = convs.filter((c) => c.status === "needs_human").length;
  const shown = useMemo(
    () => convs.filter((c) => (filter === "alla" ? true : filter === "behover" ? c.status === "needs_human" : filter === "oppna" ? c.status === "open" : c.status === "closed")),
    [convs, filter],
  );
  const sel = convs.find((c) => c.id === selId) ?? null;

  const msgsQ = useQuery({
    queryKey: ["wc-msgs", selId],
    enabled: !!selId,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase.from("webchat_messages").select("*").eq("conversation_id", selId!).order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Msg[];
    },
  });
  const msgs = msgsQ.data ?? [];
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length, selId]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["wc-convs"] });
    void qc.invalidateQueries({ queryKey: ["wc-msgs", selId] });
  };

  const setStatus = useMutation({
    mutationFn: async (status: Conv["status"]) => {
      const { error } = await supabase.from("webchat_conversations").update({ status }).eq("id", selId!);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const send = useMutation({
    mutationFn: async () => {
      const text = reply.trim();
      if (!text) throw new Error("Skriv ett svar först.");
      const { error } = await supabase.from("webchat_messages").insert({ conversation_id: selId, sender: "staff", body: text });
      if (error) throw error;
      const { error: e2 } = await supabase.from("webchat_conversations").update({ last_message_at: new Date().toISOString(), status: "needs_human" }).eq("id", selId!);
      if (e2) throw e2;
    },
    onSuccess: () => { setReply(""); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("webchat_conversations").delete().eq("id", selId!);
      if (error) throw error;
    },
    onSuccess: () => { setSelId(null); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const showList = !isMobile || !sel;
  const showThread = !isMobile || !!sel;

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "340px 1fr", gap: 14, alignItems: "start" }}>
      {showList && (
        <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, overflow: "hidden" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: 10, borderBottom: `1px solid ${LINE}` }}>
            {([["alla", "Alla"], ["behover", `Behöver svar (${needs})`], ["oppna", "Öppna"], ["avslutade", "Avslutade"]] as Array<[Filter, string]>).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} style={{ height: 30, padding: "0 10px", borderRadius: 999, font: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${filter === k ? INK : LINE}`, background: filter === k ? INK : "#fff", color: filter === k ? "#fff" : MUTED }}>
                {l}
              </button>
            ))}
          </div>
          {convsQ.isLoading && <div style={{ padding: 14, color: MUTED }}>Hämtar…</div>}
          {convsQ.error && <div style={{ padding: 14, color: "#B91C1C", fontSize: 14 }}>Kunde inte hämta: {(convsQ.error as Error).message}</div>}
          {!convsQ.isLoading && shown.length === 0 && <div style={{ padding: 14, color: MUTED, fontSize: 14 }}>Inga samtal.</div>}
          {shown.map((c) => (
            <button key={c.id} type="button" onClick={() => setSelId(c.id)} style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 14px", border: 0, borderBottom: `1px solid ${LINE}`, background: c.id === selId ? "#F1F5EF" : "#fff", cursor: "pointer", font: "inherit" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontWeight: 700, color: INK }}>{c.contact_name || "Okänd besökare"}</span>
                <span style={{ fontSize: 12, color: MUTED }}>{fmt(c.last_message_at)}</span>
              </div>
              <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: "2px 9px", background: c.status === "needs_human" ? "#FDE2E7" : c.status === "closed" ? "#EEF0EE" : "rgba(92,184,74,0.14)", color: c.status === "needs_human" ? "#8B1A2B" : c.status === "closed" ? MUTED : "#2E6B24" }}>{STATUS_LABEL[c.status]}</span>
                {c.ticket_id && <span style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: "2px 9px", background: GOLD, color: INK }}>Felanmälan skapad</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {showThread && (
        <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, minHeight: 420, display: "flex", flexDirection: "column" }}>
          {!sel && <div style={{ margin: "auto", color: MUTED, padding: 30 }}>Välj ett samtal</div>}
          {sel && (
            <>
              <div style={{ padding: "12px 14px", borderBottom: `1px solid ${LINE}`, display: "grid", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <div>
                    {isMobile && <button type="button" className="fp-btn" style={{ height: 30, marginRight: 8 }} onClick={() => setSelId(null)}>← Tillbaka</button>}
                    <strong style={{ color: INK }}>{sel.contact_name || "Okänd besökare"}</strong>
                    <span style={{ fontSize: 13, color: MUTED }}> · {STATUS_LABEL[sel.status]}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {sel.status !== "closed" ? (
                      <button type="button" className="fp-btn" onClick={() => setStatus.mutate("closed")}>Avsluta</button>
                    ) : (
                      <button type="button" className="fp-btn" onClick={() => setStatus.mutate("open")}>Öppna igen</button>
                    )}
                    <button type="button" className="fp-btn fp-danger" onClick={() => { if (window.confirm("Ta bort hela samtalet? Det går inte att ångra.")) remove.mutate(); }}>Ta bort</button>
                  </div>
                </div>
                <div style={{ fontSize: 13.5, color: "#374151" }}>
                  {[sel.contact_phone, sel.contact_email].filter(Boolean).join(" · ") || "Inga kontaktuppgifter angivna"}
                  {sel.ticket_id ? " · Felanmälan skapad i BAYT" : ""}
                </div>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10, maxHeight: 460 }}>
                {msgs.map((m) => {
                  const mine = m.sender === "staff";
                  return (
                    <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "80%" }}>
                      <div style={{ fontSize: 11, color: MUTED, margin: "0 4px 2px", textAlign: mine ? "right" : "left" }}>{SENDER_LABEL[m.sender]} · {fmt(m.created_at)}</div>
                      <div style={{ padding: "9px 12px", borderRadius: 14, fontSize: 14.5, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere", background: mine ? GREEN : m.sender === "ai" ? "#F1F5EF" : "#fff", color: mine ? "#fff" : INK, border: m.sender === "visitor" ? `1px solid ${LINE}` : "none" }}>{m.body}</div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
              <div style={{ padding: 10, borderTop: `1px solid ${LINE}`, display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12, color: MUTED }}>När du svarar tystas AI:n i det här samtalet. Besökaren ser ditt svar inom några sekunder.</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <textarea className="fp-textarea" rows={2} value={reply} placeholder="Skriv ett svar…" onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send.mutate(); } }} />
                  <button type="button" className="fp-btn fp-primary" style={{ height: "auto", minHeight: 36 }} disabled={send.isPending || !reply.trim()} onClick={() => send.mutate()}>Skicka</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Knowledge() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["wc-kb"],
    queryFn: async () => {
      const { data, error } = await supabase.from("webchat_knowledge").select("*").order("sort_order").order("created_at");
      if (error) throw error;
      return (data ?? []) as KB[];
    },
  });
  const items = q.data ?? [];
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const refresh = () => void qc.invalidateQueries({ queryKey: ["wc-kb"] });

  const add = useMutation({
    mutationFn: async () => {
      if (!title.trim() || !body.trim()) throw new Error("Ange rubrik och text.");
      const { error } = await supabase.from("webchat_knowledge").insert({ title: title.trim(), body: body.trim() });
      if (error) throw error;
    },
    onSuccess: () => { setTitle(""); setBody(""); refresh(); toast.success("Sparat", { style: { background: GREEN, color: "#fff" } }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const patch = useMutation({
    mutationFn: async (v: { id: string; fields: Partial<KB> }) => {
      const { error } = await supabase.from("webchat_knowledge").update(v.fields).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("webchat_knowledge").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 820 }}>
      <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.6 }}>
        AI-assistenten svarar bara utifrån det som står här. Skriv korta och tydliga fakta: ordningsregler, öppettider, vem man kontaktar, tvättstugan, sopsortering med mera. Hittar den inget svar lämnar den över till personalen.
      </div>
      <div style={{ background: "#fff", border: `2px solid ${GOLD}`, borderRadius: 14, padding: 16, display: "grid", gap: 10 }}>
        <input className="fp-input" placeholder="Rubrik, till exempel Tvättstuga" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="fp-textarea" rows={4} placeholder="Text som assistenten får använda" value={body} onChange={(e) => setBody(e.target.value)} />
        <div><button type="button" className="fp-btn fp-primary" disabled={add.isPending} onClick={() => add.mutate()}>Lägg till</button></div>
      </div>
      {q.isLoading && <div style={{ color: MUTED }}>Hämtar…</div>}
      {items.map((k) => (
        <KbRow key={k.id} k={k} onSave={(fields) => patch.mutate({ id: k.id, fields })} onDelete={() => { if (window.confirm(`Ta bort "${k.title}"?`)) del.mutate(k.id); }} />
      ))}
    </div>
  );
}

function KbRow({ k, onSave, onDelete }: { k: KB; onSave: (f: Partial<KB>) => void; onDelete: () => void }) {
  const [t, setT] = useState(k.title);
  const [b, setB] = useState(k.body);
  const dirty = t !== k.title || b !== k.body;
  return (
    <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: 14, display: "grid", gap: 8, opacity: k.active ? 1 : 0.6 }}>
      <input className="fp-input" value={t} onChange={(e) => setT(e.target.value)} />
      <textarea className="fp-textarea" rows={3} value={b} onChange={(e) => setB(e.target.value)} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
          <input type="checkbox" checked={k.active} onChange={(e) => onSave({ active: e.target.checked })} /> Aktiv
        </label>
        <button type="button" className="fp-btn fp-primary" disabled={!dirty} onClick={() => onSave({ title: t.trim(), body: b.trim() })}>Spara ändring</button>
        <button type="button" className="fp-btn fp-danger" onClick={onDelete}>Ta bort</button>
      </div>
    </div>
  );
}

function SettingsPanel() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["wc-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("webchat_settings").select("key,value");
      if (error) throw error;
      const m: Record<string, string> = {};
      (data ?? []).forEach((r) => (m[r.key] = r.value));
      return m;
    },
  });
  const [f, setF] = useState({ jour_phone: "", opening_hours: "", ai_monthly_limit: "" });
  const loaded = useRef(false);
  useEffect(() => {
    if (q.data && !loaded.current) {
      loaded.current = true;
      setF({ jour_phone: q.data.jour_phone ?? "", opening_hours: q.data.opening_hours ?? "", ai_monthly_limit: q.data.ai_monthly_limit ?? "3000" });
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const n = parseInt(f.ai_monthly_limit, 10);
      if (!Number.isFinite(n) || n < 0) throw new Error("Taket för AI-meddelanden måste vara ett tal.");
      const rows = [
        { key: "jour_phone", value: f.jour_phone.trim() },
        { key: "opening_hours", value: f.opening_hours.trim() },
        { key: "ai_monthly_limit", value: String(n) },
      ];
      const { error } = await supabase.from("webchat_settings").upsert(rows, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["wc-settings"] }); toast.success("Sparat", { style: { background: GREEN, color: "#fff" } }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, display: "grid", gap: 14, maxWidth: 560 }}>
      <div>
        <label className="fp-label">Journummer</label>
        <input className="fp-input" value={f.jour_phone} onChange={(e) => setF({ ...f, jour_phone: e.target.value })} />
      </div>
      <div>
        <label className="fp-label">Öppettider (visas i chatten)</label>
        <input className="fp-input" value={f.opening_hours} onChange={(e) => setF({ ...f, opening_hours: e.target.value })} />
      </div>
      <div>
        <label className="fp-label">Tak för AI-svar per månad</label>
        <input className="fp-input" value={f.ai_monthly_limit} onChange={(e) => setF({ ...f, ai_monthly_limit: e.target.value })} />
      </div>
      <div style={{ fontSize: 12.5, color: MUTED }}>Fastighet för felanmälningar: BRF RTB. Ändras i databasen (webchat_settings, property_id).</div>
      <div><button type="button" className="fp-btn fp-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Sparar…" : "Spara"}</button></div>
    </div>
  );
}
