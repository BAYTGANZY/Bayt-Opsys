import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DashboardSquare01Icon,
  Building02Icon,
  DoorOpenIcon,
  AlertCircleIcon,
  ClipboardCheckIcon,
  Briefcase01Icon,
  File02Icon,
  BookOpen01Icon,
  MinimizeScreenIcon,
  Image02Icon,
  Package01Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useVisibleProperties } from "@/hooks/useVisibleProperties";
import { useBuildingWorld } from "@/lib/building-world";
import { PROPERTY_SECTIONS_FOR_ROLE, canEdit } from "@/lib/permissions";
const baytLogo = `${import.meta.env.BASE_URL}assets/bayt-logo.png`;
const buildingSketch = `${import.meta.env.BASE_URL}assets/building-sketch-2.png`;

export const Route = createFileRoute("/_authenticated/fastigheter/$id/")({
  head: () => ({ meta: [{ title: "Fastighetens hem — BAYT" }] }),
  component: BuildingHomePage,
});

type PropertyRow = { id: string; name: string; address: string | null; world_image_url: string | null };

// `null` propertySection = always shown; a string checks PROPERTY_SECTIONS_FOR_ROLE
// the same way the property sub-nav and canAccess() already gate these routes.
const TILES = [
  {
    to: "/fastigheter/$id/dashboard",
    label: "Dashboard",
    icon: DashboardSquare01Icon,
    propertySection: null,
  },
  {
    to: "/fastigheter/$id/installningar",
    label: "Fastigheter",
    icon: Building02Icon,
    propertySection: null,
  },
  {
    to: "/properties/$id/apartments",
    label: "Lägenheter",
    icon: DoorOpenIcon,
    propertySection: "apartments",
  },
  {
    to: "/properties/$id/issues",
    label: "Felanmälningar",
    icon: AlertCircleIcon,
    propertySection: "issues",
  },
  {
    to: "/properties/$id/inspections",
    label: "Besiktningar",
    icon: ClipboardCheckIcon,
    propertySection: "inspections",
  },
  {
    to: "/properties/$id/projects",
    label: "Projekt",
    icon: Briefcase01Icon,
    propertySection: "projects",
  },
  {
    to: "/properties/$id/objects",
    label: "Objekt",
    icon: Package01Icon,
    propertySection: "objects",
  },
  {
    to: "/properties/$id/documents",
    label: "Dokument",
    icon: File02Icon,
    propertySection: "documents",
  },
  {
    to: "/properties/$id/logbook",
    label: "Loggbok",
    icon: BookOpen01Icon,
    propertySection: "logbook",
  },
] as const;

function canReachSection(role: string | null | undefined, section: string | null): boolean {
  if (section === null) return true;
  if (role === "admin") return true;
  return !!(role && PROPERTY_SECTIONS_FOR_ROLE[role]?.includes(section));
}

const BG = "#0e1f1a";
const LINE = "rgba(151, 186, 72, 0.18)";
const ACCENT = "#bcd97a";
const TEXT = "#e6efd8";
const MUTED = "#7a9476";

const STYLES = `
  .bw-page {
    min-height: 100vh;
    background: radial-gradient(ellipse at top, #15332c 0%, ${BG} 70%);
    color: ${TEXT};
    font-family: Inter, system-ui, sans-serif;
    display: flex;
    flex-direction: column;
    padding: 32px 40px;
  }
  .bw-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid ${LINE};
    padding-bottom: 20px;
    margin-bottom: 24px;
  }
  .bw-header-left { display: flex; align-items: center; gap: 14px; }
  .bw-logo { height: 40px; }
  .bw-minimize {
    background: transparent;
    border: 1px solid ${LINE};
    color: ${MUTED};
    width: 36px;
    height: 36px;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .bw-minimize:hover { color: ${ACCENT}; border-color: ${ACCENT}; }
  .bw-building {
    text-align: right;
  }
  .bw-building-name {
    font-size: 18px;
    font-weight: 700;
    color: ${TEXT};
    font-family: Outfit, Inter, system-ui, sans-serif;
  }
  .bw-building-address { font-size: 13px; color: ${MUTED}; margin-top: 2px; }
  .bw-body {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 48px;
    align-items: center;
  }
  .bw-tiles {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    max-width: 560px;
    width: 100%;
    justify-self: center;
    margin-left: 8%;
  }
  .bw-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 32px 16px;
    text-decoration: none;
    color: ${TEXT};
    background: transparent;
    border: 1.5px solid ${ACCENT};
    border-radius: 16px;
    transition: background 0.15s ease;
    min-height: 160px;
  }
  .bw-tile:hover { background: rgba(188, 217, 122, 0.05); }
  .bw-tile-icon {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    border: 1.5px solid ${ACCENT};
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${ACCENT};
    flex-shrink: 0;
  }
  .bw-tile-label {
    font-size: 14px;
    letter-spacing: 0.03em;
    color: ${TEXT};
    text-align: center;
    line-height: 1.25;
  }
  .bw-right {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  }
  .bw-sketch-wrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    max-width: 100%;
    max-height: 500px;
  }
  .bw-sketch {
    display: block;
    max-width: 100%;
    max-height: 500px;
    opacity: 0.85;
    filter: drop-shadow(0 8px 24px rgba(0,0,0,0.4));
  }
  .bw-sketch-editable {
    cursor: pointer;
    padding: 0;
    border: none;
    background: none;
    display: block;
  }
  .bw-sketch-editable:disabled { cursor: not-allowed; }
  .bw-sketch-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: rgba(14, 31, 26, 0.55);
    border-radius: 8px;
    color: ${TEXT};
    font-size: 13px;
    font-family: Inter, system-ui, sans-serif;
    letter-spacing: 0.02em;
    opacity: 0;
    transition: opacity 0.15s ease;
    pointer-events: none;
  }
  .bw-sketch-editable:hover + .bw-sketch-overlay,
  .bw-sketch-editable:focus-visible + .bw-sketch-overlay { opacity: 1; }
  .bw-bg-sketch { display: none; }

  @media (max-width: 768px) {
    .bw-page { padding: 20px 16px; position: relative; overflow: hidden; height: 100vh; }
    .bw-header { padding-bottom: 14px; margin-bottom: 0; position: relative; z-index: 2; flex-wrap: wrap; gap: 10px; }
    .bw-logo { height: 32px; }
    .bw-bg-sketch {
      display: block;
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      object-position: center;
      opacity: 0.18;
      pointer-events: none;
      z-index: 0;
    }
    .bw-body { grid-template-columns: minmax(0, 1fr); gap: 0; align-items: center; justify-items: center; position: relative; z-index: 1; }
    .bw-tiles { display: flex; flex-direction: column; grid-template-columns: none; max-width: 220px; margin-left: 0; justify-self: center; gap: 4px; }
    .bw-tile { flex-direction: row; justify-content: flex-start; gap: 14px; padding: 10px 14px; min-height: 0; border: 1.5px solid ${ACCENT} !important; border-radius: 10px; background: transparent; }
    .bw-tile-icon { width: 36px; height: 36px; border-width: 1px; }
    .bw-tile-icon svg { width: 18px; height: 18px; }
    .bw-tile-label { font-size: 13px; letter-spacing: 0.02em; text-align: left; }
    .bw-right { display: none; }
    .bw-building { text-align: left; }
  }
`;

function BuildingHomePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { exit } = useBuildingWorld();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  // A role must not reach a building it isn't scoped to just by typing its id.
  const { allowedIds, isLoading: scopeLoading } = useVisibleProperties();
  const denied = !scopeLoading && allowedIds !== null && !allowedIds.has(id);
  useEffect(() => {
    if (denied) navigate({ to: "/fastigheter", replace: true });
  }, [denied, navigate]);

  const { data: property, isLoading } = useQuery({
    queryKey: ["property-world", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, address, world_image_url")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as PropertyRow | null;
    },
  });

  const tiles = TILES.filter((t) => canReachSection(profile?.role, t.propertySection));
  const worldSketch = property?.world_image_url || buildingSketch;

  async function handleWorldImage(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${id}/world-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("property-images")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("property-images").getPublicUrl(path);
      const { error: dbErr } = await supabase
        .from("properties")
        .update({ world_image_url: pub.publicUrl })
        .eq("id", id);
      if (dbErr) throw dbErr;
      qc.invalidateQueries({ queryKey: ["property-world", id] });
      toast.success("Bild uppdaterad");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Kunde inte ladda upp bild";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <style>{STYLES}</style>
      <div className="bw-page">
        <img src={worldSketch} alt="" className="bw-bg-sketch" aria-hidden />

        <div className="bw-header">
          <div className="bw-header-left">
            <img src={baytLogo} alt="BAYT" className="bw-logo" />
            <button
              type="button"
              className="bw-minimize"
              aria-label="Minimera — tillbaka till fastigheter"
              title="Minimera — tillbaka till fastigheter"
              onClick={() => {
                exit();
                navigate({ to: "/fastigheter" });
              }}
            >
              <HugeiconsIcon icon={MinimizeScreenIcon} size={18} />
            </button>
          </div>
          <div className="bw-building">
            <div className="bw-building-name">
              {isLoading ? "Laddar…" : (property?.name ?? "Okänd fastighet")}
            </div>
            {property?.address && <div className="bw-building-address">{property.address}</div>}
          </div>
        </div>

        <div className="bw-body">
          <div className="bw-tiles">
            {tiles.map((tile) => (
              <Link key={tile.to} to={tile.to} params={{ id }} className="bw-tile">
                <div className="bw-tile-icon">
                  <HugeiconsIcon icon={tile.icon} size={30} strokeWidth={1.5} />
                </div>
                <div className="bw-tile-label">{tile.label}</div>
              </Link>
            ))}
          </div>

          <div className="bw-right">
            <div className="bw-sketch-wrap">
              {canEdit(profile?.role) ? (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleWorldImage(f);
                      e.currentTarget.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className="bw-sketch-editable"
                    disabled={uploading}
                    title="Byt bild"
                    aria-label="Byt bild"
                    onClick={() => fileRef.current?.click()}
                  >
                    <img src={worldSketch} alt="" className="bw-sketch" />
                  </button>
                  <div className="bw-sketch-overlay" aria-hidden>
                    <HugeiconsIcon icon={Image02Icon} size={16} />
                    {uploading ? "Laddar upp…" : "Byt bild"}
                  </div>
                </>
              ) : (
                <img src={worldSketch} alt="" className="bw-sketch" />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
