import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useIsMobile } from "@/hooks/use-mobile";
import { PropertyTimeline } from "@/components/PropertyTimeline";
import { DeleteButton } from "@/components/DeleteButton";
const buildingSketch = `${import.meta.env.BASE_URL}assets/building-sketch.png`;

export const Route = createFileRoute("/_authenticated/fastigheter/$id/installningar")({
  head: () => ({ meta: [{ title: "Fastighetsinställningar — BAYT" }] }),
  component: PropertySettingsPage,
});

const C = {
  primary: "#5CB84A",
  dark: "#0D2B1E",
  border: "#E5E7EB",
  text: "#1a1a1a",
  secondary: "#6B7280",
  card: "#ffffff",
};

type PropertyRow = {
  id: string;
  name: string;
  address: string | null;
  image_url: string | null;
  designation: string | null;
  description: string | null;
  unit_count: number | null;
  notes: string | null;
};

function PropertySettingsPage() {
  const { id } = Route.useParams();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const { data: property, isLoading } = useQuery({
    queryKey: ["property-settings", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, address, image_url, designation, description, unit_count, notes")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as PropertyRow | null;
    },
  });

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [designation, setDesignation] = useState("");
  const [description, setDescription] = useState("");
  const [unitCount, setUnitCount] = useState("");
  const [notes, setNotes] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (property) {
      setName(property.name ?? "");
      setAddress(property.address ?? "");
      setDesignation(property.designation ?? "");
      setDescription(property.description ?? "");
      setUnitCount(property.unit_count?.toString() ?? "");
      setNotes(property.notes ?? "");
      setImageUrl(property.image_url ?? null);
    }
  }, [property]);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("property-images")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("property-images").getPublicUrl(path);
      setImageUrl(pub.publicUrl);
      toast.success("Bild uppladdad");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Kunde inte ladda upp bild";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("properties")
        .update({
          name: name.trim(),
          address: address.trim() || null,
          designation: designation.trim() || null,
          description: description.trim() || null,
          unit_count: unitCount.trim() ? parseInt(unitCount, 10) : null,
          notes: notes.trim() || null,
          image_url: imageUrl,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sparat!");
      qc.invalidateQueries({ queryKey: ["properties", "list"] });
      qc.invalidateQueries({ queryKey: ["section-overview-properties"] });
      qc.invalidateQueries({ queryKey: ["property", id] });
      qc.invalidateQueries({ queryKey: ["property-settings", id] });
      navigate({ to: "/fastigheter/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message ?? "Kunde inte spara"),
  });

  if (isLoading) {
    return <div style={{ padding: 24, color: C.secondary }}>Laddar…</div>;
  }
  if (!property) {
    return <div style={{ padding: 24, color: C.secondary }}>Fastigheten hittades inte.</div>;
  }

  const previewSrc = imageUrl ?? buildingSketch;

  return (
    <div
      style={{
        padding: isMobile ? 16 : 32,
        maxWidth: 720,
        margin: "0 auto",
        fontFamily: "Inter, system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <Link
        to="/fastigheter/$id"
        params={{ id }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          color: C.secondary,
          textDecoration: "none",
          width: "fit-content",
        }}
      >
        <ArrowLeft size={16} /> Tillbaka
      </Link>

      <h1
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: C.text,
          margin: 0,
          fontFamily: "Outfit, Inter, system-ui, sans-serif",
        }}
      >
        Inställningar
      </h1>

      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          padding: isMobile ? 16 : 24,
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        {/* Image */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: C.secondary,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Bild
          </label>
          <div
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: "16 / 9",
              borderRadius: 10,
              overflow: "hidden",
              background: "#E8F2DC",
              border: `1px solid ${C.border}`,
            }}
          >
            <img
              src={previewSrc}
              alt=""
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              alignSelf: "flex-start",
              height: 38,
              padding: "0 16px",
              background: C.dark,
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              cursor: uploading ? "not-allowed" : "pointer",
              opacity: uploading ? 0.7 : 1,
              fontFamily: "Outfit, Inter, system-ui, sans-serif",
            }}
          >
            {uploading ? "Laddar upp…" : "Byt bild"}
          </button>
        </div>

        {/* Name */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: C.secondary,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Namn
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              height: 40,
              padding: "0 12px",
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              fontSize: 14,
              color: C.text,
              outline: "none",
              background: "#fff",
            }}
          />
        </div>

        {/* Address */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: C.secondary,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Adress
          </label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            style={{
              height: 40,
              padding: "0 12px",
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              fontSize: 14,
              color: C.text,
              outline: "none",
              background: "#fff",
            }}
          />
        </div>

        {/* Beteckning */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: C.secondary,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Beteckning
          </label>
          <input
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            style={{
              height: 40,
              padding: "0 12px",
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              fontSize: 14,
              color: C.text,
              outline: "none",
              background: "#fff",
            }}
          />
        </div>

        {/* Antal lägenheter */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: C.secondary,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Antal lägenheter
          </label>
          <input
            type="number"
            min={0}
            value={unitCount}
            onChange={(e) => setUnitCount(e.target.value)}
            style={{
              height: 40,
              padding: "0 12px",
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              fontSize: 14,
              color: C.text,
              outline: "none",
              background: "#fff",
            }}
          />
        </div>

        {/* Beskrivning */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: C.secondary,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Beskrivning
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={{
              padding: "10px 12px",
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              fontSize: 14,
              color: C.text,
              outline: "none",
              background: "#fff",
              resize: "vertical",
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          />
        </div>

        {/* Anteckningar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: C.secondary,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Anteckningar
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            style={{
              padding: "10px 12px",
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              fontSize: 14,
              color: C.text,
              outline: "none",
              background: "#fff",
              resize: "vertical",
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
          <Link
            to="/fastigheter/$id"
            params={{ id }}
            style={{
              height: 40,
              padding: "0 18px",
              display: "inline-flex",
              alignItems: "center",
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 500,
              color: C.text,
              background: "#fff",
              textDecoration: "none",
            }}
          >
            Avbryt
          </Link>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending || !name.trim()}
            style={{
              height: 40,
              padding: "0 22px",
              background: C.primary,
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              cursor: save.isPending ? "not-allowed" : "pointer",
              opacity: save.isPending || !name.trim() ? 0.7 : 1,
              fontFamily: "Outfit, Inter, system-ui, sans-serif",
            }}
          >
            {save.isPending ? "Sparar…" : "Spara"}
          </button>
          <DeleteButton
            table="properties"
            id={id}
            label={name || "fastigheten"}
            variant="full"
            invalidateKeys={[["properties", "list"], ["section-overview-properties"]]}
            onDeleted={() => navigate({ to: "/fastigheter" })}
          />
        </div>
      </div>

      <PropertyTimeline propertyId={id} />
    </div>
  );
}
