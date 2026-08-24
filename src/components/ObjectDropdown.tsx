import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { objectTypeLabel } from "@/lib/object-tokens";
import { ChevronSelect } from "@/components/ChevronSelect";

const C = {
  border: "#E5E7EB",
  text: "#1a1a1a",
  secondary: "#6B7280",
  card: "#ffffff",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  height: 40,
  padding: "0 12px",
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  fontSize: 14,
  color: C.text,
  background: C.card,
  outline: "none",
  boxSizing: "border-box",
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

type ObjectOption = { id: string; type: string; name: string | null };

export function objectOptionLabel(o: ObjectOption): string {
  const type = objectTypeLabel(o.type);
  return o.name?.trim() ? `${type} · ${o.name.trim()}` : type;
}

/**
 * Lets a felanmälan/besiktning/projekt be raised against a specific objekt
 * (hiss, vind, miljörum, källare, SBA, tvätt, förråd, lokal) — the same
 * property_objects row the objekt detail page's own "Ny felanmälan"/
 * "Ny besiktning" forms link, just from the other direction. Scoped to the
 * chosen fastighet, same pattern as the lägenhet dropdown next to it.
 */
export function ObjectDropdown({
  propertyId,
  value,
  onChange,
  disabled = false,
}: {
  propertyId: string;
  value: string | null;
  onChange: (objectId: string | null) => void;
  disabled?: boolean;
}) {
  const { data: objects = [] } = useQuery({
    queryKey: ["objects-for-property", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_objects")
        .select("id, type, name")
        .eq("property_id", propertyId)
        .order("type");
      if (error) throw error;
      return (data ?? []) as ObjectOption[];
    },
  });

  return (
    <div style={{ minWidth: 0 }}>
      <label style={labelStyle}>Objekt</label>
      <ChevronSelect
        style={inputStyle}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={!propertyId || disabled}
      >
        <option value="">{propertyId ? "Inget objekt" : "Välj fastighet först"}</option>
        {objects.map((o) => (
          <option key={o.id} value={o.id}>{objectOptionLabel(o)}</option>
        ))}
      </ChevronSelect>
    </div>
  );
}
