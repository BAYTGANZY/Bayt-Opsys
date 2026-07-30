import { createFileRoute } from "@tanstack/react-router";
import { NewProjectPage } from "./_authenticated.projects.new";

export const Route = createFileRoute("/_authenticated/properties/$id/projects/new")({
  component: NewProjectRoute,
});

function NewProjectRoute() {
  const { id } = Route.useParams();
  return <NewProjectPage initialPropertyId={id} />;
}
