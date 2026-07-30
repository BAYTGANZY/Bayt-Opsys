import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  User,
  AlertCircle,
  ClipboardList,
  FileText,
  Mail,
  Calendar,
  UserCog,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/boende")({
  ssr: false,
  head: () => ({ meta: [{ title: "Boendeportal — BAYT" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.session.user.id)
      .maybeSingle();
    const role = (profile as { role?: string } | null)?.role;
    if (role === "boende") return;
    if (role === "admin") throw redirect({ to: "/dashboard" });
    if (role === "styrelse") throw redirect({ to: "/styrelse" });
    throw redirect({ to: "/login" });
  },
  component: BoendePage,
});

const C = {
  bg: "#f4f5f7",
  card: "#ffffff",
  border: "#e6e8eb",
  divider: "#eef0f2",
  primary: "rgba(92,184,74,0.15)",
  primarySoft: "#E8F5E4",
  primaryIcon: "#3D8A30",
  secondary: "#6B7280",
  text: "#1a1a1a",
};

type ProfileFull = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  apartment: string | null;
  property_id: string | null;
  properties: { name: string | null } | null;
};

function BoendePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id ?? "";

  const profileQ = useQuery({
    queryKey: ["boende-profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, apartment, property_id, properties(name)")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as ProfileFull | null;
    },
  });

  const p = profileQ.data;
  const firstName = (p?.full_name ?? user?.email ?? "").split(" ")[0] || "";
  const initials = (p?.full_name ?? user?.email ?? "?")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif", color: C.text }}>
      <header
        style={{
          background: C.card,
          borderBottom: `1px solid ${C.border}`,
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Boendeportal</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={async () => {
              await signOut();
              navigate({ to: "/login" });
            }}
            aria-label="Logga ut"
            title="Logga ut"
            style={{
              background: "transparent",
              border: "none",
              color: C.secondary,
              cursor: "pointer",
              padding: 6,
              display: "inline-flex",
            }}
          >
            <LogOut size={18} />
          </button>
          <Avatar url={p?.avatar_url ?? null} initials={initials} size={32} />
        </div>
      </header>

      <main style={{ maxWidth: 560, margin: "0 auto", padding: 16 }}>
        {/* User card */}
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 16,
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 20,
          }}
        >
          <Avatar url={p?.avatar_url ?? null} initials={initials} size={56} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 2 }}>
              Hej{firstName ? `, ${firstName}` : ""}
            </div>
            <div style={{ fontSize: 13, color: C.secondary }}>
              {p?.apartment ? `Lägenhet ${p.apartment}` : "Ingen lägenhet"}
              {p?.properties?.name ? ` · ${p.properties.name}` : ""}
            </div>
          </div>
        </div>

        {/* Navigation list */}
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <Row to="/boende/lagenhet" icon={<User size={20} color={C.primaryIcon} />} label="Min lägenhet" />
          <Row to="/boende/felanmalan/ny" icon={<AlertCircle size={20} color={C.primaryIcon} />} label="Skicka felanmälan" />
          <Row to="/boende/arenden" icon={<ClipboardList size={20} color={C.primaryIcon} />} label="Mina ärenden" />
          <Row to="/boende/dokument" icon={<FileText size={20} color={C.primaryIcon} />} label="Dokument & information" />
          <Row to="/boende/meddelanden" icon={<Mail size={20} color={C.primaryIcon} />} label="Meddelanden" />
          <Row to="/boende/besok" icon={<Calendar size={20} color={C.primaryIcon} />} label="Bokade besök" />
          <Row to="/boende/uppgifter" icon={<UserCog size={20} color={C.primaryIcon} />} label="Mina uppgifter" last />
        </div>
      </main>
    </div>
  );
}

function Avatar({ url, initials, size }: { url: string | null; initials: string; size: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: C.primarySoft,
        color: C.primaryIcon,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.36),
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

function Row({
  to,
  icon,
  label,
  last,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  last?: boolean;
}) {
  return (
    <Link
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      to={to as any}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 16px",
        borderBottom: last ? "none" : `1px solid ${C.divider}`,
        textDecoration: "none",
        color: "inherit",
        background: C.card,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: C.primarySoft,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, fontSize: 15, fontWeight: 500 }}>{label}</div>
      <ChevronRight size={18} color={C.secondary} />
    </Link>
  );
}
