import { createFileRoute } from "@tanstack/react-router";
import { InspectionsTab, type ArendeStatusFilter } from "@/components/property-tabs";

type Search = { filter?: ArendeStatusFilter };

const VALID_FILTERS = new Set<ArendeStatusFilter>(["alla", "oppna", "avslutade", "vilande"]);

export const Route = createFileRoute("/_authenticated/properties/$id/inspections/")({
  // ?filter=oppna etc. — lets a link (e.g. the "Öppna ärenden" building overview,
  // via PropertySectionButtons) land the tab pre-set to a specific mode.
  validateSearch: (s: Record<string, unknown>): Search => ({
    filter: typeof s.filter === "string" && VALID_FILTERS.has(s.filter as ArendeStatusFilter) ? (s.filter as ArendeStatusFilter) : undefined,
  }),
  component: InspectionsRoute,
});

function InspectionsRoute() {
  const { id } = Route.useParams();
  const { filter } = Route.useSearch();
  return <InspectionsTab propertyId={id} initialFilter={filter} />;
}
