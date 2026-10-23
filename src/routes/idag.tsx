import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  deriveIssueStatus,
  deriveInspectionStatus,
  deriveProjectStatus,
  derivePriority,
  LIFECYCLE_OF,
  type DerivedStatus,
} from "@/lib/issue-tokens";
import { inspectionTypeLabel } from "@/lib/inspection-tokens";
import {
  HOME_STYLES,
  TopBar,
  Panel,
  Row,
  useHomeUser,
  HeroBell,
  greeting,
  fmtDate,
  daysChip,
  KIND_LABEL,
  KIND_PATH,
  type Kind,
} from "@/components/HomeKit";

const sketch = `${import.meta.env.BASE_URL}assets/building-sketch-2.png`;

export const Route = createFileRoute("/idag")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Idag — BAYT" }] }),
  component: IdagPage,
});

type Lifecycle = "vilande" | "oppet" | "avslutat";
type Level = "ok" | "warn" | "bad";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row_ = Record<string, any>;

type Entry = {
  kind: Kind;
  id: string;
  title: string;
  propertyId: string | null;
  lifecycle: Lifecycle;
  status: DerivedStatus;
  akut: boolean;
  isNew: boolean;
  doneAt: string | null;
  updatedAt: string | null;
};

type Property = { id: string; name: string; image_url: string | null };

const TABLE: Record<Kind, string> = { issue: "issues", inspection: "inspections", project: "projects" };

const NAV = [
  { to: "/dag-rapport", label: "Dag Rapport" },
  { to: "/fastigheter", label: "Fastigheter" },
  { to: "/issues", label: "Felanmälningar" },
  { to: "/inspections", label: "Besiktningar" },
  { to: "/projects", label: "Projekt" },
  { to: "/entreprenorer", label: "Entreprenörer" },
  { to: "/teknik", label: "Teknik" },
  { to: "/fastighetspresentation", label: "Presentation" },
  { to: "/loggbok", label: "Loggbok" },
  { to: "/chatt", label: "Chatt" },
  { to: "/installningar", label: "Inställningar" },
];

function lifecycleFor(kind: Kind, row: Row_): Lifecycle {
  const map = LIFECYCLE_OF as Record<string, Lifecycle>;
  if (kind === "issue") return map[String(row.status ?? "")] ?? "vilande";
  if (row.arende_status) return map[String(row.arende_status)] ?? "vilande";
  const legacy = String(row.status ?? "");
  if (kind === "inspection") return legacy === "klar" ? "avslutat" : "oppet";
  return legacy === "klar" || legacy === "avbruten" ? "avslutat" : "oppet";
}

function toEntries(kind: Kind, rows: Row_[]): Entry[] {
  return rows.map((row) => {
    let status: DerivedStatus;
    let title: string;
    let akut = false;
    if (kind === "issue") {
      const prio = derivePriority(row.deadline || null, { from: row.created_at });
      akut = prio.key === "akut";
      status = deriveIssueStatus({ status: row.status, priority: prio.key, created_at: row.created_at, deadline: row.deadline || null });
      title = row.title || "Felanmälan";
    } else if (kind === "inspection") {
      status = deriveInspectionStatus({
        status: row.status ?? null,
        arende_status: row.arende_status ?? null,
        next_due_date: row.next_due_date ?? null,
        last_completed_date: row.last_completed_date ?? null,
        interval_months: row.interval_months ?? null,
      });
      title = inspectionTypeLabel(row.inspection_type);
    } else {
      status = deriveProjectStatus({
        status: row.status ?? null,
        arende_status: row.arende_status ?? null,
        start_date: row.start_date ?? null,
        end_date: row.end_date ?? null,
      });
      title = row.title || "Projekt";
    }
    return {
      kind,
      id: row.id as string,
      title,
      propertyId: (row.property_id as string | null) ?? null,
      lifecycle: lifecycleFor(kind, row),
      status,
      akut,
      isNew: !row.viewed_at,
      doneAt: (row.contractor_done_at as string | null) ?? null,
      updatedAt: (row.updated_at as string | null) ?? (row.created_at as string | null) ?? null,
    };
  });
}

function useKind(kind: Kind, enabled: boolean) {
  return useQuery({
    queryKey: ["idag-items", kind],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from(TABLE[kind]).select("*");
      if (error) throw error;
      return toEntries(kind, (data ?? []) as Row_[]);
    },
  });
}

