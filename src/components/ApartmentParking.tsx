import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { isStaff } from "@/lib/permissions";

const C = { border: "#E5E7EB", secondary: "#6B7280", text: "#1a1a1a", green: "#3D8A30" };
const KIND_LABEL: Record<string, string> = { parkering: "Parkeringsplats", garage: "Garageplats" };
const STATUS_LABEL: Record<string, string> = { vantar: "Står i kö", erbjuden: "Erbjuden plats", tilldelad: "Har plats", struken: "Struken" };
const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  vantar: { bg: "#F3F4F6", fg: "#374151" },
  erbjuden: { bg: "#FEF3C7", fg: "#92400E" },
  tilldelad: { bg: "#DCFCE7", fg: "#166534" },
  struken: { bg: "#FEE2E2", fg: "#991B1B" },
};

type Row = {
  id: string;
  kind: string;
  status: string;
  name: string;
  spot_label: string | null;
  queued_at: string;
  reference: string;
};

const fmt = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" });

/**
 * Parkering för lägenheten: står den i kö, har den erbjudits eller fått en plats? Matchas på
 * (förening, lägenhetsnummer, trappa) — samma identitet som övrigt i portalen och samma som
 * submit-parkering använder för att stoppa en andra anmälan från samma lägenhet.
 * Köplatsen räknas som i kölistan: antal aktiva före i samma förening och typ, plus ett.
 * Bara admin och styrelse (RLS); saknas tabellen visas ingenting.
 */
export function ApartmentParking({ propertyId, apartmentNumber, trappa }: { propertyId: string | null; apartmentNumber: string; trappa: string | null }) {
  const { profile } = useAuth();
  const allowed = isStaff(profile?.role) || profile?.role === "styrelse";

  const q = useQuery({
    queryKey: ["apartment-parking", propertyId, apartmentNumber, trappa],
    enabled: allowed && !!propertyId,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      let mine = supabase.from("parking_queue").select("*").eq("property_id", propertyId!).eq("apartment_number", apartmentNumber).order("queued_at", { ascending: false });
      mine = trappa ? mine.eq("trappa", trappa) : mine.is("trappa", null);
      const r = await mine;
      if (r.error) return null; // tabellen kan saknas — då visas ingenting
      const rows = (r.data ?? []) as Row[];
      // Köplats per typ, bara för dem som faktiskt står i kö.
      const waiting = rows.filter((x) => x.status === "vantar" || x.status === "erbjuden");
      const positions = new Map<string, number>();
      for (const w of waiting) {
        const before = await supabase
          .from("parking_queue")
          .select("id", { count: "exact", head: true })
          .eq("property_id", propertyId!)
          .eq("kind", w.kind)
          .in("status", ["vantar", "erbjuden"])
          .lt("queued_at", w.queued_at);
        positions.set(w.id, (before.count ?? 0) + 1);
      }
      return { rows, positions };
    },
  });

  if (!allowed || !q.data) return null;
  const { rows, positions } = q.data;
  const shown = rows.filter((x) => x.status !== "struken");

  return (
    <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${C.border}`, maxWidth: 720 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: "0 0 2px" }}>Parkering</h2>
      <div style={{ fontSize: 13, color: C.secondary, marginBottom: 12 }}>Köplats och eventuell tilldelad plats för den här lägenheten</div>
      {shown.length === 0 ? (
        <div style={{ fontSize: 13.5, color: C.secondary }}>
          Lägenheten står inte i någon parkeringskö och har ingen tilldelad plats. <Link to={"/parkering" as never} style={{ color: C.green }}>Öppna kölistan</Link>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {shown.map((x) => {
            const st = STATUS_STYLE[x.status] ?? STATUS_STYLE.vantar;
            const pos = positions.get(x.id);
            return (
              <div key={x.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                {pos != null && (
                  <div title="Plats i kön" style={{ minWidth: 38, height: 38, borderRadius: 10, background: "#0D2B1E", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18 }}>{pos}</div>
                )}
                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 14.5, color: C.text }}>{KIND_LABEL[x.kind] ?? x.kind}</strong>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: st.bg, color: st.fg }}>{STATUS_LABEL[x.status] ?? x.status}</span>
                  </div>
                  <div style={{ fontSize: 13, color: C.secondary, marginTop: 2 }}>
                    {x.name} · anmäld {fmt(x.queued_at)} · {x.reference}
                    {x.spot_label ? <> · plats <strong style={{ color: C.text }}>{x.spot_label}</strong></> : null}
                  </div>
                </div>
                <Link to={"/parkering" as never} style={{ fontSize: 13, color: C.green }}>Kölistan</Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
