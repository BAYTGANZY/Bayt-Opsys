import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { homeForRole } from "@/lib/permissions";

/**
 * Den gamla startsidan (snabbåtkomst-rutor) är borttagen — favoriter i menyn och på
 * Översikt ersätter den. Rutten finns kvar bara som vidarebefordran så att gamla
 * bokmärken och länkar (inloggning, Teknik, Fastighetspresentation, mejl) hamnar
 * på rollens egen startsida i stället för på ett 404.
 */
export const Route = createFileRoute("/start")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
    const { data: p } = await supabase.from("profiles").select("role").eq("id", data.session.user.id).maybeSingle();
    throw redirect({ to: homeForRole((p?.role as string | undefined) ?? null) as never });
  },
});
