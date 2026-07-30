import { createFileRoute } from "@tanstack/react-router";
import { SectionOverviewPage } from "@/components/SectionOverviewPage";

export const Route = createFileRoute("/_authenticated/apartments/")({
  head: () => ({ meta: [{ title: "Lägenheter — BAYT" }] }),
  component: () => <SectionOverviewPage section="apartments" title="Lägenheter" />,
});
