import { useState } from "react";

type Field = { key: string; label: string; type: "text" | "date" | "number" };

const FIELDS: Record<string, Field[]> = {
  issue: [
    { key: "description", label: "Beskrivning", type: "text" },
    { key: "deadline", label: "Tidsgräns", type: "date" },
  ],
  inspection: [
    { key: "description", label: "Anteckningar", type: "text" },
    { key: "deadline", label: "Tidsgräns", type: "date" },
    { key: "last_completed_date", label: "Senast utförd", type: "date" },
    { key: "next_due_date", label: "Nästa besiktning", type: "date" },
    { key: "inspector", label: "Besiktningsman", type: "text" },
  ],
  project: [
    { key: "description", label: "Beskrivning", type: "text" },
    { key: "budget", label: "Budget (kr)", type: "number" },
    { key: "start_date", label: "Startdatum", type: "date" },
    { key: "end_date", label: "Slutdatum", type: "date" },
  ],
};

// Besiktningens anteckningar heter "notes" i databasen men "description" i listan.
const SERVER_KEY: Record<string, Record<string, string>> = {
  inspection: { description: "notes" },
};

export function PortalEditForm({
  kind,
  values,
  saving,
  onSave,
}: {
  kind: string;
  values: Record<string, unknown>;
  saving: boolean;
  onSave: (fields: Record<string, unknown>) => void;
}) {
  const fields = FIELDS[kind] ?? [];
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    for (const f of fields) d[f.key] = values[f.key] == null ? "" : String(values[f.key]);
    return d;
  });

  const input: React.CSSProperties = {
    width: "100%",
    border: "1px solid #E5E7EB",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 14,
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  return (
    <div style={{ display: "grid", gap: 12, marginTop: 4 }}>
      <div style={{ fontSize: 12, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Uppdatera ärendet
      </div>
      {fields.map((f) => (
        <label key={f.key} style={{ display: "grid", gap: 4, fontSize: 13, color: "#1F2A37" }}>
          {f.label}
          {f.type === "text" && f.key === "description" ? (
            <textarea
              rows={4}
              style={input}
              value={draft[f.key]}
              onChange={(e) => setDraft((p) => ({ ...p, [f.key]: e.target.value }))}
            />
          ) : (
            <input
              style={input}
              type={f.type === "text" ? "text" : f.type}
              min={f.type === "number" ? 0 : undefined}
              value={draft[f.key]}
              onChange={(e) => setDraft((p) => ({ ...p, [f.key]: e.target.value }))}
            />
          )}
        </label>
      ))}
      <button
        type="button"
        disabled={saving}
        onClick={() => {
          const out: Record<string, unknown> = {};
          for (const f of fields) {
            out[SERVER_KEY[kind]?.[f.key] ?? f.key] = draft[f.key] === "" ? null : draft[f.key];
          }
          onSave(out);
        }}
        style={{
          height: 44,
          background: "#3D8A30",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          fontSize: 15,
          fontWeight: 600,
          cursor: saving ? "not-allowed" : "pointer",
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? "Sparar…" : "Spara ändringar"}
      </button>
    </div>
  );
}
