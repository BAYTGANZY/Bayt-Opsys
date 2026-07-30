import { createFileRoute } from "@tanstack/react-router";
import { IssuesTab } from "@/components/property-tabs";

export const Route = createFileRoute("/_authenticated/properties/$id/issues/")({
  component: IssuesRoute,
});

function IssuesRoute() {
  const { id } = Route.useParams();
  return <IssuesTab propertyId={id} />;
}
