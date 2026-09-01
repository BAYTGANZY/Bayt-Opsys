import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { deriveIssueStatus, PRIORITY_DISPLAY_LABEL } from "@/lib/issue-tokens";
import { DerivedStatusBadge } from "@/components/DerivedStatusBadge";

/**
 * /mina-arenden — entreprenörens motsvarighet till boendens /arendestatus.
 *
 * Publik och utan inloggning i portalen: en entreprenör skriver den e-post som
 * står på deras kontaktpost — samma adress som tilldelningsmejlen går till —
 * får en sexsiffrig kod i mejlen, och ser sedan sina felanmälningar nyast
 * först. En rad fälls ut till hela ärendet, och därifrån öppnas och avslutas
 * det.
 *
 * VARFÖR EN KOD OCH INTE BARA ADRESSEN, som på /arendestatus
 * Den boendes sida bara läser, och bara den boendes egna rader. Den här sidan
 * *skriver* — den flyttar ett ärendes livscykel — och visar anmälarens namn och
 * telefonnummer. En entreprenörs e-postadress står på varje faktura och
 * visitkort och är alltså ingen hemlighet; koden är det som bevisar att den som
 * skriver adressen också läser den.
 *
 * ALL TRAFIK GÅR GENOM EDGE-FUNKTIONEN entreprenor-portal, aldrig genom
 * supabase-klienten direkt. `issues` har RLS på utan anon-policy, och det ska
 * den fortsätta ha: en publik läspolicy hade öppnat hela beståndets ärenden för
 * vem som helst med anon-nyckeln. Funktionen kör med service role och
 * kontrollerar själv, per anrop, att ärendet är tilldelat sessionens kontakt.
 *
 * Statusskrivningarna speglar OppnaArendeButton/AvslutaArendeButton: samma
 * statusvärden, samma rad i issue_status_history, samma loggbokspost. De
 * knapparna går inte att återanvända här — de skriver genom den inloggade
 * klienten och läser roll ur useAuth, och här finns ingen inloggning alls.
 */
export const Route = createFileRoute("/mina-arenden")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Mina ärenden — BAYT" },
      { name: "description", content: "Se och hantera de felanmälningar du är tilldelad." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MinaArendenPage,
});

const baytLogo = `${import.meta.env.BASE_URL}assets/bayt-logo.png`;

const C = {
  border: "#E5E7EB",
  hairline: "#F1F3F5",
  primary: "#3D8A30",
  accent: "#5CB84A",
  dark: "#0D2B1E",
  secondary: "#6B7280",
  muted: "#8A94A0",
  text: "#1F2A37",
  error: "#DC2626",
  card: "#ffffff",
  wash: "#F9FAFB",
  accentBg: "#F0F7EE",
};

const HEADING_FONT = "Outfit, Inter, system-ui, sans-serif";

// ---------------------------------------------------------------------------
// Sessionen i webbläsaren
// ---------------------------------------------------------------------------
const SESSION_KEY = "bayt.entreprenor.session";

type StoredSession = {
  token: string;
  email: string;
  name: string | null;
  expiresAt: string;
};

// localStorage kastar i privat läge och när webbläsaren blockerar lagring, och
// det får inte ta ner sidan — en entreprenör som inte kan bli ihågkommen ska
// bara få skriva koden igen.
function readSession(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.token) return null;
    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(session: StoredSession): void {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Sessionen lever kvar i minnet den här sidvisningen; nästa besök får logga in igen.
  }
}

function clearStoredSession(): void {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* se ovan */
  }
}

// ---------------------------------------------------------------------------
// Anrop mot edge-funktionen
// ---------------------------------------------------------------------------
class PortalError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * functions.invoke lägger INTE svarskroppen i `data` när statuskoden är 4xx/5xx
 * — den hamnar i `error.context`, som är själva Response-objektet. Utan det här
 * uppackandet skulle varje avvisat anrop visa supabase-js generiska
 * "Edge Function returned a non-2xx status code" i stället för funktionens
 * svenska förklaring, och 401 gick inte att skilja från 500.
 */
async function callPortal<T>(payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("entreprenor-portal", { body: payload });

  if (error) {
    const res = (error as { context?: Response }).context;
    if (res && typeof res.json === "function") {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new PortalError(body?.error ?? error.message, res.status);
    }
    throw new PortalError(error.message || "Något gick fel. Försök igen.", 0);
  }

  const asError = data as { error?: string } | null;
  if (asError?.error) throw new PortalError(asError.error, 400);
  return data as T;
}

