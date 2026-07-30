import { createFileRoute } from "@tanstack/react-router";
import { NewInspectionPage } from "./_authenticated.inspections.new";

export const Route = createFileRoute("/_authenticated/properties/$id/inspections/new")({
  component: NewInspectionRoute,
});

function NewInspectionRoute() {
  const { id } = Route.useParams();
  return <NewInspectionPage initialPropertyId={id} />;
}
