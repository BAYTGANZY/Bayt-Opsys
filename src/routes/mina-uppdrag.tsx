import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useMyArenden, arendeHref, arendeKindLabel } from "@/hooks/useMyArenden";
import { HOME_STYLES, TopBar, Panel, Row, useHomeUser, greeting, fmtDate, daysChip } from "@/components/HomeKit";
import { Hero } from "@/components/HeroKit";

export const Route = createFileRoute("/mina-uppdrag")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Mina uppdrag — BAYT" }] }),
  component: MinaUppdragPage,
});

const NAV = [
  { to: "/issues", label: "Felanmälningar" },
  { to: "/inspections", label: "Besiktningar" },
  { to: "/projects", label: "Projekt" },
  { to: "/chatt", label: "Chatt" },
  { to: "/installningar", label: "Inställningar" },
];

function MinaUppdragPage() {
  const { role, name } = useHomeUser();
  const allowed = role === "entreprenor";
  const { arenden, isLoading, error } = useMyArenden();

  const active = useMemo(() => arenden.filter((a) => a.lifecycle !== "avslutat"), [arenden]);
  const done = useMemo(() => arenden.filter((a) => a.lifecycle === "avslutat"), [arenden]);
  const sorted = useMemo(
    () =>
      [...active].sort((a, b) => {
        const ad = a.status.dueDate ?? "9999-12-31";
        const bd = b.status.dueDate ?? "9999-12-31";
        return ad.localeCompare(bd);
      }),
    [active],
  );
  const overdue = sorted.filter((a) => a.status.daysLeft != null && a.status.daysLeft < 0);
  const soon = sorted.filter((a) => a.status.daysLeft != null && a.status.daysLeft >= 0 && a.status.daysLeft <= 7);
  const first = sorted.filter((a) => (a.status.daysLeft != null && a.status.daysLeft <= 7) || a.priorityKey === "akut");

  const firstName = name?.trim().split(/\s+/)[0] ?? "";
  const headline =
    overdue.length > 0
      ? `${overdue.length} ${overdue.length === 1 ? "uppdrag är" : "uppdrag är"} försenade.`
      : active.length === 0
        ? "Du har inga uppdrag just nu."
        : `Du har ${active.length} ${active.length === 1 ? "uppdrag" : "uppdrag"}.`;
  const sub =
    active.length === 0
      ? "Nya uppdrag dyker upp här så fort du blir tilldelad ett."
      : soon.length > 0
        ? `${soon.length} ${soon.length === 1 ? "förfaller" : "förfaller"} inom sju dagar. Börja uppifrån.`
        : "Inget brådskar de närmaste dagarna.";

  const top = overdue[0] ?? first[0] ?? sorted[0] ?? null;

  const render = (list: typeof sorted) =>
    list.map((a) => {
      const chip = daysChip(a.status.daysLeft);
      return (
        <Row
          key={`${a.kind}-${a.id}`}
          to={arendeHref(a)}
          title={a.title}
          sub={`${arendeKindLabel(a.kind)}${a.propertyName ? ` · ${a.propertyName}` : ""}${a.placeLabel ? ` · ${a.placeLabel}` : ""}`}
          right={
            <>
              {a.status.dueDate && (
                <span className="hk-row-sub" style={{ margin: 0 }}>
                  {fmtDate(a.status.dueDate)}
                </span>
              )}
              <span className={`hk-chip ${chip.cls}`}>{chip.text}</span>
            </>
          }
        />
      );
    });

  return (
    <>
      <style>{HOME_STYLES}</style>
      <div className="hk-page">
        <div className="hk-wrap">
          <TopBar role={role} name={name} items={NAV} roleLabel="Entreprenör" />

          {role === undefined && <div className="hk-empty">Laddar…</div>}
          {role !== undefined && !allowed && (
            <div className="hk-empty">
              Den här sidan är till för entreprenörer.{" "}
              <Link to={"/start" as never} className="hk-link">
                Till startsidan
              </Link>
            </div>
          )}

          {allowed && (
            <>
              <Hero
                hello={`${greeting()}${firstName ? `, ${firstName}` : ""}`}
                headline={headline}
                bad={overdue.length > 0}
                sub={sub}
                loading={isLoading}
                next={
                  top
                    ? {
                        to: arendeHref(top),
                        label: "Gör först",
                        title: top.title,
                        sub: `${arendeKindLabel(top.kind)}${top.propertyName ? ` · ${top.propertyName}` : ""}`,
                        chip: daysChip(top.status.daysLeft),
                      }
                    : null
                }
                emptyNext="Inga uppdrag just nu."
                tiles={[
                  { label: "Aktiva uppdrag", n: active.length, anchor: "panel-alla" },
                  { label: "Försenade", n: overdue.length, tone: overdue.length > 0 ? "bad" : undefined, anchor: "panel-alla" },
                  { label: "Inom 7 dagar", n: soon.length, tone: soon.length > 0 ? "warn" : undefined, anchor: "panel-gorforst" },
                  { label: "Avslutade", n: done.length, tone: "good" },
                ]}
              />

              {error && <div className="hk-empty">Kunde inte hämta dina uppdrag: {error.message}</div>}

              <h2 className="hk-h2">Dina uppdrag</h2>
              <div className="hk-cols">
                <div id="panel-gorforst" style={{ minWidth: 0, scrollMarginTop: 16 }}>
                  <Panel title="Gör först">
                    {first.length === 0 && <div className="hk-empty">Inget brådskar. 👍</div>}
                    {render(first.slice(0, 8))}
                  </Panel>
                </div>
                <div id="panel-alla" style={{ minWidth: 0, scrollMarginTop: 16 }}>
                  <Panel title="Alla aktiva uppdrag">
                    {sorted.length === 0 && <div className="hk-empty">Du har inga aktiva uppdrag.</div>}
                    {render(sorted)}
                  </Panel>
                </div>
              </div>

              <p className="hk-note">
                Tryck på ett uppdrag för att läsa det, lägga till en kommentar eller bilder, och meddela att uppdraget
                är slutfört. BAYT granskar och avslutar uppdraget.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