// ---------------------------------------------------------------------------
// Typer
// ---------------------------------------------------------------------------
type PortalIssue = {
  id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  priority: string | null;
  status: string | null;
  lifecycle: "vilande" | "oppet" | "avslutat";
  deadline: string | null;
  created_at: string | null;
  trappa: string | null;
  property_id: string | null;
  property_name: string | null;
  apartment_label: string | null;
  object_label: string | null;
  reporter_name: string | null;
  reporter_phone: string | null;
  reporter_email: string | null;
  can_open: boolean;
  can_close: boolean;
};

type ListResponse = { issues: PortalIssue[]; name: string | null; email: string };

// ---------------------------------------------------------------------------
// Formatering
// ---------------------------------------------------------------------------
const dayFmt = new Intl.DateTimeFormat("sv-SE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const shortFmt = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", year: "numeric" });

/** "Måndag 27 juli 2026" — veckodag först, som ute på fältet. */
function formatDay(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return null;
  const s = dayFmt.format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatShort(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? null : shortFmt.format(d);
}

// ---------------------------------------------------------------------------
// Delade stilar
// ---------------------------------------------------------------------------
const shellStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "radial-gradient(ellipse at top, #15332c 0%, #0e1f1a 70%)",
  display: "flex",
  justifyContent: "center",
  padding: 16,
  fontFamily: "Inter, system-ui, sans-serif",
};

const cardStyle: React.CSSProperties = {
  background: C.card,
  borderRadius: 12,
  padding: 24,
  width: "100%",
  boxSizing: "border-box",
  display: "grid",
  gap: 16,
  minWidth: 0,
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  height: 44,
  padding: "0 12px",
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  fontSize: 15,
  color: C.text,
  background: C.card,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 500,
  color: C.secondary,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 6,
};

function primaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    height: 46,
    background: C.primary,
    color: "#ffffff",
    border: "none",
    borderRadius: 8,
    padding: "0 20px",
    fontSize: 15,
    fontWeight: 600,
    fontFamily: HEADING_FONT,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.7 : 1,
  };
}

function linkButtonStyle(): React.CSSProperties {
  return {
    background: "none",
    border: "none",
    padding: 0,
    color: C.primary,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    textDecoration: "underline",
    fontFamily: "inherit",
  };
}

