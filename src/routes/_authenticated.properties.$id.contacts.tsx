import { createFileRoute } from "@tanstack/react-router";
import { ContactsTab } from "@/components/property-tabs";

export const Route = createFileRoute("/_authenticated/properties/$id/contacts")({
  component: ContactsRoute,
});

function ContactsRoute() {
  const { id } = Route.useParams();
  return <ContactsTab propertyId={id} />;
}
