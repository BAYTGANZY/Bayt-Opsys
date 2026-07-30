import { createFileRoute } from "@tanstack/react-router";
import { ApartmentsTab } from "@/components/property-tabs";

export const Route = createFileRoute("/_authenticated/properties/$id/apartments/")({
  component: ApartmentsRoute,
});

function ApartmentsRoute() {
  const { id } = Route.useParams();
  return <ApartmentsTab propertyId={id} />;
}
