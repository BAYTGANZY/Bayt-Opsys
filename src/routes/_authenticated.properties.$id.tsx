import { createFileRoute, Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useIsMobile } from "@/hooks/use-mobile";
import { useVisibleProperties } from "@/hooks/useVisibleProperties";
import { PropertyProvider, COLORS } from "@/components/property-tabs";
import { DocumentUploadControls } from "@/components/DocumentUploadControls";
import { useBuildingWorld } from "@/lib/building-world";

type Search = { from?: string };

export const Route = createFileRoute("/_authenticated/properties/$id")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    from: typeof s.from === "string" ? s.from : undefined,
  }),
  head: () => ({ meta: [{ title: "Fastighet — BAYT" }] }),
  component: PropertyShell,
});

const TABS = [
  { key: "apartments", label: "Lägenheter", to: "/properties/$id/apartments" },
  { key: "issues", label: "Felanmälningar", to: "/properties/$id/issues" },
  { key: "inspections", label: "Besiktningar", to: "/properties/$id/inspections" },
  { key: "projects", label: "Projekt", to: "/properties/$id/projects" },
  { key: "documents", label: "Dokument", to: "/properties/$id/documents" },
  { key: "logbook", label: "Loggbok", to: "/properties/$id/logbook" },
  { key: "actions", label: "Åtgärdslista", to: "/properties/$id/actions" },
  { key: "objects", label: "Objekt", to: "/properties/$id/objects" },
  { key: "contacts", label: "Kontakter", to: "/properties/$id/contacts" },
  { key: "avslutat", label: "Avslutade", to: "/properties/$id/avslutat" },
] as const;

function PropertyShell() {
  const { id } = Route.useParams();
  const { from } = Route.useSearch();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { activeId: bwActiveId } = useBuildingWorld();
  const inBuildingWorld = bwActiveId === id;
  // A role must not reach a building it isn't scoped to just by typing its id.
  const { allowedIds, isLoading: scopeLoading } = useVisibleProperties();
  const denied = !scopeLoading && allowedIds !== null && !allowedIds.has(id);
  useEffect(() => {
    if (denied) navigate({ to: "/fastigheter", replace: true });
  }, [denied, navigate]);

  const { data: property, isLoading } = useQuery({
    queryKey: ["property", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Derive active tab label for breadcrumb
  const activeTab = TABS.find((t) => pathname.startsWith(`/properties/${id}/${t.key}`));
  const breadcrumbTab = activeTab?.label ?? "Lägenheter";

  // On a detail sub-page (e.g. an individual felanmälan), "back" returns to that
  // section's list. Otherwise it goes back to wherever the building was opened
  // from: the "Öppna ärenden" building overview if that's where the user came
  // from (carried via the `from` search param), Fastigheter otherwise.
  const sectionPath = activeTab ? `/properties/${id}/${activeTab.key}` : null;
  const onDetail =
    !!sectionPath && pathname !== sectionPath && pathname.startsWith(sectionPath + "/");
  const fromOppnaArenden = from === "oppna-arenden";
  const backTo = onDetail
    ? sectionPath!
    : inBuildingWorld
      ? "/fastigheter/$id"
      : fromOppnaArenden
        ? "/oppna-arenden"
        : "/fastigheter";
  const backLabel = onDetail
    ? `Tillbaka till ${activeTab!.label.toLowerCase()}`
    : inBuildingWorld
      ? "Tillbaka"
      : fromOppnaArenden
        ? "Tillbaka"
        : "Tillbaka till fastigheter";
  const backParams = !onDetail && inBuildingWorld ? { id } : undefined;
  const backSearch = onDetail && fromOppnaArenden ? { from: "oppna-arenden" } : undefined;

  // Kontakter uses a restructured header: building info sits compactly to the
  // right of the breadcrumb, and the section name ("Kontakter") becomes the
  // heading with the "Ny kontakt" action beside it, above the list.
  const isContacts = activeTab?.key === "contacts";
  // Dokument: the Kategori dropdown + Ladda upp button sit on the same row
  // as the building name/address, instead of inside the list below.
  const isDocuments = activeTab?.key === "documents";

  const breadcrumb = (
    <div style={{ fontSize: 13, color: COLORS.secondary }}>
      <Link
        to={inBuildingWorld ? "/fastigheter/$id" : "/fastigheter"}
        params={(inBuildingWorld ? { id } : undefined) as never}
        style={{ color: COLORS.secondary, textDecoration: "none" }}
      >
        Fastigheter
      </Link>
      {" › "}
      <span style={{ color: COLORS.secondary }}>{property?.name ?? "…"}</span>
      {" › "}
      <span style={{ color: COLORS.text, fontWeight: 600 }}>{breadcrumbTab}</span>
    </div>
  );

  return (
    <PropertyProvider value={{ property, propertyId: id }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          fontFamily: "Inter, system-ui, sans-serif",
          padding: isMobile ? 16 : 32,
        }}
      >
        <Link
          to={backTo as never}
          params={backParams as never}
          search={backSearch as never}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: COLORS.secondary,
            textDecoration: "none",
            width: "fit-content",
          }}
        >
          <ArrowLeft size={16} /> {backLabel}
        </Link>

        {isContacts ? (
          <>
            {/* Breadcrumb (left) + building name & address (right, same height) */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              {breadcrumb}
              <div style={{ textAlign: "right", minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: COLORS.text,
                    fontFamily: "Outfit, Inter, system-ui, sans-serif",
                  }}
                >
                  {property?.name ?? "…"}
                </div>
                {property?.address && (
                  <div style={{ fontSize: 12, color: COLORS.secondary, marginTop: 2 }}>
                    {property.address}
                  </div>
                )}
              </div>
            </div>

            {/* "Kontakter" heading (left) + Ny kontakt button (right) */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <h1 style={{ fontSize: 24, fontWeight: 700, color: COLORS.text, margin: 0 }}>
                Kontakter
              </h1>
              <Link
                to="/contacts/new"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "10px 18px",
                  background: "#5CB84A",
                  color: "#fff",
                  borderRadius: 999,
                  textDecoration: "none",
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: "Outfit, Inter, system-ui, sans-serif",
                  whiteSpace: "nowrap",
                }}
              >
                <Plus size={16} /> Ny kontakt
              </Link>
            </div>
          </>
        ) : isDocuments ? (
          <>
            {breadcrumb}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: COLORS.text, margin: 0 }}>
                  {isLoading ? "Laddar…" : (property?.name ?? "Okänd fastighet")}
                </h1>
                {property?.address && (
                  <div style={{ fontSize: 13, color: COLORS.secondary, marginTop: 4 }}>
                    {property.address}
                  </div>
                )}
              </div>
              <DocumentUploadControls propertyId={id} />
            </div>
          </>
        ) : (
          <>
            {breadcrumb}
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: COLORS.text, margin: 0 }}>
                {isLoading ? "Laddar…" : (property?.name ?? "Okänd fastighet")}
              </h1>
              {property?.address && (
                <div style={{ fontSize: 13, color: COLORS.secondary, marginTop: 4 }}>
                  {property.address}
                </div>
              )}
            </div>
          </>
        )}

        <div
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            padding: isMobile ? 16 : 24,
            boxShadow: "0 1px 2px rgba(13,43,30,0.03), 0 8px 24px -14px rgba(13,43,30,0.10)",
          }}
        >
          <Outlet />
        </div>
      </div>
    </PropertyProvider>
  );
}
