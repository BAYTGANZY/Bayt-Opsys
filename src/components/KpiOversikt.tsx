import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Building02Icon,
  DoorOpenIcon,
  AlertCircleIcon,
  File02Icon,
  Calendar03Icon,
  Briefcase01Icon,
} from "@hugeicons/core-free-icons";
import { supabase } from "@/lib/supabase";

type Card = {
  key: string;
  label: string;
  icon: typeof Building02Icon;
  iconBg: string;
  iconColor: string;
  to: string;
  load: () => Promise<number>;
  danger?: boolean; // turn number red when > 0
};

async function countAll(table: string) {
  const { count } = await supabase
    .from(table)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select("*", { count: "exact", head: true } as any);
  return count ?? 0;
}

async function countOpenIssues() {
  const { count } = await supabase
    .from("issues")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select("*", { count: "exact", head: true } as any)
    .in("status", ["pagande", "oppet", "vantar"]);
  return count ?? 0;
}

async function countUpcomingInspections() {
  const today = new Date();
  const in30 = new Date();
  in30.setDate(today.getDate() + 30);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const { count } = await supabase
    .from("inspections")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select("*", { count: "exact", head: true } as any)
    .gte("next_due_date", iso(today))
    .lte("next_due_date", iso(in30));
  return count ?? 0;
}

async function countActiveProjects() {
  const { count } = await supabase
    .from("projects")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select("*", { count: "exact", head: true } as any)
    .eq("status", "aktiv");
  return count ?? 0;
}

const CARDS: Card[] = [
  {
    key: "properties",
    label: "Fastigheter",
    icon: Building02Icon,
    iconBg: "#e6f0f7",
    iconColor: "#2c5d82",
    to: "/fastigheter",
    load: () => countAll("properties"),
  },
  {
    key: "apartments",
    label: "Lägenheter",
    icon: DoorOpenIcon,
    iconBg: "#E8F5E4",
    iconColor: "#3D8A30",
    to: "/apartments",
    load: () => countAll("apartments"),
  },
  {
    key: "open-issues",
    label: "Öppna ärenden",
    icon: AlertCircleIcon,
    iconBg: "#fbe4e2",
    iconColor: "#DC2626",
    to: "/issues",
    load: countOpenIssues,
    danger: true,
  },
  {
    key: "documents",
    label: "Dokument",
    icon: File02Icon,
    iconBg: "#ece4f5",
    iconColor: "#5b3f8a",
    to: "/dokument",
    load: () => countAll("documents"),
  },
  {
    key: "upcoming-inspections",
    label: "Kommande besiktningar",
    icon: Calendar03Icon,
    iconBg: "#E8F5E4",
    iconColor: "#3D8A30",
    to: "/inspections",
    load: countUpcomingInspections,
  },
  {
    key: "active-projects",
    label: "Aktiva projekt",
    icon: Briefcase01Icon,
    iconBg: "#ece4f5",
    iconColor: "#5b3f8a",
    to: "/projects",
    load: countActiveProjects,
  },
];

export function KpiOversikt() {
  const [counts, setCounts] = useState<Record<string, number | null>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      CARDS.map(async (c) => [c.key, await c.load().catch(() => 0)] as const),
    ).then((entries) => {
      if (cancelled) return;
      setCounts(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      style={{
        background: "transparent",
        padding: "0",
      }}
    >
      <h2
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#6B7280",
          margin: "0 0 12px",
        }}
      >
        Översikt
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        {CARDS.map((c) => {
          const value = counts[c.key];
          const showRed = c.danger && (value ?? 0) > 0;
          return (
            <div
              key={c.key}
              style={{
                background: "#ffffff",
                border: "1px solid #E5E7EB",
                borderRadius: 12,
                boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
                padding: 20,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: c.iconBg,
                    color: c.iconColor,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <HugeiconsIcon icon={c.icon} size={20} />
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#1a1a1a",
                  }}
                >
                  {c.label}
                </div>
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: showRed ? "#DC2626" : "#1a1a1a",
                }}
              >
                {value ?? "—"}
              </div>
              <Link
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                to={c.to as any}
                style={{
                  marginTop: "auto",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#3D8A30",
                  textDecoration: "none",
                }}
              >
                Visa alla →
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default KpiOversikt;
