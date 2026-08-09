import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { AnsvarigDropdown } from "@/components/AnsvarigDropdown";
import { ObjectDropdown } from "@/components/ObjectDropdown";
import { DerivedPriorityField } from "@/components/DerivedPriorityField";
import { derivePriority } from "@/lib/issue-tokens";

export const Route = createFileRoute("/_authenticated/projects/new")({
  head: () => ({ meta: [{ title: "Nytt projekt — BAYT" }] }),
  component: NewProjectPage,
});

const C = {
  bg: "#FFFFFF",
  card: "#ffffff",
  border: "#E5E7EB",
  primary: "#3D8A30",
  secondary: "#6B7280",
  text: "#1a1a1a",
  error: "#DC2626",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 500,
  color: C.secondary,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 12px",
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  fontSize: 14,
  color: C.text,
  background: C.card,
  outline: "none",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  height: "auto",
  minHeight: 80,
  padding: 12,
  resize: "vertical",
  fontFamily: "inherit",
};


export function NewProjectPage({ initialPropertyId }: { initialPropertyId?: string } = {}) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [propertyId, setPropertyId] = useState(initialPropertyId ?? "");
  const [propertyObjectId, setPropertyObjectId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [assignedContactId, setAssignedContactId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: properties = [] } = useQuery({
    queryKey: ["properties-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!propertyId || !title) throw new Error("Fyll i obligatoriska fält");
      const { data, error } = await supabase
        .from("projects")
        .insert({
          property_id: propertyId,
          property_object_id: propertyObjectId,
          title,
          description: description || null,
          status: "planerad",
          // Starts vilande so Öppna ärende has something to flip; after that the
          // status shown is derived (deriveProjectStatus), never picked.
          arende_status: "vilande",
          budget: budget ? Number(budget) : null,
          start_date: startDate || null,
          end_date: endDate || null,
          assigned_contact_id: assignedContactId,
          created_by: user?.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success("Sparat!", { style: { background: "#3D8A30", color: "#fff" } });
      navigate({ to: "/projects/$id", params: { id } });
    },
    onError: (e: any) => setError(e.message ?? "Kunde inte spara"),
  });

  // Prioritet är härledd, aldrig vald — här ur projektets slutdatum.
  const derivedPriority = derivePriority(endDate || null, { dueLabel: "Slutdatum" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    create.mutate();
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: isMobile ? 16 : 32 }}>
      <Link
        to="/projects"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 14,
          color: C.secondary,
          textDecoration: "none",
          marginBottom: 16,
        }}
      >
        <ArrowLeft size={18} /> Tillbaka
      </Link>

      <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: "0 0 24px" }}>Nytt projekt</h1>

      <form
        onSubmit={handleSubmit}
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: 24,
          maxWidth: 640,
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Fastighet *</label>
          <select
            style={inputStyle}
            value={propertyId}
            onChange={(e) => { setPropertyId(e.target.value); setPropertyObjectId(null); }}
            required
          >
            <option value="">Välj fastighet</option>
            {(properties as Array<{ id: string; name: string }>).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <ObjectDropdown propertyId={propertyId} value={propertyObjectId} onChange={setPropertyObjectId} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Titel *</label>
          <input
            style={inputStyle}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Beskrivning</label>
          <textarea
            style={textareaStyle}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Budget (SEK)</label>
          <input
            style={inputStyle}
            type="number"
            min={0}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Startdatum</label>
            <input
              style={inputStyle}
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>Slutdatum</label>
            <input
              style={inputStyle}
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <DerivedPriorityField priority={derivedPriority} labelStyle={labelStyle} reasonColor={C.secondary} />
        </div>

        <div style={{ marginBottom: 24 }}>
          <AnsvarigDropdown value={assignedContactId} onChange={setAssignedContactId} />
        </div>

        {error && (
          <div style={{ color: C.error, fontSize: 14, marginBottom: 16 }}>{error}</div>
        )}

        <button
          type="submit"
          disabled={create.isPending}
          style={{
            width: "100%",
            height: 44,
            background: C.primary,
            color: "#ffffff",
            border: "none",
            borderRadius: 6,
            fontSize: 15,
            fontWeight: 600,
            cursor: create.isPending ? "not-allowed" : "pointer",
            opacity: create.isPending ? 0.7 : 1,
          }}
        >
          {create.isPending ? "Sparar…" : "Spara projekt"}
        </button>
      </form>
    </div>
  );
}
