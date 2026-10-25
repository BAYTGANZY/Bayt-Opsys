import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { LIFECYCLE_OF } from "@/lib/issue-tokens";
import { inspectionTypeLabel } from "@/lib/inspection-tokens";
import { useHomeUser } from "@/components/HomeKit";

const logo = `${import.meta.env.BASE_URL}assets/bayt-logo.png`;

export const Route = createFileRoute("/koll")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Koll — BAYT" }] }),
  component: KollPage,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row_ = Record<string, any>;
type Property = { id: string; name: string };
type Tone = "bad" | "plan" | "ok";

type Active = {
  key: string;
  kind: string;
  title: string;
  date: string | null;
  daysLeft: number | null;
  tone: Tone;
  label: string;
  to: string;
  propertyId: string | null;
};

type Past = {
  key: string;
  title: string;
  date: string;
  to: string;
  propertyId: string | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const daysUntil = (date: string | null): number | null => {
  if (!date) return null;
  const t = new Date(`${date.slice(0, 10)}T00:00:00`).getTime();
  if (Number.isNaN(t)) return null;
  const n = new Date();
  const base = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  return Math.round((t - base) / 86400000);
};

/** Första raden i loggtexten. "X — skickat till Y (mejl)" visas utan mottagarens mejladress. */
function logTitle(text: string | null | undefined, max = 90): string {
  const raw = (text ?? "").trim().split("\n")[0].replace(/\*\*/g, "").trim();
  if (!raw) return "Loggpost";
  const m = raw.match(/^(.*?)\s+[—–-]\s+skickat till\b/i);
  const t = m ? `${m[1].trim()} – tilldelad entreprenör` : raw;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function updatedLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === new Date().toDateString()) return `Uppdaterad idag ${time}`;
  return `Uppdaterad ${d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" })} ${time}`;
}

function lifecycleOf(kind: "issue" | "project", row: Row_): string {
  const map = LIFECYCLE_OF as Record<string, string>;
  if (kind === "issue") return map[String(row.status ?? "")] ?? "vilande";
  if (row.arende_status) return map[String(row.arende_status)] ?? "vilande";
  const legacy = String(row.status ?? "");
  return legacy === "klar" || legacy === "avbruten" ? "avslutat" : "oppet";
}

function toneFor(daysLeft: number | null, planned: boolean): { tone: Tone; label: string } {
  if (daysLeft != null && daysLeft < 0) {
    const n = -daysLeft;
    return { tone: "bad", label: `${n} ${n === 1 ? "dag" : "dagar"} försenad` };
  }
  if (planned) return { tone: "plan", label: "Planerat" };
  return { tone: "ok", label: "Pågår" };
}

