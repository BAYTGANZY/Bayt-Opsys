import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { parseSie, sameOrgnr, type SieResult } from "@/lib/sie";
import { MONTHS } from "@/lib/ekonomi-oversikt";

const INK = "#0D2B1E";
const GREEN = "#3D8A30";
const MUTED = "#6B7280";
const LINE = "#E3E7E2";
const HOT = "#C2334D";
const CHUNK = 500;

const btn = (primary: boolean, disabled?: boolean) => ({
  height: 44,
  padding: "0 20px",
  borderRadius: 10,
  fontSize: 16,
  fontWeight: 600,
  fontFamily: "inherit",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.6 : 1,
  background: primary ? GREEN : "#fff",
  color: primary ? "#fff" : INK,
  border: primary ? `1px solid ${GREEN}` : `1px solid ${LINE}`,
});

function periodText(p: string | null) {
  if (!p) return "okänt";
  return `${MONTHS[Number(p.slice(4)) - 1]} ${p.slice(0, 4)}`;
}

/**
 * Admin: läs in en SIE-fil från bokföringen. Filen tolkas i webbläsaren; bara
 * kontosummor per månad sparas (aldrig verifikationer). Samma fil kan läsas in igen
 * — siffrorna för de år som finns i filen ersätts.
 */
export function EkonomiOversiktImport({ propertyId, propertyName }: { propertyId: string; propertyName: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; parsed: SieResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFile(null);
    setError(null);
    if (input.current) input.current.value = "";
  };

  async function onPick(f: File | undefined) {
    setError(null);
    setFile(null);
    if (!f) return;
    try {
      const parsed = parseSie(new Uint8Array(await f.arrayBuffer()));
      if (parsed.rows.length === 0 || parsed.years.length === 0) {
        setError("Det här ser inte ut som en SIE-fil med månadssaldon. Hämta en SIE 4-fil för hela räkenskapsåret från bokföringen.");
        return;
      }
      // Skydd mot fel förening: jämför mot förra importen för den här fastigheten.
      const prev = await supabase
        .from("finance_imports")
        .select("source_orgnr, source_name")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (prev.error) throw prev.error;
      const last = prev.data?.[0];
      if (last?.source_orgnr && parsed.orgnr && !sameOrgnr(last.source_orgnr as string, parsed.orgnr)) {
        setError(
          `Fel förening? Tidigare siffror för ${propertyName} kommer från ${last.source_name} (${last.source_orgnr}), men den här filen gäller ${parsed.name} (${parsed.orgnr}). Inget har sparats.`,
        );
        return;
      }
      setFile({ name: f.name, parsed });
    } catch (e) {
      setError(`Kunde inte läsa filen: ${(e as Error).message}`);
    }
  }

  async function save() {
    if (!file) return;
    const { parsed } = file;
    setBusy(true);
    try {
      // Unika nycklar — den som kommer sist vinner.
      const map = new Map<string, { property_id: string; year: number; month: number; account: string; amount: number }>();
      for (const r of parsed.rows) {
        map.set(`${r.year}|${r.month}|${r.account}`, { property_id: propertyId, year: r.year, month: r.month, account: r.account, amount: r.amount });
      }
      const rows = [...map.values()];
      const years = [...new Set(rows.map((r) => r.year))];

      // 1. Ersätt de år som finns i filen.
      const del = await supabase.from("finance_balances").delete().eq("property_id", propertyId).in("year", years);
      if (del.error) throw del.error;

      // 2. Skriv in nya siffror.
      for (let i = 0; i < rows.length; i += CHUNK) {
        const ins = await supabase.from("finance_balances").upsert(rows.slice(i, i + CHUNK), { onConflict: "property_id,year,month,account" });
        if (ins.error) throw ins.error;
      }

      // 3. Kontrollera att det verkligen sparades. En skrivning som RLS stoppar
      //    ger 200 utan fel, så antalet rader måste räknas efteråt.
      const chk = await supabase
        .from("finance_balances")
        .select("account", { count: "exact", head: true })
        .eq("property_id", propertyId)
        .in("year", years);
      if (chk.error) throw chk.error;
      if ((chk.count ?? 0) !== rows.length) {
        throw new Error(`Bara ${chk.count ?? 0} av ${rows.length} rader sparades. Kör inläsningen igen.`);
      }

      // 4. Kontonamn.
      const names = Object.entries(parsed.accounts).map(([account, name]) => ({ property_id: propertyId, account, name }));
      for (let i = 0; i < names.length; i += CHUNK) {
        const up = await supabase.from("finance_accounts").upsert(names.slice(i, i + CHUNK), { onConflict: "property_id,account" });
        if (up.error) throw up.error;
      }

      // 5. Logg (visas som "uppdaterad" och används som skydd mot fel förening).
      const log = await supabase
        .from("finance_imports")
        .insert({
          property_id: propertyId,
          imported_by: user?.id ?? null,
          file_name: file.name,
          source_name: parsed.name,
          source_orgnr: parsed.orgnr,
          years,
          latest_period: parsed.latestPeriod,
          account_count: names.length,
          row_count: rows.length,
        })
        .select("id");
      if (log.error) throw log.error;
      if (!log.data || log.data.length === 0) throw new Error("Importloggen kunde inte sparas.");

      await qc.invalidateQueries({ queryKey: ["finance-oversikt"] });
      toast.success("Siffrorna är uppdaterade", { style: { background: GREEN, color: "#fff" } });
      reset();
    } catch (e) {
      const msg = (e as Error).message ?? "Okänt fel";
      const missing = /relation .* does not exist|schema cache/i.test(msg);
      toast.error(missing ? "Databastabellerna saknas. Kör SQL-filen ekonomi-oversikt.sql en gång i Supabase." : `Kunde inte spara: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  const p = file?.parsed;
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, background: "#fff", padding: 20 }}>
      <h3 style={{ fontFamily: "Outfit, Inter, sans-serif", fontSize: 20, margin: 0, color: INK }}>Uppdatera siffrorna</h3>
      <p style={{ color: MUTED, margin: "6px 0 14px", lineHeight: 1.55 }}>
        Hämta en SIE-fil för räkenskapsåret från bokföringen (Nabo → Bokföring → SIE-export) och välj den här. Du får se vad som läses in innan något sparas.
        Bara summor per konto och månad sparas, inga verifikationer.
      </p>
      <input ref={input} type="file" accept=".se,.sie,.txt" onChange={(e) => onPick(e.target.files?.[0])} style={{ fontSize: 16 }} />
      {error && <p style={{ color: HOT, lineHeight: 1.5, marginBottom: 0 }}>{error}</p>}
      {p && (
        <div style={{ marginTop: 16, background: "#F6F9F4", borderRadius: 10, padding: 16, lineHeight: 1.7 }}>
          <div>
            <strong>{p.name}</strong> ({p.orgnr})
          </div>
          <div>Räkenskapsår i filen: {p.years.join(" och ")}</div>
          <div>Senaste färdigbokförda månad: {periodText(p.latestPeriod)}</div>
          <div>
            {Object.keys(p.accounts).length} konton, {p.rows.length} månadssaldon
          </div>
          <div style={{ marginTop: 8, color: INK }}>
            Siffrorna sparas för <strong>{propertyName}</strong>. Stämmer det inte, välj en annan fastighet ovan innan du sparar.
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button style={btn(true, busy)} disabled={busy} onClick={save}>
              {busy ? "Sparar …" : "Spara siffrorna"}
            </button>
            <button style={btn(false, busy)} disabled={busy} onClick={reset}>
              Avbryt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
