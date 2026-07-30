import { createFileRoute } from "@tanstack/react-router";
import { ProjectDetailPage } from "./_authenticated.projects.$id";

export const Route = createFileRoute("/_authenticated/properties/$id/projects/$projectId")({
  component: ProjectRoute,
});

function ProjectRoute() {
  const { projectId } = Route.useParams();
  return <ProjectDetailPage idOverride={projectId} />;
}