const isActive = (e: Entry) => e.lifecycle !== "avslutat";
const isOverdue = (e: Entry) => isActive(e) && e.status.daysLeft != null && e.status.daysLeft < 0;
const keyOf = (e: Entry) => `${e.kind}-${e.id}`;

function levelOf(entries: Entry[]): Level {
  const active = entries.filter(isActive);
  if (active.some((e) => isOverdue(e) || e.akut)) return "bad";
  if (active.some((e) => e.doneAt || (e.kind === "inspection" && e.status.daysLeft != null && e.status.daysLeft <= 30))) return "warn";
  return "ok";
}

const IDAG_STYLES = `
  .id-hero {
    position: relative; margin-top: 8px; border-radius: 26px; overflow: hidden; min-height: 540px;
    background: #0b1d17 center / cover no-repeat; border: 1px solid rgba(255,255,255,0.08);
    display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 420px); gap: 28px; align-items: center;
    padding: 56px 44px 96px; perspective: 1200px;
  }
  .id-hero::before {
    content: ""; position: absolute; inset: 0; z-index: 0;
    background: linear-gradient(90deg, rgba(8,22,17,0.88) 0%, rgba(8,22,17,0.55) 55%, rgba(8,22,17,0.7) 100%),
                linear-gradient(0deg, rgba(8,22,17,0.85) 0%, rgba(8,22,17,0) 40%);
  }
  .id-hero.id-sketch { background-size: contain; background-position: right center; }
  .id-hero > * { position: relative; z-index: 1; }

  .id-glass {
    background: rgba(14,31,26,0.55); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px);
    border: 1px solid rgba(255,255,255,0.14); border-radius: 22px;
    box-shadow: 0 24px 50px -20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.12);
    transform: perspective(1000px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg));
    transition: transform 0.25s ease-out;
  }
  .id-right .id-glass { transform: perspective(1000px) rotateX(calc(var(--rx, 0deg) * -0.8)) rotateY(calc(var(--ry, 0deg) * -0.8)); }

  .id-main { padding: 34px 36px; max-width: 640px; }
  .id-hello { color: #5CB84A; font-size: 17px; font-weight: 600; margin: 0 0 8px; }
  .id-headline { font-family: Outfit, Inter, system-ui, sans-serif; font-size: 44px; line-height: 1.08; font-weight: 600; margin: 0 0 12px; }
  .id-headline.bad { color: #F2E3BC; }
  .id-sub { font-size: 15.5px; line-height: 1.55; color: #c9d6c3; margin: 0; }

  .id-right { display: grid; gap: 14px; }
  .id-next { padding: 20px 22px; display: block; text-decoration: none; color: inherit; }
  .id-next:hover { border-color: rgba(92,184,74,0.6); }
  .id-next-label { font-size: 11.5px; letter-spacing: 0.1em; text-transform: uppercase; color: #9fb79f; }
  .id-next-title { font-family: Outfit, Inter, system-ui, sans-serif; font-size: 22px; font-weight: 600; margin: 8px 0 4px; overflow-wrap: anywhere; }
  .id-next-sub { font-size: 13px; color: #b9c8b4; margin-bottom: 12px; }
  .id-next-empty { font-size: 14px; color: #c9d6c3; margin-top: 8px; }

  .id-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .id-tile { padding: 14px 16px; border-radius: 18px; }
  .id-tile-l { font-size: 11px; letter-spacing: 0.07em; text-transform: uppercase; color: #9fb79f; }
  .id-tile-n { font-family: Outfit, Inter, system-ui, sans-serif; font-size: 32px; font-weight: 600; line-height: 1.1; margin-top: 4px; }
  .id-tile.bad { border-color: #8B1A2B; background: rgba(122,20,38,0.45); }
  .id-tile.bad .id-tile-n { color: #F2E3BC; }
  .id-tile.warn .id-tile-n { color: #ffd37a; }
  .id-tile.good .id-tile-n { color: #8be07a; }

  .id-props { position: absolute; left: 44px; right: 44px; bottom: 28px; z-index: 2; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .id-props-label { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #b9c8b4; margin-right: 4px; }
  .id-chip {
    display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 16px; border-radius: 999px; cursor: pointer; font: inherit;
    font-size: 13px; font-weight: 600; color: #e6efd8; background: rgba(14,31,26,0.6); border: 1px solid rgba(255,255,255,0.16);
    -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  }
  .id-chip:hover { border-color: rgba(92,184,74,0.7); }
  .id-chip[aria-pressed="true"] { border-color: #5CB84A; background: rgba(61,138,48,0.45); }
  .id-dot { width: 8px; height: 8px; border-radius: 50%; background: #8be07a; }
  .id-dot.warn { background: #ffd37a; }
  .id-dot.bad { background: #C2334D; }

  .id-hero .hk-herobell { top: 24px; right: 28px; transform: none; gap: 6px; }
  .id-hero .hk-bell-label { display: none; }
  .id-hero .hk-bellring button[aria-label] { width: 64px !important; height: 64px !important; min-width: 64px !important; min-height: 64px !important; }
  .id-hero .hk-bellring button[aria-label] svg { width: 30px; height: 30px; }
  .id-hero .hk-bellring button[aria-label] > span { min-width: 22px !important; height: 22px !important; font-size: 11px !important; }

  @media (max-width: 1100px) {
    .id-hero { grid-template-columns: minmax(0, 1fr); padding: 48px 28px 100px; min-height: 0; }
    .id-main { max-width: none; }
    .id-props { left: 28px; right: 28px; }
  }
  @media (max-width: 768px) {
    .id-hero { padding: 76px 14px 110px; border-radius: 20px; }
    .id-main { padding: 22px 20px; }
    .id-headline { font-size: 30px; }
    .id-props { left: 14px; right: 14px; bottom: 16px; }
    .id-hero .hk-herobell { top: 14px; right: 14px; }
    .id-glass, .id-right .id-glass { transform: none; }
  }
  @media (hover: none), (prefers-reduced-motion: reduce) {
    .id-glass, .id-right .id-glass { transform: none !important; transition: none; }
  }
`;

