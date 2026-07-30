import { createFileRoute } from "@tanstack/react-router";
import { OppnaArendenOverview } from "@/components/OppnaArendenOverview";

export const Route = createFileRoute("/_authenticated/oppna-arenden")({
  head: () => ({ meta: [{ title: "Öppna ärenden — BAYT" }] }),
  component: OppnaArendenOverview,
});
