import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/besiktningar")({
  component: () => <h1 style={{ fontSize: 24, fontWeight: 600 }}>Besiktningar</h1>,
});