const STYLES = `
  .kl-page { min-height: 100vh; min-height: 100dvh; background: #1c4332; font-family: Inter, system-ui, sans-serif; color: #121f18; padding-bottom: 120px; }
  .kl-head { max-width: 760px; margin: 0 auto; padding: 28px 26px 34px; display: flex; align-items: center; justify-content: space-between; }
  .kl-logo { height: 46px; display: block; }
  .kl-out { background: transparent; border: 1px solid rgba(255,255,255,0.28); color: #e9efe4; border-radius: 10px; height: 34px; padding: 0 12px; font: inherit; font-size: 12.5px; cursor: pointer; }
  .kl-sheet { max-width: 760px; margin: 0 auto; background: #f1ecdd; border-radius: 44px 44px 0 0; padding: 36px 22px 44px; min-height: 70vh; }
  .kl-title { font-family: Outfit, Inter, system-ui, sans-serif; font-size: 40px; line-height: 1.04; font-weight: 800; letter-spacing: -0.01em; margin: 0 0 12px; color: #121f18; max-width: 520px; }
  .kl-sub { font-size: 15px; color: #4d5a50; margin: 0 0 22px; }
  .kl-props { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 20px; }
  .kl-chip { height: 36px; padding: 0 16px; border-radius: 999px; border: 1px solid #d3ccb6; background: #f8f5ec; font: inherit; font-size: 13px; font-weight: 600; color: #2d3b32; cursor: pointer; }
  .kl-chip[aria-pressed="true"] { background: #1c4332; border-color: #1c4332; color: #fff; }

  .kl-h2 { font-family: Outfit, Inter, system-ui, sans-serif; font-size: 22px; font-weight: 800; margin: 26px 0 14px; color: #121f18; display: flex; align-items: center; gap: 10px; }
  .kl-count { font-family: Inter, system-ui, sans-serif; font-size: 12.5px; font-weight: 700; color: #4d5a50; background: #e4dcc3; border-radius: 999px; padding: 2px 10px; }

  .kl-list { display: grid; gap: 14px; }
  .kl-card { display: flex; align-items: center; gap: 16px; background: #f9f6ee; border-radius: 28px; padding: 20px 18px; text-decoration: none; color: inherit; box-shadow: 0 14px 26px -18px rgba(20,34,27,0.55), 0 1px 0 rgba(255,255,255,0.8) inset; }
  .kl-card.bad { box-shadow: 0 0 0 2px #8B1A2B, 0 14px 26px -18px rgba(122,20,38,0.5); }
  .kl-ico { width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .kl-ico.done { background: #2b7a3d; color: #fff; }
  .kl-ico.plan { background: #efe9a3; color: #5e520f; }
  .kl-ico.bad { background: #7A1426; color: #F5E6C4; }
  .kl-ico.ok { background: #d8ead7; color: #1f5a30; }
  .kl-main { flex: 1; min-width: 0; }
  .kl-kind { font-size: 11.5px; letter-spacing: 0.09em; text-transform: uppercase; color: #6c776f; font-weight: 700; margin-bottom: 3px; }
  .kl-ctitle { font-size: 18px; font-weight: 800; line-height: 1.2; overflow-wrap: anywhere; }
  .kl-cmeta { font-size: 14px; color: #4d5a50; margin-top: 5px; }
  .kl-tag { display: inline-block; margin-top: 8px; padding: 4px 12px; border-radius: 8px; font-size: 13px; font-weight: 700; }
  .kl-tag.plan { background: #efe9a3; color: #5e520f; }
  .kl-tag.bad { background: #7A1426; color: #F5E6C4; }
  .kl-tag.ok { background: #d8ead7; color: #1f5a30; }
  .kl-side { display: flex; align-items: center; gap: 8px; color: #2d3b32; flex-shrink: 0; }
  .kl-arrow { color: #7b857d; font-size: 24px; line-height: 1; }
  .kl-none { background: #f9f6ee; border-radius: 24px; padding: 20px; color: #4d5a50; font-size: 15px; }

  .kl-small { display: grid; gap: 10px; }
  .kl-card.sm { padding: 12px 14px; border-radius: 22px; gap: 12px; box-shadow: 0 10px 20px -16px rgba(20,34,27,0.5); }
  .kl-card.sm .kl-ico { width: 36px; height: 36px; }
  .kl-card.sm .kl-ctitle { font-size: 15px; font-weight: 700; }
  .kl-card.sm .kl-cmeta { font-size: 12.5px; margin-top: 3px; }

  .kl-more { display: block; width: 100%; margin-top: 14px; height: 46px; border-radius: 16px; border: 1px solid #d3ccb6; background: #f8f5ec; font: inherit; font-size: 14px; font-weight: 700; color: #2d3b32; cursor: pointer; }
  .kl-empty { padding: 26px 8px; color: #4d5a50; font-size: 15px; }

  .kl-nav { position: fixed; left: 0; right: 0; bottom: 0; z-index: 20; display: flex; justify-content: center; padding: 10px 14px calc(14px + env(safe-area-inset-bottom)); pointer-events: none; }
  .kl-nav-in { pointer-events: auto; width: 100%; max-width: 560px; display: grid; grid-template-columns: 1fr 1.35fr 1fr; gap: 6px; background: #ebe5d3; border-radius: 34px; padding: 8px; box-shadow: 0 18px 36px -14px rgba(0,0,0,0.5); }
  .kl-nav a { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 11px 6px; border-radius: 26px; text-decoration: none; color: #2d3b32; font-size: 13px; font-weight: 600; }
  .kl-nav a.on { background: #1c4332; color: #fff; }
  @media (max-width: 480px) { .kl-title { font-size: 34px; } .kl-ctitle { font-size: 17px; } }
`;

