import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { gateEntreprenorEmail, notifyEntreprenorAboutArende } from "@/lib/entreprenor-notify";
import { useIsMobile } from "@/hooks/use-mobile";
import { AnsvarigDropdown } from "@/components/AnsvarigDropdown";
import { ObjectDropdown } from "@/components/ObjectDropdown";
import { DerivedPriorityField } from "@/components/DerivedPriorityField";
import { FileDropzone } from "@/components/FileDropzone";
import { derivePriority } from "@/lib/issue-tokens";
import { sanitizeStorageName } from "@/lib/storage";

export const Route = createFileRoute("/_authenticated/projects/new")({
  head: () => ({ meta: [{ title: "Nytt projekt — BAYT" }] }),
  component: NewProjectPage,
});

const C = {
  bg: "#FFFFFF",
  card: "#ffffff",
  border: "#E5E7EB",
  primary: "#3D8A30",
  secondary: "#6B7280",
  text: "#1a1a1a",
  error: "#DC2626",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 500,
  color: C.secondary,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 12px",
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  fontSize: 14,
  color: C.text,
  background: C.card,
  outline: "none",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  height: "auto",
  minHeight: 80,
  padding: 12,
  resize: "vertical",
  fontFamily: "inherit",
};


export function NewProjectPage({ initialPropertyId }: { initialPropertyId?: string } = {}) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  // Grinden kan spara en rättad e-postadress på kontakten, och då måste både
  // dropdownens och listornas cache släppas — gateEntreprenorEmail gör det.
  const qc = useQueryClient();

  const [propertyId, setPropertyId] = useState(initialPropertyId ?? "");
  const [propertyObjectId, setPropertyObjectId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [assignedContactId, setAssignedContactId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { data: properties = [] } = useQuery({
    queryKey: ["properties-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!propertyId || !title) throw new Error("Fyll i obligatoriska fält");
      // Grinden ställs innan raden skapas, inte efter. Backar admin ur rutan
      // skapas ingenting alls: hade ärendet skapats tilldelat men utan utskick
      // hade nästa sparning inte frågat igen, eftersom grinden på detaljsidan
      // bara reagerar på ett *byte* av entreprenör.
      let gateEmail: string | null = null;
      let gateName: string | null = null;
      if (profile?.role === "admin" && assignedContactId) {
        const gate = await gateEntreprenorEmail({
          contactId: assignedContactId,
          qc,
          arendeTitle: title,
          confirmLabel: "Skicka och spara",
        });
        if (!gate.ok) {
          return { id: null as string | null, mailedTo: null as string | null, mailError: null as string | null, uploadError: null as string | null };
        }
        gateEmail = gate.email;
        gateName = gate.name;
      }

      const { data, error } = await supabase
        .from("projects")
        .insert({
          property_id: propertyId,
          property_object_id: propertyObjectId,
          title,
          description: description || null,
          status: "planerad",
          // Starts vilande so Öppna ärende has something to flip; after that the
          // status shown is derived (deriveProjectStatus), never picked.
          arende_status: "vilande",
          budget: budget ? Number(budget) : null,
          start_date: startDate || null,
          end_date: endDate || null,
          assigned_contact_id: assignedContactId,
          created_by: user?.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      const newId = data.id as string;

      // Filer laddas upp när projektet finns (vi behöver id:t). Misslyckas en
      // fil är projektet ändå skapat, och felet visas för admin.
      let uploadError: string | null = null;
      if (files.length > 0 && user) {
        try {
          for (const f of files) {
            const path = `${newId}/${Date.now()}-${sanitizeStorageName(f.name)}`;
            const { error: upErr } = await supabase.storage.from("project-files").upload(path, f);
            if (upErr) throw new Error(`Uppladdningen av ${f.name} misslyckades: ${upErr.message}`);
            const { data: pub } = supabase.storage.from("project-files").getPublicUrl(path);
            const { error: insErr } = await supabase.from("project_images").insert({
              project_id: newId,
              url: pub.publicUrl,
              uploaded_by: user.id,
            });
            if (insErr) throw insErr;
          }
        } catch (e) {
          uploadError = e instanceof Error ? e.message : "Filerna kunde inte laddas upp.";
        }
      }

      // Utskicket sker efter skrivningen — mejlet ska spegla det som faktiskt
      // sparades. Misslyckas det är projektet ändå skapat.
      let mailedTo: string | null = null;
      let mailError: string | null = null;
      if (gateEmail) {
        try {
          await notifyEntreprenorAboutArende({
            kind: "project",
            id: newId,
            propertyId,
            // projects har ingen apartment_id — projekt är byggnadsnivå.
            propertyObjectId,
            title,
            contactName: gateName ?? "entreprenören",
            email: gateEmail,
            createdBy: user?.id ?? null,
          });
          mailedTo = gateEmail;
        } catch (e) {
          mailError = e instanceof Error ? e.message : "E-posten kunde inte skickas.";
        }
      }
      return { id: newId, mailedTo, mailError, uploadError };
    },
    onSuccess: ({ id, mailedTo, mailError, uploadError }) => {
      if (!id) {
        setError("Ingenting sparades — entreprenören tilldelades inte.");
        return;
      }
      if (uploadError) {
        toast.error(`Projektet sparades, men ${uploadError} Lägg till filerna på projektsidan.`);
      } else if (mailError) {
        toast.error(`Projektet sparades, men ${mailError}`);
      } else if (mailedTo) {
        toast.success(`Sparat! Projektet skickades till ${mailedTo}.`, { style: { background: "#3D8A30", color: "#fff" } });
      } else {
        toast.success("Sparat!", { style: { background: "#3D8A30", color: "#fff" } });
      }
      qc.invalidateQueries({ queryKey: ["project-images", id] });
      navigate({ to: "/projects/$id", params: { id } });
    },
    onError: (e: any) => setError(e.message ?? "Kunde inte spara"),
  });

  // Prioritet är härledd, aldrig vald — här ur projektets slutdatum.
  const derivedPriority = derivePriority(endDate || null, { dueLabel: "Slutdatum" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    create.mutate();
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: isMobile ? 16 : 32 }}>
      <Link
        to="/projects"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 14,
          color: C.secondary,
          textDecoration: "none",
          marginBottom: 16,
        }}
      >
        <ArrowLeft size={18} /> Tillbaka
      </Link>

      <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: "0 0 24px" }}>Nytt projekt</h1>

      <form
        onSubmit={handleSubmit}
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: 24,
          maxWidth: 640,
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Fastighet *</label>
          <select
            style={inputStyle}
            value={propertyId}
            onChange={(e) => { setPropertyId(e.target.value); setPropertyObjectId(null); }}
            required
          >
            <option value="">Välj fastighet</option>
            {(properties as Array<{ id: string; name: string }>).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <ObjectDropdown propertyId={propertyId} value={propertyObjectId} onChange={setPropertyObjectId} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Titel *</label>
          <input
            style={inputStyle}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Beskrivning</label>
          <textarea
            style={textareaStyle}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Bilder och filer</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            <FileDropzone
              files={files}
              onAdd={(picked) => setFiles((prev) => [...prev, ...picked])}
              onRemove={(i) => setFiles((prev) => prev.filter((_, k) => k !== i))}
            />
            {files.length > 0 && (
              <div style={{ fontSize: 12, color: C.secondary }}>
                {files.length} {files.length === 1 ? "fil" : "filer"} laddas upp när du sparar projektet.
              </div>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Budget (SEK)</label>
          <input
            style={inputStyle}
            type="number"
            min={0}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Startdatum</label>
            <input
              style={inputStyle}
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>Slutdatum</label>
            <input
              style={inputStyle}
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <DerivedPriorityField priority={derivedPriority} labelStyle={labelStyle} reasonColor={C.secondary} />
        </div>

        <div style={{ marginBottom: 24 }}>
          <AnsvarigDropdown value={assignedContactId} onChange={setAssignedContactId} />
        </div>

        {error && (
          <div style={{ color: C.error, fontSize: 14, marginBottom: 16 }}>{error}</div>
        )}

        <button
          type="submit"
          disabled={create.isPending}
          style={{
            width: "100%",
            height: 44,
            background: C.primary,
            color: "#ffffff",
            border: "none",
            borderRadius: 6,
            fontSize: 15,
            fontWeight: 600,
            cursor: create.isPending ? "not-allowed" : "pointer",
            opacity: create.isPending ? 0.7 : 1,
          }}
        >
          {create.isPending ? "Sparar…" : "Spara projekt"}
        </button>
      </form>
    </div>
  );
}
