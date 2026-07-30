import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Search01Icon,
  Building02Icon,
  File02Icon,
  AlertCircleIcon,
  UserGroupIcon,
  Briefcase01Icon,
} from "@hugeicons/core-free-icons";
import { supabase } from "@/lib/supabase";
import { useMyArendeScope } from "@/hooks/useMyContactId";

type Hit = {
  id: string;
  primary: string;
  secondary?: string;
  to: { pathname: string; params?: Record<string, string> };
};

type Section = {
  key: string;
  label: string;
  icon: typeof Search01Icon;
  hits: Hit[];
  total: number;
  showAllTo: string;
};

const PER_SECTION = 3;
const FETCH_LIMIT = 6; // fetch a few more than we show, so we know if there's more
const STATIC_CATEGORIES = [
  { label: "Fastigheter", to: "/fastigheter" },
  { label: "Lägenheter", to: "/apartments" },
  { label: "Felanmälningar", to: "/issues" },
  { label: "Besiktningar", to: "/inspections" },
  { label: "Dokument", to: "/dokument" },
  { label: "Kontakter", to: "/contacts" },
  { label: "Projekt", to: "/projects" },
];

function escapeLike(s: string) {
  // Escape PostgREST ilike special chars
  return s.replace(/[%_,()]/g, (m) => `\\${m}`);
}

/**
 * `filterContactId` (from useMyArendeScope) narrows the ärende hits to the
 * signed-in entreprenör's own felanmälningar and projekt. The search box is in
 * the top bar for every role, so without this an entreprenör could find any
 * ärende in the system by typing a word from its title.
 */
async function runSearch(term: string, filterContactId: string | null): Promise<Section[]> {
  const q = `%${escapeLike(term)}%`;
  // Plain <T> on purpose: an F-bounded constraint (T extends { eq(...): T })
  // makes tsc recursively instantiate supabase's builder generics and die with
  // TS2589. The cast is runtime-identical — eq() returns the same builder.
  const scoped = <T,>(builder: T): T =>
    filterContactId
      ? ((builder as { eq(col: string, val: string): unknown }).eq("assigned_contact_id", filterContactId) as T)
      : builder;

  const [propsR, docsR, issuesR, contactsR, projectsR] = await Promise.all([
    supabase
      .from("properties")
      .select("id, name, address")
      .or(`name.ilike.${q},address.ilike.${q}`)
      .limit(FETCH_LIMIT),
    supabase
      .from("documents")
      .select("id, name, category")
      .or(`name.ilike.${q},category.ilike.${q}`)
      .limit(FETCH_LIMIT),
    scoped(
      supabase
        .from("issues")
        .select(
          "id, title, description, apartment_id, apartments(apartment_number)",
        )
        .or(`title.ilike.${q},description.ilike.${q}`),
    ).limit(FETCH_LIMIT),
    supabase
      .from("contacts")
      .select("id, full_name, company")
      .or(`full_name.ilike.${q},company.ilike.${q}`)
      .limit(FETCH_LIMIT),
    scoped(supabase.from("projects").select("id, title").ilike("title", q)).limit(FETCH_LIMIT),
  ]);

  const sections: Section[] = [
    {
      key: "properties",
      label: "Fastigheter",
      icon: Building02Icon,
      total: propsR.data?.length ?? 0,
      showAllTo: "/fastigheter",
      hits: (propsR.data ?? []).slice(0, PER_SECTION).map((p) => ({
        id: p.id,
        primary: p.name ?? "—",
        secondary: p.address ?? undefined,
        to: { pathname: "/properties/$id", params: { id: p.id } },
      })),
    },
    {
      key: "documents",
      label: "Dokument",
      icon: File02Icon,
      total: docsR.data?.length ?? 0,
      showAllTo: "/dokument",
      hits: (docsR.data ?? []).slice(0, PER_SECTION).map((d) => ({
        id: d.id,
        primary: d.name ?? "—",
        secondary: d.category ?? undefined,
        to: { pathname: "/dokument" },
      })),
    },
    {
      key: "issues",
      label: "Felanmälningar",
      icon: AlertCircleIcon,
      total: issuesR.data?.length ?? 0,
      showAllTo: "/issues",
      hits: (issuesR.data ?? []).slice(0, PER_SECTION).map((i) => {
        const apt = (
          i as unknown as {
            apartments: { apartment_number: string | null } | null;
          }
        ).apartments?.apartment_number;
        return {
          id: i.id,
          primary: i.title ?? "—",
          secondary: apt ? `Lägenhet ${apt}` : undefined,
          to: { pathname: "/issues/$id", params: { id: i.id } },
        };
      }),
    },
    {
      key: "contacts",
      label: "Kontakter",
      icon: UserGroupIcon,
      total: contactsR.data?.length ?? 0,
      showAllTo: "/contacts",
      hits: (contactsR.data ?? []).slice(0, PER_SECTION).map((c) => ({
        id: c.id,
        primary: c.full_name ?? "—",
        secondary: c.company ?? undefined,
        to: { pathname: "/contacts/$id", params: { id: c.id } },
      })),
    },
    {
      key: "projects",
      label: "Projekt",
      icon: Briefcase01Icon,
      total: projectsR.data?.length ?? 0,
      showAllTo: "/projects",
      hits: (projectsR.data ?? []).slice(0, PER_SECTION).map((pr) => ({
        id: pr.id,
        primary: pr.title ?? "—",
        to: { pathname: "/projects/$id", params: { id: pr.id } },
      })),
    },
  ];

  return sections;
}

