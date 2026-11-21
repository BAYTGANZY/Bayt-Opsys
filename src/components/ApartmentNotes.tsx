import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { isStaff } from "@/lib/permissions";

const C = { border: "#E5E7EB", secondary: "#6B7280", text: "#1a1a1a", green: "#3D8A30", soft: "#F3F9F1" };

type Note = { id: string; body: string; created_by_name: string | null; created_at: string; done: boolean; done_at: string | null };

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("sv-SE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Anteckningar till förvaltaren på en lägenhet. Styrelsen är read-only i övrigt men kan här lämna
 * ett önskemål ("vi vill att fönstren ses över i lgh 1801"); admin ser det, bockar av och raderar.
 * Tabellen kommer från supabase-functions/apartment-notes.sql (körs för hand) — saknas den visas
 * en neutral notis i stället för att sidan går sönder. Entreprenörer ser ingenting.
 */
export function ApartmentNotes({ apartmentId, propertyId }: { apartmentId: string; propertyId: string | null }) {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const isAdmin = profile?.role === "admin";
  const staff = isStaff(profile?.role);
  const allowed = staff || profile?.role === "styrelse";
  const [text, setText] = useState("");
  const key = ["apartment-notes", apartmentId];

  const q = useQuery({
    queryKey: key,
    enabled: allowed,
    queryFn: async () => {
      const r = await supabase.from("apartment_notes").select("*").eq("apartment_id", apartmentId).order("created_at", { ascending: false });
      if (r.error) throw r.error;
      return (r.data ?? []) as Note[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!propertyId) throw new Error("Lägenheten saknar fastighet.");
      const body = text.trim();
      if (!body) throw new Error("Skriv en anteckning först.");
      const r = await supabase
        .from("apartment_notes")
        .insert({ apartment_id: apartmentId, property_id: propertyId, body, created_by: user?.id, created_by_name: profile?.full_name ?? null })
        .select("id");
      if (r.error) throw r.error;
      if (!r.data || r.data.length === 0) throw new Error("Anteckningen sparades inte (behörighet saknas).");
    },
    onSuccess: () => {
      setText("");
      toast.success("Anteckningen är sparad");
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (n: Note) => {
      const r = await supabase.from("apartment_notes").update({ done: !n.done, done_at: n.done ? null : new Date().toISOString() }).eq("id", n.id).select("id");
      if (r.error) throw r.error;
      if (!r.data || r.data.length === 0) throw new Error("Ändringen sparades inte.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (n: Note) => {
      const r = await supabase.from("apartment_notes").delete().eq("id", n.id).select("id");
      if (r.error) throw r.error;
      if (!r.data || r.data.length === 0) throw new Error("Anteckningen kunde inte tas bort.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!allowed) return null;
  const missing = !!q.error && /does not exist|schema cache|42P01|PGRST205/i.test((q.error as Error).message);
  const notes = q.data ?? [];

  return (
    <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${C.border}`, maxWidth: 720 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: "0 0 2px" }}>Anteckningar</h2>
      <div style={{ fontSize: 13, color: C.secondary, marginBottom: 12 }}>
        {isAdmin ? "Önskemål och noteringar från styrelsen om lägenheten" : "Vill ni att något görs i lägenheten? Skriv det här så ser förvaltaren det."}
      </div>

      {missing && <div style={{ fontSize: 13, color: C.secondary }}>Anteckningar är inte aktiverade ännu (databasen behöver uppdateras).</div>}

      {!missing && (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Skriv en anteckning eller ett önskemål"
            aria-label="Ny anteckning"
            style={{ width: "100%", boxSizing: "border-box", padding: 10, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", resize: "vertical" }}
          />
          <button
            type="button"
            disabled={add.isPending || !text.trim()}
            onClick={() => add.mutate()}
            style={{ marginTop: 8, height: 36, padding: "0 16px", borderRadius: 8, border: "none", background: C.green, color: "#fff", fontWeight: 600, fontSize: 14, cursor: add.isPending || !text.trim() ? "not-allowed" : "pointer", opacity: add.isPending || !text.trim() ? 0.6 : 1 }}
          >
            Spara anteckning
          </button>

          <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
            {notes.length === 0 && !q.isLoading && <div style={{ fontSize: 13, color: C.secondary }}>Inga anteckningar ännu.</div>}
            {notes.map((n) => (
              <div key={n.id} style={{ border: `1px solid ${C.border}`, borderLeft: `3px solid ${n.done ? "#9CA3AF" : C.green}`, borderRadius: 8, padding: "10px 12px", background: n.done ? "#F9FAFB" : C.soft }}>
                <div style={{ fontSize: 14, color: n.done ? C.secondary : C.text, whiteSpace: "pre-wrap", textDecoration: n.done ? "line-through" : "none" }}>{n.body}</div>
                <div style={{ fontSize: 12, color: C.secondary, marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <span>{n.created_by_name || "Okänd"} · {fmt(n.created_at)}</span>
                  {n.done && <span>Klar {n.done_at ? fmt(n.done_at) : ""}</span>}
                  {staff && (
                    <>
                      <button type="button" onClick={() => toggle.mutate(n)} style={{ background: "none", border: "none", color: C.green, fontWeight: 600, cursor: "pointer", padding: 0, fontSize: 12 }}>
                        {n.done ? "Öppna igen" : "Markera som klar"}
                      </button>
                      {isAdmin && <button
                        type="button"
                        onClick={() => { if (window.confirm("Ta bort anteckningen? Det går inte att ångra.")) remove.mutate(n); }}
                        style={{ background: "none", border: "none", color: "#B91C1C", cursor: "pointer", padding: 0, fontSize: 12 }}
                      >
                        Ta bort
                      </button>}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
