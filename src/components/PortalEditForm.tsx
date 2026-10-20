import { useState } from "react";

export function PortalEditForm({
  values,
  saving,
  onSave,
  onDone,
  doneSaving,
}: {
  kind: string;
  values: Record<string, unknown>;
  saving: boolean;
  onSave: (fields: Record<string, unknown>) => void;
  onDone: () => void;
  doneSaving: boolean;
}) {
  const [note, setNote] = useState<string>(
    values.contractor_note == null ? "" : String(values.contractor_note),
  );
  const doneAt = values.contractor_done_at ? String(values.contractor_done_at) : null;

  const box: React.CSSProperties = {
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
      <label style={{ display: "grid", gap: 4, fontSize: 13, color: "#1F2A37" }}>
        Din kommentar
        <textarea
          rows={4}
          style={box}
          value={note}
          placeholder="Skriv här, t.ex. vad som är gjort eller vad som behövs."
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <button
        type="button"
        disabled={saving}
        onClick={() => onSave({ contractor_note: note === "" ? null : note })}
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
        {saving ? "Sparar…" : "Spara kommentar"}
      </button>

      {doneAt ? (
        <div style={{ fontSize: 13, color: "#3D8A30", fontWeight: 600 }}>
          Du har meddelat att uppdraget är slutfört. Förvaltaren granskar och avslutar ärendet.
        </div>
      ) : (
        <button
          type="button"
          disabled={doneSaving}
          onClick={() => {
            if (window.confirm("Meddela förvaltaren att uppdraget är slutfört?")) onDone();
          }}
          style={{
            height: 44,
            background: "#0D2B1E",
            color: "#ffffff",
            border: "1px solid #0D2B1E",
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 600,
            cursor: doneSaving ? "not-allowed" : "pointer",
            opacity: doneSaving ? 0.7 : 1,
          }}
        >
          {doneSaving ? "Skickar…" : "Meddela att uppdraget är slutfört"}
        </button>
      )}
    </div>
  );
}