function IdagPage() {
  const { role, name } = useHomeUser();
  const allowed = role === "admin";
  const [sel, setSel] = useState<string | null>(null);
  const heroRef = useRef<HTMLElement | null>(null);

  const propsQ = useQuery({
    queryKey: ["idag-properties-img"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id, name, image_url").order("name");
      if (error) throw error;
      return (data ?? []) as Property[];
    },
  });
  const issuesQ = useKind("issue", allowed);
  const inspectionsQ = useKind("inspection", allowed);
  const projectsQ = useKind("project", allowed);

  const properties = propsQ.data ?? [];
  const propName = (id: string | null) => properties.find((p) => p.id === id)?.name ?? "—";
  const loading = propsQ.isLoading || issuesQ.isLoading || inspectionsQ.isLoading || projectsQ.isLoading;

  const all = useMemo(
    () => [...(issuesQ.data ?? []), ...(inspectionsQ.data ?? []), ...(projectsQ.data ?? [])],
    [issuesQ.data, inspectionsQ.data, projectsQ.data],
  );
  const scoped = useMemo(() => (sel ? all.filter((e) => e.propertyId === sel) : all), [all, sel]);
  const active = scoped.filter(isActive);

  const attention = active
    .filter((e) => isOverdue(e) || e.akut)
    .sort((a, b) => (a.status.daysLeft ?? 9999) - (b.status.daysLeft ?? 9999));
  const review = active.filter((e) => e.doneAt).sort((a, b) => (a.doneAt ?? "").localeCompare(b.doneAt ?? ""));
  const fresh = active.filter((e) => e.kind === "issue" && e.isNew);
  const upcoming = active
    .filter((e) => e.kind === "inspection" && e.status.dueDate)
    .sort((a, b) => (a.status.dueDate ?? "").localeCompare(b.status.dueDate ?? ""));
  const upcoming60 = upcoming.filter((e) => e.status.daysLeft != null && e.status.daysLeft >= 0 && e.status.daysLeft <= 60);
  const cutoff = Date.now() - 30 * 86400000;
  const resolved = scoped.filter((e) => e.lifecycle === "avslutat" && e.updatedAt && new Date(e.updatedAt).getTime() >= cutoff);

  const waiting = new Set([...attention, ...review, ...fresh].map(keyOf)).size;
  const headline = waiting === 0 ? "Inget väntar på dig." : `${waiting} ${waiting === 1 ? "sak väntar" : "saker väntar"} på dig.`;
  const sub = [
    attention.length > 0 ? `${attention.length} kräver åtgärd` : null,
    review.length > 0 ? `${review.length} att granska` : null,
    fresh.length > 0 ? `${fresh.length} nya felanmälningar` : null,
    upcoming60.length > 0 ? `${upcoming60.length} kontroller de närmaste 60 dagarna` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const heroProp = (sel ? properties.find((p) => p.id === sel) : null) ?? properties.find((p) => p.image_url) ?? null;
  const heroImg = heroProp?.image_url ?? null;

  const next = attention[0] ?? review[0] ?? fresh[0] ?? null;
  const nextChip = next
    ? next.akut && !isOverdue(next)
      ? { text: "Akut", cls: "hk-chip-bad" }
      : next.doneAt
        ? { text: "Granska", cls: "hk-chip-warn" }
        : next.status.daysLeft != null
          ? daysChip(next.status.daysLeft)
          : { text: "Ny", cls: "hk-chip-muted" }
    : null;

  const perProperty = properties.map((p) => ({ p, level: levelOf(all.filter((e) => e.propertyId === p.id)) }));
  const selName = sel ? propName(sel) : null;

  const onMove = (e: React.MouseEvent<HTMLElement>) => {
    const el = heroRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--ry", `${(x * 7).toFixed(2)}deg`);
    el.style.setProperty("--rx", `${(-y * 6).toFixed(2)}deg`);
  };
  const onLeave = () => {
    const el = heroRef.current;
    if (!el) return;
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--rx", "0deg");
  };

  return (
    <>
      <style>{HOME_STYLES}</style>
      <style>{IDAG_STYLES}</style>
      <div className="hk-page">
        <div className="hk-wrap">
          <TopBar role={role} name={name} items={NAV} roleLabel="BAYT" />

          {role === undefined && <div className="hk-empty">Laddar…</div>}
          {role !== undefined && !allowed && (
            <div className="hk-empty">
              Den här sidan är till för BAYT:s personal.{" "}
              <Link to={"/start" as never} className="hk-link">
                Till startsidan
              </Link>
            </div>
          )}

          {allowed && (
            <>
              <section
                ref={heroRef}
                className={`id-hero${heroImg ? "" : " id-sketch"}`}
                style={{ backgroundImage: `url(${heroImg ?? sketch})` }}
                onMouseMove={onMove}
                onMouseLeave={onLeave}
              >
                <HeroBell />

                <div className="id-glass id-main">
                  <p className="id-hello">{greeting()}</p>
                  <h1 className={`id-headline${attention.length > 0 ? " bad" : ""}`}>{loading ? "Hämtar läget…" : headline}</h1>
                  <p className="id-sub">{loading ? "" : sub || "Allt är avstämt för tillfället."}</p>
                </div>

                <div className="id-right">
                  {next ? (
                    <Link to={`/${KIND_PATH[next.kind]}/${next.id}` as never} className="id-glass id-next">
                      <div className="id-next-label">Nästa upp</div>
                      <div className="id-next-title">{next.title}</div>
                      <div className="id-next-sub">
                        {KIND_LABEL[next.kind]} · {propName(next.propertyId)}
                      </div>
                      {nextChip && <span className={`hk-chip ${nextChip.cls}`}>{nextChip.text}</span>}
                    </Link>
                  ) : (
                    <div className="id-glass id-next">
                      <div className="id-next-label">Nästa upp</div>
                      <div className="id-next-empty">Inget väntar. Bra jobbat. 👍</div>
                    </div>
                  )}

                  <div className="id-tiles">
                    <div className={`id-glass id-tile${attention.length > 0 ? " bad" : ""}`}>
                      <div className="id-tile-l">Kräver åtgärd</div>
                      <div className="id-tile-n">{attention.length}</div>
                    </div>
                    <div className={`id-glass id-tile${review.length > 0 ? " warn" : ""}`}>
                      <div className="id-tile-l">Att granska</div>
                      <div className="id-tile-n">{review.length}</div>
                    </div>
                    <div className="id-glass id-tile">
                      <div className="id-tile-l">Nya felanmälningar</div>
                      <div className="id-tile-n">{fresh.length}</div>
                    </div>
                    <div className="id-glass id-tile">
                      <div className="id-tile-l">Kontroller, 60 dagar</div>
                      <div className="id-tile-n">{upcoming60.length}</div>
                    </div>
                    <div className="id-glass id-tile good" style={{ gridColumn: "span 2" }}>
                      <div className="id-tile-l">Avklarat, 30 dagar</div>
                      <div className="id-tile-n">{resolved.length}</div>
                    </div>
                  </div>
                </div>

                <div className="id-props">
                  <span className="id-props-label">Fastigheter</span>
                  {perProperty.map(({ p, level }) => (
                    <button key={p.id} type="button" className="id-chip" aria-pressed={sel === p.id} onClick={() => setSel((c) => (c === p.id ? null : p.id))}>
                      <span className={`id-dot ${level === "ok" ? "" : level}`} />
                      {p.name}
                    </button>
                  ))}
                </div>
              </section>

              {selName && (
                <div className="hk-filter" style={{ marginTop: 14 }}>
                  <span>Visar bara {selName}.</span>
                  <button type="button" onClick={() => setSel(null)}>
                    Visa alla
                  </button>
                </div>
              )}

              <div className="hk-actions">
                <Link to={"/issues/new" as never} className="hk-action primary">
                  + Ny felanmälan
                </Link>
                <Link to={"/dag-rapport" as never} className="hk-action">
                  Dag Rapport
                </Link>
                <Link to={"/teknik" as never} className="hk-action">
                  Teknik
                </Link>
                <Link to={"/fastighetspresentation" as never} className="hk-action">
                  Presentation
                </Link>
                <Link to={"/entreprenorer" as never} className="hk-action">
                  Entreprenörer
                </Link>
              </div>

              <h2 className="hk-h2">Det här väntar på dig</h2>
              <div className="hk-cols">
                <Panel title="Kräver åtgärd" to="/issues">
                  {attention.length === 0 && <div className="hk-empty">Inget är försenat eller akut. 👍</div>}
                  {attention.slice(0, 7).map((e) => {
                    const chip = e.akut && !isOverdue(e) ? { text: "Akut", cls: "hk-chip-bad" } : daysChip(e.status.daysLeft);
                    return (
                      <Row key={keyOf(e)} to={`/${KIND_PATH[e.kind]}/${e.id}`} title={e.title} sub={`${KIND_LABEL[e.kind]} · ${propName(e.propertyId)}`} right={<span className={`hk-chip ${chip.cls}`}>{chip.text}</span>} />
                    );
                  })}
                </Panel>

                <Panel title="Att granska — entreprenören är klar">
                  {review.length === 0 && <div className="hk-empty">Ingen väntar på ditt godkännande.</div>}
                  {review.slice(0, 7).map((e) => (
                    <Row
                      key={keyOf(e)}
                      to={`/${KIND_PATH[e.kind]}/${e.id}`}
                      title={e.title}
                      sub={`${KIND_LABEL[e.kind]} · ${propName(e.propertyId)}`}
                      right={
                        <>
                          <span className="hk-chip hk-chip-warn">Granska</span>
                          <span className="hk-row-sub" style={{ margin: 0 }}>
                            Klart {fmtDate(e.doneAt)}
                          </span>
                        </>
                      }
                    />
                  ))}
                </Panel>

                <Panel title="Nya felanmälningar" to="/issues">
                  {fresh.length === 0 && <div className="hk-empty">Alla felanmälningar är öppnade.</div>}
                  {fresh.slice(0, 7).map((e) => (
                    <Row key={keyOf(e)} to={`/issues/${e.id}`} title={e.title} sub={propName(e.propertyId)} right={<span className="hk-chip hk-chip-muted">Ny</span>} />
                  ))}
                </Panel>

                <Panel title="Kommande kontroller" to="/inspections">
                  {upcoming.length === 0 && <div className="hk-empty">Inga kontroller är planerade.</div>}
                  {upcoming.slice(0, 7).map((e) => {
                    const chip = daysChip(e.status.daysLeft);
                    return (
                      <Row
                        key={keyOf(e)}
                        to={`/inspections/${e.id}`}
                        title={e.title}
                        sub={propName(e.propertyId)}
                        right={
                          <>
                            <span className="hk-row-sub" style={{ margin: 0 }}>
                              {fmtDate(e.status.dueDate)}
                            </span>
                            <span className={`hk-chip ${chip.cls}`}>{chip.text}</span>
                          </>
                        }
                      />
                    );
                  })}
                </Panel>
              </div>

              <p className="hk-note">
                Siffrorna hämtas direkt ur portalen. "Att granska" visar ärenden där en entreprenör har tryckt på
                "Meddela att uppdraget är slutfört" och som ni inte har avslutat än.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
