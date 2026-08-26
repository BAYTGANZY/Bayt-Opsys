import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check } from "lucide-react";
import { supabase } from "@/lib/supabase";

const baytLogo = `${import.meta.env.BASE_URL}assets/bayt-logo.png`;

export const Route = createFileRoute("/arendestatus")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Ärendestatus — BAYT" },
      { name: "description", content: "Följ statusen på din felanmälan." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ArendeStatusPage,
});

const C = {
  border: "#E5E7EB",
  primary: "#3D8A30",
  secondary: "#6B7280",
  text: "#1a1a1a",
  error: "#DC2626",
  card: "#ffffff",
  accentBg: "#F3F9F1",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  height: 40,
  padding: "0 12px",
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  fontSize: 14,
  color: C.text,
  background: C.card,
  outline: "none",
  boxSizing: "border-box",
};

const cardStyle: React.CSSProperties = {
  background: C.card,
  borderRadius: 12,
  padding: 24,
  width: "100%",
  boxSizing: "border-box",
  display: "grid",
  gap: 16,
  minWidth: 0,
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
};

type TrackedIssue = {
  id: string;
  title: string | null;
  category: string | null;
  created_at: string | null;
  property_name: string | null;
  /** viewed_at IS NOT NULL — someone with access opened the ärende's detail page. */
  viewed: boolean;
  /** assigned_contact_id IS NOT NULL — an entreprenör has been picked. */
  assigned: boolean;
  /** deadline column, ISO date or null. */
  deadline: string | null;
  /** status is in the "avslutat" bucket — AvslutaArendeButton was pressed. */
  closed: boolean;
};

// Four resident-facing milestones, each keyed to one concrete admin/
// entreprenör action rather than the messy `issue_status` enum:
//   Mottagen  — admin has opened and viewed the ärende (viewed_at)
//   Påbörjad  — admin has assigned an entreprenör (assigned_contact_id)
//   Åtgärdad  — a deadline has been set (deadline)
//   Avslutad  — "Avsluta ärende" was pressed, by either role (status closed)
// A later milestone always wins over an earlier one even if the earlier
// condition was never individually true (e.g. closed with no deadline ever
// set) — same staircase convention as an Amazon-style tracker: reaching a
// later checkpoint implies the earlier ones, whether or not each was
// logged on its own.
const STEP_LABELS = ["Mottagen", "Påbörjad", "Åtgärdad", "Avslutad"] as const;

function computeStepIndex(issue: TrackedIssue): number {
  if (issue.closed) return 3;
  if (issue.deadline) return 2;
  if (issue.assigned) return 1;
  if (issue.viewed) return 0;
  return 0; // nothing has happened yet — shown as the active, not-yet-done first step
}

function stepDescription(issue: TrackedIssue, current: number): string {
  switch (current) {
    case 0:
      return issue.viewed
        ? "Din felanmälan är mottagen och granskad av förvaltningen."
        : "Din felanmälan är mottagen och väntar på att granskas.";
    case 1:
      return "En entreprenör är tilldelad ärendet.";
    case 2: {
      const dateLabel = issue.deadline
        ? new Date(issue.deadline).toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" })
        : null;
      return dateLabel
        ? `Felanmälan förväntas vara klar senast ${dateLabel}.`
        : "Åtgärden pågår.";
    }
    default:
      return "Ärendet är avslutat.";
  }
}

