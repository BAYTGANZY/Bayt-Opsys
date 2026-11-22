import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { confirmDialog } from "@/components/ConfirmDialog";
import { parseNabo, planNaboImport, type AptRow, type ChangeKind, type NaboParse, type PlanRow } from "@/lib/nabo-import";

/**
 * Importera medlemslistan från Nabo till en förenings lägenheter (bara admin). Förhandsgranskning först, inget
 * sparas förrän admin trycker. Reglerna står i `src/lib/nabo-import.ts`: samma ägare kompletteras och behåller
 * telefon/e-post, en ny ägare ersätter allt, och inget tas bort för att Nabo saknar det. Matchningen sker via
 * "nr 1234" i lägenhetens Status — det är det nummer plattformen följer, inte folkbokföringens.
 */
const INK = "#0D2B1E";
const GREEN = "#3D8A30";
const MUTED = "#6B7280";
const LINE = "#E3E7E2";
const AMBER = "#9A5B0B";

const btn = (primary: boolean, disabled?: boolean): React.CSSProperties => ({
  height: 38,
  padding: "0 16px",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  fontFamily: "inherit",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.6 : 1,
  background: primary ? GREEN : "#fff",
  color: primary ? "#fff" : INK,
  border: `1px solid ${primary ? GREEN : LINE}`,
});

const GROUPS: Array<{ kind: ChangeKind; title: string; hint: string; tone: string; defaultOn: boolean }> = [
  { kind: "ny_agare", title: "Ny ägare", hint: "Ingen av ägarna hos oss finns i Nabo. Namn, telefon, e-post och datum ersätts.", tone: "#B03A22", defaultOn: true },
  { kind: "delvis", title: "Kontrollera själv", hint: "Någon ägare är kvar och någon är borta. Namnet uppdateras, telefon och e-post behålls. Kryssa i de du vill köra.", tone: AMBER, defaultOn: false },
  { kind: "ny_uppgift", title: "Ägare fylls i", hint: "Hos oss saknades ägare. Namn och datum läggs in.", tone: GREEN, defaultOn: true },
  { kind: "samma", title: "Samma ägare — kompletteras", hint: "Telefon och e-post rörs inte. Bara namnstavning, medägare och inträdesdatum fylls i.", tone: GREEN, defaultOn: true },
];

async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buf);
  // Nabo exporterar UTF-8, men en fil som sparats om i Excel kan vara Windows-1252.
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(buf) : utf8;
}

