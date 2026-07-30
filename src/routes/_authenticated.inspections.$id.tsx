import { createFileRoute, Link, useParams, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpRight, Upload, FileText } from "lucide-react";
import { FileDropzone } from "@/components/FileDropzone";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { OppnaArendeButton } from "@/components/OppnaArendeButton";
import { AvslutaArendeButton } from "@/components/AvslutaArendeButton";
import { AnsvarigDropdown } from "@/components/AnsvarigDropdown";
import { DeleteButton } from "@/components/DeleteButton";
import { DerivedStatusField } from "@/components/DerivedStatusBadge";
import { DerivedPriorityField } from "@/components/DerivedPriorityField";
import { deriveInspectionStatus, derivePriorityFromStatus } from "@/lib/issue-tokens";
import { useRecordScopeGuard } from "@/hooks/useRecordScopeGuard";
import { isEntreprenor } from "@/lib/permissions";
import { sanitizeStorageName } from "@/lib/storage";

export const Route = createFileRoute("/_authenticated/inspections/$id")({
  head: () => ({ meta: [{ title: "Besiktning — BAYT" }] }),
  component: InspectionDetailPage,
});

const C = {
  bg: "#FFFFFF", card: "#ffffff", border: "#E5E7EB",
  primary: "#3D8A30", secondary: "#6B7280", text: "#1a1a1a",
  error: "#DC2626",
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

export function InspectionDetailPage({ idOverride }: { idOverride?: string } = {}) {
  const params = useParams({ strict: false }) as { id?: string };
  const id = idOverride ?? params.id!;
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  const entreprenor = isEntreprenor(profile?.role);
  // Passed as ?from= so the apartment page's Tillbaka can return here — its
  // default back link is hard-wired to the fastighet, not to the besiktning.
  const currentPath = useRouterState({ select: (s) => s.location.pathname });

  const { data: insp, isLoading } = useQuery({
    queryKey: ["inspection", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("*, properties(name)")
        .eq("id", id).single();
      if (error) throw error;
      return data as any;
    },
  });

  // Reachable by URL — enforce role scope on this besiktning. `undefined` until
  // the row is in hand (see useRecordScopeGuard), and no redirectTo so each role
  // lands on its own home page rather than a grid it may not be able to use.
  useRecordScopeGuard({
    propertyId: insp?.property_id,
    assignedContactId: insp ? (insp.assigned_contact_id ?? null) : undefined,
    loading: isLoading,
  });

  const { data: protocols = [] } = useQuery({
    queryKey: ["inspection-protocols", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspection_protocols")
        .select("*")
        .eq("inspection_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [inspector, setInspector] = useState("");
  const [interval, setInterval] = useState(12);
  const [notes, setNotes] = useState("");
  const [inspectionType, setInspectionType] = useState("");
  const [lastDate, setLastDate] = useState("");
  const [apartmentId, setApartmentId] = useState("");
  const [trappa, setTrappa] = useState("");
  const [assignedContactId, setAssignedContactId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const { data: apartments = [] } = useQuery({
    queryKey: ["apartments-for-property", insp?.property_id],
    enabled: !!insp?.property_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("apartments")
        .select("id, apartment_number, trappa")
        .eq("property_id", insp!.property_id)
        .order("apartment_number");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; apartment_number: string; trappa: string | null }>;
    },
  });

  // Trappan tillhör lägenheten — mirrors the chosen apartment and locks when it
  // has one. Covers seeding too: apartmentId is seeded from the row, so once the
  // apartments query resolves the field fills itself.
  const apartmentTrappa = apartments.find((a) => a.id === apartmentId)?.trappa?.trim() ?? "";

  useEffect(() => {
    if (!insp) return;
    setInspector(insp.inspector ?? "");
    setInterval(insp.interval_months ?? 12);
    setNotes(insp.notes ?? "");
    setInspectionType(insp.inspection_type ?? "");
    setLastDate(insp.last_completed_date ?? "");
    setApartmentId(insp.apartment_id ?? "");
    setTrappa(insp.trappa ?? "");
    setAssignedContactId(insp.assigned_contact_id ?? null);
  }, [insp]);

  useEffect(() => {
    if (!id) return;
    void supabase.from("inspections").update({ viewed_at: new Date().toISOString() }).eq("id", id).is("viewed_at", null);
  }, [id]);

  const nextDue = useMemo(() => {
    if (!lastDate || !interval) return "";
    try { return addMonths(lastDate, Number(interval)); } catch { return ""; }
  }, [lastDate, interval]);

  const fmt = (s: string | null) => s ? new Intl.DateTimeFormat("sv-SE").format(new Date(s)) : "—";

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("inspections").update({
        inspection_type: inspectionType || null,
        inspector: inspector || null,
        interval_months: Number(interval) || null,
        notes: notes || null,
        // `status` is deliberately absent — derived via deriveInspectionStatus.
        // Lifecycle lives in arende_status, written only by Öppna/Avsluta.
        last_completed_date: lastDate || null,
        next_due_date: nextDue || null,
        apartment_id: apartmentId || null,
        // No `trappa` key: the live DB has no inspections.trappa column, and an
        // unknown column makes PostgREST reject the whole UPDATE. Trappa is
        // displayed derived from the linked apartment instead of persisted.
        assigned_contact_id: assignedContactId,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inspection", id] });
      setError(null);
      toast.success("Sparat!", { style: { background: "#3D8A30", color: "#fff" } });
    },
    onError: (e: any) => setError(e.message ?? "Kunde inte spara"),
  });

  const handleUpload = async () => {
    if (!files.length || !user) return;
    setUploading(true); setError(null);
    try {
      for (const f of files) {
        const path = `${id}/${Date.now()}-${sanitizeStorageName(f.name)}`;
        const { error: upErr } = await supabase.storage.from("protocols").upload(path, f);
        if (upErr) throw new Error("Uppladdning misslyckades: " + upErr.message);
        const { data: pub } = supabase.storage.from("protocols").getPublicUrl(path);
        const { error: pErr } = await supabase.from("inspection_protocols").insert({
          inspection_id: id,
          protocol_url: pub.publicUrl,
          completed_date: lastDate || null,
          uploaded_by: user.id,
        });
        if (pErr) throw pErr;
      }
      setFiles([]);
      qc.invalidateQueries({ queryKey: ["inspection-protocols", id] });
      toast.success("Sparat!", { style: { background: "#3D8A30", color: "#fff" } });
    } catch (e: any) {
      setError(e.message ?? "Uppladdning misslyckades");
    } finally {
      setUploading(false);
    }
  };

  if (isLoading || !insp) {
    return <div style={{ background: C.bg, minHeight: "100vh", padding: 32, color: C.secondary }}>Laddar…</div>;
  }

  // Read, never chosen. Uses the live form values so the badge reacts while
  // utförd-datum / intervall are being edited.
  const derived = deriveInspectionStatus({
    arende_status: insp.arende_status ?? null,
    status: insp.status ?? null,
    next_due_date: nextDue || null,
    last_completed_date: lastDate || null,
    interval_months: Number(interval) || null,
  });
  // Besiktningar have no prioritet column and never had a dropdown — the
  // prioritet is purely read, out of the same tidsgräns the status uses.
  const derivedPriority = derivePriorityFromStatus(derived, {
    from: (insp as { created_at?: string | null }).created_at ?? null,
    dueLabel: "Nästa besiktning",
  });

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: isMobile ? 16 : 32 }}>
      <Link to="/inspections" style={{
        display: "inline-flex", alignItems: "center", gap: 6, color: C.secondary,
        fontSize: 13, textDecoration: "none", marginBottom: 12,
      }}>
        <ArrowLeft size={18} /> Tillbaka
      </Link>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>{insp.inspection_type}</h1>
      <div style={{ fontSize: 13, color: C.secondary, marginBottom: 16 }}>{insp.properties?.name ?? "—"}</div>
      <div style={{ marginBottom: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <OppnaArendeButton
          kind="inspection"
          id={id}
          currentStatus={(insp as { arende_status?: string | null }).arende_status ?? null}
          title={insp.inspection_type ?? "Besiktning"}
          propertyId={insp.property_id ?? null}
          apartmentId={insp.apartment_id ?? null}
          invalidateKeys={[["inspection", id]]}
        />
        <AvslutaArendeButton
          kind="inspection"
          id={id}
          currentStatus={(insp as { arende_status?: string | null }).arende_status ?? null}
          title={insp.inspection_type ?? "Besiktning"}
          propertyId={insp.property_id ?? null}
          apartmentId={insp.apartment_id ?? null}
          invalidateKeys={[["inspection", id]]}
        />
      </div>


      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
        padding: 24, maxWidth: 720, display: "grid", gap: 16, marginBottom: 16,
      }}>
        <div>
          <label style={labelStyle}>Typ</label>
          <input style={inputStyle} value={inspectionType} onChange={(e) => setInspectionType(e.target.value)} />
        </div>

        <div>
          <label style={labelStyle}>Utförd datum</label>
          <input type="date" style={inputStyle} value={lastDate} onChange={(e) => setLastDate(e.target.value)} />
        </div>

        <div>
          <label style={labelStyle}>Besiktningsman</label>
          <input style={inputStyle} value={inspector} onChange={(e) => setInspector(e.target.value)} />
        </div>

        <div>
          <label style={labelStyle}>Intervall (månader)</label>
          <input type="number" min={1} style={inputStyle}
            value={interval} onChange={(e) => setInterval(Number(e.target.value))} />
          <div style={{ marginTop: 6, fontSize: 13, color: C.secondary }}>
            Nästa besiktning: {nextDue ? fmt(nextDue) : "—"}
          </div>
        </div>

        <div>
          <DerivedStatusField status={derived} labelStyle={labelStyle} reasonColor={C.secondary} />
        </div>

        <div>
          <DerivedPriorityField priority={derivedPriority} labelStyle={labelStyle} reasonColor={C.secondary} />
        </div>

        <div>
          <label style={labelStyle}>Lägenhet</label>
          <div style={{ position: "relative" }}>
            <select
              style={{ ...inputStyle, ...(entreprenor && apartmentId ? { paddingRight: 56 } : {}) }}
              value={apartmentId}
              onChange={(e) => {
                const v = e.target.value;
                setApartmentId(v);
                const t = apartments.find((a) => a.id === v)?.trappa?.trim();
                if (t) setTrappa(t);
              }}
              disabled={!insp.property_id || entreprenor}
            >
              <option value="">—</option>
              {apartments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.trappa?.trim() ? `Lgh ${a.apartment_number} · Trappa ${a.trappa.trim()}` : `Lgh ${a.apartment_number}`}
                </option>
              ))}
            </select>
            {/* Entreprenör: the apartment is not theirs to change, but it is
                theirs to inspect — arrow opens the apartment page. Placed left
                of the native select-chevron, not over it. */}
            {entreprenor && apartmentId && (
              <button
                type="button"
                title="Öppna lägenheten"
                aria-label="Öppna lägenheten"
                onClick={() =>
                  navigate({
                    to: "/apartments/$id",
                    params: { id: apartmentId },
                    search: { from: currentPath } as never,
                  })
                }
                style={{
                  position: "absolute", right: 30, top: "50%", transform: "translateY(-50%)",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 24, height: 24, padding: 0, border: "none", background: "transparent",
                  cursor: "pointer",
                }}
              >
                <ArrowUpRight size={16} color={C.primary} />
              </button>
            )}
          </div>
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
          <label style={labelStyle}>Anteckningar</label>
          <textarea style={{ ...inputStyle, height: 96, padding: 12, resize: "vertical" }}
            value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <AnsvarigDropdown value={assignedContactId} onChange={setAssignedContactId} />

        {error && <div style={{ color: C.error, fontSize: 14 }}>{error}</div>}

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => save.mutate()} disabled={save.isPending} style={{
            height: 44, background: C.primary, color: "#ffffff", border: "none",
            borderRadius: 6, padding: "0 24px", fontSize: 15, fontWeight: 600,
            cursor: save.isPending ? "default" : "pointer", opacity: save.isPending ? 0.7 : 1,
          }}>
            {save.isPending ? "Sparar…" : "Spara"}
          </button>
          <DeleteButton
            table="inspections"
            id={id}
            label="besiktningen"
            variant="full"
            invalidateKeys={[["inspections"], ["oppna-arenden"]]}
            onDeleted={() => navigate({ to: "/inspections" })}
          />
        </div>
      </div>

      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
        padding: 24, maxWidth: 720,
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: "0 0 16px" }}>Protokoll</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16, minWidth: 0 }}>
          <FileDropzone
            files={files}
            onAdd={(picked) => setFiles((prev) => [...prev, ...picked])}
            onRemove={(i) => setFiles((prev) => prev.filter((_, k) => k !== i))}
          />
          <button onClick={handleUpload} disabled={!files.length || uploading} style={{
            height: 40, background: C.primary, color: "#ffffff", border: "none",
            borderRadius: 6, padding: "0 16px", fontSize: 14, fontWeight: 600,
            cursor: (!files.length || uploading) ? "default" : "pointer",
            opacity: (!files.length || uploading) ? 0.6 : 1,
            display: "inline-flex", alignItems: "center", gap: 6,
            alignSelf: "flex-start",
          }}>
            <Upload size={18} /> {uploading ? "Laddar upp…" : "Ladda upp"}
          </button>
        </div>

        {protocols.length === 0 ? (
          <div style={{ color: C.secondary, fontSize: 14 }}>Inga protokoll uppladdade</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {(protocols as any[]).map((p) => (
              <div key={p.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: 12, border: `1px solid ${C.border}`, borderRadius: 6,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <FileText size={18} color={C.secondary} />
                  <div>
                    <div style={{ fontSize: 14, color: C.text }}>{fmt(p.completed_date)}</div>
                    <div style={{ fontSize: 12, color: C.secondary }}>{fmt(p.created_at)}</div>
                  </div>
                </div>
                <a href={p.protocol_url} target="_blank" rel="noreferrer"
                  style={{ color: C.primary, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
                  Öppna
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