// ---------------------------------------------------------------------------
// Inloggning: e-post → kod
// ---------------------------------------------------------------------------
function LoginCard({ onSignedIn }: { onSignedIn: (session: StoredSession) => void }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Ange din e-postadress.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      await callPortal({ action: "request_code", email: trimmed });
      setStep("code");
      setCode("");
      toast.success("Kod skickad — kolla din e-post.");
    } catch (err) {
      setError(err instanceof PortalError ? err.message : "Något gick fel. Försök igen om en stund.");
    } finally {
      setPending(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      setError("Koden är sex siffror.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const res = await callPortal<{ token: string; expires_at: string; name: string | null }>({
        action: "verify_code",
        email: email.trim(),
        code: digits,
      });
      onSignedIn({
        token: res.token,
        email: email.trim().toLowerCase(),
        name: res.name,
        expiresAt: res.expires_at,
      });
    } catch (err) {
      setError(err instanceof PortalError ? err.message : "Något gick fel. Försök igen om en stund.");
    } finally {
      setPending(false);
    }
  }

  if (step === "email") {
    return (
      <form onSubmit={requestCode} style={cardStyle}>
        <div style={{ minWidth: 0 }}>
          <label style={labelStyle} htmlFor="entreprenor-email">
            E-post
          </label>
          <input
            id="entreprenor-email"
            type="email"
            autoComplete="email"
            style={inputStyle}
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            placeholder="namn@firman.se"
            required
          />
          <div style={{ fontSize: 12, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
            Adressen som står på din kontaktpost hos BAYT — samma som ärendemejlen skickas till.
          </div>
        </div>
        {error && <div style={{ color: C.error, fontSize: 14 }}>{error}</div>}
        <button type="submit" disabled={pending} style={primaryButtonStyle(pending)}>
          {pending ? "Skickar…" : "Skicka kod"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={verifyCode} style={cardStyle}>
      <div style={{ minWidth: 0 }}>
        <label style={labelStyle} htmlFor="entreprenor-code">
          Kod
        </label>
        <input
          id="entreprenor-code"
          // inputMode numeric + one-time-code ger sifferknappsatsen på mobilen
          // och låter iOS/Android fylla i koden direkt från notisen.
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          style={{ ...inputStyle, letterSpacing: "0.5em", fontSize: 22, fontWeight: 600, textAlign: "center" }}
          value={code}
          onChange={(ev) => setCode(ev.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          autoFocus
        />
        <div style={{ fontSize: 13, color: C.secondary, marginTop: 10, lineHeight: 1.5 }}>
          Vi har skickat en sexsiffrig kod till <strong style={{ color: C.text }}>{email.trim()}</strong>.
          Den gäller i 15 minuter.
        </div>
      </div>
      {error && <div style={{ color: C.error, fontSize: 14 }}>{error}</div>}
      <button type="submit" disabled={pending} style={primaryButtonStyle(pending)}>
        {pending ? "Loggar in…" : "Logga in"}
      </button>
      <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
        <button type="button" style={linkButtonStyle()} disabled={pending} onClick={() => void requestCode()}>
          Skicka ny kod
        </button>
        <button
          type="button"
          style={linkButtonStyle()}
          onClick={() => {
            setStep("email");
            setError(null);
            setCode("");
          }}
        >
          Byt e-postadress
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Ärendelistan
// ---------------------------------------------------------------------------
function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "baseline", minWidth: 0 }}>
      <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", width: 92, flexShrink: 0 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: C.text, minWidth: 0, overflowWrap: "anywhere" }}>{children}</div>
    </div>
  );
}

function IssueRow({
  issue,
  expanded,
  onToggle,
  onAct,
  actingKind,
}: {
  issue: PortalIssue;
  expanded: boolean;
  onToggle: () => void;
  onAct: (kind: "open" | "close") => void;
  /** Vilken av de två knapparna som just nu väntar på svar, om någon. */
  actingKind: "open" | "close" | null;
}) {
  // Samma härledda status som resten av appen visar för ett ärende, genom
  // samma badge — en "Försenad" måste se likadan ut och betyda samma sak här
  // som inne i portalen, annars börjar de två ytorna säga emot varandra.
  const derived = deriveIssueStatus({
    status: issue.status,
    priority: issue.priority,
    created_at: issue.created_at,
    deadline: issue.deadline,
  });

  const metaParts = [issue.property_name, issue.apartment_label ?? issue.object_label, formatShort(issue.created_at)]
    .filter(Boolean)
    .join(" · ");

  const reporterBits = [
    issue.reporter_name,
    issue.reporter_phone,
    issue.reporter_email,
  ].filter((v) => v && String(v).trim());

  return (
    <div
      style={{
        background: C.card,
        borderRadius: 12,
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        overflow: "hidden",
        opacity: issue.lifecycle === "avslutat" ? 0.72 : 1,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          padding: "16px 18px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          cursor: "pointer",
          textAlign: "left",
          font: "inherit",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: HEADING_FONT,
              fontSize: 15,
              fontWeight: 600,
              color: C.text,
              overflowWrap: "anywhere",
            }}
          >
            {issue.title || "Felanmälan"}
          </div>
          {metaParts && (
            <div style={{ fontSize: 13, color: C.secondary, marginTop: 3, overflowWrap: "anywhere" }}>
              {metaParts}
            </div>
          )}
        </div>
        <DerivedStatusBadge status={derived} />
        <ChevronDown
          size={18}
          color={C.muted}
          style={{ flexShrink: 0, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 120ms" }}
        />
      </button>

      {expanded && (
        <div style={{ borderTop: `1px solid ${C.hairline}`, padding: "16px 18px 18px", display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 9 }}>
            <Detail label="Status">
              {derived.label}
              <span style={{ color: C.secondary }}> — {derived.reason}</span>
            </Detail>
            <Detail label="Fastighet">{issue.property_name ?? "—"}</Detail>
            {issue.apartment_label && <Detail label="Lägenhet">{issue.apartment_label}</Detail>}
            {!issue.apartment_label && issue.trappa && <Detail label="Trappa">{issue.trappa}</Detail>}
            {issue.object_label && <Detail label="Objekt">{issue.object_label}</Detail>}
            {issue.category && <Detail label="Kategori">{issue.category}</Detail>}
            <Detail label="Prioritet">
              {PRIORITY_DISPLAY_LABEL[issue.priority ?? ""] ?? issue.priority ?? "—"}
            </Detail>
            <Detail label="Tidsgräns">{formatDay(issue.deadline) ?? "Ingen satt"}</Detail>
            <Detail label="Anmäld">{formatDay(issue.created_at) ?? "—"}</Detail>
            {reporterBits.length > 0 && (
              <Detail label="Anmälare">
                <div style={{ display: "grid", gap: 2 }}>
                  {issue.reporter_name && <div>{issue.reporter_name}</div>}
                  {/* Klickbara på mobilen: den här sidan används stående utanför
                      en port, och att ringa anmälaren är nästa steg efter att ha
                      läst raden. */}
                  {issue.reporter_phone && (
                    <a href={`tel:${issue.reporter_phone}`} style={{ color: C.primary, fontWeight: 600 }}>
                      {issue.reporter_phone}
                    </a>
                  )}
                  {issue.reporter_email && (
                    <a href={`mailto:${issue.reporter_email}`} style={{ color: C.primary }}>
                      {issue.reporter_email}
                    </a>
                  )}
                </div>
              </Detail>
            )}
          </div>

          {issue.description && (
            <div style={{ background: C.wash, borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                Beskrivning
              </div>
              <div style={{ fontSize: 14, color: C.text, lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {issue.description}
              </div>
            </div>
          )}

          {/* Handlingsraden är livscykeln och ingenting annat, precis som i Dag
              Rapports bottensheet: vilande → [Öppna] [Avsluta], oppet →
              [Avsluta]. Ett avslutat ärende visar ingen knapp alls. */}
          {(issue.can_open || issue.can_close) && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", paddingTop: 2 }}>
              {issue.can_open && (
                <button
                  type="button"
                  onClick={() => onAct("open")}
                  disabled={actingKind !== null}
                  style={{
                    height: 42,
                    padding: "0 18px",
                    background: C.accent,
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 600,
                    fontFamily: HEADING_FONT,
                    cursor: actingKind !== null ? "not-allowed" : "pointer",
                    opacity: actingKind !== null ? 0.7 : 1,
                  }}
                >
                  {actingKind === "open" ? "Öppnar…" : "Öppna ärende"}
                </button>
              )}
              {issue.can_close && (
                <button
                  type="button"
                  onClick={() => onAct("close")}
                  disabled={actingKind !== null}
                  style={{
                    height: 42,
                    padding: "0 18px",
                    background: C.dark,
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 600,
                    fontFamily: HEADING_FONT,
                    cursor: actingKind !== null ? "not-allowed" : "pointer",
                    opacity: actingKind !== null ? 0.7 : 1,
                  }}
                >
                  {actingKind === "close" ? "Avslutar…" : "Avsluta ärende"}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type FilterKey = "alla" | "att-gora" | "avslutade";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "alla", label: "Alla" },
  { key: "att-gora", label: "Att göra" },
  { key: "avslutade", label: "Avslutade" },
];

function ArendeList({ session, onSignOut }: { session: StoredSession; onSignOut: () => void }) {
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("alla");

  const listQuery = useQuery({
    queryKey: ["entreprenor-portal", session.token],
    // Ett utgånget token är ett slutgiltigt svar, inte ett tillfälligt fel —
    // utan detta försöker react-query igen tre gånger innan sidan ger upp.
    retry: false,
    queryFn: () => callPortal<ListResponse>({ action: "list", token: session.token }),
  });

  // Servern är den som avgör om sessionen lever. Svarar den 401 är token dött
  // och ska bort ur webbläsaren, annars fastnar sidan i ett felmeddelande som
  // inte går att klicka sig ur.
  useEffect(() => {
    if (listQuery.error instanceof PortalError && listQuery.error.status === 401) onSignOut();
  }, [listQuery.error, onSignOut]);

  const act = useMutation({
    mutationFn: (vars: { id: string; kind: "open" | "close" }) =>
      callPortal({ action: vars.kind, token: session.token, issue_id: vars.id }),
    onSuccess: (_data, vars) => {
      toast.success(vars.kind === "open" ? "Ärendet är öppet" : "Ärendet är avslutat");
      qc.invalidateQueries({ queryKey: ["entreprenor-portal", session.token] });
    },
    onError: (err: Error) => {
      if (err instanceof PortalError && err.status === 401) {
        onSignOut();
        return;
      }
      toast.error(err.message);
      // Ett 409 betyder att någon annan hann före. Att hämta om listan är hela
      // rättelsen: raden får sin riktiga status och rätt knappar.
      qc.invalidateQueries({ queryKey: ["entreprenor-portal", session.token] });
    },
  });

  const issues = listQuery.data?.issues ?? [];

  const counts = useMemo(
    () => ({
      alla: issues.length,
      "att-gora": issues.filter((i) => i.lifecycle !== "avslutat").length,
      avslutade: issues.filter((i) => i.lifecycle === "avslutat").length,
    }),
    [issues],
  );

  const visible = useMemo(() => {
    if (filter === "att-gora") return issues.filter((i) => i.lifecycle !== "avslutat");
    if (filter === "avslutade") return issues.filter((i) => i.lifecycle === "avslutat");
    return issues;
  }, [issues, filter]);

  const displayName = listQuery.data?.name ?? session.name;

  return (
    <div style={{ display: "grid", gap: 14, width: "100%" }}>
      <div style={{ ...cardStyle, gap: 14, padding: "18px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: HEADING_FONT, fontSize: 16, fontWeight: 600, color: C.text, overflowWrap: "anywhere" }}>
              {displayName || "Mina ärenden"}
            </div>
            <div style={{ fontSize: 13, color: C.secondary, overflowWrap: "anywhere" }}>
              {listQuery.data?.email ?? session.email}
            </div>
          </div>
          <button type="button" onClick={onSignOut} style={linkButtonStyle()}>
            Logga ut
          </button>
        </div>

        {/* Filtret döljer bara rader, det ändrar inget. En entreprenör som ska
            se "allt jag har" är sidans grundfråga, så Alla är förvalt. */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                style={{
                  height: 34,
                  padding: "0 14px",
                  borderRadius: 8,
                  border: `1px solid ${active ? C.accent : C.border}`,
                  background: active ? C.accentBg : C.card,
                  color: active ? C.dark : C.secondary,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {f.label} ({counts[f.key]})
              </button>
            );
          })}
        </div>
      </div>

      {listQuery.isLoading && (
        <div style={{ ...cardStyle, fontSize: 14, color: C.secondary }}>Hämtar dina ärenden…</div>
      )}

      {listQuery.error && !(listQuery.error instanceof PortalError && listQuery.error.status === 401) && (
        <div style={{ ...cardStyle, gap: 12 }}>
          <div style={{ fontSize: 14, color: C.error }}>
            {listQuery.error instanceof PortalError ? listQuery.error.message : "Kunde inte hämta ärendena."}
          </div>
          <button type="button" style={linkButtonStyle()} onClick={() => void listQuery.refetch()}>
            Försök igen
          </button>
        </div>
      )}

      {listQuery.isSuccess && visible.length === 0 && (
        <div style={{ ...cardStyle, fontSize: 14, color: C.text, lineHeight: 1.5 }}>
          {issues.length === 0
            ? "Du har inga tilldelade felanmälningar just nu."
            : "Inga ärenden för det här valet."}
        </div>
      )}

      {visible.map((issue) => (
        <IssueRow
          key={issue.id}
          issue={issue}
          expanded={expandedId === issue.id}
          onToggle={() => setExpandedId((prev) => (prev === issue.id ? null : issue.id))}
          onAct={(kind) => act.mutate({ id: issue.id, kind })}
          actingKind={act.isPending && act.variables?.id === issue.id ? act.variables.kind : null}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
function MinaArendenPage() {
  const qc = useQueryClient();
  // Läses ur localStorage direkt vid första renderingen, inte i en effekt: en
  // inloggad entreprenör ska inte se inloggningsformuläret blinka förbi.
  const [session, setSession] = useState<StoredSession | null>(() => readSession());

  function signOut() {
    const token = session?.token;
    setSession(null);
    clearStoredSession();
    if (token) {
      // Bäst-möjliga-fall: sessionsraden tas bort serverside så ett token som
      // ändå läckt ut inte lever kvar i trettio dagar. Misslyckas det spelar
      // det ingen roll för den som loggar ut — den är redan utloggad här.
      void callPortal({ action: "logout", token }).catch(() => {});
      qc.removeQueries({ queryKey: ["entreprenor-portal", token] });
    }
  }

  return (
    <div style={shellStyle}>
      <div
        style={{
          width: session ? "min(720px, 96vw)" : "min(460px, 94vw)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "24px 0 40px",
        }}
      >
        <img
          src={baytLogo}
          alt="BAYT"
          style={{ height: "clamp(40px, 10vw, 56px)", width: "auto", marginBottom: 24, filter: "brightness(0) invert(1)" }}
        />
        <div style={{ width: "100%", textAlign: "center", marginBottom: 20 }}>
          <h1 style={{ fontFamily: HEADING_FONT, fontSize: 24, fontWeight: 600, color: "#ffffff", margin: "0 0 8px" }}>
            Mina ärenden
          </h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", margin: 0 }}>
            {session
              ? "Dina tilldelade felanmälningar, senaste först."
              : "För dig som är entreprenör hos BAYT."}
          </p>
        </div>

        {session ? (
          <ArendeList session={session} onSignOut={signOut} />
        ) : (
          <LoginCard
            onSignedIn={(next) => {
              writeSession(next);
              setSession(next);
            }}
          />
        )}
      </div>
    </div>
  );
}
