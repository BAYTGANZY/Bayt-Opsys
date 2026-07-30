import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { FileDropzone } from "@/components/FileDropzone";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { AnsvarigDropdown } from "@/components/AnsvarigDropdown";
import { DerivedPriorityField } from "@/components/DerivedPriorityField";
import { derivePriority } from "@/lib/issue-tokens";
import { sanitizeStorageName } from "@/lib/storage";
import { INSPECTION_TYPES } from "@/lib/inspection-tokens";

export const Route = createFileRoute("/_authenticated/inspections/new")({
  head: () => ({ meta: [{ title: "Ny besiktning — BAYT" }] }),
  component: NewInspectionPage,
});

const C = {
  bg: "#FFFFFF", card: "#ffffff", border: "#E5E7EB",
  primary: "#3D8A30", secondary: "#6B7280", text: "#1a1a1a",
  error: "#DC2626", focus: "#5CB84A",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 500, color: C.secondary,
  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: "100%", height: 40, padding: "0 12px",
  border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 14,
  color: C.text, background: C.card, outline: "none", boxSizing: "border-box",
};

function addMonths(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00");
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d.toISOString().slice(0, 10);
}

export function NewInspectionPage({ initialPropertyId }: { initialPropertyId?: string } = {}) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user } = useAuth();

  const [propertyId, setPropertyId] = useState(initialPropertyId ?? "");
  const [apartmentId, setApartmentId] = useState("");
  const [trappa, setTrappa] = useState("");
  const [type, setType] = useState("sba");
  const [inspector, setInspector] = useState("");
  const [lastDate, setLastDate] = useState("");
  const [interval, setInterval] = useState(12);
  const [notes, setNotes] = useState("");
  const [assignedContactId, setAssignedContactId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apartmentWarn, setApartmentWarn] = useState(false);

  const { data: properties = [] } = useQuery({
    queryKey: ["properties-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: apartments = [] } = useQuery({
    queryKey: ["apartments-for-property", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("apartments")
        .select("id, apartment_number, trappa")
        .eq("property_id", propertyId)
        .order("apartment_number");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; apartment_number: string; trappa: string | null }>;
    },
  });

  // Trappan tillhör lägenheten (identity: property + nummer + trappa) — the
  // field below mirrors the chosen apartment and locks when it has one.
  const apartmentTrappa = apartments.find((a) => a.id === apartmentId)?.trappa?.trim() ?? "";

  const nextDue = useMemo(() => {
    if (!lastDate || !interval) return "";
    try { return addMonths(lastDate, Number(interval)); } catch { return ""; }
  }, [lastDate, interval]);

  const fmtDate = (s: string) => s ? new Intl.DateTimeFormat("sv-SE").format(new Date(s)) : "—";

  // Prioritet är härledd, aldrig vald — här ur nästa besiktningsdatum.
  const derivedPriority = derivePriority(nextDue || null, { dueLabel: "Nästa besiktning" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!propertyId) { setError("Välj fastighet"); return; }
    setSaving(true); setError(null);
    try {
      const { data: ins, error: insErr } = await supabase.from("inspections").insert({
        property_id: propertyId,
        apartment_id: apartmentId || null,
        // No `trappa` key: the live DB has no inspections.trappa column, and an
        // unknown column makes PostgREST reject the whole INSERT. Trappa is
        // displayed derived from the linked apartment instead of persisted.
        inspection_type: type,
        inspector: inspector || null,
        last_completed_date: lastDate || null,
        next_due_date: nextDue || null,
        interval_months: Number(interval) || null,
        notes: notes || null,
        assigned_contact_id: assignedContactId,
        status: "aktiv",
        // Starts vilande so Öppna ärende has something to flip; after that the
        // status shown is derived (deriveInspectionStatus), never picked.
        arende_status: "vilande",
        created_by: user.id,
      }).select("id").single();
      if (insErr) throw insErr;

      // First file is the protocol (a failure aborts the save), the rest are
      // best-effort extras — same split the old file/extraFiles states carried.
      const file = files[0] ?? null;
      const extraFiles = files.slice(1);
      if (file && ins) {
        const path = `${ins.id}/${Date.now()}-${sanitizeStorageName(file.name)}`;
        const { error: upErr } = await supabase.storage.from("protocols").upload(path, file);
        if (upErr) throw new Error("Protokoll kunde inte laddas upp: " + upErr.message);
        const { data: pub } = supabase.storage.from("protocols").getPublicUrl(path);
        const { error: pErr } = await supabase.from("inspection_protocols").insert({
          inspection_id: ins.id,
          protocol_url: pub.publicUrl,
          completed_date: lastDate || null,
          uploaded_by: user.id,
        });
        if (pErr) throw pErr;
      }
      // The besiktning is already created — a failed extra file must be
      // reported, not swallowed, but it doesn't undo the save.
      const fileFailures: string[] = [];
      for (const f of extraFiles) {
        const path = `${ins!.id}/${Date.now()}-${sanitizeStorageName(f.name)}`;
        const { error: upErr } = await supabase.storage.from("protocols").upload(path, f);
        if (upErr) { fileFailures.push(`${f.name}: ${upErr.message}`); continue; }
        const { data: pub } = supabase.storage.from("protocols").getPublicUrl(path);
        const { error: pErr } = await supabase.from("inspection_protocols").insert({
          inspection_id: ins!.id,
          protocol_url: pub.publicUrl,
          completed_date: lastDate || null,
          uploaded_by: user.id,
        });
        if (pErr) fileFailures.push(`${f.name}: ${pErr.message}`);
      }
      if (fileFailures.length) {
        toast.error(`Besiktningen skapades, men ${fileFailures.length === 1 ? "en fil" : `${fileFailures.length} filer`} kunde inte laddas upp: ${fileFailures.join("; ")}`);
      } else {
        toast.success("Sparat!", { style: { background: "#3D8A30", color: "#fff" } });
      }
      navigate({ to: "/inspections/$id", params: { id: ins!.id } });
    } catch (err: any) {
      setError(err.message ?? "Kunde inte spara");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: isMobile ? 16 : 32 }}>
      <Link to="/inspections" style={{
        display: "inline-flex", alignItems: "center", gap: 6, color: C.secondary,
        fontSize: 13, textDecoration: "none", marginBottom: 12,
      }}>
        <ArrowLeft size={18} /> Tillbaka
      </Link>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: "0 0 24px" }}>Ny besiktning</h1>

      <form onSubmit={handleSubmit} style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
        padding: 24, maxWidth: 720, display: "grid", gap: 16,
      }}>
        <div>
          <label style={labelStyle}>Fastighet *</label>
          <select style={inputStyle} value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setApartmentId(""); }} required>
            <option value="">Välj fastighet</option>
            {(properties as Array<{ id: string; name: string }>).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Lägenhet</label>
          <div onMouseDown={() => { if (!propertyId) setApartmentWarn(true); }}>
            <select
              style={{ ...inputStyle, opacity: propertyId ? 1 : 0.6, cursor: propertyId ? "pointer" : "not-allowed" }}
              value={apartmentId}
              onChange={(e) => {
                const v = e.target.value;
                setApartmentId(v);
                const t = apartments.find((a) => a.id === v)?.trappa?.trim();
                if (t) setTrappa(t);
              }}
              disabled={!propertyId}
            >
              <option value="">—</option>
              {apartments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.trappa?.trim() ? `Lgh ${a.apartment_number} · Trappa ${a.trappa.trim()}` : `Lgh ${a.apartment_number}`}
                </option>
              ))}
            </select>
          </div>
          {!propertyId && apartmentWarn && (
            <div style={{ color: "#DC2626", fontSize: 13, marginTop: 6 }}>Välj en fastighet först</div>
          )}
        </div>

        <div>
          <label style={labelStyle}>Trappa</label>
          {/* Locked to the apartment's trappa when it has one — free typing here
              caused mismatches with the apartment identity. Not persisted on
              inspections (no such column); display only. */}
          <input
            style={{ ...inputStyle, ...(apartmentTrappa ? { background: "#F3F4F6", cursor: "default" } : {}) }}
            value={apartmentTrappa || trappa}
            readOnly={!!apartmentTrappa}
            onChange={(e) => { if (!apartmentTrappa) setTrappa(e.target.value); }}
            placeholder="t.ex. A"
          />
        </div>

        <div>
          <label style={labelStyle}>Typ *</label>
          <select style={inputStyle} value={type} onChange={(e) => setType(e.target.value)} required>
            {INSPECTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Besiktningsman</label>
          <input style={inputStyle} value={inspector} onChange={(e) => setInspector(e.target.value)} />
        </div>

        <AnsvarigDropdown value={assignedContactId} onChange={setAssignedContactId} />

        <div>
          <label style={labelStyle}>Utförd datum</label>
          <input type="date" style={inputStyle} value={lastDate} onChange={(e) => setLastDate(e.target.value)} />
        </div>

        <div>
          <label style={labelStyle}>Intervall (månader)</label>
          <input type="number" min={1} style={inputStyle} value={interval} onChange={(e) => setInterval(Number(e.target.value))} />
          <div style={{ marginTop: 6, fontSize: 13, color: C.secondary }}>
            Nästa besiktning: {nextDue ? fmtDate(nextDue) : "—"}
          </div>
        </div>

        <DerivedPriorityField priority={derivedPriority} labelStyle={labelStyle} reasonColor={C.secondary} />

        <div>
          <label style={labelStyle}>Anteckningar</label>
          <textarea style={{ ...inputStyle, height: 96, padding: 12, resize: "vertical" }}
            value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div style={{ minWidth: 0 }}>
          <label style={labelStyle}>Filer</label>
          <FileDropzone
            files={files}
            onAdd={(picked) => setFiles((prev) => [...prev, ...picked])}
            onRemove={(i) => setFiles((prev) => prev.filter((_, k) => k !== i))}
          />
        </div>

        {error && <div style={{ color: C.error, fontSize: 14 }}>{error}</div>}

        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <button type="submit" disabled={saving} style={{
            height: 44, background: C.primary, color: "#ffffff", border: "none",
            borderRadius: 6, padding: "0 24px", fontSize: 15, fontWeight: 600,
            cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1,
          }}>
            {saving ? "Sparar…" : "Spara"}
          </button>
          <Link to="/inspections" style={{
            height: 44, background: C.card, color: C.text, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: "0 24px", display: "inline-flex", alignItems: "center",
            fontSize: 15, fontWeight: 500, textDecoration: "none",
          }}>
            Avbryt
          </Link>
        </div>
      </form>
    </div>
  );
}
