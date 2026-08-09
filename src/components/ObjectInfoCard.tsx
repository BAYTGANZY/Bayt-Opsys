import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { objectTypeLabel } from "@/lib/object-tokens";

const C = {
  border: "#E5E7EB",
  text: "#1a1a1a",
  secondary: "#6B7280",
  wash: "#F9FAFB",
  primary: "#3D8A30",
};

type ObjectRow = {
  id: string;
  property_id: string;
  type: string;
  name: string | null;
  description: string | null;
  apartment_id: string | null;
};

type Apartment = { apartment_number: string; trappa: string | null };

/**
 * Shown on an ärendes detaljsida when it is raised against ett objekt
 * (property_objects) — the reverse direction of the objekt-sidans egna
 * "Ny felanmälan"/"Ny besiktning" forms. Whoever is assigned (entreprenör
 * included — RLS lets them read an objekt they hold an ärende on, see
 * has_object_assignment) sees what the objekt is and, if it is tied to a
 * lägenhet, which one — same "koppla till lägenhet" field the objektets
 * own new-form writes.
 *
 * apartment_id is resolved with a separate lookup rather than a PostgREST
 * embed, same no-embed convention as everywhere else in this codebase: an
 * embed needs a declared FK on both sides, and a missing one 400s the whole
 * query instead of just leaving the lägenhetslabel blank.
 */
export function ObjectInfoCard({ objectId }: { objectId: string | null }) {
  const objectQ = useQuery({
    queryKey: ["object-info", objectId],
    enabled: !!objectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_objects")
        .select("id, property_id, type, name, description, apartment_id")
        .eq("id", objectId!)
        .single();
      if (error) throw error;
      return data as ObjectRow;
    },
  });

  const apartmentId = objectQ.data?.apartment_id ?? null;
  const apartmentQ = useQuery({
    queryKey: ["object-info-apartment", apartmentId],
    enabled: !!apartmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("apartments")
        .select("apartment_number, trappa")
        .eq("id", apartmentId!)
        .single();
      if (error) throw error;
      return data as Apartment;
    },
  });

  if (!objectId || !objectQ.data) return null;
  const o = objectQ.data;
  const a = apartmentQ.data;

  return (
    <div style={{ background: C.wash, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, display: "grid", gap: 6, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: C.secondary, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Objekt
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
        {objectTypeLabel(o.type)}{o.name?.trim() ? ` · ${o.name.trim()}` : ""}
      </div>
      {o.description?.trim() && (
        <div style={{ fontSize: 13, color: C.secondary, whiteSpace: "pre-wrap" }}>{o.description.trim()}</div>
      )}
      {a && (
        <div style={{ fontSize: 13, color: C.text }}>
          Lägenhet: Lgh {a.apartment_number}{a.trappa?.trim() ? ` · Trappa ${a.trappa.trim()}` : ""}
        </div>
      )}
      <Link
        to="/properties/$id/objects/$objectId"
        params={{ id: o.property_id, objectId: o.id }}
        style={{ fontSize: 13, fontWeight: 600, color: C.primary, textDecoration: "underline", justifySelf: "start" }}
      >
        Visa objektet
      </Link>
    </div>
  );
}
