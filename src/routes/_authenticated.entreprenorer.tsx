// ===========================================================================
// Entreprenörer — admins vy över vad som är utdelat och hur det står till.
//
// Frågan sidan finns för är inte "vilka entreprenörer har vi" (det är
// /contacts) utan "vad har vi lämnat ifrån oss, till vem, och vad hände sedan".
// Ett ärende delas genom att tilldelas en entreprenör i <AnsvarigDropdown> —
// samma handling mejlar ut det (src/lib/entreprenor-notify.ts) — och därefter
// har admin hittills inte haft någon plats att följa upp det på annat än att
// öppna ett ärende i taget.
//
// EN ENTREPRENÖR = EN KONTAKTPOST, inte en inloggning. Tilldelningen pekar på
// `contacts.assigned_contact_id`, och en entreprenör kan ha en inloggning
// (`contacts.profile_id`) eller ingen alls — de allra flesta har ingen. Sidan
// grupperar därför på kontakt-id och visar inloggningen som en egenskap, inte
// tvärtom. Kolumnen "Konto" är där för att den är den vanligaste orsaken till
// att en entreprenör säger "jag ser inga ärenden": utan koppling ser de
// ingenting, hur många ärenden som än står här.
//
// Härledd status renderas genom <DerivedStatusBadge> som överallt annars. Ingen
// lokal badgekarta — se CLAUDE.md.
// ===========================================================================

import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, HardHat, Mail, Search, ShieldAlert, UserCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDeladeArenden, arendeHref, arendeKindColor, arendeKindLabel, compareMyArenden, type MyArende } from "@/hooks/useMyArenden";
import { DerivedStatusBadge } from "@/components/DerivedStatusBadge";
import { DERIVED_STATUS, type DerivedStatusKey } from "@/lib/issue-tokens";
import { FilterDropdown, FilterRow, listEmptyText } from "@/components/ListFilterBar";
import { normalizeEmail } from "@/lib/contact-tokens";

export const Route = createFileRoute("/_authenticated/entreprenorer")({
  head: () => ({ meta: [{ title: "Entreprenörer — BAYT" }] }),
  component: EntreprenorerPage,
});

const C = {
  pageBg: "#F7F8F7",
  card: "#FFFFFF",
  border: "#E9EBE9",
  dark: "#0D2B1E",
  green: "#5CB84A",
  primary: "#3D8A30",
  tint: "#F0F7EE",
  text: "#111318",
  secondary: "#5B6169",
  muted: "#9AA0A6",
  warn: "#B45309",
};

const headingFont = "Outfit, Inter, system-ui, sans-serif";
const bodyFont = "Inter, system-ui, sans-serif";

type ContactRow = {
  id: string;
  full_name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  contact_type: string | null;
  profile_id: string | null;
  /** false = pensionerad, se supabase-functions/contacts-active-flag.sql */
  active?: boolean | null;
};

type ProfileRow = { id: string; email: string | null; full_name: string | null; role: string | null };

/** En delegering: `profile_id` får också arbeta som `contact_id`. */
type DelegationRow = { contact_id: string; profile_id: string };

/**
 * Allt sidan behöver om entreprenörerna själva — kontaktposterna, deras
 * inloggningar, delegeringarna och när de senast fick ett ärende mejlat.
 *
 * `select("*")` på contacts av samma skäl som överallt annars: `active` kommer
 * från en handkörd migration och att namnge kolumnen skulle 400:a hela sidan
 * där SQL:en inte är körd.
 */
