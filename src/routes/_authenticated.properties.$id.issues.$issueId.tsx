import { createFileRoute } from "@tanstack/react-router";
import { IssueDetailPage } from "./_authenticated.issues.$id";

export const Route = createFileRoute("/_authenticated/properties/$id/issues/$issueId")({
  component: IssueRoute,
});

function IssueRoute() {
  const { issueId } = Route.useParams();
  return <IssueDetailPage idOverride={issueId} />;
}
