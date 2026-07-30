import { createFileRoute } from "@tanstack/react-router";
import { PropertyLoggbokWithComments } from "@/components/PropertyLoggbokWithComments";

export const Route = createFileRoute("/_authenticated/properties/$id/logbook")({
  component: LogbookRoute,
});

function LogbookRoute() {
  const { id } = Route.useParams();
  return <PropertyLoggbokWithComments propertyId={id} />;
}
