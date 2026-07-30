import { createFileRoute } from "@tanstack/react-router";
import { SectionOverviewPage } from "@/components/SectionOverviewPage";

export const Route = createFileRoute("/_authenticated/dokument")({
  head: () => ({ meta: [{ title: "Dokument — BAYT" }] }),
  component: () => <SectionOverviewPage section="documents" title="Dokument" />,
});
