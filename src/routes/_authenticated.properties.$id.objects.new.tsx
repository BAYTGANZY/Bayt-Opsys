import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { objectTypeLabel } from "@/lib/object-tokens";
import { logEvent } from "@/lib/logbook";
import { EditableSelect } from "@/components/EditableSelect";
import { ChevronSelect } from "@/components/ChevronSelect";
import { useObjectTypeOptions } from "@/hooks/useObjectTypeOptions";

export const Route = createFileRoute("/_authenticated/properties/$id/objects/new")({
  head: () => ({ meta: [{ title: "Nytt objekt — BAYT" }] }),
  component: NewObjectRoute,
});

const C = { border: "#E5E7EB", text: "#1a1a1a", primary: "#3D8A30", secondary: "#6B7280" };
const label: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 500, color: C.secondary, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 };
const input: React.CSSProperties = { width: "100%", height: 40, padding: "0 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, outline: "none", background: "#fff", boxSizing: "border-box" };
const textarea: React.CSSProperties = { ...input, height: "auto", minHeight: 80, padding: 12, resize: "vertical", fontFamily: "inherit" };

function NewObjectRoute() {
  const { id: propertyId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  // Starts empty on purpose: the admin is met by a blank textbox and, as they
  // type, EditableSelect's native <datalist> filters to matching suggestions
  // — pick one, or keep typing and the raw text becomes the value on save
  // (and a future suggestion for the next objekt).
  const [type, setType] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [apartmentId, setApartmentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const typeOptions = useObjectTypeOptions();

  const aptsQ = useQuery({
    queryKey: ["apartments-for-property", propertyId],
    queryFn: async () => {
      // trappa included to match the other users of this cache key — the five
      // ["apartments-for-property"] queries must select identical columns or
      // whichever runs first starves the others of trappa.
      const { data } = await supabase.from("apartments").select("id, apartment_number, trappa").eq("property_id", propertyId).order("apartment_number");
      return (data ?? []) as Array<{ id: string; apartment_number: string; trappa: string | null }>;
    },
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!type.trim()) { setError("Typ krävs"); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.from("property_objects").insert({
        property_id: propertyId,
        type: type.trim(),
        name: title.trim() || null,
        description: description.trim() || null,
        apartment_id: apartmentId || null,
        created_by: user?.id ?? null,
      } as any).select("id").single();
      if (error) throw error;
      await logEvent({
        event_type: "objekt_kopplad",
        property_id: propertyId,
        apartment_id: apartmentId || null,
        property_object_id: (data as any).id,
        description: `Nytt objekt: ${title.trim() || objectTypeLabel(type)}`,
        created_by: user?.id ?? null,
      });
      toast.success("Sparat!");
      navigate({ to: "/properties/$id/objects", params: { id: propertyId } });
    } catch (err: any) {
      setError(err?.message ?? "Kunde inte spara");
      setSaving(false);
    }
  }

  return (
    <div>
      <Link to="/properties/$id/objects" params={{ id: propertyId }} style={{ fontSize: 13, color: C.secondary, textDecoration: "none" }}>← Tillbaka</Link>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: "10px 0 16px" }}>Nytt objekt</h2>
      <form onSubmit={submit} style={{ display: "grid", gap: 14, maxWidth: 520 }}>
        <div>
          <label style={label}>Typ *</label>
          <EditableSelect value={type} onChange={setType} options={typeOptions} style={input} placeholder="Skriv eller välj typ" />
        </div>
        <div>
          <label style={label}>Titel</label>
          <input style={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="T.ex. Hiss A, Källare plan 1" />
        </div>
        <div>
          <label style={label}>Beskrivning</label>
          <textarea style={textarea} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
        <div>
          <label style={label}>Koppla till lägenhet</label>
          <ChevronSelect style={input} value={apartmentId} onChange={(e) => setApartmentId(e.target.value)}>
            <option value="">— Ingen —</option>
            {(aptsQ.data ?? []).map((a) => <option key={a.id} value={a.id}>Lgh {a.apartment_number} · Trappa {a.trappa}</option>)}
          </ChevronSelect>
        </div>
        {error && <div style={{ color: "#DC2626", fontSize: 13 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" disabled={saving} style={{ height: 44, padding: "0 20px", background: C.primary, color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: "pointer", opacity: saving ? 0.7 : 1 }}>{saving ? "Sparar…" : "Spara objekt"}</button>
        </div>
      </form>
    </div>
  );
}
