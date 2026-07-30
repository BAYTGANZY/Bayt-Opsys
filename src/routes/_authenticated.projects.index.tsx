import { createFileRoute } from "@tanstack/react-router";
import { SectionOverviewPage } from "@/components/SectionOverviewPage";

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({ meta: [{ title: "Projekt — BAYT" }] }),
  component: () => <SectionOverviewPage section="projects" title="Projekt" />,
});
