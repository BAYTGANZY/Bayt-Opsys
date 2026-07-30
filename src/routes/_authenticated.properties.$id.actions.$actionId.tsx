import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { deriveActionStatus } from "@/lib/issue-tokens";
import { DerivedStatusField } from "@/components/DerivedStatusBadge";
import { DeleteButton } from "@/components/DeleteButton";
import { COLORS, labelStyle, inputStyle, textareaStyle, primaryBtn } from "@/components/property-tabs";

export const Route = createFileRoute("/_authenticated/properties/$id/actions/$actionId")({
  head: () => ({ meta: [{ title: "Åtgärd — BAYT" }] }),
  component: ActionDetailPage,
});

type Action = {
  id: string;
  property_id: string | null;
  title: string;
  description: string | null;
  status: string | null;
  due_date: string | null;
  assigned_to: string | null;
  created_at: string | null;
  profiles: { full_name: string | null } | null;
};

function ActionDetailPage() {
  const { id: propertyId, actionId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const actionQ = useQuery({
    queryKey: ["action", actionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("actions")
        .select("id, property_id, title, description, status, due_date, assigned_to, created_at, profiles:assigned_to(full_name)")
        .eq("id", actionId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Action | null;
    },
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  useEffect(() => {
    if (!actionQ.data) return;
    setTitle(actionQ.data.title ?? "");
    setDescription(actionQ.data.description ?? "");
    setDueDate(actionQ.data.due_date ?? "");
  }, [actionQ.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Titel krävs");
      // .select() so an update RLS silently filtered away is distinguishable
      // from one that worked — PostgREST returns 200 for both.
      const { data, error } = await supabase
        .from("actions")
        .update({ title: title.trim(), description: description.trim() || null, due_date: dueDate || null })
        .eq("id", actionId)
        .select("id");
      if (error) throw error;
      if ((data?.length ?? 0) === 0) {
        throw new Error("Databasen tillät inte ändringen — åtgärden sparades inte.");
      }
    },
    onSuccess: () => {
      toast.success("Sparat!", { style: { background: "#3D8A30", color: "#fff" } });
      qc.invalidateQueries({ queryKey: ["action", actionId] });
      qc.invalidateQueries({ queryKey: ["actions", propertyId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Kunde inte spara"),
  });

  if (actionQ.isLoading) return <div style={{ color: COLORS.secondary }}>Laddar…</div>;
  if (!actionQ.data) return <div style={{ color: COLORS.secondary }}>Åtgärden hittades inte.</div>;
  const action = actionQ.data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: COLORS.text, fontFamily: "Outfit, Inter, system-ui, sans-serif" }}>
        {action.title}
      </h2>

      <div>
        <label style={labelStyle}>Titel *</label>
        <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div>
        <label style={labelStyle}>Beskrivning</label>
        <textarea style={textareaStyle} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <label style={labelStyle}>Förfallodatum</label>
          <input style={inputStyle} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <DerivedStatusField
          status={deriveActionStatus({ status: action.status, due_date: dueDate || null })}
          labelStyle={labelStyle}
        />
        <div style={{ minWidth: 0 }}>
          <label style={labelStyle}>Tilldelad</label>
          <div style={{ display: "flex", alignItems: "center", minHeight: 40, fontSize: 14, color: COLORS.text }}>
            {action.profiles?.full_name ?? "—"}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          style={{ ...primaryBtn, cursor: save.isPending ? "not-allowed" : "pointer", opacity: save.isPending ? 0.7 : 1 }}
        >
          {save.isPending ? "Sparar…" : "Spara ändringar"}
        </button>
        <DeleteButton
          table="actions"
          id={actionId}
          label={action.title ?? "åtgärd"}
          variant="full"
          invalidateKeys={[["actions", propertyId]]}
          onDeleted={() => navigate({ to: "/properties/$id/actions", params: { id: propertyId } })}
        />
      </div>
    </div>
  );
}
