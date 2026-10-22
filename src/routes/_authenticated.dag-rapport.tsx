import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { CalendarCheckIn01Icon, AlertCircleIcon } from "@hugeicons/core-free-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { BottomSheet } from "@/components/BottomSheet";
import { PRIORITY_BADGE, isOverdue, LIFECYCLE_OF, STATUS_ACTIVATE, STATUS_CLOSE, deriveIssueStatus } from "@/lib/issue-tokens";
import { logEvent } from "@/lib/logbook";
import { VeckansArendenSection } from "@/components/OppnaArendenList";
import { EntreprenorDagRapport, StyrelseDagRapport } from "@/components/EntreprenorDagRapport";
import { isEntreprenor, isStyrelse } from "@/lib/permissions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dag-rapport")({
  head: () => ({ meta: [{ title: "Dag Rapport — BAYT" }] }),
  component: DagRapportRoute,
});

/**
 * Dag Rapport is three different pages sharing one URL.
 *
 * For an entreprenör it is their landing page and whole working surface — only
 * ärenden assigned to them, split into "öppna" and the full deadline-ordered
 * worklist (see EntreprenorDagRapport).
 *
 * Styrelse gets the same worklist for the buildings they are attached to, read
 * only: they neither order the work nor do it, but they need to see what is
 * coming and who is doing it. StyrelseDagRapport renders no lifecycle buttons
 * at all — not disabled, not hidden, simply never rendered.
 *
 * For admin it stays the building-wide day view below.
 */
function DagRapportRoute() {
  const { profile } = useAuth();
  if (isEntreprenor(profile?.role)) return <EntreprenorDagRapport />;
  if (isStyrelse(profile?.role)) return <StyrelseDagRapport />;
  return <DagRapportPage />;
}

type Issue = {
  id: string;
  title: string;
  status: string;
  priority: string;
  description: string | null;
  category: string | null;
  deadline: string | null;
  created_at: string;
  property_id: string | null;
  apartment_id: string | null;
  properties: { name: string | null } | null;
};

