import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { CalendarCheckIn01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/lib/auth";
import { BottomSheet } from "@/components/BottomSheet";
import { DerivedStatusBadge } from "@/components/DerivedStatusBadge";
import { todayISO } from "@/lib/issue-tokens";
import { OppnaArendeButton, canOppnaArende } from "@/components/OppnaArendeButton";
import { AvslutaArendeButton, canAvslutaArende } from "@/components/AvslutaArendeButton";
import {
  useMyArenden,
  useByggnadensArenden,
  arendeKindColor,
  arendeKindLabel,
  type MyArende,
  type MyArendeKind,
} from "@/hooks/useMyArenden";

/**
 * Dag Rapport for the entreprenör role — their landing page and the only view
 * they need to run a day from.
 *
 * Two lists, both showing nothing but ärenden assigned to them (useMyArenden
 * filters on assigned_contact_id):
 *   1. Öppna ärenden — the work they have started. Tap a row → details → Avsluta.
 *   2. Alla ärenden — the full worklist in deadline order, prioritet as
 *      tie-break. Tap a row → details → Öppna (when it is still vilande).
 *
 * Section 1 is a subset of section 2 on purpose: "what I have started" is worth
 * its own list even though the row also appears in the complete one. Avslutade
 * ärenden appear in neither — those belong in the (not yet built) Avslutat view.
 *
 * Every status write goes through OppnaArendeButton/AvslutaArendeButton, which
 * are the only writers of an ärende's lifecycle column and already handle
 * issue_status_history + the loggbok entry.
 */

const C = {
  text: "#1F2A37",
  secondary: "#6B7280",
  muted: "#8A94A0",
  border: "#E5E7EB",
  hairline: "#F1F3F5",
  card: "#FFFFFF",
  wash: "#F9FAFB",
  green: "#3D8A30",
  dark: "#0D2B1E",
  red: "#B91C1C",
};

const HEADING_FONT = "Outfit, Inter, system-ui, sans-serif";

const dayFmt = new Intl.DateTimeFormat("sv-SE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** "Måndag 27 juli 2026" — veckodag först, som ute på fältet. */
function formatDeadlineDay(iso: string): string {
  const s = dayFmt.format(new Date(`${iso}T00:00:00`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Where the tidsgräns came from, in three words or less. */
const DUE_CAPTION: Record<string, string> = {
  deadline: "Deadline",
  prioritet: "Enligt prioritet",
  intervall: "Enligt intervall",
};

function DueDate({ arende, align = "right" }: { arende: MyArende; align?: "right" | "left" }) {
  const { dueDate, dueSource, daysLeft } = arende.status;
  const overdue = daysLeft !== null && daysLeft < 0;

  if (!dueDate) {
    return (
      <div style={{ textAlign: align, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Tidsgräns
        </div>
        <div style={{ fontSize: 13, color: C.secondary }}>Ingen satt</div>
      </div>
    );
  }

  return (
    <div style={{ textAlign: align, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {DUE_CAPTION[dueSource ?? ""] ?? "Tidsgräns"}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: overdue ? C.red : C.text, whiteSpace: "nowrap" }}>
        {formatDeadlineDay(dueDate)}
      </div>
    </div>
  );
}

function ArendeRow({
  arende,
  onPick,
  showAssignee = false,
}: {
  arende: MyArende;
  onPick: () => void;
  /** Styrelsen läser listan för att se vem som ska utföra jobbet. */
  showAssignee?: boolean;
}) {
  const isMobile = useIsMobile();
  const kindColor = arendeKindColor(arende.kind);

  return (
    <button
      type="button"
      onClick={onPick}
      style={{
        display: "flex",
        alignItems: isMobile ? "flex-start" : "center",
        flexDirection: isMobile ? "column" : "row",
        gap: isMobile ? 8 : 14,
        width: "100%",
        padding: "14px 16px",
        border: "none",
        borderBottom: `1px solid ${C.hairline}`,
        background: "transparent",
        textAlign: "left",
        cursor: "pointer",
        font: "inherit",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, width: isMobile ? "100%" : undefined }}>
        <span
          aria-hidden
          style={{ width: 8, height: 8, borderRadius: "50%", background: kindColor, flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: C.text,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {arende.title}
            </span>
            {arende.priorityKey === "akut" && (
              <span
                title={arende.priorityReason}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  color: "#B91C1C",
                  background: "#FDE8E8",
                  borderRadius: 4,
                  padding: "2px 6px",
                  flexShrink: 0,
                }}
              >
                AKUT
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: C.secondary, marginTop: 3 }}>
            {arendeKindLabel(arende.kind)}
            {arende.propertyName ? ` · ${arende.propertyName}` : ""}
            {arende.placeLabel ? ` · ${arende.placeLabel}` : ""}
            {showAssignee ? ` · ${arende.assignedName ?? "Ej tilldelad"}` : ""}
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexShrink: 0,
          paddingLeft: isMobile ? 18 : 0,
        }}
      >
        <DueDate arende={arende} align={isMobile ? "left" : "right"} />
        <DerivedStatusBadge status={arende.status} />
      </div>
    </button>
  );
}

function Section({
  title,
  subtitle,
  rows,
  empty,
  onPick,
  showAssignee = false,
}: {
  title: string;
  subtitle: string;
  rows: MyArende[];
  empty: string;
  onPick: (a: MyArende) => void;
  showAssignee?: boolean;
}) {
  return (
    <section
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
      }}
    >
      <div
        style={{
          padding: "14px 16px",
          borderBottom: `1px solid ${C.hairline}`,
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontFamily: HEADING_FONT, fontSize: 16, fontWeight: 600, color: C.text }}>
            {title}
          </h2>
          <div style={{ fontSize: 12, color: C.secondary, marginTop: 2 }}>{subtitle}</div>
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: C.muted,
            letterSpacing: "0.08em",
            flexShrink: 0,
          }}
        >
          {rows.length}
        </div>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: 24, color: C.secondary, fontSize: 14 }}>{empty}</div>
      ) : (
        rows.map((a) => (
          <ArendeRow key={`${a.kind}-${a.id}`} arende={a} onPick={() => onPick(a)} showAssignee={showAssignee} />
        ))
      )}
    </section>
  );
}

