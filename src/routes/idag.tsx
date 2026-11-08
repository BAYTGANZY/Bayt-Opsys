import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";

/**
 * Gamla "Idag"-sidan är ersatt av Översikt (/styrelse). Rutten finns kvar bara som
 * vidarebefordran så att bokmärken och gamla länkar inte slutar fungera.
 */
export const Route = createFileRoute("/idag")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
    throw redirect({ to: "/styrelse" });
  },
});