function DagRapportPage() {
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const { data: issues = [], isLoading } = useQuery({
    queryKey: ["dag-rapport"],
    queryFn: async () => {
      const { data } = await supabase
        .from("issues")
        .select("id, title, status, priority, description, category, deadline, created_at, property_id, apartment_id, properties(name)")
        .not("status", "in", "(klar,fakturerad,stangd,avslutat)")
        .order("created_at", { ascending: false });
      return ((data ?? []) as unknown as Issue[]).filter((i) => {
        if (i.priority === "akut") return true;
        if (i.deadline && i.deadline <= today) return true;
        return false;
      });
    },
  });

  const selected = useMemo(() => issues.find((i) => i.id === selectedId) ?? null, [issues, selectedId]);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, label, propertyId, apartmentId }: { id: string; status: string; label: string; propertyId: string | null; apartmentId: string | null }) => {
      const { data: prev } = await supabase.from("issues").select("status").eq("id", id).maybeSingle();
      const oldStatus = (prev as any)?.status ?? null;
      const { error } = await supabase.from("issues").update({ status }).eq("id", id);
      if (error) throw error;
      if (user && oldStatus && oldStatus !== status) {
        await supabase.from("issue_status_history").insert({ issue_id: id, old_status: oldStatus, new_status: status, changed_by: user.id }).then(() => null, () => null);
      }
      await logEvent({
        event_type: "arende_status_andring",
        property_id: propertyId,
        // Without this the entry is property-scoped only and never reaches the
        // apartment's Tidslinje, which filters on apartment_id.
        apartment_id: apartmentId,
        description: `${label} (${oldStatus ?? "?"} → ${status})`,
        created_by: user?.id ?? null,
      });
    },
    onSuccess: () => {
      toast.success("Uppdaterat");
      setSelectedId(null);
      qc.invalidateQueries({ queryKey: ["dag-rapport"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Kunde inte uppdatera"),
  });

  return (
    <div style={{ padding: isMobile ? 16 : 32, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <HugeiconsIcon icon={CalendarCheckIn01Icon} size={22} color="#3D8A30" />
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Dag Rapport</h1>
      </div>

      <VeckansArendenSection />


      <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 16 }}>
        {issues.length} ärenden för idag — akuta, försenade och förfallna.
      </div>
      {isLoading ? (
        <div style={{ color: "#6B7280" }}>Laddar…</div>
      ) : issues.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#6B7280" }}>Inga ärenden idag — bra jobbat!</div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
          {issues.map((i) => {
            const overdue = isOverdue(i.deadline, i.status);
            const prio = PRIORITY_BADGE[i.priority] ?? PRIORITY_BADGE.normal;
            return (
              <button
                key={i.id}
                type="button"
                onClick={() => setSelectedId(i.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, width: "100%",
                  padding: "14px 16px", border: "none", background: "transparent",
                  borderBottom: "1px solid #F3F4F6", cursor: "pointer", textAlign: "left",
                }}
              >
                <span
                  style={{
                    position: "relative", display: "inline-block",
                    width: 12, height: 12, borderRadius: "50%", background: prio.color, flexShrink: 0,
                  }}
                >
                  {overdue && (
                    <span style={{ position: "absolute", inset: -4, borderRadius: "50%", border: `2px solid ${prio.color}`, animation: "bayt-sonar 1.4s ease-out infinite" }} />
                  )}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.title}</div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                    {i.properties?.name ?? "—"}{i.deadline ? ` · Deadline ${i.deadline}` : ""}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: prio.color, fontWeight: 600, textTransform: "uppercase" }}>{i.priority}</div>
              </button>
            );
          })}
        </div>
      )}

      <BottomSheet open={!!selected} onClose={() => setSelectedId(null)}>
        {selected && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>Felanmälan</div>
              <h2 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>{selected.title}</h2>
              <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>{selected.properties?.name ?? "—"}</div>
            </div>
            <div style={{ display: "flex", gap: 16, fontSize: 13, flexWrap: "wrap" }}>
              <span><b>Prioritet:</b> <span style={{ color: (PRIORITY_BADGE[selected.priority] ?? PRIORITY_BADGE.normal).color }}>{selected.priority}</span></span>
              <span><b>Status:</b> <span style={{ color: deriveIssueStatus(selected).color }}>{deriveIssueStatus(selected).label}</span></span>
              {selected.deadline && <span style={{ color: isOverdue(selected.deadline, selected.status) ? "#DC2626" : undefined }}><b>Deadline:</b> {selected.deadline}</span>}
              {selected.category && <span><b>Kategori:</b> {selected.category}</span>}
            </div>
            {selected.description && (
              <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, padding: 12, fontSize: 14, color: "#1a1a1a", whiteSpace: "pre-wrap" }}>
                {selected.description}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {LIFECYCLE_OF[selected.status] === "vilande" && (
                <button
                  type="button"
                  onClick={() => updateStatus.mutate({ id: selected.id, status: STATUS_ACTIVATE, label: selected.title, propertyId: selected.property_id, apartmentId: selected.apartment_id })}
                  disabled={updateStatus.isPending}
                  style={{ height: 44, padding: "0 18px", background: "#3D8A30", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                >
                  Aktivera
                </button>
              )}
              {LIFECYCLE_OF[selected.status] !== "avslutat" && (
                <button
                  type="button"
                  onClick={() => updateStatus.mutate({ id: selected.id, status: STATUS_CLOSE, label: selected.title, propertyId: selected.property_id, apartmentId: selected.apartment_id })}
                  disabled={updateStatus.isPending}
                  style={{ height: 44, padding: "0 18px", background: "#fff", color: "#1a1a1a", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                >
                  Avsluta
                </button>
              )}
              <button
                type="button"
                onClick={() => { setSelectedId(null); navigate({ to: "/issues/$id", params: { id: selected.id } }); }}
                style={{ marginLeft: "auto", height: 44, padding: "0 18px", background: "transparent", color: "#3D8A30", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              >
                Öppna fullskärm →
              </button>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
