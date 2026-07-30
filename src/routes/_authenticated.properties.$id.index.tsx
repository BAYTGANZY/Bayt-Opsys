import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/properties/$id/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/properties/$id/apartments", params: { id: params.id } });
  },
});
