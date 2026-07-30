import { createFileRoute } from "@tanstack/react-router";
import { OversiktDashboard } from "@/components/OversiktDashboard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Översikt — BAYT" }] }),
  component: () => <OversiktDashboard />,
});