export function GlobalSearch() {
  const navigate = useNavigate();
  const { filterContactId, ready } = useMyArendeScope();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sections, setSections] = useState<Section[] | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const trimmed = term.trim();
  const isSearching = trimmed.length >= 2;

  // Debounced search
  useEffect(() => {
    if (!isSearching) {
      setSections(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    // `ready` gates the first query: searching before the contact link resolves
    // would run unscoped and show an entreprenör everyone's ärenden.
    if (!ready) return;
    const handle = setTimeout(() => {
      let cancelled = false;
      runSearch(trimmed, filterContactId)
        .then((r) => {
          if (!cancelled) setSections(r);
        })
        .catch(() => {
          if (!cancelled) setSections([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, 300);
    return () => clearTimeout(handle);
  }, [trimmed, isSearching, ready, filterContactId]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const totalHits = useMemo(
    () => sections?.reduce((sum, s) => sum + s.hits.length, 0) ?? 0,
    [sections],
  );

  function go(to: { pathname: string; params?: Record<string, string> }) {
    setOpen(false);
    setTerm("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigate({ to: to.pathname as any, params: to.params as any });
  }

  return (
    <div
      ref={boxRef}
      style={{ position: "relative", width: 260 }}
      onFocus={() => setOpen(true)}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "rgba(255,255,255,0.06)",
          borderRadius: 8,
          padding: "0 12px",
          height: 36,
          color: "#ffffff",
          fontSize: 13,
        }}
      >
        <HugeiconsIcon icon={Search01Icon} size={16} />
        <input
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Sök i BAYT..."
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#ffffff",
            fontSize: 13,
          }}
        />
      </div>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: 360,
            maxHeight: 480,
            overflowY: "auto",
            background: "#ffffff",
            border: "1px solid #E5E7EB",
            borderRadius: 12,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            zIndex: 60,
            padding: 8,
            color: "#1a1a1a",
          }}
        >
          {!isSearching && (
            <div style={{ padding: "4px 8px 8px" }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#6B7280",
                  padding: "6px 6px",
                }}
              >
                Kategorier
              </div>
              {STATIC_CATEGORIES.map((c) => (
                <button
                  key={c.to}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onClick={() => go({ pathname: c.to as any })}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    background: "transparent",
                    border: "none",
                    padding: "8px 10px",
                    fontSize: 13,
                    color: "#1a1a1a",
                    cursor: "pointer",
                    borderRadius: 6,
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "#F7F8F6")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}

          {isSearching && loading && !sections && (
            <div
              style={{ padding: 16, fontSize: 13, color: "#6B7280" }}
            >
              Söker…
            </div>
          )}

          {isSearching && sections && totalHits === 0 && !loading && (
            <div style={{ padding: 16, fontSize: 13, color: "#6B7280" }}>
              Inga resultat för "{trimmed}"
            </div>
          )}

          {isSearching &&
            sections &&
            sections.map((s) =>
              s.hits.length === 0 ? null : (
                <div key={s.key} style={{ padding: "4px 0 8px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "#6B7280",
                      padding: "6px 10px",
                    }}
                  >
                    <HugeiconsIcon icon={s.icon} size={12} />
                    {s.label}
                  </div>
                  {s.hits.map((h) => (
                    <button
                      key={`${s.key}-${h.id}`}
                      onClick={() => go(h.to)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        background: "transparent",
                        border: "none",
                        padding: "8px 10px",
                        cursor: "pointer",
                        borderRadius: 6,
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "#F7F8F6")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#1a1a1a",
                        }}
                      >
                        {h.primary}
                      </div>
                      {h.secondary && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "#6B7280",
                            marginTop: 2,
                          }}
                        >
                          {h.secondary}
                        </div>
                      )}
                    </button>
                  ))}
                  {s.total > PER_SECTION && (
                    <button
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      onClick={() => go({ pathname: s.showAllTo as any })}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        background: "transparent",
                        border: "none",
                        padding: "6px 10px 10px",
                        fontSize: 12,
                        color: "#3D8A30",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Visa alla {s.label.toLowerCase()} →
                    </button>
                  )}
                </div>
              ),
            )}
        </div>
      )}
    </div>
  );
}

export default GlobalSearch;
