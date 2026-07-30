import { createFileRoute } from "@tanstack/react-router";
import { InspectionDetailPage } from "./_authenticated.inspections.$id";

export const Route = createFileRoute("/_authenticated/properties/$id/inspections/$inspectionId")({
  component: InspectionRoute,
});

function InspectionRoute() {
  const { inspectionId } = Route.useParams();
  return <InspectionDetailPage idOverride={inspectionId} />;
}
