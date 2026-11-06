import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/chat-widget")({
  head: () => ({ meta: [{ title: "Chatt — BAYT" }, { name: "robots", content: "noindex" }] }),
  component: ChatWidget,
});

const API = "https://tixxacthedwaoqtjokdr.supabase.co/functions/v1/chat-intake";
const KEY = "bayt.chat.token";
const INK = "#0D2B1E";
const GREEN = "#3D8A30";
const LINE = "#E3E7E2";
const MUTED = "#6B7280";
const GOLD = "#E8C464";

type Msg = { sender: "visitor" | "ai" | "staff"; body: string; created_at: string };
type State = { status: string; jour_phone: string; opening_hours: string; messages: Msg[] };

function makeToken(): string {
  try {
    const t = window.localStorage.getItem(KEY);
    if (t && /^[a-f0-9]{64}$/.test(t)) return t;
  } catch {
    /* ignoreras */
  }
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  const t = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  try {
    window.localStorage.setItem(KEY, t);
  } catch {
    /* ignoreras */
  }
  return t;
}

async function call(body: Record<string, unknown>): Promise<State & { error?: string }> {
  const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error ?? "fel"), { status: r.status });
  return j;
}

const field: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 8, fontSize: 14,
  fontFamily: "inherit", border: `1px solid ${LINE}`, background: "#fff", color: INK,
};

