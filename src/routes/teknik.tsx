import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { canEdit } from "@/lib/permissions";
import { TEKNIK_SECTIONS, TeknikIcon } from "@/lib/teknik-config";

const baytLogo = `${import.meta.env.BASE_URL}assets/bayt-logo.png`;
const buildingSketch = `${import.meta.env.BASE_URL}assets/building-sketch-2.png`;

export const Route = createFileRoute("/teknik")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Teknik — BAYT" }] }),
  component: TeknikPage,
});

type Item = { id: string; section: string; label: string; sort_order: number };
type Round = { id: string; section: string; started_at: string };
type Check = { round_id: string; item_id: string; checked: boolean; note: string | null };

const dateFmt = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", year: "numeric" });

const STYLES = `
  .tk-page {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    background: radial-gradient(ellipse at top, #1b3a33 0%, #0e1f1a 75%);
    color: #e6efd8;
    padding: 28px 40px 36px;
    font-family: Inter, system-ui, sans-serif;
    box-sizing: border-box;
  }
  .tk-header {
    display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
    border-bottom: 1px solid rgba(151,186,72,0.18); padding-bottom: 18px; margin-bottom: 28px;
  }
  .tk-logo { height: 40px; display: block; }
  .tk-header-right { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .tk-home {
    height: 40px; padding: 0 14px; display: inline-flex; align-items: center; border-radius: 8px;
    font-size: 13px; letter-spacing: 0.04em; text-decoration: none; color: #9fb79f;
    border: 1px solid rgba(151,186,72,0.18); background: transparent;
  }
  .tk-home:hover { color: #ffffff; border-color: rgba(92,184,74,0.6); }
  .tk-title { font-family: Outfit, Inter, system-ui, sans-serif; font-size: 28px; font-weight: 600; margin: 0 0 22px; }
  .tk-select {
    height: 40px; padding: 0 12px; border-radius: 8px; font-size: 14px; font-family: inherit;
    background: rgba(255,255,255,0.06); color: #e6efd8; border: 1px solid rgba(255,255,255,0.14); max-width: 100%;
  }
  .tk-select option { color: #1a1a1a; }

  .tk-body {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(0, 0.7fr);
    gap: 48px;
    align-items: stretch;
    min-height: 0;
  }
  .tk-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-rows: repeat(3, minmax(0, 1fr));
    border-top: 1px solid rgba(255,255,255,0.12);
    border-left: 1px solid rgba(255,255,255,0.12);
    min-height: 480px;
  }
  .tk-tile {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
    padding: 18px 8px; text-decoration: none; color: #d9dfdb; background: transparent;
    border: none; border-right: 1px solid rgba(255,255,255,0.12); border-bottom: 1px solid rgba(255,255,255,0.12);
    cursor: pointer; font: inherit; transition: background 0.15s ease, color 0.15s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .tk-tile:hover { background: rgba(92,184,74,0.10); color: #ffffff; }
  .tk-tile-label { font-size: 17px; font-weight: 500; }
  .tk-tile-sub { font-size: 13px; color: #8aa38a; }
  .tk-tile-sub.tk-full { color: #5CB84A; font-weight: 600; }
  .tk-side { display: flex; align-items: center; justify-content: center; min-height: 0; }
  .tk-sketch { max-width: 100%; max-height: 72vh; width: auto; height: auto; opacity: 0.9; filter: drop-shadow(0 8px 24px rgba(0,0,0,0.4)); }

  .tk-back { background: none; border: none; color: #9fb79f; font-size: 14px; cursor: pointer; padding: 0; font-family: inherit; }
  .tk-back:hover { color: #ffffff; }
  .tk-head { display: flex; align-items: center; gap: 14px; margin: 14px 0 6px; }
  .tk-head h1 { font-family: Outfit, Inter, system-ui, sans-serif; font-size: 24px; margin: 0; font-weight: 600; }
  .tk-bar { height: 6px; border-radius: 3px; background: rgba(255,255,255,0.10); overflow: hidden; margin: 12px 0 6px; }
  .tk-bar > div { height: 100%; background: #5CB84A; transition: width 0.2s ease; }
  .tk-meta { font-size: 12.5px; color: #8aa38a; }
  .tk-list { margin-top: 18px; border: 1px solid rgba(255,255,255,0.10); border-radius: 14px; overflow: hidden; background: rgba(255,255,255,0.03); }
  .tk-row { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.07); }
  .tk-row:last-child { border-bottom: none; }
  .tk-box {
    width: 28px; height: 28px; border-radius: 8px; flex-shrink: 0; cursor: pointer; padding: 0;
    background: transparent; border: 1.5px solid rgba(255,255,255,0.35); color: #0D2B1E;
    display: flex; align-items: center; justify-content: center;
  }
  .tk-done .tk-box { background: #5CB84A; border-color: #5CB84A; }
  .tk-label { flex: 1 1 40%; min-width: 0; font-size: 14.5px; line-height: 1.35; }
  .tk-done .tk-label { color: #9fb79f; text-decoration: line-through; text-decoration-color: rgba(159,183,159,0.5); }
  .tk-note {
    flex: 1 1 38%; min-width: 0; height: 36px; padding: 0 10px; border-radius: 8px; font-size: 13.5px; font-family: inherit;
    background: rgba(255,255,255,0.06); color: #e6efd8; border: 1px solid rgba(255,255,255,0.12);
  }
  .tk-note::placeholder { color: #6f8a70; }
  .tk-del { background: none; border: none; color: #c98a8a; cursor: pointer; font-size: 20px; line-height: 1; padding: 4px 8px; }
  .tk-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; align-items: center; }
  .tk-btn {
    height: 40px; padding: 0 16px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit;
    background: rgba(255,255,255,0.06); color: #e6efd8; border: 1px solid rgba(255,255,255,0.16);
  }
  .tk-btn.tk-primary { background: #3D8A30; border-color: #3D8A30; color: #fff; }
  .tk-add { display: flex; gap: 8px; padding: 12px 14px; border-top: 1px solid rgba(255,255,255,0.07); }
  .tk-add input { flex: 1; min-width: 0; }
  .tk-hist { margin-top: 28px; }
  .tk-hist h2 { font-size: 15px; font-weight: 600; margin: 0 0 8px; color: #c9d6c3; }
  .tk-hist-row { display: flex; justify-content: space-between; padding: 8px 2px; font-size: 13.5px; color: #9fb79f; border-bottom: 1px solid rgba(255,255,255,0.06); }

  @media (max-width: 1100px) {
    .tk-body { grid-template-columns: minmax(0, 1fr); gap: 28px; }
    .tk-side { display: none; }
  }
  @media (max-width: 768px) {
    .tk-page { padding: 18px 14px 40px; }
    .tk-logo { height: 32px; }
    .tk-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: none; min-height: 0; }
    .tk-tile { min-height: 130px; }
    .tk-row { flex-wrap: wrap; }
    .tk-note { flex: 1 1 100%; margin-left: 40px; }
  }
`;

