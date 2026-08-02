import { createFileRoute } from "@tanstack/react-router";
import { ApartmentDetailPage } from "./_authenticated.apartments.$id";

type Search = { tab?: string; from?: string };

export const Route = createFileRoute("/_authenticated/properties/$id/apartments/$apartmentId")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    tab: typeof s.tab === "string" ? s.tab : undefined,
    from: typeof s.from === "string" ? s.from : undefined,
  }),
  component: ApartmentRoute,
});

function ApartmentRoute() {
  const { apartmentId } = Route.useParams();
  return <ApartmentDetailPage idOverride={apartmentId} />;
}
