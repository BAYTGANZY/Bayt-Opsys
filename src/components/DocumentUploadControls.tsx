import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { sanitizeStorageName } from "@/lib/storage";
import { useAuth } from "@/lib/auth";
import { COLORS } from "@/components/property-tabs";
import { FileDropzone } from "@/components/FileDropzone";

const DOC_CATEGORIES = ["avtal", "protokoll", "ritningar", "forsakringar", "garantier", "offerter", "driftinstruktioner", "besiktningsprotokoll", "ovrigt"];

/** Kategori dropdown + Ladda upp dokument button, standalone so it can sit
 *  in the property header row next to the building name/address, while the
 *  document list (DocumentsTab) stays in sync via the shared query key. */
export function DocumentUploadControls({ propertyId }: { propertyId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("ovrigt");

  // Uploads start the moment files are picked — nothing is staged, so the
  // dropzone below never shows a chip list (files={[]}).
  const handleUpload = async (picked: File[]) => {
    if (!picked.length || !user || uploading) return;
    setError(""); setUploading(true);
    for (const file of picked) {
      const path = `${propertyId}/${Date.now()}-${sanitizeStorageName(file.name)}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
      if (upErr) { setError(`Uppladdning misslyckades: ${upErr.message}`); setUploading(false); return; }
      const { data: pub } = supabase.storage.from("documents").getPublicUrl(path);
      const { error: insErr } = await supabase.from("documents").insert({
        property_id: propertyId, name: file.name, category, file_url: pub.publicUrl, file_type: file.type || null, file_size: file.size, uploaded_by: user.id,
      });
      if (insErr) { setError(insErr.message); setUploading(false); return; }
    }
    setUploading(false);
    qc.invalidateQueries({ queryKey: ["documents", propertyId] });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        style={{
          width: "auto", minWidth: 160, height: 38, padding: "0 14px",
          border: "1px solid #5CB84A", borderRadius: 999, background: "#F0F7EE",
          color: "#0D2B1E", fontSize: 13.5, fontWeight: 600, outline: "none", cursor: "pointer",
        }}
      >
        {DOC_CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
      </select>
      <div style={{ width: "100%", minWidth: 280 }}>
        <FileDropzone
          files={[]}
          onAdd={handleUpload}
          onRemove={() => {}}
          label={uploading ? "Laddar upp…" : "Ladda upp dokument"}
        />
      </div>
      {error && <div style={{ color: COLORS.error, fontSize: 12.5 }}>{error}</div>}
    </div>
  );
}
