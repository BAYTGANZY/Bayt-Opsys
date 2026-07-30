import { createFileRoute } from "@tanstack/react-router";
import { DocumentsTab } from "@/components/property-tabs";

export const Route = createFileRoute("/_authenticated/properties/$id/documents")({
  component: DocumentsRoute,
});

function DocumentsRoute() {
  const { id } = Route.useParams();
  return <DocumentsTab propertyId={id} />;
}