function CheckRow({
  label,
  checked,
  note,
  editing,
  onToggle,
  onNote,
  onDelete,
}: {
  label: string;
  checked: boolean;
  note: string;
  editing: boolean;
  onToggle: (next: boolean) => void;
  onNote: (next: string | null) => void;
  onDelete: () => void;
}) {
  const [isChecked, setIsChecked] = useState(checked);
  const [text, setText] = useState(note);
  useEffect(() => setIsChecked(checked), [checked]);
  useEffect(() => setText(note), [note]);

  return (
    <div className={`tk-row${isChecked ? " tk-done" : ""}`}>
      <button
        type="button"
        className="tk-box"
        aria-pressed={isChecked}
        aria-label={isChecked ? "Avmarkera" : "Bocka av"}
        onClick={() => {
          const next = !isChecked;
          setIsChecked(next);
          onToggle(next);
        }}
      >
        {isChecked && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l5 5 9-10" />
          </svg>
        )}
      </button>
      <div className="tk-label">{label}</div>
      <input
        className="tk-note"
        value={text}
        placeholder="Anteckning"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text.trim() !== note.trim()) onNote(text.trim() || null);
        }}
      />
      {editing && (
        <button type="button" className="tk-del" aria-label="Ta bort punkt" onClick={onDelete}>
          ×
        </button>
      )}
    </div>
  );
}