async function loadEntreprenorer() {
  const { data: contactData, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("contact_type", "entreprenor")
    .order("full_name");
  if (error) throw error;
  const contacts = (contactData ?? []) as unknown as ContactRow[];

  const profileIds = contacts.map((c) => c.profile_id).filter((id): id is string => !!id);
  const profiles = new Map<string, ProfileRow>();
  if (profileIds.length > 0) {
    // Separat uppslag och ingen embed: `contacts.profile_id` har ingen
    // deklarerad FK mot profiles i alla miljöer, och saknas den tar en embed
    // ner hela sidan i stället för bara kontokolumnen.
    const { data } = await supabase
      .from("profiles")
      .select("id, email, full_name, role")
      .in("id", profileIds);
    for (const p of (data ?? []) as ProfileRow[]) profiles.set(p.id, p);
  }

  // Delegeringar är en handkörd migration (account-delegation.sql). Saknas
  // tabellen ska det bli "inga delegeringar", aldrig ett trasigt sidfel.
  let delegations: DelegationRow[] = [];
  {
    const { data, error: delErr } = await supabase
      .from("contact_delegations")
      .select("contact_id, profile_id");
    if (delErr) {
      console.warn("[entreprenorer] contact_delegations kunde inte läsas:", delErr.message);
    } else {
      delegations = (data ?? []) as DelegationRow[];
    }
  }

  // "Senast mejlad" kommer ur loggboken, där notifyEntreprenorAboutIssue skriver
  // "<titel> — skickat till <namn> (<e-post>)". Adressen inom parentes är det
  // enda stabila i den strängen, så matchningen görs på den. Heuristik, inte en
  // koppling: `logbook_entries` har ingen ärende- eller kontaktkolumn, så det
  // här kan bara svara "har den här adressen fått något, och när" — aldrig
  // "gick just det här ärendet iväg".
  const { data: logData } = await supabase
    .from("logbook_entries")
    .select("description, created_at")
    .eq("event_type", "entreprenor_notifierad")
    .order("created_at", { ascending: false })
    .limit(500);

  const lastMailed = new Map<string, string>();
  for (const row of (logData ?? []) as Array<{ description: string | null; created_at: string | null }>) {
    const match = /\(([^()]+@[^()]+)\)\s*$/.exec(row.description ?? "");
    const email = normalizeEmail(match?.[1]);
    if (!email || !row.created_at) continue;
    // Sorterad fallande — första träffen per adress är den senaste.
    if (!lastMailed.has(email)) lastMailed.set(email, row.created_at);
  }

  return { contacts, profiles, delegations, lastMailed };
}

/** En entreprenör med sina ärenden och det som räknats fram ur dem. */
type EntreprenorCard = {
  contact: ContactRow;
  login: ProfileRow | null;
  /** Inloggningar som fått den här kontakten delegerad till sig. */
  delegatedTo: ProfileRow[];
  lastMailedAt: string | null;
  arenden: MyArende[];
  open: MyArende[];
  closed: MyArende[];
  forsenade: number;
  bradskande: number;
};

const STATUS_ORDER: DerivedStatusKey[] = [
  "forsenad",
  "bradskande",
  "pagaende",
  "ny",
  "pausad",
  "avbruten",
  "avslutat",
];

function fmtDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" });
}

function EntreprenorerPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [openOnly, setOpenOnly] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Rutten släpper bara in admin (canAccess), men sidan kontrollerar rollen igen:
  // urvalet nedan är oinskränkt och får inte hänga på ett enda lager.
  const registryQ = useQuery({
    queryKey: ["entreprenorer-registry"],
    enabled: isAdmin,
    queryFn: loadEntreprenorer,
  });
  const { arenden, isLoading: arendenLoading } = useDeladeArenden(isAdmin);

  const cards = useMemo<EntreprenorCard[]>(() => {
    const reg = registryQ.data;
    if (!reg) return [];

    const byContact = new Map<string, MyArende[]>();
    for (const a of arenden) {
      if (!a.assignedContactId) continue;
      const list = byContact.get(a.assignedContactId);
      if (list) list.push(a);
      else byContact.set(a.assignedContactId, [a]);
    }

    const delegatesFor = new Map<string, ProfileRow[]>();
    for (const d of reg.delegations) {
      const p = reg.profiles.get(d.profile_id);
      // Delegeringen kan peka på en inloggning vars profil inte lästes ovan
      // (den är inte kopplad till någon entreprenörskontakt). Då visas id:t inte
      // alls hellre än att gissa ett namn.
      if (!p) continue;
      const list = delegatesFor.get(d.contact_id);
      if (list) list.push(p);
      else delegatesFor.set(d.contact_id, [p]);
    }

    // En kontakt utan ärenden hör hemma i listan ändå: "ingenting utdelat" är
    // ett svar på sidans fråga, inte frånvaron av ett.
    return reg.contacts
      .map((contact) => {
        const list = (byContact.get(contact.id) ?? []).slice().sort(compareMyArenden);
        const open = list.filter((a) => a.lifecycle !== "avslutat" && a.status.key !== "avslutat");
        const closed = list.filter((a) => a.lifecycle === "avslutat" || a.status.key === "avslutat");
        return {
          contact,
          login: contact.profile_id ? (reg.profiles.get(contact.profile_id) ?? null) : null,
          delegatedTo: delegatesFor.get(contact.id) ?? [],
          lastMailedAt: reg.lastMailed.get(normalizeEmail(contact.email) ?? "") ?? null,
          arenden: list,
          open,
          closed,
          forsenade: open.filter((a) => a.status.key === "forsenad").length,
          bradskande: open.filter((a) => a.status.key === "bradskande").length,
        };
      })
      // Mest angeläget överst: försenade, sedan brådskande, sedan flest öppna.
      // En entreprenör utan något utdelat hamnar sist men försvinner inte.
      .sort((a, b) => {
        if (a.forsenade !== b.forsenade) return b.forsenade - a.forsenade;
        if (a.bradskande !== b.bradskande) return b.bradskande - a.bradskande;
        if (a.open.length !== b.open.length) return b.open.length - a.open.length;
        return (a.contact.full_name ?? "").localeCompare(b.contact.full_name ?? "", "sv");
      });
  }, [registryQ.data, arenden]);

  const filterActive = !!search.trim() || !!kindFilter || !!statusFilter;

  // Filtren gäller ärenderaderna. Ett kort vars alla rader filtrerats bort
  // faller ur listan — annars läser en sida full av tomma kort som om varje
  // entreprenör plötsligt saknade arbete.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return cards
      .map((card) => {
        let rows = openOnly ? card.open : card.arenden;
        if (kindFilter) rows = rows.filter((a) => a.kind === kindFilter);
        if (statusFilter) rows = rows.filter((a) => a.status.key === statusFilter);
        if (term) {
          const nameHit =
            (card.contact.full_name ?? "").toLowerCase().includes(term) ||
            (card.contact.company ?? "").toLowerCase().includes(term) ||
            (card.contact.email ?? "").toLowerCase().includes(term);
          if (!nameHit) {
            rows = rows.filter(
              (a) =>
                a.title.toLowerCase().includes(term) ||
                (a.propertyName ?? "").toLowerCase().includes(term) ||
                (a.placeLabel ?? "").toLowerCase().includes(term),
            );
          }
        }
        return { card, rows };
      })
      // Ofiltrerat är sidan hela registret: varje entreprenör syns, även den som
      // inte har något utdelat just nu — "ingenting hos hen" är ett svar på
      // sidans fråga. Så fort ett filter är på är ett tomt kort däremot bara
      // brus, och då faller det ur listan.
      //
      // "Endast pågående" räknas medvetet inte som ett filter här: en
      // entreprenör som blivit klar med allt ska inte försvinna ur registret,
      // bara stå med noll pågående.
      .filter(({ rows }) => rows.length > 0 || !filterActive);
  }, [cards, search, kindFilter, statusFilter, openOnly, filterActive]);


  const totals = useMemo(() => {
    const open = cards.flatMap((c) => c.open);
    return {
      entreprenorer: cards.filter((c) => c.arenden.length > 0).length,
      delade: cards.reduce((n, c) => n + c.arenden.length, 0),
      oppna: open.length,
      forsenade: open.filter((a) => a.status.key === "forsenad").length,
      utanKonto: cards.filter((c) => c.arenden.length > 0 && !c.login).length,
    };
  }, [cards]);

  const statusOptions = useMemo(() => {
    const present = new Set(
      cards.flatMap((c) => (openOnly ? c.open : c.arenden)).map((a) => a.status.key),
    );
    return STATUS_ORDER.filter((k) => present.has(k)).map((k) => ({
      value: k,
      label: DERIVED_STATUS[k].label,
    }));
  }, [cards, openOnly]);

  if (!isAdmin) {
    return (
      <div style={{ background: C.pageBg, minHeight: "100%", padding: 40, fontFamily: bodyFont }}>
        <div style={{ maxWidth: 520, margin: "0 auto", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, display: "flex", gap: 12 }}>
          <ShieldAlert size={20} color={C.warn} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 14, color: C.secondary, lineHeight: 1.6 }}>
            Entreprenörsvyn visar vad som är utdelat till samtliga entreprenörer och är därför
            förbehållen administratörer.
          </div>
        </div>
      </div>
    );
  }

  const isLoading = registryQ.isLoading || arendenLoading;

  return (
    <div style={{ background: C.pageBg, minHeight: "100%", padding: isMobile ? 20 : 40, fontFamily: bodyFont }}>
      <div style={{ maxWidth: 1040, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontFamily: headingFont, fontSize: isMobile ? 22 : 26, fontWeight: 600, letterSpacing: "-0.01em", color: C.text, margin: 0 }}>
              Entreprenörer
            </h1>
            <div style={{ fontSize: 13, color: C.secondary, marginTop: 4 }}>
              Ärenden som delats ut, till vem, och hur de står just nu.
            </div>
          </div>
          <Link
            to="/contacts"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 14px",
              background: C.card, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8,
              textDecoration: "none", fontSize: 13.5, fontWeight: 600, fontFamily: headingFont,
              whiteSpace: "nowrap", flexShrink: 0,
            }}
          >
            Kontaktregistret
          </Link>
        </div>

        <KpiRow totals={totals} isMobile={isMobile} />

        <FilterRow>
          <div style={{ position: "relative", flex: "1 1 200px", minWidth: 0 }}>
            <Search size={14} color={C.muted} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sök entreprenör, ärende eller fastighet"
              style={{
                width: "100%", height: 30, padding: "0 10px 0 28px", borderRadius: 8,
                border: `1px solid ${search.trim() ? C.green : C.border}`, background: C.card,
                fontSize: 12.5, color: C.text, outline: "none", boxSizing: "border-box", minWidth: 0,
                fontFamily: bodyFont,
              }}
            />
          </div>
          <FilterDropdown
            options={[
              { value: "issue", label: "Felanmälningar" },
              { value: "inspection", label: "Besiktningar" },
              { value: "project", label: "Projekt" },
            ]}
            value={kindFilter}
            onChange={setKindFilter}
            resting="Alla ärendetyper"
            ariaLabel="Filtrera på ärendetyp"
          />
          <FilterDropdown
            options={statusOptions}
            value={statusFilter}
            onChange={setStatusFilter}
            resting="Alla statusar"
            ariaLabel="Filtrera på härledd status"
          />
          <button
            type="button"
            onClick={() => setOpenOnly((v) => !v)}
            aria-pressed={openOnly}
            title={openOnly ? "Visa även avslutade ärenden" : "Visa bara pågående ärenden"}
            style={{
              height: 30, padding: "0 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
              cursor: "pointer", fontFamily: bodyFont, whiteSpace: "nowrap",
              border: `1px solid ${openOnly ? C.green : C.border}`,
              background: openOnly ? C.tint : C.card,
              color: openOnly ? C.primary : C.secondary,
            }}
          >
            {openOnly ? "Endast pågående" : "Inklusive avslutade"}
          </button>
          {(filterActive || !openOnly) && (
            <button
              type="button"
              onClick={() => { setSearch(""); setKindFilter(null); setStatusFilter(null); setOpenOnly(true); }}
              style={{ height: 30, padding: "0 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: bodyFont, border: `1px solid ${C.border}`, background: C.card, color: C.secondary }}
            >
              Rensa
            </button>
          )}
        </FilterRow>

        {isLoading ? (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, color: C.secondary, fontSize: 14 }}>
            Laddar…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "48px 24px", textAlign: "center" }}>
            <HardHat size={28} color={C.muted} style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 14, color: C.secondary }}>
              {listEmptyText(filterActive, "Inga entreprenörer med utdelade ärenden", "entreprenörer")}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.map(({ card, rows }) => (
              <EntreprenorCardView
                key={card.contact.id}
                card={card}
                rows={rows}
                isMobile={isMobile}
                expanded={expanded[card.contact.id] ?? false}
                onToggle={() =>
                  setExpanded((e) => ({ ...e, [card.contact.id]: !(e[card.contact.id] ?? false) }))
                }
                // Fastighet först — samma arendeHref som Dag Rapports sheet, så
                // de två vyerna aldrig kan länka olika.
                onOpenArende={(a) => navigate({ to: arendeHref(a) as never })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiRow({
  totals,
  isMobile,
}: {
  totals: { entreprenorer: number; delade: number; oppna: number; forsenade: number; utanKonto: number };
  isMobile: boolean;
}) {
  const items: Array<{ label: string; value: number; tone?: "warn" | "danger" }> = [
    { label: "Entreprenörer med ärenden", value: totals.entreprenorer },
    { label: "Utdelade ärenden", value: totals.delade },
    { label: "Pågående", value: totals.oppna },
    { label: "Försenade", value: totals.forsenade, tone: totals.forsenade > 0 ? "danger" : undefined },
    { label: "Utan inloggning", value: totals.utanKonto, tone: totals.utanKonto > 0 ? "warn" : undefined },
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(5, minmax(0, 1fr))",
        gap: 10,
      }}
    >
      {items.map((i) => (
        <div
          key={i.label}
          style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
            padding: "12px 14px", minWidth: 0,
            boxShadow: "0 1px 3px rgba(13,43,30,0.04)",
          }}
        >
          <div
            style={{
              fontFamily: headingFont, fontSize: 22, fontWeight: 600, lineHeight: 1.1,
              color: i.tone === "danger" ? "#DC2626" : i.tone === "warn" ? C.warn : C.dark,
            }}
          >
            {i.value}
          </div>
          <div style={{ fontSize: 11.5, color: C.secondary, marginTop: 3, lineHeight: 1.3 }}>{i.label}</div>
        </div>
      ))}
    </div>
  );
}

