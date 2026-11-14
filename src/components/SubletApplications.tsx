import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { printSubletApplication } from "@/lib/andrahand-print";

const INK = "#0D2B1E";
const GREEN = "#3D8A30";
const MUTED = "#6B7280";
const LINE = "#E3E7E2";
const HOT = "#C2334D";
const GOLD = "#B7791F";
const BUCKET = "sublet-applications";

type App = {
  id: string;
  reference: string;
  property_id: string;
  apartment_number: string;
  trappa: string | null;
  applicant_name: string;
  applicant_email: string;
  applicant_phone: string | null;
  tenant_name: string;
  tenant_contact: string | null;
  start_date: string;
  end_date: string;
  reason: string;
  reason_text: string | null;
  status: "ny" | "komplettering" | "godkand" | "nekad";
  decision_note: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  supplement_note: string | null;
  created_at: string;
};
type AppFile = { id: string; application_id: string; file_path: string; file_name: string; added_by: string };
type Decision = "godkand" | "nekad" | "komplettering";

const STATUS: Record<App["status"], { label: string; color: string; bg: string }> = {
  ny: { label: "Väntar på beslut", color: "#1D4ED8", bg: "#EEF3FF" },
  komplettering: { label: "Väntar på komplettering", color: GOLD, bg: "#FBF4E0" },
  godkand: { label: "Godkänd", color: GREEN, bg: "#F0F7EE" },
  nekad: { label: "Nekad", color: HOT, bg: "#FCEEF0" },
};

