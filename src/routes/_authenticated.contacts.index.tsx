import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useIsMobile } from "@/hooks/use-mobile";
import { CONTACT_TYPE_LABEL, CONTACT_TYPE_BADGE } from "@/lib/contact-tokens";
import {
  ContactFilterBar,
  contactTypeKey,
  sortContacts,
  useContactSort,
  usePresentContactTypes,
} from "@/components/ContactFilterBar";

export const Route = createFileRoute("/_authenticated/contacts/")({
  head: () => ({ meta: [{ title: "Kontakter — BAYT" }] }),
  component: ContactsPage,
});

const C = {
  pageBg: "#F7F8F7",
  card: "#FFFFFF",
  border: "#E9EBE9",
  green: "#5CB84A",
  text: "#111318",
  secondary: "#5B6169",
  muted: "#9AA0A6",
};

const headingFont = "Outfit, Inter, system-ui, sans-serif";
const bodyFont = "Inter, system-ui, sans-serif";

type ContactRow = {
  id: string;
  full_name: string;
  contact_type: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  property_id: string | null;
  created_at: string | null;
  properties: { name: string | null } | null;
  /** false = retired, see supabase-functions/contacts-active-flag.sql */
  active?: boolean | null;
};

function Badge({ type }: { type: string | null }) {
  if (!type) return null;
  const s = CONTACT_TYPE_BADGE[type] ?? { bg: "#F0F0F0", color: C.secondary };
  return (
    <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>
      {CONTACT_TYPE_LABEL[type] ?? type}
    </span>
  );
}

function ContactsPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [buildingFilter, setBuildingFilter] = useState<string>(""); // "" = alla
  const [typeFilter, setTypeFilter] = useState<string | null>(null); // null = alla typer
  // Sorteringen är en egen axel: den ordnar det som filtren har lämnat kvar,
  // och de två filtren kan vara påslagna samtidigt som den.
  const sort = useContactSort();

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["contacts", "all"],
    queryFn: async () => {
      // select("*") — `active` comes from a hand-run migration
      // (supabase-functions/contacts-active-flag.sql); naming it explicitly
      // would break this list if the frontend ships before the SQL is applied.
      const { data, error } = await supabase
        .from("contacts")
        .select("*, properties(name)")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as unknown as ContactRow[];
    },
  });

  // Build the filter options from whichever buildings actually have contacts.
  const buildings = useMemo(() => {
    const map = new Map<string, string>();
    let hasUnassigned = false;
    for (const c of contacts) {
      if (c.property_id && c.properties?.name) map.set(c.property_id, c.properties.name);
      else if (!c.property_id) hasUnassigned = true;
    }
    const list = Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    return { list, hasUnassigned };
  }, [contacts]);

  const byBuilding = useMemo(() => {
    if (!buildingFilter) return contacts;
    if (buildingFilter === "__none__") return contacts.filter((c) => !c.property_id);
    return contacts.filter((c) => c.property_id === buildingFilter);
  }, [contacts, buildingFilter]);

  // Kontakttypschipen byggs ur raderna som överlevt fastighetsfiltret, inte ur
  // slutresultatet: härleds de ur det fullt filtrerade setet kollapsar raden
  // till det chip man just tryckt på, som om de andra typerna slutat finnas.
  const presentTypes = usePresentContactTypes(byBuilding, typeFilter);

  const filtered = useMemo(() => {
    const rows = typeFilter ? byBuilding.filter((c) => contactTypeKey(c) === typeFilter) : byBuilding;
    return sortContacts(rows, sort);
  }, [byBuilding, typeFilter, sort]);

  const filterActive = buildingFilter !== "" || typeFilter !== null;

  return (
    <div style={{ background: C.pageBg, minHeight: "100%", padding: isMobile ? 20 : 40, fontFamily: bodyFont }}>
      <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Header row: title + Ny kontakt. Filtren ligger på egen rad under —
            de fick inte plats här utan att trycka undan rubriken på mobil. */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "nowrap", overflowX: "auto" }}>
          <h1 style={{ fontFamily: headingFont, fontSize: isMobile ? 22 : 26, fontWeight: 600, letterSpacing: "-0.01em", color: C.text, margin: 0, whiteSpace: "nowrap", flexShrink: 0 }}>
            Kontakter
          </h1>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <Link
              to="/contacts/new"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 16px",
                background: C.green, color: "#fff", borderRadius: 8, textDecoration: "none",
                fontSize: 14, fontWeight: 600, fontFamily: headingFont, whiteSpace: "nowrap",
              }}
            >
              <Plus size={16} /> {isMobile ? "Ny" : "Ny kontakt"}
            </Link>
          </div>
        </div>

        {!isLoading && contacts.length > 0 && (
          <ContactFilterBar
            sort={sort}
            types={presentTypes}
            typeFilter={typeFilter}
            onTypeFilter={setTypeFilter}
            buildings={buildings}
            buildingFilter={buildingFilter}
            onBuildingFilter={setBuildingFilter}
          />
        )}

        {/* List */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: "0 1px 3px rgba(13,43,30,0.04)", overflow: "hidden" }}>
          {isLoading ? (
            <div style={{ padding: 24, color: C.secondary }}>Laddar…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "48px 24px", textAlign: "center" }}>
              <Users size={28} color={C.muted} style={{ marginBottom: 10 }} />
              {/* Namnger att det är valet som är tomt, inte registret — annars
                  läses en filtrerad tom lista som "vi har inga kontakter". */}
              <div style={{ fontSize: 14, color: C.secondary }}>Inga kontakter{filterActive ? " för det här valet" : " ännu"}</div>
            </div>
          ) : (
            filtered.map((c, i) => (
              <div
                key={c.id}
                onClick={() => navigate({ to: "/contacts/$id", params: { id: c.id } })}
                style={{
                  display: "flex", alignItems: "center", gap: 14, padding: "14px 20px",
                  borderBottom: i === filtered.length - 1 ? "none" : `1px solid ${C.border}`,
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFBFA")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ flex: 1, minWidth: 0, opacity: c.active === false ? 0.55 : 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{c.full_name}</span>
                    <Badge type={c.contact_type} />
                    {c.active === false && (
                      <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: "#F3F4F6", color: C.muted }}>
                        Inaktiv
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: C.secondary, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {[c.company, c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: C.muted, textAlign: "right", flexShrink: 0, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.properties?.name ?? "Utan fastighet"}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
