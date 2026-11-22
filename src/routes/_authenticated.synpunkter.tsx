import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useVisibleProperties } from "@/hooks/useVisibleProperties";
import { confirmDialog } from "@/components/ConfirmDialog";
import { isStaff } from "@/lib/permissions";

/**
 * Synpunkter, frågor och klagomål från medlemmar, inlämnade på /lamna-synpunkt (edge-funktionen submit-synpunkt).
 * Admin, medarbetare och styrelse (sin egen förening, via RLS) läser och markerar; styrelsen svarar via sin egen
 * e-post ("Svara" öppnar ett mejl till medlemmen). Bara admin raderar. Se CLAUDE.md, "Synpunkter från medlemmar".
 */
export const Route = createFileRoute("/_authenticated/synpunkter")({
  head: () => ({ meta: [{ title: "Synpunkter — BAYT" }] }),
  component: SynpunkterPage,
});

const INK = "#0D2B1E";
const GREEN = "#3D8A30";
const MUTED = "#6B7280";
const LINE = "#E3E7E2";
const GOLD = "#E8C464";
const GOLD_SOFT = "rgba(232,196,100,0.16)";

type Status = "ny" | "last" | "besvarad";
type Category = "synpunkt" | "fraga" | "klagomal";
type Item = {
  id: string;
  reference: string;
  property_id: string;
  category: Category;
  apartment_number: string;
  trappa: string;
  name: string;
  email: string;
  message: string;
  status: Status;
  staff_note: string | null;
  handled_by_name: string | null;
  handled_at: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<Status, string> = { ny: "Ny", last: "Läst", besvarad: "Besvarad" };
const STATUS_STYLE: Record<Status, { bg: string; fg: string }> = {
  ny: { bg: "#FEF3C7", fg: "#92400E" },
  last: { bg: "#F3F4F6", fg: "#374151" },
  besvarad: { bg: "#DCFCE7", fg: "#166534" },
};
const CATEGORY_LABEL: Record<Category, string> = { synpunkt: "Synpunkt", fraga: "Fråga", klagomal: "Klagomål" };
const CATEGORY_STYLE: Record<Category, { bg: string; fg: string }> = {
  synpunkt: { bg: "#E8EEF9", fg: "#2F4F8F" },
  fraga: { bg: "#F3E8FF", fg: "#6B21A8" },
  klagomal: { bg: "#FDE7E2", fg: "#B03A22" },
};

const STYLES = `
  .sy-btn { height: 36px; padding: 0 14px; border-radius: 8px; font-size: 13.5px; font-weight: 600; cursor: pointer; font-family: inherit; background: #fff; color: #0D2B1E; border: 1px solid #E3E7E2; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
  .sy-btn:hover { border-color: #3D8A30; }
  .sy-btn:disabled { opacity: .6; cursor: not-allowed; }
  .sy-btn.sy-primary { background: #3D8A30; border-color: #3D8A30; color: #fff; }
  .sy-btn.sy-danger { color: #B42318; }
  .sy-input { height: 40px; padding: 0 12px; border: 1px solid #E3E7E2; border-radius: 8px; font: inherit; font-size: 14px; background: #fff; min-width: 0; max-width: 100%; box-sizing: border-box; }
  .sy-pill { height: 34px; padding: 0 14px; border-radius: 999px; border: 1px solid #E3E7E2; background: #fff; font: inherit; font-size: 13.5px; font-weight: 600; color: #6B7280; cursor: pointer; }
  .sy-pill.on { background: #0D2B1E; border-color: #0D2B1E; color: #fff; }
`;

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" });
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("sv-SE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

type Filter = "ny" | "alla" | "besvarad";

function csvCell(v: unknown): string {
  const s = String(v ?? "").replace(/\r?\n/g, " ").replace(/"/g, '""');
  return `"${s}"`;
}

function SynpunkterPage() {
  const isMobile = useIsMobile();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const canUse = isStaff(profile?.role) || profile?.role === "styrelse";
  const { allowedIds } = useVisibleProperties();
  const qc = useQueryClient();
  const [propertyId, setPropertyId] = useState("");
  const [filter, setFilter] = useState<Filter>("ny");
  const [category, setCategory] = useState<"alla" | Category>("alla");
  const [search, setSearch] = useState("");

  const propsQ = useQuery({
    queryKey: ["synpunkter-properties", profile?.role],
    enabled: canUse,
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
  const properties = (propsQ.data ?? []).filter((p) => !allowedIds || allowedIds.has(p.id));
  const activeProperty = propertyId && properties.some((p) => p.id === propertyId) ? propertyId : properties[0]?.id ?? "";
  const propertyName = properties.find((p) => p.id === activeProperty)?.name ?? "";

  const q = useQuery({
    queryKey: ["member-feedback", activeProperty],
    enabled: canUse && !!activeProperty,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("member_feedback").select("*").eq("property_id", activeProperty).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });
  const all = q.data ?? [];
  const missingTable = !!q.error && /does not exist|relation|schema cache/i.test((q.error as Error).message);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["member-feedback"] });
    void qc.invalidateQueries({ queryKey: ["feedback-notifications"] });
  };

  /** Statusändringar. .select("id") — en UPDATE som RLS stoppar ger 200 med noll rader. */
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { data, error } = await supabase.from("member_feedback").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Ändringen sparades inte (saknar behörighet).");
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from("member_feedback").delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Raden raderades inte.");
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const formUrl = () => `${window.location.origin}/lamna-synpunkt?forening=${activeProperty}`;
  const copyLink = async () => {
    const url = formUrl();
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Länken till formuläret är kopierad");
    } catch {
      window.prompt("Kopiera länken:", url);
    }
  };

  const exportCsv = () => {
    const head = ["Referens", "Mottaget", "Gäller", "Namn", "E-post", "Lägenhet", "Trappa", "Status", "Meddelande", "Intern anteckning"];
    const lines = [head.map(csvCell).join(";")];
    for (const r of [...all].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      lines.push([r.reference, fmtDateTime(r.created_at), CATEGORY_LABEL[r.category], r.name, r.email, r.apartment_number, r.trappa, STATUS_LABEL[r.status], r.message, r.staff_note ?? ""].map(csvCell).join(";"));
    }
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `synpunkter-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (profile && !canUse) {
    return <div style={{ padding: 32, color: MUTED }}>Du har inte behörighet till den här sidan.</div>;
  }

  const nNy = all.filter((r) => r.status === "ny").length;
  const nBesvarad = all.filter((r) => r.status === "besvarad").length;
  const nKlagomal = all.filter((r) => r.category === "klagomal").length;

  const needle = search.trim().toLowerCase();
  const shown = all
    .filter((r) => (filter === "alla" ? true : r.status === filter))
    .filter((r) => category === "alla" || r.category === category)
    .filter((r) => !needle || [r.name, r.email, r.apartment_number, r.message, r.reference].some((v) => v.toLowerCase().includes(needle)));

  return (
    <div style={{ padding: isMobile ? 16 : 32, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Inter, system-ui, sans-serif" }}>
      <style>{STYLES}</style>

      <div style={{ position: "relative", overflow: "hidden", borderRadius: 18, color: "#e6efd8", padding: "22px 24px", background: "radial-gradient(ellipse at 15% 0%, #21503f 0%, #0f2a21 55%, #0b1d17 100%)", border: `2px solid ${GOLD}`, boxShadow: `0 0 0 4px ${GOLD_SOFT}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <span style={{ display: "inline-block", fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", color: INK, background: GOLD, borderRadius: 999, padding: "3px 10px", marginBottom: 8 }}>MEDLEMMAR</span>
            <h1 style={{ fontFamily: "Outfit, Inter, system-ui, sans-serif", fontSize: 28, fontWeight: 800, color: "#fff", margin: 0 }}>Synpunkter</h1>
            <div style={{ fontSize: 14, color: "#c9d8c3", marginTop: 6, maxWidth: 640, lineHeight: 1.6 }}>
              Synpunkter, frågor och klagomål från medlemmar om avgiftshöjningen. {propertyName}
            </div>
          </div>
          <select className="sy-input" style={{ maxWidth: 280 }} value={activeProperty} onChange={(e) => setPropertyId(e.target.value)} aria-label="Förening">
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
          {[
            { n: all.length, l: "inkomna" },
            { n: nNy, l: "nya", warn: nNy > 0 },
            { n: nBesvarad, l: "besvarade" },
            { n: nKlagomal, l: "klagomål" },
          ].map((s) => (
            <div key={s.l} style={{ minWidth: 104, padding: "10px 14px", borderRadius: 12, background: s.warn ? "rgba(224,169,59,.18)" : "rgba(255,255,255,.07)", border: `1px solid ${s.warn ? "rgba(243,201,105,.55)" : "rgba(255,255,255,.14)"}` }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: s.warn ? "#F6CF72" : "#fff", lineHeight: 1.1 }}>{s.n}</div>
              <div style={{ fontSize: 12.5, color: "#b9cbb9" }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {missingTable && (
        <div style={{ background: "#FFF7E6", border: "1px solid #F1D9A0", borderRadius: 10, padding: "12px 16px", fontSize: 14, color: "#7A4B00" }}>
          Synpunkterna är inte aktiverade ännu. SQL-filen <strong>synpunkter.sql</strong> behöver köras en gång i Supabase.
        </div>
      )}
      {q.error && !missingTable && <div style={{ color: "#B91C1C", fontSize: 14 }}>Kunde inte hämta synpunkterna: {(q.error as Error).message}</div>}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {([["ny", `Nya (${nNy})`], ["alla", `Alla (${all.length})`], ["besvarad", `Besvarade (${nBesvarad})`]] as Array<[Filter, string]>).map(([k, l]) => (
            <button key={k} type="button" className={`sy-pill${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>{l}</button>
          ))}
          <select className="sy-input" style={{ height: 34, borderRadius: 999 }} value={category} onChange={(e) => setCategory(e.target.value as "alla" | Category)} aria-label="Typ">
            <option value="alla">Alla typer</option>
            <option value="klagomal">Klagomål</option>
            <option value="synpunkt">Synpunkter</option>
            <option value="fraga">Frågor</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {all.length > 3 && <input className="sy-input" style={{ width: 220 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Sök namn, lägenhet eller text" aria-label="Sök" />}
          <button type="button" className="sy-btn" onClick={exportCsv} disabled={all.length === 0}>Exportera (Excel)</button>
          <button type="button" className="sy-btn" onClick={copyLink} disabled={!activeProperty}>Kopiera länk till formuläret</button>
        </div>
      </div>

      {q.isLoading && <div style={{ color: MUTED }}>Hämtar…</div>}
      {!q.isLoading && shown.length === 0 && !q.error && (
        <div style={{ background: "#fff", border: `1px dashed #CBD3CA`, borderRadius: 14, padding: "32px 16px", textAlign: "center", color: MUTED, fontSize: 14.5 }}>
          {all.length === 0 ? "Inga meddelanden har kommit in ännu." : filter === "ny" ? "Inga nya meddelanden. Allt är läst." : "Inget matchar valet."}
        </div>
      )}
      <div style={{ display: "grid", gap: 10 }}>
        {shown.map((r) => (
          <FeedbackCard key={r.id} r={r} isAdmin={isAdmin} update={update} remove={remove} profileName={profile?.full_name ?? null} propertyName={propertyName} />
        ))}
      </div>

      <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
        Länken "Kopiera länk till formuläret" lägger du på föreningens hemsida. Du får ett mejl och en notis i klockan för varje nytt meddelande. Tryck <strong>Svara</strong> på ett meddelande för att svara till medlemmens e-post från din egen mejl. Markera det som besvarat när du är klar.
      </div>
    </div>
  );
}

type CardProps = {
  r: Item;
  isAdmin: boolean;
  update: { mutate: (v: { id: string; patch: Record<string, unknown> }) => void; isPending: boolean };
  remove: { mutate: (id: string) => void; isPending: boolean };
  profileName: string | null;
  propertyName: string;
};

function FeedbackCard({ r, isAdmin, update, remove, profileName, propertyName }: CardProps) {
  const [note, setNote] = useState(r.staff_note ?? "");
  const [open, setOpen] = useState(r.status === "ny");
  const st = STATUS_STYLE[r.status];
  const cat = CATEGORY_STYLE[r.category];
  const isNew = r.status === "ny";
  const long = r.message.length > 280;
  const text = !open && long ? r.message.slice(0, 280).trimEnd() + "…" : r.message;
  const replyHref = `mailto:${r.email}?subject=${encodeURIComponent(`Svar på ditt meddelande (${r.reference})`)}&body=${encodeURIComponent(`Hej ${r.name},\n\n\n\nVänliga hälsningar,\nStyrelsen i ${propertyName}`)}`;

  const del = async () => {
    if (await confirmDialog({ title: "Radera helt?", message: `Meddelandet från ${r.name} (${r.reference}) raderas för alltid. Det går inte att ångra.`, confirmLabel: "Radera", danger: true })) {
      remove.mutate(r.id);
    }
  };
  const markAnswered = () =>
    update.mutate({ id: r.id, patch: { status: "besvarad", handled_at: new Date().toISOString(), handled_by_name: profileName } });
  const saveNote = () => update.mutate({ id: r.id, patch: { staff_note: note.trim() || null } }, );

  return (
    <div style={{ background: "#fff", border: `1px solid ${isNew ? "#EBCB8A" : LINE}`, borderLeft: `4px solid ${isNew ? "#E0A93B" : LINE}`, borderRadius: 14, padding: "14px 16px", display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <strong style={{ fontSize: 16, color: INK }}>{r.name}</strong>
            <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: cat.bg, color: cat.fg }}>{CATEGORY_LABEL[r.category]}</span>
            <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: st.bg, color: st.fg }}>{STATUS_LABEL[r.status]}</span>
          </div>
          <div style={{ fontSize: 13.5, color: MUTED, marginTop: 3, lineHeight: 1.55 }}>
            Lgh {r.apartment_number}, trappa {r.trappa} · {r.reference} · {fmtDateTime(r.created_at)}
          </div>
          <div style={{ fontSize: 13.5, marginTop: 2 }}>
            <a href={`mailto:${r.email}`} style={{ color: GREEN }}>{r.email}</a>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <a className="sy-btn sy-primary" href={replyHref}>Svara</a>
          {r.status !== "besvarad" && <button type="button" className="sy-btn" disabled={update.isPending} onClick={markAnswered}>Markera som besvarad</button>}
          {r.status === "ny" && <button type="button" className="sy-btn" disabled={update.isPending} onClick={() => update.mutate({ id: r.id, patch: { status: "last" } })}>Markera som läst</button>}
          {r.status !== "ny" && <button type="button" className="sy-btn" disabled={update.isPending} onClick={() => update.mutate({ id: r.id, patch: { status: "ny", handled_at: null, handled_by_name: null } })}>Markera som ny</button>}
          {isAdmin && <button type="button" className="sy-btn sy-danger" disabled={remove.isPending} onClick={del}>Radera</button>}
        </div>
      </div>

      <div style={{ background: "#F7F9F6", border: `1px solid ${LINE}`, borderRadius: 10, padding: "12px 14px", fontSize: 14.5, color: INK, lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {text}
        {long && (
          <button type="button" onClick={() => setOpen((v) => !v)} style={{ display: "block", marginTop: 6, background: "none", border: "none", color: GREEN, fontWeight: 600, cursor: "pointer", padding: 0, fontFamily: "inherit", fontSize: 13.5 }}>
            {open ? "Visa mindre" : "Visa hela"}
          </button>
        )}
      </div>

      {r.status === "besvarad" && r.handled_at && (
        <div style={{ fontSize: 13, color: "#166534" }}>
          Besvarad {fmtDate(r.handled_at)}{r.handled_by_name ? ` av ${r.handled_by_name}` : ""}.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          className="sy-input"
          style={{ flex: "1 1 260px" }}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Intern anteckning (syns bara för er)"
          aria-label={`Intern anteckning för ${r.reference}`}
          onKeyDown={(e) => { if (e.key === "Enter") saveNote(); }}
        />
        <button type="button" className="sy-btn" disabled={update.isPending || note.trim() === (r.staff_note ?? "")} onClick={saveNote}>Spara anteckning</button>
      </div>
    </div>
  );
}
