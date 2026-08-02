import { createFileRoute } from "@tanstack/react-router";
import { ProjectsTab, type ArendeStatusFilter } from "@/components/property-tabs";

type Search = { filter?: ArendeStatusFilter };

const VALID_FILTERS = new Set<ArendeStatusFilter>(["alla", "oppna", "avslutade", "vilande"]);

export const Route = createFileRoute("/_authenticated/properties/$id/projects/")({
  // ?filter=oppna etc. — lets a link (e.g. the "Öppna ärenden" building overview,
  // via PropertySectionButtons) land the tab pre-set to a specific mode.
  validateSearch: (s: Record<string, unknown>): Search => ({
    filter: typeof s.filter === "string" && VALID_FILTERS.has(s.filter as ArendeStatusFilter) ? (s.filter as ArendeStatusFilter) : undefined,
  }),
  component: ProjectsRoute,
});

function ProjectsRoute() {
  const { id } = Route.useParams();
  const { filter } = Route.useSearch();
  return <ProjectsTab propertyId={id} initialFilter={filter} />;
}