const fmt = (iso: string | null) => (iso ? new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" }) : "—");

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

const btn = (kind: "primary" | "danger" | "plain", disabled?: boolean): React.CSSProperties => ({
  height: 40,
  padding: "0 16px",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  fontFamily: "inherit",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.6 : 1,
  background: kind === "primary" ? GREEN : "#fff",
  color: kind === "primary" ? "#fff" : kind === "danger" ? "#B91C1C" : INK,
  border: `1px solid ${kind === "primary" ? GREEN : kind === "danger" ? "#F1C0C0" : LINE}`,
});

/**
 * Ansökningar om andrahandsuthyrning från /ansok-andrahand. Admin och styrelse (i sin egen förening)
 * ser dem här och trycker Godkänn / Neka / Begär komplettering — beslutet går via edge-funktionen
 * decide-andrahand, som sparar vem som beslutade, lägger in uthyrningen i registret och mejlar sökanden.
 */
export function SubletApplications({ propertyId, propertyName, onDecided }: { propertyId: string; propertyName: string; onDecided: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"open" | "done">("open");
  const link = `${typeof window !== "undefined" ? window.location.origin : "https://app.bayt.se"}/ansok-andrahand?forening=${propertyId}`;

  const q = useQuery({
    queryKey: ["sublet-apps", propertyId],
    queryFn: async () => {
      const a = await supabase.from("sublet_applications").select("*").eq("property_id", propertyId).order("created_at", { ascending: false });
      if (a.error) throw a.error;
      const apps = (a.data ?? []) as App[];
      let files: AppFile[] = [];
      if (apps.length > 0) {
        const f = await supabase.from("sublet_application_files").select("*").in("application_id", apps.map((x) => x.id));
        if (!f.error) files = (f.data ?? []) as AppFile[];
      }
      return { apps, files };
    },
  });
  const apps = q.data?.apps ?? [];
  const open = apps.filter((a) => a.status === "ny" || a.status === "komplettering");
  const done = apps.filter((a) => a.status === "godkand" || a.status === "nekad");
  const shown = tab === "open" ? open : done;
  const missing = !!q.error && /does not exist|schema cache|42P01|PGRST205/i.test((q.error as Error).message);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Länken är kopierad", { style: { background: GREEN, color: "#fff" } });
    } catch {
      window.prompt("Kopiera länken:", link);
    }
  };

  return (
    <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, padding: "18px 20px", display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: "Outfit, Inter, sans-serif", fontSize: 20, fontWeight: 700, color: INK }}>Ansökningar</div>
          <div style={{ fontSize: 14, color: MUTED, marginTop: 2 }}>
            Medlemmar i {propertyName || "föreningen"} ansöker via en länk på hemsidan. Här fattar styrelsen beslut.
          </div>
        </div>
        <button type="button" style={btn("plain")} onClick={copy}>
          Kopiera ansökningslänk
        </button>
      </div>

      {missing && (
        <div style={{ color: HOT, fontSize: 14 }}>Tabellen för ansökningar saknas. Kör SQL-filen andrahand-ansokan.sql en gång i Supabase.</div>
      )}
      {q.error && !missing && <div style={{ color: HOT, fontSize: 14 }}>Kunde inte hämta ansökningarna: {(q.error as Error).message}</div>}

      {!q.error && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {([["open", `Att hantera (${open.length})`], ["done", `Besvarade (${done.length})`]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setTab(k)} style={{ height: 34, padding: "0 14px", borderRadius: 999, font: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1px solid ${tab === k ? INK : LINE}`, background: tab === k ? INK : "#fff", color: tab === k ? "#fff" : MUTED }}>
                {l}
              </button>
            ))}
          </div>
          {q.isLoading && <div style={{ color: MUTED }}>Hämtar …</div>}
          {!q.isLoading && shown.length === 0 && (
            <div style={{ color: MUTED, fontSize: 15 }}>{tab === "open" ? "Inga ansökningar väntar på beslut." : "Inga besvarade ansökningar ännu."}</div>
          )}
          <div style={{ display: "grid", gap: 12 }}>
            {shown.map((a) => (
              <AppCard
                key={a.id}
                a={a}
                propertyName={propertyName}
                files={(q.data?.files ?? []).filter((f) => f.application_id === a.id)}
                onDecided={() => {
                  void qc.invalidateQueries({ queryKey: ["sublet-apps", propertyId] });
                  onDecided();
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AppCard({ a, files, propertyName, onDecided }: { a: App; files: AppFile[]; propertyName: string; onDecided: () => void }) {
  const [note, setNote] = useState("");
  const [choice, setChoice] = useState<Decision | null>(null);
  const st = STATUS[a.status];
  const canDecide = a.status === "ny" || a.status === "komplettering";

  const decide = useMutation({
    mutationFn: async (decision: Decision) => {
      const { data, error } = await supabase.functions.invoke("decide-andrahand", { body: { id: a.id, decision, note } });
      if (error) throw new Error(await errorMessage(error, "Beslutet kunde inte sparas."));
      if (data?.error) throw new Error(String(data.error));
      return data as { mail_sent: boolean; registry_error: string | null };
    },
    onSuccess: (r, decision) => {
      const label = decision === "godkand" ? "godkänd" : decision === "nekad" ? "nekad" : "skickad på komplettering";
      toast.success(`Ansökan är ${label}${r.mail_sent ? " och sökanden har fått mejl" : ""}`, { style: { background: GREEN, color: "#fff" } });
      if (!r.mail_sent) toast.error("Mejlet till sökanden kunde inte skickas. Kontakta sökanden direkt.");
      if (r.registry_error) toast.error(`Uthyrningen lades inte in i registret automatiskt (${r.registry_error}). Lägg in den för hand.`);
      setChoice(null);
      setNote("");
      onDecided();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openFile = async (f: AppFile) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(f.file_path, 600);
    if (error || !data) return toast.error("Filen kunde inte öppnas.");
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const needNote = choice === "nekad" || choice === "komplettering";

  return (
    <div style={{ border: `1px solid ${LINE}`, borderLeft: `4px solid ${st.color}`, borderRadius: 14, padding: "14px 18px", display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontWeight: 800, fontSize: 17, color: INK }}>
          Lgh {a.apartment_number}
          {a.trappa ? `, trappa ${a.trappa}` : ""}
        </span>
        <span style={{ background: st.bg, color: st.color, fontSize: 12, fontWeight: 700, borderRadius: 999, padding: "2px 10px" }}>{st.label}</span>
        <span style={{ color: MUTED, fontSize: 13 }}>
          {a.reference} · inkom {fmt(a.created_at)}
        </span>
        <button
          type="button"
          className="no-print"
          style={{ ...btn("plain"), height: 30, fontSize: 13, marginLeft: "auto" }}
          onClick={() => { if (!printSubletApplication(a, propertyName)) toast.error("Webbläsaren blockerade utskriftsfönstret. Tillåt popup-fönster och försök igen."); }}
        >
          Skriv ut
        </button>
      </div>
      <div style={{ fontSize: 14.5, color: "#374151", lineHeight: 1.7 }}>
        Sökande: <strong>{a.applicant_name}</strong> · {a.applicant_email}
        {a.applicant_phone ? ` · ${a.applicant_phone}` : ""}
        <br />
        Hyresgäst: <strong>{a.tenant_name}</strong>
        {a.tenant_contact ? ` · ${a.tenant_contact}` : ""}
        <br />
        Period: {fmt(a.start_date)} till {fmt(a.end_date)} · Skäl: {a.reason}
        {a.reason_text && (
          <>
            <br />
            <span style={{ color: MUTED }}>{a.reason_text}</span>
          </>
        )}
      </div>
      {a.supplement_note && (
        <div style={{ background: "#FBF4E0", borderRadius: 8, padding: "8px 12px", fontSize: 14, color: "#374151" }}>
          <strong>Kommentar från sökande vid komplettering:</strong> {a.supplement_note}
        </div>
      )}
      {files.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {files.map((f) => (
            <button key={f.id} type="button" onClick={() => openFile(f)} style={{ ...btn("plain"), height: 32, fontSize: 13 }}>
              {f.file_name}
            </button>
          ))}
        </div>
      )}
      {!canDecide && (
        <div style={{ fontSize: 13.5, color: MUTED }}>
          Beslut registrerat av {a.decided_by_name ?? "okänd"} den {fmt(a.decided_at)}.
          {a.decision_note ? ` Meddelande: ${a.decision_note}` : ""}
        </div>
      )}
      {canDecide && a.status === "komplettering" && a.decision_note && (
        <div style={{ fontSize: 13.5, color: MUTED }}>Begärd komplettering: {a.decision_note}</div>
      )}
      {canDecide && (
        <div className="no-print" style={{ display: "grid", gap: 10 }}>
          {choice && (
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED }}>
                {choice === "nekad" ? "Motivering (skickas till sökanden)" : choice === "komplettering" ? "Vad behöver kompletteras? (skickas till sökanden)" : "Meddelande till sökanden (valfritt)"}
              </label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} style={{ width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 8, border: `1px solid ${LINE}`, fontFamily: "inherit", fontSize: 15 }} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  style={btn(choice === "nekad" ? "danger" : "primary", decide.isPending || (needNote && !note.trim()))}
                  disabled={decide.isPending || (needNote && !note.trim())}
                  onClick={() => decide.mutate(choice)}
                >
                  {decide.isPending ? "Skickar …" : choice === "godkand" ? "Bekräfta godkännande" : choice === "nekad" ? "Bekräfta avslag" : "Skicka begäran"}
                </button>
                <button type="button" style={btn("plain")} onClick={() => { setChoice(null); setNote(""); }}>
                  Ångra
                </button>
              </div>
            </div>
          )}
          {!choice && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" style={btn("primary")} onClick={() => setChoice("godkand")}>
                Godkänn
              </button>
              <button type="button" style={btn("plain")} onClick={() => setChoice("komplettering")}>
                Begär komplettering
              </button>
              <button type="button" style={btn("danger")} onClick={() => setChoice("nekad")}>
                Neka
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