/** Section slug per ärendetyp, for the building-scoped detail URL. */
const KIND_SECTION: Record<MyArendeKind, string> = {
  issue: "issues",
  inspection: "inspections",
  project: "projects",
};

/**
 * Where "Öppna ärendet" goes — through the fastighet, exactly like every other
 * ärende link in the portal (see IssuesTab in property-tabs.tsx). Building först
 * is the navigation model, so the sheet must not shortcut past it.
 * The flat `/issues/:id` form is only a fallback for an ärende with no fastighet.
 */
function arendeHref(a: MyArende): string {
  const section = KIND_SECTION[a.kind];
  if (a.propertyId) return `/properties/${a.propertyId}/${section}/${a.id}`;
  return `/${section}/${a.id}`;
}

function SheetRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: C.text, marginTop: 3, wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}

function ArendeSheet({
  arende,
  onClose,
  readOnly = false,
}: {
  arende: MyArende;
  onClose: () => void;
  /**
   * Styrelsens läge. Hela livscykelraden utelämnas — inte utgråad, inte dold
   * med CSS: knapparna renderas aldrig. Styrelsen är läsbehörig per spec och
   * ska inte ens se att Öppna/Avsluta finns som möjlighet.
   */
  readOnly?: boolean;
}) {
  const isMobile = useIsMobile();
  const canOpen = canOppnaArende(arende.kind, arende.lifecycleStatus, arende.projektStatus);
  // allowVilande: ett vilande ärende kan stängas direkt härifrån, se nedan.
  // projektStatus: ett avbrutet projekt har ingen livscykelåtgärd kvar.
  const canClose = canAvslutaArende(arende.kind, arende.lifecycleStatus, {
    allowVilande: true,
    projektStatus: arende.projektStatus,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: arendeKindColor(arende.kind),
          }}
        >
          <span
            aria-hidden
            style={{ width: 7, height: 7, borderRadius: "50%", background: arendeKindColor(arende.kind) }}
          />
          {arendeKindLabel(arende.kind)}
        </div>
        <h2 style={{ margin: "6px 0 0", fontFamily: HEADING_FONT, fontSize: 20, fontWeight: 700, color: C.text }}>
          {arende.title}
        </h2>
        <div style={{ fontSize: 13, color: C.secondary, marginTop: 4 }}>
          {arende.propertyName ?? "—"}
          {arende.placeLabel ? ` · ${arende.placeLabel}` : ""}
        </div>
        {/*
          Länken till hela ärendesidan ligger här uppe, inte i knappraden längst
          ner. Den satt tidigare bredvid Öppna och lästes som ännu en
          öppna-knapp — två knappar intill varandra som verkade göra samma sak.
          Knappraden är nu bara livscykeln; navigering är en textlänk.
        */}
        <Link
          to={arendeHref(arende) as never}
          onClick={onClose}
          style={{
            display: "inline-block",
            marginTop: 8,
            fontSize: 13,
            fontWeight: 600,
            color: C.green,
            textDecoration: "underline",
          }}
        >
          Visa hela ärendet
        </Link>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <DerivedStatusBadge status={arende.status} size="field" />
        <span style={{ fontSize: 13, fontWeight: 600, color: arende.priorityColor }} title={arende.priorityReason}>
          Prioritet {arende.priorityLabel.toLowerCase()}
        </span>
      </div>
      <div style={{ fontSize: 12, color: C.secondary, lineHeight: 1.5, marginTop: -8 }}>{arende.status.reason}</div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 14,
          padding: 14,
          background: C.wash,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
        }}
      >
        <SheetRow
          label={DUE_CAPTION[arende.status.dueSource ?? ""] ?? "Tidsgräns"}
          value={
            arende.status.dueDate ? (
              <span style={{ color: (arende.status.daysLeft ?? 0) < 0 ? C.red : C.text, fontWeight: 600 }}>
                {formatDeadlineDay(arende.status.dueDate)}
              </span>
            ) : (
              "Ingen satt"
            )
          }
        />
        {arende.meta.map((m) => (
          <SheetRow key={m.label} label={m.label} value={m.value} />
        ))}
      </div>

      {arende.description && (
        <div>
          <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
            Beskrivning
          </div>
          <div
            style={{
              background: C.wash,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: 12,
              fontSize: 14,
              color: C.text,
              whiteSpace: "pre-wrap",
            }}
          >
            {arende.description}
          </div>
        </div>
      )}

      {/*
        Knappraden är exakt livscykeln, inget annat:
          vilande → [Öppna ärende] [Avsluta ärende]
          oppet   → [Avsluta ärende]
        Avsluta ärende på ett vilande ärende är genvägen: ett ärende som inte
        behövde göras kan avslutas på ett klick utan att först öppnas. Samma
        knapp, samma övergång (samma statusrad, samma loggboksrad) — loggboken
        visar vilande → avslutat.
      */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {!readOnly && (
          <>
            <OppnaArendeButton
              kind={arende.kind}
              id={arende.id}
              currentStatus={arende.lifecycleStatus}
              projektStatus={arende.projektStatus}
              title={arende.title}
              propertyId={arende.propertyId}
              apartmentId={arende.apartmentId}
              onDone={onClose}
            />
            <AvslutaArendeButton
              kind={arende.kind}
              id={arende.id}
              currentStatus={arende.lifecycleStatus}
              projektStatus={arende.projektStatus}
              title={arende.title}
              propertyId={arende.propertyId}
              apartmentId={arende.apartmentId}
              allowVilande
              onDone={onClose}
            />
            {!canOpen && !canClose && (
              <div style={{ fontSize: 13, color: C.secondary }}>
                {arende.kind === "project" && arende.projektStatus === "avbruten"
                  ? "Projektet är avbrutet."
                  : arende.lifecycle === "avslutat"
                    ? "Ärendet är avslutat."
                    : "Ärendet saknar livscykelstatus — kontakta förvaltaren för att få det öppnat."}
              </div>
            )}
          </>
        )}
        <button
          type="button"
          onClick={onClose}
          style={{
            marginLeft: "auto",
            height: 40,
            padding: "0 16px",
            background: "transparent",
            color: C.secondary,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {/* Stänger vyn, inte ärendet — därav inte "Stäng", som nu betyder
              något helt annat i den här raden. */}
          Tillbaka
        </button>
      </div>
    </div>
  );
}

type ViewCopy = {
  /** Raden under rubriken, efter datum och namn. */
  lead: string;
  oppnaTitle: string;
  oppnaSubtitle: string;
  oppnaEmpty: string;
  allaSubtitle: string;
  allaEmpty: string;
  nothingToDo: string;
  errorPrefix: string;
};

/**
 * Dag Rapport-vyn, delad av entreprenören och styrelsen.
 *
 * Skillnaden är två saker och inget annat: varifrån ärendena kommer
 * (tilldelade mig vs mina fastigheter) och om livscykelknapparna finns.
 * Layout, sortering, härledd status och bottenarket är avsiktligt identiska —
 * styrelsen ska se exakt samma arbetslista som utföraren, bara utan handtagen.
 */
function DagRapportView({
  arenden,
  isLoading,
  error,
  copy,
  readOnly = false,
  showAssignee = false,
  notice,
}: {
  arenden: MyArende[];
  isLoading: boolean;
  error: Error | null;
  copy: ViewCopy;
  readOnly?: boolean;
  showAssignee?: boolean;
  notice?: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  const { profile } = useAuth();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const oppna = useMemo(() => arenden.filter((a) => a.lifecycle === "oppet"), [arenden]);
  // "Alla" = hela arbetslistan. Avslutade ärenden hör hemma i Avslutat, inte här.
  const alla = useMemo(() => arenden.filter((a) => a.lifecycle !== "avslutat"), [arenden]);
  const selected = useMemo(
    () => arenden.find((a) => `${a.kind}-${a.id}` === selectedKey) ?? null,
    [arenden, selectedKey],
  );

  const todayLabel = formatDeadlineDay(todayISO());

  return (
    <div style={{ padding: isMobile ? 16 : 32, display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <HugeiconsIcon icon={CalendarCheckIn01Icon} size={22} color={C.green} />
          <h1 style={{ fontFamily: HEADING_FONT, fontSize: isMobile ? 22 : 26, fontWeight: 700, color: C.text, margin: 0 }}>
            Dag Rapport
          </h1>
        </div>
        <div style={{ fontSize: 13, color: C.secondary, marginTop: 6 }}>
          {todayLabel}
          {profile?.full_name ? ` · ${profile.full_name}` : ""} · {copy.lead}
        </div>
      </div>

      {notice}

      {/*
        Den gamla gula "ditt konto är inte kopplat till någon kontaktpost"-rutan
        låg här. Den är borttagen med flit: kopplingen login → kontaktpost lagar
        sig numera själv på e-post (useMyContactId → ensure_my_contact_link, och
        triggarna i supabase-functions/account-continuity.sql). En raderad och
        återinbjuden entreprenör tar vid där de slutade i stället för att mötas
        av en återvändsgränd. Lägg inte tillbaka rutan.
      */}

      {error && (
        <div
          style={{
            padding: "14px 16px",
            background: "#FDE8E8",
            border: "1px solid #F5C2C2",
            borderRadius: 12,
            fontSize: 13,
            color: C.red,
          }}
        >
          {copy.errorPrefix} {error.message}
        </div>
      )}

      {isLoading ? (
        <div style={{ color: C.secondary, fontSize: 14 }}>Laddar…</div>
      ) : (
        <>
          <Section
            title={copy.oppnaTitle}
            subtitle={copy.oppnaSubtitle}
            rows={oppna}
            empty={copy.oppnaEmpty}
            onPick={(a) => setSelectedKey(`${a.kind}-${a.id}`)}
            showAssignee={showAssignee}
          />

          <Section
            title="Alla ärenden"
            subtitle={copy.allaSubtitle}
            rows={alla}
            empty={copy.allaEmpty}
            onPick={(a) => setSelectedKey(`${a.kind}-${a.id}`)}
            showAssignee={showAssignee}
          />

          {alla.length === 0 && oppna.length === 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "14px 16px",
                color: C.secondary,
                fontSize: 13,
              }}
            >
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} color={C.green} />
              {copy.nothingToDo}
            </div>
          )}
        </>
      )}

      <BottomSheet open={!!selected} onClose={() => setSelectedKey(null)} heightVh={80}>
        {selected && (
          <ArendeSheet arende={selected} onClose={() => setSelectedKey(null)} readOnly={readOnly} />
        )}
      </BottomSheet>
    </div>
  );
}

