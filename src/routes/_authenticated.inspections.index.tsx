import { createFileRoute } from "@tanstack/react-router";
import { SectionOverviewPage } from "@/components/SectionOverviewPage";

export const Route = createFileRoute("/_authenticated/inspections/")({
  head: () => ({ meta: [{ title: "Besiktningar — BAYT" }] }),
  component: () => <SectionOverviewPage section="inspections" title="Besiktningar" />,
});
