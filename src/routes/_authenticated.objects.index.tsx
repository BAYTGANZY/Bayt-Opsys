import { createFileRoute } from "@tanstack/react-router";
import { SectionOverviewPage } from "@/components/SectionOverviewPage";

export const Route = createFileRoute("/_authenticated/objects/")({
  head: () => ({ meta: [{ title: "Objekt — BAYT" }] }),
  component: () => <SectionOverviewPage section="objects" title="Objekt" />,
});