function TeknikPage() {
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [propertyId, setPropertyId] = useState<string>(() => {
    try {
      return window.localStorage.getItem("bayt.teknik.property") ?? "";
    } catch {
      return "";
    }
  });
  const [sectionKey, setSectionKey] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const attempted = useRef<string>("");

  // Rollen hämtas direkt, som på startsidan: den här sidan ligger utanför appens ram.
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        setRole(null);
        return;
      }
      setUserId(data.session.user.id);
      const { data: p } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.session.user.id)
        .maybeSingle();
      setRole((p?.role as string | undefined) ?? null);
    });
  }, []);

  const allowed = role !== undefined && canEdit(role);

  const propsQ = useQuery({
    queryKey: ["properties-min"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
  const properties = propsQ.data ?? [];

  useEffect(() => {
    if (properties.length === 0) return;
    if (!propertyId || !properties.some((p) => p.id === propertyId)) setPropertyId(properties[0].id);
  }, [propertyId, properties]);

  useEffect(() => {
    if (!propertyId) return;
    try {
      window.localStorage.setItem("bayt.teknik.property", propertyId);
    } catch {
      /* ignoreras */
    }
  }, [propertyId]);

  const itemsQ = useQuery({
    queryKey: ["teknik-items"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teknik_items")
        .select("id, section, label, sort_order")
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });
  const items = itemsQ.data ?? [];

  const roundsQ = useQuery({
    queryKey: ["teknik-open-rounds", propertyId],
    enabled: allowed && !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teknik_rounds")
        .select("id, section, started_at")
        .eq("property_id", propertyId)
        .is("completed_at", null);
      if (error) throw error;
      return (data ?? []) as Round[];
    },
  });
  const rounds = roundsQ.data ?? [];
  const roundIds = rounds.map((r) => r.id).sort().join(",");

  const checksQ = useQuery({
    queryKey: ["teknik-checks", roundIds],
    enabled: allowed && rounds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teknik_checks")
        .select("round_id, item_id, checked, note")
        .in("round_id", rounds.map((r) => r.id));
      if (error) throw error;
      return (data ?? []) as Check[];
    },
  });
  const checks = checksQ.data ?? [];

  const progress = useMemo(() => {
    const out: Record<string, { done: number; total: number }> = {};
    for (const s of TEKNIK_SECTIONS) {
      if (s.kind !== "checklist") continue;
      const sectionItems = items.filter((i) => i.section === s.key);
      const round = rounds.find((r) => r.section === s.key);
      const done = round
        ? checks.filter(
            (c) => c.round_id === round.id && c.checked && sectionItems.some((i) => i.id === c.item_id),
          ).length
        : 0;
      out[s.key] = { done, total: sectionItems.length };
    }
    return out;
  }, [items, rounds, checks]);

  const startRound = useMutation({
    mutationFn: async (vars: { section: string }) => {
      const { error } = await supabase
        .from("teknik_rounds")
        .insert({ property_id: propertyId, section: vars.section, started_by: userId });
      // 23505 = en öppen genomgång finns redan, vilket är fullt godtagbart.
      if (error && error.code !== "23505") throw error;
    },
    onSuccess: () => {
      attempted.current = "";
      void qc.invalidateQueries({ queryKey: ["teknik-open-rounds", propertyId] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Kunde inte starta genomgången"),
  });

  const section = TEKNIK_SECTIONS.find((s) => s.key === sectionKey) ?? null;
  const round = section ? rounds.find((r) => r.section === section.key) ?? null : null;

  useEffect(() => {
    if (!allowed || !section || section.kind !== "checklist" || !propertyId || !roundsQ.isSuccess) return;
    if (round) return;
    const key = `${propertyId}|${section.key}`;
    if (attempted.current === key) return;
    attempted.current = key;
    startRound.mutate({ section: section.key });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, section?.key, propertyId, roundsQ.isSuccess, round?.id]);

  const saveCheck = useMutation({
    mutationFn: async (v: { round_id: string; item_id: string; checked?: boolean; note?: string | null }) => {
      const row: Record<string, unknown> = {
        round_id: v.round_id,
        item_id: v.item_id,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      };
      if (v.checked !== undefined) row.checked = v.checked;
      if (v.note !== undefined) row.note = v.note;
      const { error } = await supabase.from("teknik_checks").upsert(row, { onConflict: "round_id,item_id" });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["teknik-checks"] }),
    onError: (e: Error) => {
      toast.error(e.message ?? "Kunde inte spara");
      void qc.invalidateQueries({ queryKey: ["teknik-checks"] });
    },
  });

  const finishRound = useMutation({
    mutationFn: async (roundId: string) => {
      const { error } = await supabase
        .from("teknik_rounds")
        .update({ completed_at: new Date().toISOString(), completed_by: userId })
        .eq("id", roundId);
      if (error) throw error;
    },
    onSuccess: () => {
      attempted.current = "";
      toast.success("Genomgången är sparad", { style: { background: "#3D8A30", color: "#fff" } });
      void qc.invalidateQueries({ queryKey: ["teknik-open-rounds", propertyId] });
      void qc.invalidateQueries({ queryKey: ["teknik-history"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Kunde inte avsluta genomgången"),
  });

  const addItem = useMutation({
    mutationFn: async (vars: { section: string; label: string }) => {
      const max = items.filter((i) => i.section === vars.section).reduce((m, i) => Math.max(m, i.sort_order), 0);
      const { error } = await supabase
        .from("teknik_items")
        .insert({ section: vars.section, label: vars.label, sort_order: max + 10 });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewLabel("");
      void qc.invalidateQueries({ queryKey: ["teknik-items"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Kunde inte lägga till"),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("teknik_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["teknik-items"] });
      void qc.invalidateQueries({ queryKey: ["teknik-checks"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Kunde inte ta bort"),
  });

  const historyQ = useQuery({
    queryKey: ["teknik-history", propertyId, sectionKey],
    enabled: allowed && !!propertyId && !!section && section.kind === "checklist",
    queryFn: async () => {
      const { data: rs, error } = await supabase
        .from("teknik_rounds")
        .select("id, completed_at")
        .eq("property_id", propertyId)
        .eq("section", sectionKey!)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      const list = (rs ?? []) as Array<{ id: string; completed_at: string }>;
      if (list.length === 0) return [];
      const { data: cs } = await supabase
        .from("teknik_checks")
        .select("round_id, checked")
        .in("round_id", list.map((r) => r.id));
      return list.map((r) => ({
        id: r.id,
        completed_at: r.completed_at,
        done: ((cs ?? []) as Array<{ round_id: string; checked: boolean }>).filter(
          (c) => c.round_id === r.id && c.checked,
        ).length,
      }));
    },
  });

  const sectionItems = section ? items.filter((i) => i.section === section.key) : [];
  const done = section ? progress[section.key]?.done ?? 0 : 0;
  const total = sectionItems.length;

  return (
    <>
      <style>{STYLES}</style>
      <div className="tk-page">
        <div className="tk-header">
          <img src={baytLogo} alt="BAYT" className="tk-logo" />
          <div className="tk-header-right">
            {allowed && (
              <select
                className="tk-select"
                value={propertyId}
                onChange={(e) => {
                  setPropertyId(e.target.value);
                  attempted.current = "";
                }}
                aria-label="Fastighet"
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            <Link to="/start" className="tk-home">
              ← Start
            </Link>
          </div>
        </div>

        {role === undefined && <div style={{ color: "#8aa38a", fontSize: 14 }}>Laddar…</div>}

        {role !== undefined && !allowed && (
          <div style={{ color: "#c9d6c3", fontSize: 15 }}>Du har inte behörighet till den här sidan.</div>
        )}

        {allowed && !section && (
          <>
            <h1 className="tk-title">Teknik</h1>
            <div className="tk-body">
              <div className="tk-grid">
                {TEKNIK_SECTIONS.map((s) => {
                  const p = progress[s.key];
                  const inner = (
                    <>
                      <TeknikIcon name={s.key} />
                      <span className="tk-tile-label">{s.label}</span>
                      {s.kind === "checklist" ? (
                        <span className={`tk-tile-sub${p && p.total > 0 && p.done === p.total ? " tk-full" : ""}`}>
                          {p ? `${p.done}/${p.total}` : ""}
                        </span>
                      ) : (
                        <span className="tk-tile-sub">Öppna</span>
                      )}
                    </>
                  );
                  return s.kind === "link" ? (
                    <Link key={s.key} to={s.href as never} className="tk-tile">
                      {inner}
                    </Link>
                  ) : (
                    <button key={s.key} type="button" className="tk-tile" onClick={() => setSectionKey(s.key)}>
                      {inner}
                    </button>
                  );
                })}
              </div>
              <div className="tk-side">
                <img src={buildingSketch} alt="" className="tk-sketch" />
              </div>
            </div>
          </>
        )}

        {allowed && section && section.kind === "checklist" && (
          <div style={{ maxWidth: 860 }}>
            <button
              type="button"
              className="tk-back"
              onClick={() => {
                setSectionKey(null);
                setEditing(false);
              }}
            >
              ← Teknik
            </button>
            <div className="tk-head">
              <TeknikIcon name={section.key} size={30} />
              <h1>{section.label}</h1>
            </div>
            <div className="tk-bar">
              <div style={{ width: total > 0 ? `${Math.round((done / total) * 100)}%` : "0%" }} />
            </div>
            <div className="tk-meta">
              {done} av {total} avbockade
              {round ? ` · genomgång startad ${dateFmt.format(new Date(round.started_at))}` : ""}
            </div>

            <div className="tk-list">
              {sectionItems.length === 0 && (
                <div style={{ padding: 18, color: "#8aa38a", fontSize: 14 }}>
                  Inga punkter ännu. Lägg till med "Redigera lista".
                </div>
              )}
              {round &&
                sectionItems.map((it) => {
                  const c = checks.find((x) => x.round_id === round.id && x.item_id === it.id);
                  return (
                    <CheckRow
                      key={it.id}
                      label={it.label}
                      checked={c?.checked ?? false}
                      note={c?.note ?? ""}
                      editing={editing}
                      onToggle={(next) => saveCheck.mutate({ round_id: round.id, item_id: it.id, checked: next })}
                      onNote={(next) => saveCheck.mutate({ round_id: round.id, item_id: it.id, note: next })}
                      onDelete={() => {
                        if (
                          window.confirm(
                            `Ta bort "${it.label}"? Punkten försvinner även ur tidigare genomgångar.`,
                          )
                        ) {
                          deleteItem.mutate(it.id);
                        }
                      }}
                    />
                  );
                })}
              {editing && (
                <form
                  className="tk-add"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const label = newLabel.trim();
                    if (label) addItem.mutate({ section: section.key, label });
                  }}
                >
                  <input
                    className="tk-note"
                    value={newLabel}
                    placeholder="Ny punkt, t.ex. Brandposter har giltig kontroll"
                    onChange={(e) => setNewLabel(e.target.value)}
                  />
                  <button type="submit" className="tk-btn tk-primary" disabled={addItem.isPending}>
                    Lägg till
                  </button>
                </form>
              )}
            </div>

            <div className="tk-actions">
              <button type="button" className="tk-btn" onClick={() => setEditing((v) => !v)}>
                {editing ? "Klar med redigering" : "Redigera lista"}
              </button>
              {round && (
                <button
                  type="button"
                  className="tk-btn tk-primary"
                  disabled={finishRound.isPending}
                  onClick={() => {
                    if (window.confirm("Avsluta genomgången och börja en ny? Den här sparas i historiken.")) {
                      finishRound.mutate(round.id);
                    }
                  }}
                >
                  Avsluta genomgång
                </button>
              )}
            </div>

            {(historyQ.data ?? []).length > 0 && (
              <div className="tk-hist">
                <h2>Tidigare genomgångar</h2>
                {(historyQ.data ?? []).map((h) => (
                  <div key={h.id} className="tk-hist-row">
                    <span>{dateFmt.format(new Date(h.completed_at))}</span>
                    <span>
                      {h.done}/{total} punkter
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