const IcoCheck = ({ s = 26 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
const IcoClock = ({ s = 28 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
const IcoAlert = ({ s = 28 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 6v8M12 18h.01" />
  </svg>
);
const IcoDots = ({ s = 28 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round">
    <path d="M6 12h.01M12 12h.01M18 12h.01" />
  </svg>
);
const IcoDoc = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="3" width="14" height="18" rx="2.5" />
    <path d="M9 8h6M9 12h6M9 16h4" />
  </svg>
);

function KollPage() {
  const { role, name } = useHomeUser();
  const allowed = role === "styrelse" || role === "admin";
  const [sel, setSel] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const propsQ = useQuery({
    queryKey: ["koll-properties"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Property[];
    },
  });
  const logQ = useQuery({
    queryKey: ["koll-logbook"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("logbook_entries")
        .select("id, property_id, entry_date, content, created_at")
        .order("entry_date", { ascending: false })
        .limit(80);
      if (error) throw error;
      return (data ?? []) as Row_[];
    },
  });
  const inspQ = useQuery({
    queryKey: ["koll-inspections"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.from("inspections").select("*");
      if (error) throw error;
      return (data ?? []) as Row_[];
    },
  });
  const issuesQ = useQuery({
    queryKey: ["koll-issues"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.from("issues").select("*");
      if (error) throw error;
      return (data ?? []) as Row_[];
    },
  });
  const projQ = useQuery({
    queryKey: ["koll-projects"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*");
      if (error) throw error;
      return (data ?? []) as Row_[];
    },
  });

  const properties = propsQ.data ?? [];
  const propName = (id: string | null) => properties.find((p) => p.id === id)?.name ?? "";

  const { active, past } = useMemo(() => {
    const today = todayStr();
    const act: Active[] = [];
    const old: Past[] = [];
    const cutoff = Date.now() - 30 * 86400000;

    for (const r of issuesQ.data ?? []) {
      const life = lifecycleOf("issue", r);
      const when = (r.updated_at as string | null) ?? (r.created_at as string | null);
      if (life === "avslutat") {
        if (when && new Date(when).getTime() >= cutoff) {
          old.push({
            key: `issue-${r.id}`,
            title: `${r.title || "Felanmälan"} – åtgärdad`,
            date: when.slice(0, 10),
            to: `/issues/${r.id}`,
            propertyId: (r.property_id as string | null) ?? null,
          });
        }
        continue;
      }
      const date = r.deadline ? String(r.deadline).slice(0, 10) : null;
      const dl = daysUntil(date);
      const t = toneFor(dl, false);
      act.push({
        key: `issue-${r.id}`,
        kind: "Felanmälan",
        title: r.title || "Felanmälan",
        date,
        daysLeft: dl,
        tone: t.tone,
        label: t.label,
        to: `/issues/${r.id}`,
        propertyId: (r.property_id as string | null) ?? null,
      });
    }

    for (const r of projQ.data ?? []) {
      const life = lifecycleOf("project", r);
      const when = (r.updated_at as string | null) ?? (r.created_at as string | null);
      if (life === "avslutat") {
        if (when && new Date(when).getTime() >= cutoff) {
          old.push({
            key: `proj-${r.id}`,
            title: `${r.title || "Projekt"} – avslutat`,
            date: when.slice(0, 10),
            to: `/projects/${r.id}`,
            propertyId: (r.property_id as string | null) ?? null,
          });
        }
        continue;
      }
      const date = r.end_date ? String(r.end_date).slice(0, 10) : null;
      const dl = daysUntil(date);
      const t = toneFor(dl, false);
      act.push({
        key: `proj-${r.id}`,
        kind: "Projekt",
        title: r.title || "Projekt",
        date,
        daysLeft: dl,
        tone: t.tone,
        label: t.label,
        to: `/projects/${r.id}`,
        propertyId: (r.property_id as string | null) ?? null,
      });
    }

    for (const r of inspQ.data ?? []) {
      const finished = String(r.arende_status ?? "") === "avslutat" || String(r.status ?? "") === "klar";
      const date = r.next_due_date ? String(r.next_due_date).slice(0, 10) : "";
      if (finished || !date || date < today) continue;
      const dl = daysUntil(date);
      if (dl != null && dl > 90) continue;
      act.push({
        key: `insp-${r.id}`,
        kind: "Kontroll",
        title: `${inspectionTypeLabel(r.inspection_type)} – kontroll`,
        date,
        daysLeft: dl,
        tone: "plan",
        label: "Planerat",
        to: `/inspections/${r.id}`,
        propertyId: (r.property_id as string | null) ?? null,
      });
    }

    for (const r of logQ.data ?? []) {
      const date = String(r.entry_date ?? "").slice(0, 10);
      if (!date || date > today) continue;
      old.push({
        key: `log-${r.id}`,
        title: logTitle(r.content),
        date,
        to: `/properties/${r.property_id}/logbook`,
        propertyId: (r.property_id as string | null) ?? null,
      });
    }

    const rank = (a: Active) => (a.tone === "bad" ? 0 : a.tone === "ok" ? 1 : 2);
    act.sort((a, b) => rank(a) - rank(b) || (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
    old.sort((a, b) => b.date.localeCompare(a.date));
    return { active: act, past: old };
  }, [issuesQ.data, projQ.data, inspQ.data, logQ.data]);

  const activeShown = (sel ? active.filter((a) => a.propertyId === sel) : active).slice(0, 8);
  const pastAll = sel ? past.filter((p) => p.propertyId === sel) : past;
  const pastShown = showAll ? pastAll : pastAll.slice(0, 12);

  const weekend = [0, 6].includes(new Date().getDay());
  const title = weekend ? "Helgkoll – logg till styrelsen" : "Vardagskoll – logg till styrelsen";
  const latest = (logQ.data ?? []).map((r) => r.created_at as string).filter(Boolean).sort().pop() ?? null;
  const loading = propsQ.isLoading || logQ.isLoading || issuesQ.isLoading;
  const multi = properties.length > 1;
  const firstName = role === "styrelse" ? name?.trim().split(/\s+/)[0] ?? "" : "";

  return (
    <>
      <style>{STYLES}</style>
      <div className="kl-page">
        <div className="kl-head">
          <img src={logo} alt="BAYT" className="kl-logo" />
          <button
            type="button"
            className="kl-out"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/login";
            }}
          >
            Logga ut
          </button>
        </div>

        <div className="kl-sheet">
          {role !== undefined && !allowed ? (
            <div className="kl-empty">
              Den här sidan är till för styrelse och fastighetsägare. <Link to={"/start" as never}>Till startsidan</Link>
            </div>
          ) : (
            <>
              <h1 className="kl-title">{title}</h1>
              <p className="kl-sub">
                {firstName ? `Hej ${firstName} · ` : ""}Fastighetslogg{latest ? ` · ${updatedLabel(latest)}` : ""}
              </p>

              {multi && (
                <div className="kl-props">
                  <button type="button" className="kl-chip" aria-pressed={sel === null} onClick={() => setSel(null)}>
                    Alla
                  </button>
                  {properties.map((p) => (
                    <button key={p.id} type="button" className="kl-chip" aria-pressed={sel === p.id} onClick={() => setSel(p.id)}>
                      {p.name}
                    </button>
                  ))}
                </div>
              )}

              {loading && <div className="kl-empty">Hämtar loggen…</div>}

              <h2 className="kl-h2">
                Pågår just nu <span className="kl-count">{activeShown.length}</span>
              </h2>
              {!loading && activeShown.length === 0 && <div className="kl-none">Inget pågår just nu. Allt är under kontroll. 👍</div>}
              <div className="kl-list">
                {activeShown.map((a) => (
                  <Link key={a.key} to={a.to as never} className={`kl-card${a.tone === "bad" ? " bad" : ""}`}>
                    <span className={`kl-ico ${a.tone}`} aria-hidden="true">
                      {a.tone === "bad" ? <IcoAlert /> : a.tone === "plan" ? <IcoClock /> : <IcoDots />}
                    </span>
                    <span className="kl-main">
                      <div className="kl-kind">{a.kind}</div>
                      <div className="kl-ctitle">{a.title}</div>
                      <div className="kl-cmeta">{propName(a.propertyId)}</div>
                      <span className={`kl-tag ${a.tone}`}>
                        {a.date ? `${a.date} · ` : ""}
                        {a.label}
                      </span>
                    </span>
                    <span className="kl-side" aria-hidden="true">
                      <IcoDoc />
                      <span className="kl-arrow">›</span>
                    </span>
                  </Link>
                ))}
              </div>

              <h2 className="kl-h2">
                Tidigare <span className="kl-count">{pastAll.length}</span>
              </h2>
              {!loading && pastAll.length === 0 && <div className="kl-none">Inget i loggen ännu.</div>}
              {pastShown.length > 0 && (
                <div className="kl-small">
                  {pastShown.map((p) => (
                    <Link key={p.key} to={p.to as never} className="kl-card sm">
                      <span className="kl-ico done" aria-hidden="true">
                        <IcoCheck s={18} />
                      </span>
                      <span className="kl-main">
                        <div className="kl-ctitle">{p.title}</div>
                        <div className="kl-cmeta">
                          {p.date} · Utfört{multi && propName(p.propertyId) ? ` · ${propName(p.propertyId)}` : ""}
                        </div>
                      </span>
                      <span className="kl-side" aria-hidden="true">
                        <span className="kl-arrow">›</span>
                      </span>
                    </Link>
                  ))}
                </div>
              )}
              {!showAll && pastAll.length > 12 && (
                <button type="button" className="kl-more" onClick={() => setShowAll(true)}>
                  Visa fler ({pastAll.length - 12})
                </button>
              )}
            </>
          )}
        </div>

        <nav className="kl-nav" aria-label="Meny">
          <div className="kl-nav-in">
            <Link to={"/styrelse" as never}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
              </svg>
              Översikt
            </Link>
            <Link to={"/koll" as never} className="on">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
              </svg>
              Loggar
            </Link>
            <Link to={"/fastigheter" as never}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                <path d="M14 3v5h5M9 13h6M9 17h6" />
              </svg>
              Dokument
            </Link>
          </div>
        </nav>
      </div>
    </>
  );
}
