import { createFileRoute } from "@tanstack/react-router";
import { InspectionsTab } from "@/components/property-tabs";

export const Route = createFileRoute("/_authenticated/properties/$id/inspections/")({
  component: InspectionsRoute,
});

function InspectionsRoute() {
  const { id } = Route.useParams();
  return <InspectionsTab propertyId={id} />;
}
