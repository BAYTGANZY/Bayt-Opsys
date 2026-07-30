import { createFileRoute } from "@tanstack/react-router";
import { ApartmentDetailPage } from "./_authenticated.apartments.$id";

export const Route = createFileRoute("/_authenticated/properties/$id/apartments/$apartmentId")({
  component: ApartmentRoute,
});

function ApartmentRoute() {
  const { apartmentId } = Route.useParams();
  return <ApartmentDetailPage idOverride={apartmentId} />;
}
