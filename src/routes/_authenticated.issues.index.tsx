import { createFileRoute } from "@tanstack/react-router";
import { IssuesPropertyOverview } from "@/components/IssuesPropertyOverview";

export const Route = createFileRoute("/_authenticated/issues/")({
  head: () => ({ meta: [{ title: "Felanmälningar — BAYT" }] }),
  component: IssuesPropertyOverview,
});