/** Entreprenörens vy: bara tilldelade ärenden, med livscykelknapparna. */
export function EntreprenorDagRapport() {
  const { arenden, isLoading, error } = useMyArenden();

  return (
    <DagRapportView
      arenden={arenden}
      isLoading={isLoading}
      error={error}
      copy={{
        lead: "dina tilldelade ärenden",
        oppnaTitle: "Öppna ärenden",
        oppnaSubtitle: "Ärenden du har öppnat och arbetar med — avsluta dem här när de är klara",
        oppnaEmpty: "Inga öppna ärenden just nu. Öppna ett ärende i listan nedan för att börja.",
        allaSubtitle: "Alla ärenden som är tilldelade dig, sorterade på deadline och därefter prioritet",
        allaEmpty: "Du har inga tilldelade ärenden.",
        nothingToDo: "Inget att göra just nu — nya ärenden dyker upp här så fort du blir tilldelad ett.",
        errorPrefix: "Kunde inte hämta dina ärenden:",
      }}
    />
  );
}

/**
 * Styrelsens vy: samma arbetslista, men för fastigheterna de är kopplade till
 * och helt utan handtag.
 *
 * Varför den finns: styrelsen beställer inte arbetet och utför det inte, men de
 * behöver veta vad som är på gång i huset och när — det är exakt vad Dag
 * Rapport visar. Därav ansvarig i varje rad: frågan de faktiskt har är "vad
 * händer, av vem, och när".
 *
 * readOnly är inte kosmetik. Styrelsen är läsbehörig per spec, så Öppna/Avsluta
 * renderas aldrig — varken i listan eller i bottenarket. Livscykelknapparna
 * gömmer sig dessutom själva för styrelse (isStyrelse-kontrollen inuti
 * OppnaArendeButton/AvslutaArendeButton), så skyddet ligger i två lager.
 */