export function NaboImport({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState<NaboParse | null>(null);
  const [fileName, setFileName] = useState("");
  const [off, setOff] = useState<Set<string>>(new Set()); // avkryssade rader (apt-id)
  const [touched, setTouched] = useState<Set<string>>(new Set()); // rader användaren själv ändrat
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const apts = useQuery({
    queryKey: ["apartments-nabo", propertyId],
    enabled: open && !!parsed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("apartments")
        .select("*") // * med flit: member_address kommer från en handkörd migration
        .eq("property_id", propertyId);
      if (error) throw error;
      return (data ?? []) as AptRow[];
    },
  });

  const plan = useMemo(() => (parsed && apts.data ? planNaboImport(apts.data, parsed.units) : null), [parsed, apts.data]);

  // Förvalet: "kontrollera själv" är avkryssat tills man själv kryssar i det.
  const isOn = (r: PlanRow) => (touched.has(r.apt.id) ? !off.has(r.apt.id) : GROUPS.find((g) => g.kind === r.kind)!.defaultOn);
  const toggle = (r: PlanRow) => {
    const next = new Set(off);
    const nowOn = isOn(r);
    if (nowOn) next.add(r.apt.id); else next.delete(r.apt.id);
    setOff(next);
    setTouched(new Set(touched).add(r.apt.id));
  };

  const chosen = plan ? plan.rows.filter(isOn) : [];

  async function onFile(f: File | undefined) {
    if (!f) return;
    try {
      const text = await readText(f);
      const p = parseNabo(text);
      if (p.units.size === 0) {
        toast.error(p.warnings[0] ?? "Hittade inga medlemmar i filen.");
        return;
      }
      setFileName(f.name);
      setOff(new Set());
      setTouched(new Set());
      setParsed(p);
    } catch {
      toast.error("Kunde inte läsa filen.");
    }
  }

  async function run() {
    if (!plan || chosen.length === 0) return;
    const newOwners = chosen.filter((r) => r.kind === "ny_agare").length;
    const ok = await confirmDialog({
      title: `Uppdatera ${chosen.length} lägenheter?`,
      message: `${newOwners > 0 ? `${newOwners} har ny ägare, och deras telefon och e-post töms. ` : ""}Övriga behåller sin telefon och e-post. Ändringarna loggas i Historik.`,
      confirmLabel: "Uppdatera",
      danger: newOwners > 0,
    });
    if (!ok) return;
    setSaving(true);
    let done = 0;
    const failed: string[] = [];
    try {
      for (let i = 0; i < chosen.length; i += 8) {
        await Promise.all(
          chosen.slice(i, i + 8).map(async (r) => {
            // .select("id"): en UPDATE som RLS stoppar är 200 med noll rader, och ska inte räknas som sparad.
            const { data, error } = await supabase.from("apartments").update(r.patch).eq("id", r.apt.id).select("id");
            if (error || !data || data.length === 0) failed.push(`nr ${r.unit.number}`);
            else done++;
          }),
        );
      }
    } finally {
      setSaving(false);
    }
    void qc.invalidateQueries({ queryKey: ["apartments"] });
    void qc.invalidateQueries({ queryKey: ["apartment"] });
    void qc.invalidateQueries({ queryKey: ["apartments-nabo"] });
    if (failed.length === 0) {
      toast.success(`${done} lägenheter uppdaterade`);
      setParsed(null);
      setOpen(false);
    } else {
      toast.error(`${done} uppdaterade, ${failed.length} misslyckades: ${failed.slice(0, 8).join(", ")}`);
    }
  }

  if (!open) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" style={btn(false)} onClick={() => setOpen(true)}>Importera medlemmar från Nabo</button>
      </div>
    );
  }

  const small: React.CSSProperties = { fontSize: 13, color: MUTED, lineHeight: 1.55 };

  return (
    <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: 20, display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontFamily: "Outfit, Inter, system-ui, sans-serif", fontSize: 18, color: INK }}>Importera medlemmar från Nabo</h3>
        <button type="button" style={btn(false)} onClick={() => { setOpen(false); setParsed(null); }}>Stäng</button>
      </div>
      <div style={small}>
        Ladda upp medlemslistan (CSV) från Nabo. Först visas vad som skulle ändras, ingenting sparas förrän du trycker Uppdatera.
        Bostäderna matchas på numret i lägenhetens <strong>Status</strong> (till exempel "Bostadsrätt nr 1051"). Telefon och e-post som
        ni lagt in behålls för samma ägare. Bara en ny ägare tömmer dem. Inget raderas för att Nabo saknar det.
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
        <button type="button" style={btn(true)} onClick={() => fileRef.current?.click()}>{parsed ? "Välj en annan fil" : "Välj fil från Nabo"}</button>
        {parsed && <span style={small}>{fileName} · {parsed.memberRows} medlemmar på {parsed.units.size} bostäder</span>}
      </div>
      {parsed?.warnings.length ? <div style={{ ...small, color: AMBER }}>{parsed.warnings.slice(0, 5).join(" ")}</div> : null}
      {parsed && apts.isLoading && <div style={small}>Hämtar lägenheterna…</div>}
      {parsed && apts.error && <div style={{ color: "#B91C1C", fontSize: 14 }}>Kunde inte hämta lägenheterna: {(apts.error as Error).message}</div>}

      {plan && (
        <>
          <div style={{ fontSize: 14, color: INK }}>
            <strong>{plan.rows.length}</strong> lägenheter får ändringar, <strong>{plan.unchanged}</strong> är redan rätt.
          </div>

          {plan.rows.length === 0 && <div style={small}>Inget behöver ändras.</div>}

          {GROUPS.map((g) => {
            const rows = plan.rows.filter((r) => r.kind === g.kind);
            if (rows.length === 0) return null;
            return (
              <div key={g.kind} style={{ display: "grid", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, color: g.tone, fontSize: 15 }}>{g.title} ({rows.length})</div>
                  <div style={small}>{g.hint}</div>
                </div>
                <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden" }}>
                  {rows.map((r, i) => (
                    <label key={r.apt.id} style={{ display: "flex", gap: 10, padding: "10px 12px", borderTop: i ? `1px solid ${LINE}` : "none", alignItems: "flex-start", cursor: "pointer", background: isOn(r) ? "#fff" : "#F7F7F5" }}>
                      <input type="checkbox" checked={isOn(r)} onChange={() => toggle(r)} style={{ marginTop: 3, width: 16, height: 16 }} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 1.55, color: INK }}>
                        <strong>Nr {r.unit.number}</strong>
                        <span style={{ color: MUTED }}> · {r.unit.address ?? ""}{r.apt.trappa ? ` · trappa ${r.apt.trappa}` : ""} · lgh {r.apt.apartment_number}</span>
                        {r.changes.map((c) => (
                          <span key={c.field} style={{ display: "block", overflowWrap: "anywhere" }}>
                            <span style={{ color: MUTED }}>{c.label}: </span>
                            {c.from ? <span style={{ textDecoration: "line-through", color: MUTED }}>{c.from}</span> : <span style={{ color: MUTED }}>tomt</span>}
                            <span style={{ color: MUTED }}> → </span>
                            {c.to ? <strong>{c.to}</strong> : <span style={{ color: "#B03A22" }}>töms</span>}
                          </span>
                        ))}
                        {r.flags.map((f) => (
                          <span key={f} style={{ display: "block", color: AMBER, fontSize: 12.5 }}>⚑ {f}</span>
                        ))}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}

          <Collapsible title={`Finns i Nabo men saknas hos oss (${plan.noApartment.length})`} hint="Ingen lägenhet har det numret i Status. Inget skapas. Lägg in numret på lägenheten och kör importen igen.">
            {plan.noApartment.map((u) => (
              <div key={u.number}>Nr {u.number}{u.address ? `, ${u.address}` : ""}: {u.members.map((m) => m.name).join(", ")}</div>
            ))}
          </Collapsible>
          <Collapsible title={`Finns hos oss men inte i Nabo (${plan.notInNabo.length})`} hint="Rörs inte. Kan vara en bostad som saknar medlem i Nabo.">
            {plan.notInNabo.map((a) => (
              <div key={a.id}>{a.status} · lgh {a.apartment_number}{a.trappa ? `, trappa ${a.trappa}` : ""}{a.tenant_name ? ` · ${a.tenant_name}` : ""}</div>
            ))}
          </Collapsible>
          <Collapsible title={`Saknar nummer i Status (${plan.noNumber.length})`} hint='Status måste innehålla "nr 1234" för att kunna matchas. Rörs inte.'>
            {plan.noNumber.map((a) => (
              <div key={a.id}>Lgh {a.apartment_number}{a.trappa ? `, trappa ${a.trappa}` : ""} · Status: {a.status || "tom"}{a.tenant_name ? ` · ${a.tenant_name}` : ""}</div>
            ))}
          </Collapsible>
          <Collapsible title={`Samma nummer på flera lägenheter (${plan.ambiguous.length})`} hint="Rörs inte, eftersom det inte går att veta vilken som menas. Rätta numret i Status.">
            {plan.ambiguous.map((a) => (
              <div key={a.number}>Nr {a.number}: {a.apts.map((x) => `lgh ${x.apartment_number}, trappa ${x.trappa ?? "?"}`).join(" och ")}</div>
            ))}
          </Collapsible>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" style={btn(true, saving || chosen.length === 0)} disabled={saving || chosen.length === 0} onClick={run}>
              {saving ? "Sparar…" : `Uppdatera ${chosen.length} lägenheter`}
            </button>
            <span style={small}>Ändringarna loggas i Historik på varje lägenhet.</span>
          </div>
        </>
      )}
    </div>
  );
}

function Collapsible({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const count = Array.isArray(children) ? children.length : children ? 1 : 0;
  if (count === 0) return null;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={{ textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 600, color: INK }}>
        {open ? "▾" : "▸"} {title}
      </button>
      {open && (
        <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, display: "grid", gap: 2 }}>
          <div style={{ marginBottom: 4 }}>{hint}</div>
          {children}
        </div>
      )}
    </div>
  );
}
