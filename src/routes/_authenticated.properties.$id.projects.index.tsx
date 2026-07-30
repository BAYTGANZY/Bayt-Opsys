import { createFileRoute } from "@tanstack/react-router";
import { ProjectsTab } from "@/components/property-tabs";

export const Route = createFileRoute("/_authenticated/properties/$id/projects/")({
  component: ProjectsRoute,
});

function ProjectsRoute() {
  const { id } = Route.useParams();
  return <ProjectsTab propertyId={id} />;
}