function EntreprenorCardView({
  card,
  rows,
  isMobile,
  expanded,
  onToggle,
  onOpenArende,
}: {
  card: EntreprenorCard;
  rows: MyArende[];
  isMobile: boolean;
  expanded: boolean;
  onToggle: () => void;
  onOpenArende: (a: MyArende) => void;
}) {
  const { contact, login, delegatedTo, lastMailedAt } = card;
  const name = contact.full_name?.trim() || "Namnlös entreprenör";
  const retired = contact.active === false;

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        boxShadow: "0 1px 3px rgba(13,43,30,0.04)",
        overflow: "hidden",
        opacity: retired ? 0.72 : 1,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12, padding: isMobile ? "13px 14px" : "14px 18px",
          background: "transparent", border: "none", cursor: "pointer", textAlign: "left", fontFamily: bodyFont,
        }}
      >
        {expanded ? <ChevronDown size={16} color={C.muted} /> : <ChevronRight size={16} color={C.muted} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: headingFont, fontWeight: 600, fontSize: 15, color: C.text }}>{name}</span>
            {contact.company?.trim() && (
              <span style={{ fontSize: 12.5, color: C.secondary }}>{contact.company.trim()}</span>
            )}
            {retired && <Pill bg="#F3F4F6" color={C.muted}>Inaktiv</Pill>}
          </div>
          <div style={{ fontSize: 12.5, color: C.secondary, marginTop: 3, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <AccountState login={login} delegatedTo={delegatedTo} />
            {contact.email?.trim() && <span style={{ color: C.muted }}>· {contact.email.trim()}</span>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {card.forsenade > 0 && <Pill bg={DERIVED_STATUS.forsenad.bg} color={DERIVED_STATUS.forsenad.color}>{card.forsenade} försenade</Pill>}
          {card.bradskande > 0 && <Pill bg={DERIVED_STATUS.bradskande.bg} color={DERIVED_STATUS.bradskande.color}>{card.bradskande} brådskande</Pill>}
          <Pill bg={C.tint} color={C.primary}>{card.open.length} pågående</Pill>
          {!isMobile && <Pill bg="#F5F6F5" color={C.secondary}>{card.arenden.length} totalt</Pill>}
        </div>
      </button>

      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}` }}>
          <div style={{ padding: isMobile ? "10px 14px" : "10px 18px", background: "#FBFCFB", borderBottom: `1px solid ${C.border}`, fontSize: 12.5, color: C.secondary, display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Mail size={13} color={C.muted} />
              Senast mejlad: {fmtDate(lastMailedAt)}
            </span>
            <span>Avslutade: {card.closed.length}</span>
            {contact.phone?.trim() && <span>Telefon: {contact.phone.trim()}</span>}
          </div>

          {rows.length === 0 ? (
            <div style={{ padding: "24px 18px", fontSize: 13.5, color: C.secondary }}>
              Inga ärenden för det här valet.
            </div>
          ) : (
            rows.map((a, i) => (
              <div
                key={`${a.kind}-${a.id}`}
                onClick={() => onOpenArende(a)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") onOpenArende(a); }}
                style={{
                  display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
                  padding: isMobile ? "12px 14px" : "12px 18px",
                  borderBottom: i === rows.length - 1 ? "none" : `1px solid ${C.border}`,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFBFA")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span
                  aria-hidden
                  style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: arendeKindColor(a.kind), flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.title}
                  </div>
                  <div style={{ fontSize: 12, color: C.secondary, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {[arendeKindLabel(a.kind), a.propertyName, a.placeLabel].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: C.muted, flexShrink: 0, textAlign: "right", minWidth: 0 }}>
                  {a.status.dueDate ? fmtDate(a.status.dueDate) : "Ingen tidsgräns"}
                </div>
                <DerivedStatusBadge status={a.status} />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Kontokolumnen. Tre utfall och de betyder olika saker för admin:
 *   - inloggning finns        → entreprenören kan se sina ärenden i portalen
 *   - delegerad till någon    → någon annans inloggning arbetar som den här
 *                               kontakten (se account-delegation.sql)
 *   - ingen inloggning alls   → ärendena finns, men de syns bara i mejlet
 */
function AccountState({ login, delegatedTo }: { login: ProfileRow | null; delegatedTo: ProfileRow[] }) {
  if (login) {
    return (
      <>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: C.primary, fontWeight: 600 }}>
          <UserCheck size={13} /> {login.email ?? "Inloggning kopplad"}
        </span>
        {delegatedTo.length > 0 && (
          <span style={{ color: C.muted }}>
            · delas med {delegatedTo.map((p) => p.email ?? p.full_name ?? "okänt konto").join(", ")}
          </span>
        )}
      </>
    );
  }
  if (delegatedTo.length > 0) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: C.primary, fontWeight: 600 }}>
        <UserCheck size={13} /> Sköts av {delegatedTo.map((p) => p.email ?? p.full_name ?? "okänt konto").join(", ")}
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: C.warn, fontWeight: 600 }}>
      <ShieldAlert size={13} /> Ingen inloggning
    </span>
  );
}

function Pill({ children, bg, color }: { children: React.ReactNode; bg: string; color: string }) {
  return (
    <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 999, fontSize: 11.5, fontWeight: 600, background: bg, color, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}
