import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, FileText, ClipboardList, Hammer, AlertTriangle, ChevronRight, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { FpLogo } from "@/components/FpLogo";

export const Route = createFileRoute("/styrelse")({
  ssr: false,
  head: () => ({ meta: [{ title: "Styrelseportal — BAYT" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.session.user.id)
      .maybeSingle();
    const role = (profile as { role?: string } | null)?.role;
    if (role !== "styrelse" && role !== "admin") {
      throw redirect({ to: "/login" });
    }
  },
  component: StyrelsePage,
});

const C = {
  bg: "#f4f5f7",
  card: "#ffffff",
  border: "#E5E7EB",
  primary: "rgba(92,184,74,0.15)",
  primarySoft: "#E8F5E4",
  primaryIcon: "#3D8A30",
  secondary: "#6B7280",
  text: "#1a1a1a",
  badge: "#DC2626",
};

function StyrelsePage() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id ?? "";

  const propertiesQ = useQuery({
    queryKey: ["styrelse-properties", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("property_id")
        .eq("id", userId)
        .maybeSingle();
      const propertyId = (prof as { property_id?: string | null } | null)?.property_id;
      if (!propertyId) return [];
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, apartments(count)")
        .eq("id", propertyId);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; apartments: { count: number }[] }>;
    },
  });

  const projectsCountQ = useQuery({
    queryKey: ["styrelse-projects-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("projects")
        .select("*", { count: "exact", head: true })
        .eq("status", "aktiv");
      return count ?? 0;
    },
  });

  const issuesCountQ = useQuery({
    queryKey: ["styrelse-issues-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("issues")
        .select("*", { count: "exact", head: true })
        .in("status", ["pagande", "oppet", "vantar"]);
      return count ?? 0;
    },
  });

  const initials = (profile?.full_name ?? user?.email ?? "?")
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
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 12,
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <FpLogo style={{ height: 28, width: "auto" }} />
        </div>
        <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0, textAlign: "center" }}>Styrelseportal</h1>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
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
          <div
            aria-label={profile?.full_name ?? "Användare"}
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              background: C.primarySoft,
              color: C.primaryIcon,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {initials}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 560, margin: "0 auto", padding: "16px" }}>
        {/* Section 1 — Mina fastigheter */}
        <SectionHeader title="Mina fastigheter" actionLabel="Visa alla" to="/fastigheter" />
        <div style={{ display: "grid", gap: 8, marginBottom: 24 }}>
          {propertiesQ.isLoading ? (
            <SkeletonRow />
          ) : propertiesQ.data && propertiesQ.data.length > 0 ? (
            propertiesQ.data.map((p) => (
              <Link
                key={p.id}
                to="/properties/$id"
                params={{ id: p.id }}
                style={cardLink}
              >
                <div style={iconWrap}>
                  <Building2 size={20} color={C.primaryIcon} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{p.name}</div>
                  <div style={{ fontSize: 13, color: C.secondary }}>
                    {p.apartments?.[0]?.count ?? 0} lägenheter
                  </div>
                </div>
                <ChevronRight size={18} color={C.secondary} />
              </Link>
            ))
          ) : (
            <EmptyCard text="Inga fastigheter tilldelade" />
          )}
        </div>

        {/* Section 2 — Quick links */}
        <SectionHeader title="Genvägar" />
        <div style={{ display: "grid", gap: 8 }}>
          <QuickLink to="/dokument" icon={<FileText size={20} color={C.primaryIcon} />} label="Dokument" />
          <QuickLink
            to="/dokument"
            search={{ category: "protokoll" }}
            icon={<ClipboardList size={20} color={C.primaryIcon} />}
            label="Protokoll"
          />
          <QuickLink
            to="/projects"
            search={{ status: "aktiv" }}
            icon={<Hammer size={20} color={C.primaryIcon} />}
            label="Pågående projekt"
            badge={projectsCountQ.data ?? 0}
          />
          <QuickLink
            to="/felanmalningar"
            icon={<AlertTriangle size={20} color={C.primaryIcon} />}
            label="Felanmälningar"
            badge={issuesCountQ.data ?? 0}
          />
        </div>
      </main>
    </div>
  );
}

const cardLink: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 14px",
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  textDecoration: "none",
  color: "inherit",
};

const iconWrap: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 8,
  background: C.primarySoft,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

function SectionHeader({ title, actionLabel, to }: { title: string; actionLabel?: string; to?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
      <h2 style={{ fontSize: 13, fontWeight: 600, color: C.secondary, textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>
        {title}
      </h2>
      {actionLabel && to && (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <Link to={to as any} style={{ fontSize: 13, color: C.primaryIcon, textDecoration: "none", fontWeight: 600 }}>
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

function QuickLink({
  to,
  search,
  icon,
  label,
  badge,
}: {
  to: string;
  search?: Record<string, string>;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <Link
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      to={to as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      search={search as any}
      style={cardLink}
    >
      <div style={iconWrap}>{icon}</div>
      <div style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{label}</div>
      {typeof badge === "number" && badge > 0 && (
        <span
          style={{
            background: C.badge,
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 999,
            minWidth: 22,
            textAlign: "center",
          }}
        >
          {badge}
        </span>
      )}
      <ChevronRight size={18} color={C.secondary} />
    </Link>
  );
}

function SkeletonRow() {
  return (
    <div style={{ ...cardLink, color: C.secondary }}>
      <div style={iconWrap} />
      <div style={{ flex: 1, fontSize: 14 }}>Laddar…</div>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "16px",
        background: C.card,
        border: `1px dashed ${C.border}`,
        borderRadius: 10,
        textAlign: "center",
        color: C.secondary,
        fontSize: 14,
      }}
    >
      {text}
    </div>
  );
}