function ProgressSteps({ current }: { current: number }) {
  return (
    <div style={{ display: "flex", width: "100%" }}>
      {STEP_LABELS.map((label, i) => {
        const isDone = i < current;
        const isCurrent = i === current;
        const isFuture = i > current;
        return (
          <div key={label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
            {i > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: 11,
                  right: "50%",
                  width: "100%",
                  height: 3,
                  background: i <= current ? C.primary : C.border,
                  zIndex: 0,
                }}
              />
            )}
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: isDone || isCurrent ? C.primary : "#ffffff",
                border: `3px solid ${isDone || isCurrent ? C.primary : C.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                zIndex: 1,
                boxShadow: isCurrent ? `0 0 0 4px ${C.accentBg}` : "none",
                boxSizing: "border-box",
              }}
            >
              {isDone && <Check size={13} color="#ffffff" strokeWidth={3} />}
            </div>
            <span
              style={{
                marginTop: 8,
                fontSize: 11,
                textAlign: "center",
                fontWeight: isCurrent ? 700 : 500,
                color: isFuture ? C.secondary : C.text,
                padding: "0 2px",
              }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function IssueTrackerCard({ issue }: { issue: TrackedIssue }) {
  const current = computeStepIndex(issue);
  const dateLabel = issue.created_at
    ? new Date(issue.created_at).toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" })
    : null;
  const metaParts = [issue.property_name, issue.category, dateLabel ? `Anmäld ${dateLabel}` : null].filter(Boolean);

  return (
    <div style={cardStyle}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: "Outfit, sans-serif", fontSize: 16, fontWeight: 600, color: C.text, overflowWrap: "anywhere" }}>
          {issue.title || "Felanmälan"}
        </div>
        {metaParts.length > 0 && (
          <div style={{ fontSize: 13, color: C.secondary, marginTop: 2 }}>{metaParts.join(" · ")}</div>
        )}
      </div>
      <ProgressSteps current={current} />
      <div style={{ fontSize: 13, color: C.secondary, textAlign: "center" }}>{stepDescription(issue, current)}</div>
    </div>
  );
}

function ArendeStatusPage() {
  const [email, setEmail] = useState("");
  const [searchedEmail, setSearchedEmail] = useState<string | null>(null);
  const [issues, setIssues] = useState<TrackedIssue[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Ange din e-postadress.");
      return;
    }
    setError(null);
    setLoading(true);
    setIssues(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("track-felanmalan", {
        body: { email: trimmed },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setIssues((data?.issues ?? []) as TrackedIssue[]);
      setSearchedEmail(trimmed);
    } catch (err) {
      console.error("[arendestatus] lookup failed:", err);
      setError("Något gick fel. Försök igen om en stund.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={shellStyle}>
      <div style={{ width: "min(560px, 94vw)", display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 0" }}>
        <img src={baytLogo} alt="BAYT" style={{ height: "clamp(40px, 10vw, 56px)", width: "auto", marginBottom: 24, filter: "brightness(0) invert(1)" }} />
        <div style={{ width: "100%", textAlign: "center", marginBottom: 20 }}>
          <h1 style={{ fontFamily: "Outfit, sans-serif", fontSize: 24, fontWeight: 600, color: "#ffffff", margin: "0 0 8px" }}>Ärendestatus</h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", margin: 0 }}>
            Skriv in e-postadressen du angav i felanmälan.
          </p>
        </div>

        <form onSubmit={onSearch} style={{ ...cardStyle, marginBottom: 16 }}>
          <div style={{ minWidth: 0 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: C.secondary, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
              E-post
            </label>
            <input
              type="email"
              style={inputStyle}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="namn@exempel.se"
              required
            />
          </div>
          {error && <div style={{ color: C.error, fontSize: 14 }}>{error}</div>}
          <button
            type="submit"
            disabled={loading}
            style={{
              height: 44,
              background: C.primary,
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              padding: "0 20px",
              fontSize: 15,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Söker…" : "Visa status"}
          </button>
        </form>

        {issues !== null && (
          issues.length === 0 ? (
            <div style={cardStyle}>
              <div style={{ fontSize: 14, color: C.text, lineHeight: 1.5 }}>
                Inga ärenden hittades för <strong>{searchedEmail}</strong>. Kontrollera att du skrev samma
                e-postadress som i felanmälan.
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 16, width: "100%" }}>
              {issues.map((issue) => (
                <IssueTrackerCard key={issue.id} issue={issue} />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

const shellStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "radial-gradient(ellipse at top, #15332c 0%, #0e1f1a 70%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  fontFamily: "Inter, system-ui, sans-serif",
};
