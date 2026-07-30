import { createFileRoute } from "@tanstack/react-router";
import { NewIssuePage } from "./_authenticated.issues.new";

export const Route = createFileRoute("/_authenticated/properties/$id/issues/new")({
  component: NewIssueRoute,
});

function NewIssueRoute() {
  const { id } = Route.useParams();
  return <NewIssuePage initialPropertyId={id} />;
}
