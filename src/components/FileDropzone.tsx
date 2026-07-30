import { ImagePlus, X } from "lucide-react";

// The upload control born on the public /felanmalan survey, extracted so every
// upload surface in the app looks and behaves the same: a clickable dashed
// dropzone that APPENDS to the selection, plus a removable chip per picked file.
// Colors are hardcoded (they match the recurring app palette) because this
// renders both inside and outside .bayt-app — the inline minWidth/boxSizing
// overflow protection must stay for the public routes that lack the global net.
const C = {
  border: "#E5E7EB",
  secondary: "#6B7280",
  text: "#1a1a1a",
};

export function FileDropzone({
  files,
  onAdd,
  onRemove,
  label = "Lägg till bild eller fil",
  accept = "*/*",
  multiple = true,
}: {
  files: File[];
  /** Called with the newly picked files only — the host appends them to its selection. */
  onAdd: (picked: File[]) => void;
  onRemove: (index: number) => void;
  label?: string;
  accept?: string;
  multiple?: boolean;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          width: "100%",
          boxSizing: "border-box",
          minHeight: 88,
          padding: "16px 12px",
          border: `1px dashed ${C.border}`,
          borderRadius: 8,
          background: "#F9FAFB",
          color: C.secondary,
          fontSize: 14,
          fontWeight: 500,
          cursor: "pointer",
          textAlign: "center",
        }}
      >
        <ImagePlus size={20} />
        <span>{label}</span>
        <input
          type="file"
          multiple={multiple}
          accept={accept}
          style={{ display: "none" }}
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            if (picked.length) onAdd(picked);
            // Re-picking a just-removed file must re-fire onChange.
            e.target.value = "";
          }}
        />
      </label>
      {files.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
          {files.map((f, i) => (
            <div
              key={`${f.name}-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                fontSize: 13,
                minWidth: 0,
              }}
            >
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.text }}>
                {f.name}
              </span>
              <button
                type="button"
                aria-label={`Ta bort ${f.name}`}
                onClick={() => onRemove(i)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: C.secondary,
                  cursor: "pointer",
                  padding: 4,
                  display: "inline-flex",
                  flexShrink: 0,
                }}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
