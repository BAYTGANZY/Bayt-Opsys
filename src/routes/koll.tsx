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

type Item = {
  key: string;
  title: string;
  date: string; // yyyy-mm-dd
  planned: boolean;
  to: string;
  propertyId: string | null;
};

const todayStr = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function firstLine(text: string | null | undefined, max = 90): string {
  const t = (text ?? "").trim().split("\n")[0].replace(/\*\*/g, "").trim();
  if (!t) return "Loggpost";
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

const STYLES = `
  .kl-page { min-height: 100vh; min-height: 100dvh; background: #1f4a37; font-family: Inter, system-ui, sans-serif; color: #14221b; padding-bottom: 110px; }
  .kl-head { max-width: 720px; margin: 0 auto; padding: 22px 22px 34px; display: flex; align-items: center; justify-content: space-between; }
  .kl-logo { height: 34px; display: block; }
  .kl-out { background: transparent; border: 1px solid rgba(255,255,255,0.28); color: #e9efe4; border-radius: 10px; height: 34px; padding: 0 12px; font: inherit; font-size: 12.5px; cursor: pointer; }
  .kl-sheet { max-width: 720px; margin: 0 auto; background: #f4efe3; border-radius: 34px 34px 0 0; padding: 30px 22px 40px; min-height: 70vh; }
  .kl-title { font-family: Outfit, Inter, system-ui, sans-serif; font-size: 34px; line-height: 1.08; font-weight: 700; margin: 0 0 10px; color: #14221b; }
  .kl-sub { font-size: 14px; color: #5d6a60; margin: 0 0 18px; }
  .kl-props { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 16px; }
  .kl-chip { height: 34px; padding: 0 14px; border-radius: 999px; border: 1px solid #cfc8b4; background: #fbf8ef; font: inherit; font-size: 13px; font-weight: 600; color: #2d3b32; cursor: pointer; }
  .kl-chip[aria-pressed="true"] { background: #1f4a37; border-color: #1f4a37; color: #fff; }
  .kl-list { display: grid; gap: 12px; }
  .kl-card { display: flex; align-items: center; gap: 14px; background: #fbf9f2; border-radius: 22px; padding: 16px 16px; text-decoration: none; color: inherit; box-shadow: 0 10px 22px -16px rgba(20,34,27,0.45); }
  .kl-ico { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .kl-ico.done { background: #2b7a3d; color: #fff; }
  .kl-ico.plan { background: #efe9a3; color: #6b5d12; }
  .kl-main { flex: 1; min-width: 0; }
  .kl-ctitle { font-size: 16px; font-weight: 700; line-height: 1.25; overflow-wrap: anywhere; }
  .kl-cmeta { font-size: 13px; color: #5d6a60; margin-top: 4px; }
  .kl-tag { display: inline-block; margin-top: 6px; padding: 3px 10px; border-radius: 8px; background: #efe9a3; color: #5e520f; font-size: 12.5px; font-weight: 600; }
  .kl-arrow { color: #7b857d; font-size: 20px; flex-shrink: 0; }
  .kl-empty { padding: 26px 8px; color: #5d6a60; font-size: 15px; }
  .kl-nav { position: fixed; left: 0; right: 0; bottom: 0; z-index: 20; display: flex; justify-content: center; padding: 10px 14px calc(12px + env(safe-area-inset-bottom)); background: linear-gradient(0deg, #f4efe3 70%, rgba(244,239,227,0)); }
  .kl-nav-in { width: 100%; max-width: 560px; display: grid; grid-template-columns: 1fr 1.3fr 1fr; gap: 6px; background: #ebe5d3; border-radius: 26px; padding: 8px; }
  .kl-nav a { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 9px 6px; border-radius: 18px; text-decoration: none; color: #2d3b32; font-size: 12.5px; font-weight: 600; }
  .kl-nav a.on { background: #1f4a37; color: #fff; }
  @media (min-width: 900px) { .kl-title { font-size: 40px; } }
`;

function KollPage() {
  const { role, name } = useHomeUser();
  const allowed = role === "styrelse" || role === "admin";
  const [sel, setSel] = useState<string | null>(null);

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
        .limit(60);
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

  const properties = propsQ.data ?? [];
  const propName = (id: string | null) => properties.find((p) => p.id === id)?.name ?? "";

  const items = useMemo<Item[]>(() => {
    const today = todayStr();
    const out: Item[] = [];

    for (const r of logQ.data ?? []) {
      const date = String(r.entry_date ?? "").slice(0, 10);
      if (!date) continue;
      out.push({
        key: `log-${r.id}`,
        title: firstLine(r.content),
        date,
        planned: date > today,
        to: `/properties/${r.property_id}/logbook`,
        propertyId: (r.property_id as string | null) ?? null,
      });
    }

    for (const r of inspQ.data ?? []) {
      const finished = String(r.arende_status ?? "") === "avslutat" || String(r.status ?? "") === "klar";
      const date = String(r.next_due_date ?? "").slice(0, 10);
      if (finished || !date || date < today) continue;
      out.push({
        key: `insp-${r.id}`,
        title: `${inspectionTypeLabel(r.inspection_type)} – kontroll`,
        date,
        planned: true,
        to: `/inspections/${r.id}`,
        propertyId: (r.property_id as string | null) ?? null,
      });
    }

    const map = LIFECYCLE_OF as Record<string, string>;
    const cutoff = Date.now() - 30 * 86400000;
    for (const r of issuesQ.data ?? []) {
      if (map[String(r.status ?? "")] !== "avslutat") continue;
      const when = (r.updated_at as string | null) ?? (r.created_at as string | null);
      if (!when || new Date(when).getTime() < cutoff) continue;
      out.push({
        key: `issue-${r.id}`,
        title: `${r.title || "Felanmälan"} – åtgärdad`,
        date: when.slice(0, 10),
        planned: false,
        to: `/issues/${r.id}`,
        propertyId: (r.property_id as string | null) ?? null,
      });
    }

    return out;
  }, [logQ.data, inspQ.data, issuesQ.data]);

  const visible = useMemo(() => {
    const list = sel ? items.filter((i) => i.propertyId === sel) : items;
    const planned = list.filter((i) => i.planned).sort((a, b) => a.date.localeCompare(b.date));
    const done = list.filter((i) => !i.planned).sort((a, b) => b.date.localeCompare(a.date));
    return [...planned, ...done].slice(0, 40);
  }, [items, sel]);

  const day = new Date().getDay();
  const weekend = day === 0 || day === 6;
  const title = weekend ? "Helgkoll – logg till styrelsen" : "Vardagskoll – logg till styrelsen";

  const latest = (logQ.data ?? []).map((r) => r.created_at as string).filter(Boolean).sort().pop() ?? null;
  const loading = propsQ.isLoading || logQ.isLoading;
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
              Den här sidan är till för styrelse och fastighetsägare.{" "}
              <Link to={"/start" as never}>Till startsidan</Link>
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
              {!loading && visible.length === 0 && <div className="kl-empty">Inget nytt att visa just nu.</div>}

              <div className="kl-list">
                {visible.map((i) => (
                  <Link key={i.key} to={i.to as never} className="kl-card">
                    <span className={`kl-ico ${i.planned ? "plan" : "done"}`} aria-hidden="true">
                      {i.planned ? (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 7v5l3 2" />
                        </svg>
                      ) : (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12.5l4.5 4.5L19 7.5" />
                        </svg>
                      )}
                    </span>
                    <span className="kl-main">
                      <div className="kl-ctitle">{i.title}</div>
                      {i.planned ? (
                        <span className="kl-tag">
                          {i.date} · Planerat
                        </span>
                      ) : (
                        <div className="kl-cmeta">
                          {i.date} · Utfört{multi && propName(i.propertyId) ? ` · ${propName(i.propertyId)}` : ""}
                        </div>
                      )}
                    </span>
                    <span className="kl-arrow" aria-hidden="true">›</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>

        <nav className="kl-nav" aria-label="Meny">
          <div className="kl-nav-in">
            <Link to={"/styrelse" as never}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
              </svg>
              Översikt
            </Link>
            <Link to={"/koll" as never} className="on">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
              </svg>
              Loggar
            </Link>
            <Link to={"/fastigheter" as never}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
