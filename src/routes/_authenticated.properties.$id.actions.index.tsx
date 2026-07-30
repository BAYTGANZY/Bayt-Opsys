import { createFileRoute } from "@tanstack/react-router";
import { ActionsTab } from "@/components/property-tabs";

export const Route = createFileRoute("/_authenticated/properties/$id/actions/")({
  component: ActionsRoute,
});

function ActionsRoute() {
  const { id } = Route.useParams();
  return <ActionsTab propertyId={id} />;
}
