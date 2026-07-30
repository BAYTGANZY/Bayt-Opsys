import { createFileRoute } from "@tanstack/react-router";
import { SectionOverviewPage } from "@/components/SectionOverviewPage";

export const Route = createFileRoute("/_authenticated/felanmalningar")({
  head: () => ({ meta: [{ title: "Felanmälan — BAYT" }] }),
  component: () => <SectionOverviewPage section="issues" title="Felanmälan" />,
});
