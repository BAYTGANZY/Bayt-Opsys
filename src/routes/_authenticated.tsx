import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { canAccess, homeForRole } from "@/lib/permissions";
import { AppShell } from "@/components/AppShell";
import { NotificationsProvider } from "@/lib/notifications";
import { BuildingWorldProvider } from "@/lib/building-world";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/login" });
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, password_set")
      .eq("id", data.session.user.id)
      .maybeSingle();
    if (profile?.password_set === false) {
      throw redirect({ to: "/accept-invite" });
    }
    if (!profile?.role || !["admin", "styrelse", "entreprenor"].includes(profile.role)) {
      await supabase.auth.signOut();
      throw redirect({ to: "/login", search: { error: "Åtkomst nekad." } });
    }
    // Hiding a nav link is not access control — a role must not be able to reach a
    // forbidden page by typing its URL. Bounce them to their own landing page.
    if (!canAccess(profile.role, location.pathname)) {
      throw redirect({ to: homeForRole(profile.role) });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { loading, session } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0D2B1E",
          color: "#ffffff",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        Laddar…
      </div>
    );
  }

  return (
    <NotificationsProvider>
      <BuildingWorldProvider>
        <AppShell />
      </BuildingWorldProvider>
    </NotificationsProvider>
  );
}
