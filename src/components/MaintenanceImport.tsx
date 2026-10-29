import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileUp, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { sanitizeStorageName } from "@/lib/storage";
import { COLORS, primaryBtn } from "@/components/property-tabs";
import { kr, occurrences, type Action, type Plan } from "@/lib/maintenance";

const BUCKET = "maintenance-files";

type Settings = {
  name: string;
  start_year: number;
  end_year: number;
  vat_rate: number;
  extra_cost_pct: number;
  annual_increase_pct: number;
  boa_sqm: number | null;
  current_annual_savings: number;
  fund_balance: number;
};
type Row = Omit<Action, "id" | "plan_id" | "property_id">;
type Result = { settings: Settings; reported_total: number | null; actions: Row[] };

const num = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Något gick fel");

export function MaintenanceImport({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"idle" | "uploading" | "analyzing" | "preview" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [reported, setReported] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  const reset = () => {
    setPhase("idle");
    setError(null);
    setSettings(null);
    setReported(null);
    setRows([]);
  };

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    reset();
    if (!/\.pdf$/i.test(file.name)) return setError("Välj en PDF-fil.");
    if (file.size > 30 * 1024 * 1024) return setError("PDF:en är för stor (max 30 MB).");

    try {
      setPhase("uploading");
      const path = `${propertyId}/imports/${crypto.randomUUID()}-${sanitizeStorageName(file.name)}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: "application/pdf" });
      if (upErr) throw new Error(`Uppladdningen misslyckades: ${upErr.message}`);

      setPhase("analyzing");
      const { data, error: fnErr } = await supabase.functions.invoke("import-maintenance-plan", {
        body: { path, property_id: propertyId },
      });
      if (fnErr) throw new Error(`Funktionen svarade med fel (${fnErr.message}). Är den driftsatt?`);

      const raw = typeof data === "string" ? data : JSON.stringify(data);
      const start = raw.indexOf("{");
      if (start < 0) throw new Error("Tomt svar från funktionen.");
      const parsed = JSON.parse(raw.slice(start));
      if (parsed.error) throw new Error(parsed.error);

      const r = parsed as Result;
      const s = r.settings;
      setSettings({
        name: s.name || "Underhållsplan",
        start_year: num(s.start_year, new Date().getFullYear()),
        end_year: num(s.end_year, new Date().getFullYear() + 49),
        vat_rate: num(s.vat_rate, 25),
        extra_cost_pct: num(s.extra_cost_pct),
        annual_increase_pct: num(s.annual_increase_pct),
        boa_sqm: s.boa_sqm == null ? null : num(s.boa_sqm),
        current_annual_savings: num(s.current_annual_savings),
        fund_balance: num(s.fund_balance),
      });
      setReported(r.reported_total == null ? null : num(r.reported_total));
      setRows(
        r.actions.map((a) => ({
          name: String(a.name ?? "").trim() || "Åtgärd",
          category: a.category ? String(a.category) : null,
          location: a.location ? String(a.location) : null,
          year: num(a.year),
          interval_years: a.interval_years ? num(a.interval_years) : null,
          prev_year: a.prev_year ? num(a.prev_year) : null,
          quantity: num(a.quantity, 1),
          unit: a.unit ? String(a.unit) : "st",
          unit_price: num(a.unit_price),
          kind: a.kind === "investering" ? "investering" : "underhall",
          status: a.status === "beslutad" || a.status === "genomford" ? a.status : "planerad",
          label: a.label ? String(a.label) : null,
          description: a.description ? String(a.description) : null,
        })),
      );
      setPhase("preview");
    } catch (err) {
      setError(errMsg(err));
      setPhase("idle");
    }
  }

  // Samma beräkning som planvyn, så siffrorna går att jämföra mot PDF:en.
  const computed = (() => {
    if (!settings) return 0;
    const plan = { ...settings, id: "", property_id: propertyId, round_to: 1000 } as unknown as Plan;
    const acts = rows.map((r, i) => ({ ...r, id: String(i), plan_id: "", property_id: propertyId })) as Action[];
    return occurrences(acts, plan, true).reduce((s, o) => s + o.cost, 0);
  })();
  const diffPct = reported && reported > 0 ? ((computed - reported) / reported) * 100 : null;
  const ok = diffPct !== null && Math.abs(diffPct) <= 1;

  async function save() {
    if (!settings) return;
    setPhase("saving");
    try {
      const { data: existing } = await supabase.from("maintenance_plans").select("id").eq("property_id", propertyId).maybeSingle();
      let planId = existing?.id as string | undefined;
      const planFields = { ...settings, round_to: 1000 };
      if (planId) {
        const { error } = await supabase.from("maintenance_plans").update(planFields).eq("id", planId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("maintenance_plans")
          .insert({ ...planFields, property_id: propertyId })
          .select("id")
          .single();
        if (error) throw error;
        planId = data.id as string;
      }

      const { data: old } = await supabase.from("maintenance_actions").select("id").eq("plan_id", planId);
      const oldIds = ((old ?? []) as Array<{ id: string }>).map((o) => o.id);

      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100).map((r) => ({ ...r, plan_id: planId, property_id: propertyId }));
        const { error } = await supabase.from("maintenance_actions").insert(chunk);
        if (error) throw error;
      }
      for (let i = 0; i < oldIds.length; i += 100) {
        const { error } = await supabase.from("maintenance_actions").delete().in("id", oldIds.slice(i, i + 100));
        if (error) throw error;
      }

      qc.invalidateQueries({ queryKey: ["mplan", propertyId] });
      qc.invalidateQueries({ queryKey: ["mactions"] });
      qc.invalidateQueries({ queryKey: ["mplans-all"] });
      toast.success(`${rows.length} åtgärder importerades`, { style: { background: "#3D8A30", color: "#fff" } });
      setOpen(false);
      reset();
    } catch (err) {
      toast.error(errMsg(err));
      setPhase("preview");
    }
  }

  const busy = phase === "uploading" || phase === "analyzing" || phase === "saving";

  return (
    <>
      <button style={{ ...primaryBtn, height: 40 }} onClick={() => setOpen(true)}>
        <FileUp size={16} /> Importera från PDF
      </button>

      {open && (
        <div
          onClick={() => !busy && (setOpen(false), reset())}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300, display: "flex", justifyContent: "center", alignItems: "flex-start", overflowY: "auto", padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "min(980px, 100%)", marginTop: 24, padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: 20, fontFamily: "Outfit, Inter, system-ui, sans-serif" }}>Importera underhållsplan från PDF</h2>
              <button disabled={busy} onClick={() => (setOpen(false), reset())} aria-label="Stäng" style={{ border: "none", background: "transparent", cursor: "pointer" }}>
                <X size={20} />
              </button>
            </div>

            {(phase === "idle" || phase === "uploading" || phase === "analyzing") && (
              <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                <div style={{ fontSize: 14, color: COLORS.secondary, lineHeight: 1.55 }}>
                  Välj PDF:en från Nabo/Planima. Innehållet läses av en AI-tjänst (Anthropic) och du får se resultatet innan något sparas.
                  Kontrollera siffrorna mot originalet.
                </div>
                <input ref={inputRef} type="file" accept="application/pdf" onChange={onPick} style={{ display: "none" }} />
                <div>
                  <button style={{ ...primaryBtn, height: 42, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={() => inputRef.current?.click()}>
                    <FileUp size={16} />{" "}
                    {phase === "uploading" ? "Laddar upp…" : phase === "analyzing" ? "Läser av planen, det tar 1–3 minuter…" : "Välj PDF"}
                  </button>
                </div>
                {error && <div style={{ color: COLORS.error, fontSize: 14 }}>{error}</div>}
              </div>
            )}

            {(phase === "preview" || phase === "saving") && settings && (
              <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, fontSize: 13 }}>
                  {[
                    ["Period", `${settings.start_year}–${settings.end_year}`],
                    ["Moms", `${settings.vat_rate} %`],
                    ["Byggherretillägg", `${settings.extra_cost_pct} %`],
                    ["Uppräkning", `${settings.annual_increase_pct} % / år`],
                    ["Boarea", settings.boa_sqm ? `${settings.boa_sqm} m²` : "saknas"],
                    ["Nuvarande avsättning", kr(settings.current_annual_savings)],
                    ["Fondsaldo vid start", kr(settings.fund_balance)],
                    ["Antal åtgärder", String(rows.length)],
                  ].map(([l, v]) => (
                    <div key={l} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "8px 10px" }}>
                      <div style={{ fontSize: 11, color: COLORS.secondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>{l}</div>
                      <div style={{ fontWeight: 700, marginTop: 2 }}>{v}</div>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    borderRadius: 10, padding: "10px 12px", fontSize: 14, lineHeight: 1.5,
                    background: diffPct === null ? "#F3F4F6" : ok ? "#E8F5E4" : "#FBD5DC",
                    color: diffPct === null ? COLORS.text : ok ? "#2E6B24" : "#8B1A2B",
                  }}
                >
                  <strong>Kontroll mot PDF:en:</strong> uträknad total {kr(computed)} inkl. moms
                  {reported ? `, PDF:en anger ${kr(reported)}` : ", PDF:ens totalsumma hittades inte"}.
                  {diffPct !== null && (ok ? ` Avvikelse ${diffPct.toFixed(2)} %. Ser bra ut.` : ` Avvikelse ${diffPct.toFixed(1)} %. Granska raderna innan du sparar.`)}
                </div>

                <div style={{ maxHeight: 360, overflow: "auto", border: `1px solid ${COLORS.border}`, borderRadius: 10 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead style={{ position: "sticky", top: 0, background: "#F9FAFB" }}>
                      <tr>
                        {["Åtgärd", "Kategori", "Läge", "År", "Int.", "Mängd", "Styckpris", "Typ", ""].map((h) => (
                          <th key={h} style={{ textAlign: "left", padding: "8px 6px", fontSize: 11, color: COLORS.secondary, textTransform: "uppercase" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                          <td style={{ padding: "6px", fontWeight: 600 }}>{r.name}</td>
                          <td style={{ padding: "6px" }}>{r.category ?? "—"}</td>
                          <td style={{ padding: "6px" }}>{r.location ?? "—"}</td>
                          <td style={{ padding: "6px" }}>{r.year}</td>
                          <td style={{ padding: "6px" }}>{r.interval_years ?? "—"}</td>
                          <td style={{ padding: "6px", whiteSpace: "nowrap" }}>{r.quantity} {r.unit}</td>
                          <td style={{ padding: "6px", whiteSpace: "nowrap" }}>{kr(r.unit_price)}</td>
                          <td style={{ padding: "6px" }}>{r.kind === "investering" ? "Inv." : "Und."}</td>
                          <td style={{ padding: "6px" }}>
                            <button
                              onClick={() => setRows((cur) => cur.filter((_, k) => k !== i))}
                              disabled={phase === "saving"}
                              style={{ border: "none", background: "transparent", color: COLORS.error, cursor: "pointer" }}
                              aria-label="Ta bort raden"
                            >
                              <X size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ fontSize: 13, color: COLORS.secondary }}>
                  Sparar du ersätts planens befintliga åtgärder. Kommentarer och bilder på de gamla åtgärderna tas bort med dem.
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    style={{ ...primaryBtn, height: 42, opacity: phase === "saving" ? 0.7 : 1 }}
                    disabled={phase === "saving" || rows.length === 0}
                    onClick={() => {
                      if (window.confirm(`Spara ${rows.length} åtgärder och ersätta planens befintliga åtgärder?`)) void save();
                    }}
                  >
                    {phase === "saving" ? "Sparar…" : "Spara importen"}
                  </button>
                  <button
                    style={{ ...primaryBtn, height: 42, background: "#fff", color: COLORS.text, border: `1px solid ${COLORS.border}` }}
                    disabled={phase === "saving"}
                    onClick={reset}
                  >
                    Börja om
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