export function StyrelseDagRapport() {
  const { arenden, isLoading, error, noProperties } = useByggnadensArenden();

  return (
    <DagRapportView
      arenden={arenden}
      isLoading={isLoading}
      error={error}
      readOnly
      showAssignee
      copy={{
        lead: "ärenden i dina fastigheter",
        oppnaTitle: "Pågående arbete",
        oppnaSubtitle: "Ärenden som entreprenören har öppnat och arbetar med just nu",
        oppnaEmpty: "Inget arbete är påbörjat just nu.",
        allaSubtitle: "Allt som är planerat eller pågår i dina fastigheter, sorterat på deadline",
        allaEmpty: "Inga pågående ärenden i dina fastigheter.",
        nothingToDo: "Inget på gång just nu — nya ärenden dyker upp här så fort de registreras.",
        errorPrefix: "Kunde inte hämta fastigheternas ärenden:",
      }}
      notice={
        noProperties ? (
          <div
            style={{
              padding: "14px 16px",
              background: "#FFF3CD",
              border: "1px solid #F2E2A8",
              borderRadius: 12,
              fontSize: 13,
              color: "#856404",
            }}
          >
            Ditt konto är inte kopplat till någon fastighet ännu. Kontakta förvaltaren.
          </div>
        ) : null
      }
    />
  );
}