function ChatWidget() {
  const [token] = useState(makeToken);
  const [st, setSt] = useState<State>({ status: "open", jour_phone: "", opening_hours: "", messages: [] });
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [mode, setMode] = useState<"chat" | "ticket">("chat");
  const [tk, setTk] = useState({ apartment_number: "", trappa: "", name: "", phone: "", email: "", description: "" });
  const endRef = useRef<HTMLDivElement | null>(null);

  const poll = useCallback(async () => {
    try {
      setSt(await call({ action: "poll", token }));
    } catch {
      /* tyst */
    }
  }, [token]);

  useEffect(() => {
    void poll();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void poll();
    }, 6000);
    return () => window.clearInterval(id);
  }, [poll]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [st.messages.length, mode]);

  const errText = (e: unknown) => {
    const s = (e as { status?: number })?.status;
    if (s === 429) return "Du skickar för snabbt eller för många meddelanden. Vänta en stund eller ring jour.";
    if ((e as Error)?.message === "missing_fields") return "Fyll i alla fält (lägenhet, trappa, namn, telefon, e-post och beskrivning).";
    return "Något gick fel. Försök igen, eller ring.";
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setErr("");
    setSt((s) => ({ ...s, messages: [...s.messages, { sender: "visitor", body: text, created_at: new Date().toISOString() }] }));
    setInput("");
    try {
      setSt(await call({ action: "send", token, message: text }));
    } catch (e) {
      setErr(errText(e));
      void poll();
    } finally {
      setSending(false);
    }
  };

  const sendTicket = async () => {
    if (sending) return;
    setSending(true);
    setErr("");
    try {
      setSt(await call({ action: "ticket", token, ticket: tk }));
      setMode("chat");
      setTk({ apartment_number: "", trappa: "", name: "", phone: "", email: "", description: "" });
    } catch (e) {
      setErr(errText(e));
    } finally {
      setSending(false);
    }
  };

  const tel = st.jour_phone.replace(/[^\d+]/g, "");
  const close = () => window.parent.postMessage({ type: "bayt-chat-close" }, "*");
  const setK = (k: keyof typeof tk) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setTk({ ...tk, [k]: e.target.value });

  const bubble = (m: Msg, i: number) => {
    const mine = m.sender === "visitor";
    return (
      <div key={i} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "85%" }}>
        {!mine && (
          <div style={{ fontSize: 11, color: MUTED, margin: "0 4px 2px" }}>{m.sender === "ai" ? "AI-assistent" : "Personal"}</div>
        )}
        <div style={{
          padding: "9px 12px", borderRadius: 14, fontSize: 14.5, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere",
          background: mine ? GREEN : m.sender === "staff" ? "rgba(232,196,100,0.28)" : "#F1F5EF",
          color: mine ? "#fff" : INK,
        }}>{m.body}</div>
      </div>
    );
  };

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "#fff", fontFamily: "Inter, system-ui, sans-serif", color: INK }}>
      <div style={{ background: INK, color: "#fff", padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, borderBottom: `3px solid ${GOLD}` }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>BAYT</div>
          <div style={{ fontSize: 12, color: "#c9d8c3" }}>Chatt med föreningen{st.opening_hours ? ` · ${st.opening_hours}` : ""}</div>
        </div>
        {tel && (
          <a href={`tel:${tel}`} target="_top" style={{ background: GOLD, color: INK, fontWeight: 800, fontSize: 13, borderRadius: 999, padding: "7px 12px", textDecoration: "none", whiteSpace: "nowrap" }}>
            Ring jour
          </a>
        )}
        <button type="button" onClick={close} aria-label="Stäng" style={{ background: "transparent", border: 0, color: "#fff", fontSize: 24, lineHeight: 1, cursor: "pointer" }}>×</button>
      </div>

      {mode === "chat" ? (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 12, color: MUTED, background: "#F7F9F6", border: `1px solid ${LINE}`, borderRadius: 10, padding: "8px 10px", lineHeight: 1.5 }}>
              Du chattar med en AI-assistent och personal. Samtalet sparas i 90 dagar. Skriv inga känsliga uppgifter. Vid akuta fel, ring jour.
            </div>
            {st.messages.length === 0 && bubble({ sender: "ai", body: "Hej! Jag är BAYT:s AI-assistent. Fråga om ordningsregler, öppettider eller felanmälan. Vill du anmäla ett fel, tryck på Anmäl fel.", created_at: "" }, -1)}
            {st.messages.map(bubble)}
            {st.status === "needs_human" && (
              <div style={{ fontSize: 12.5, color: MUTED, textAlign: "center" }}>Personalen har fått ärendet och svarar så snart de kan.</div>
            )}
            <div ref={endRef} />
          </div>
          {err && <div style={{ color: "#B91C1C", fontSize: 13, padding: "0 14px 6px" }}>{err}</div>}
          <div style={{ padding: 10, borderTop: `1px solid ${LINE}`, display: "grid", gap: 8 }}>
            <button type="button" onClick={() => { setErr(""); setMode("ticket"); }} style={{ height: 36, borderRadius: 8, border: `1px solid ${GREEN}`, background: "#fff", color: GREEN, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
              Anmäl fel
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{ ...field, flex: 1 }}
                value={input}
                maxLength={1000}
                placeholder="Skriv ett meddelande…"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
              />
              <button type="button" onClick={() => void send()} disabled={sending || !input.trim()} style={{ padding: "0 16px", borderRadius: 8, border: 0, background: GREEN, color: "#fff", fontWeight: 700, cursor: "pointer", opacity: sending || !input.trim() ? 0.6 : 1, fontFamily: "inherit" }}>
                Skicka
              </button>
            </div>
          </div>
        </>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "grid", gap: 10, alignContent: "start" }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Anmäl fel</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input style={field} placeholder="Lägenhet (nr)" inputMode="numeric" value={tk.apartment_number} onChange={setK("apartment_number")} />
            <input style={field} placeholder="Trappa (nr)" inputMode="numeric" value={tk.trappa} onChange={setK("trappa")} />
          </div>
          <input style={field} placeholder="Ditt namn" value={tk.name} onChange={setK("name")} />
          <input style={field} placeholder="Telefon" inputMode="tel" value={tk.phone} onChange={setK("phone")} />
          <input style={field} placeholder="E-post" inputMode="email" value={tk.email} onChange={setK("email")} />
          <textarea style={{ ...field, resize: "vertical" }} rows={4} maxLength={1500} placeholder="Vad är fel? Var och sedan när?" value={tk.description} onChange={setK("description")} />
          {err && <div style={{ color: "#B91C1C", fontSize: 13 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => void sendTicket()} disabled={sending} style={{ height: 40, padding: "0 18px", borderRadius: 8, border: 0, background: GREEN, color: "#fff", fontWeight: 700, cursor: "pointer", opacity: sending ? 0.6 : 1, fontFamily: "inherit" }}>
              {sending ? "Skickar…" : "Skicka felanmälan"}
            </button>
            <button type="button" onClick={() => { setErr(""); setMode("chat"); }} style={{ height: 40, padding: "0 16px", borderRadius: 8, border: `1px solid ${LINE}`, background: "#fff", color: INK, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Tillbaka
            </button>
          </div>
          <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>Dina uppgifter används bara för att hantera felanmälan.</div>
        </div>
      )}
    </div>
  );
}
