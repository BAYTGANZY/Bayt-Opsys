
import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

const STORAGE_KEY = "bayt-property-walkthroughs";

const CHECKLIST = [
  {
    title: "1. Allmänt om fastigheten",
    icon: "⌂",
    items: [
      "Fastighetens adress och typ",
      "Antal byggnader och lägenheter",
      "Byggår och större renoveringar",
      "Kontaktperson och ansvarig förvaltare",
    ],
  },
  {
    title: "2. Utemiljö och byggnad",
    icon: "▤",
    items: [
      "Fasad och sockel",
      "Tak och takavvattning",
      "Fönster och entréer",
      "Gårdar, gångar och parkering",
      "Belysning och skyltning",
    ],
  },
  {
    title: "3. Gemensamma utrymmen",
    icon: "▦",
    items: [
      "Trapphus och korridorer",
      "Tvättstuga",
      "Källare och vind",
      "Soprum och avfallshantering",
      "Förråd och tekniska utrymmen",
    ],
  },
  {
    title: "4. Tekniska installationer",
    icon: "⚙",
    items: [
      "Värme och ventilation",
      "Vatten och avlopp",
      "El och belysning",
      "Brandskydd och utrymningsvägar",
      "Hissar, om sådana finns",
    ],
  },
  {
    title: "5. Drift och förvaltning",
    icon: "✓",
    items: [
      "Pågående fel och brister",
      "Befintliga serviceavtal",
      "Återkommande tillsyn och kontroller",
      "Kontakt med entreprenörer",
      "Akuta behov och prioriteringar",
    ],
  },
];

const TOTAL = CHECKLIST.reduce(
  (sum, section) => sum + section.items.length,
  0,
);

type Walkthrough = {
  id: string;
  propertyName: string;
  address: string;
  contact: string;
  visitDate: string;
  answers: Record<string, string>;
  comments: Record<string, string>;
  generalNotes: string;
  updatedAt: string;
};

const styles = `
.bayt-page {
  --bayt-green: #0D2B1E;
  --bayt-green-2: #194631;
  --bayt-lime: #C4DF83;
  --bayt-bg: #F5F7F3;
  --bayt-line: #E1E7DF;
  --bayt-muted: #718075;
  color: #18251D;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}
.bayt-page * { box-sizing: border-box; }
.bayt-page button, .bayt-page input,
.bayt-page select, .bayt-page textarea { font: inherit; }
.bayt-page button { cursor: pointer; }
.bayt-hero {
  position: relative; overflow: hidden;
  border-radius: 22px; padding: 28px;
  color: white; background: var(--bayt-green);
}
.bayt-hero:after {
  content: ""; position: absolute;
  width: 220px; height: 220px; border-radius: 50%;
  right: -70px; top: -100px;
  border: 35px solid rgba(196,223,131,.10);
  pointer-events: none;
}
.bayt-eyebrow {
  color: var(--bayt-lime); font-size: 11px;
  font-weight: 800; letter-spacing: .19em;
}
.bayt-title {
  margin: 12px 0 8px; font-size: clamp(25px,4vw,36px);
  line-height: 1.15; letter-spacing: -.045em;
  font-weight: 800;
}
.bayt-muted { color: var(--bayt-muted); }
.bayt-panel {
  border: 1px solid var(--bayt-line);
  border-radius: 18px; background: white; padding: 22px;
}
.bayt-field {
  width: 100%; min-width: 0; border: 1px solid #DCE4DA;
  background: #FBFCFA; border-radius: 10px;
  padding: 12px 13px; color: #18251D;
  outline: none; transition: border-color .15s, box-shadow .15s;
}
.bayt-field:focus {
  border-color: #648B58;
  box-shadow: 0 0 0 3px rgba(100,139,88,.12);
}
.bayt-label {
  display: block; margin-bottom: 7px;
  font-size: 12px; font-weight: 700; color: #526256;
}
.bayt-btn {
  display: inline-flex; align-items: center; justify-content: center;
  gap: 8px; border-radius: 10px; padding: 12px 16px;
  font-size: 13px; font-weight: 750; border: 1px solid transparent;
  transition: transform .15s, background .15s;
}
.bayt-btn:hover { transform: translateY(-1px); }
.bayt-primary { background: var(--bayt-green); color: white; }
.bayt-primary:hover { background: var(--bayt-green-2); }
.bayt-secondary { background: white; color: var(--bayt-green); border-color: var(--bayt-line); }
.bayt-lime { background: var(--bayt-lime); color: var(--bayt-green); }
.bayt-section-head {
  display: flex; align-items: center; gap: 12px; margin-bottom: 18px;
}
.bayt-icon {
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 43px; height: 43px;
  border-radius: 12px; background: #EAF1E5;
  color: var(--bayt-green); font-size: 23px; font-weight: 900;
}
.bayt-progress {
  width: 100%; height: 8px; overflow: hidden;
  border-radius: 99px; background: #E9EEE7;
}
.bayt-progress > div {
  height: 100%; background: var(--bayt-green);
  border-radius: 99px; transition: width .2s;
}
.bayt-check-section {
  overflow: hidden; border: 1px solid var(--bayt-line);
  border-radius: 14px; background: white;
}
.bayt-check-title {
  display: flex; align-items: center; gap: 12px;
  padding: 15px; background: #F7F9F5;
  border-bottom: 1px solid var(--bayt-line);
  font-size: 14px; font-weight: 800;
}
.bayt-check-item { padding: 15px; border-bottom: 1px solid #EDF0EB; }
.bayt-check-item:last-child { border-bottom: 0; }
.bayt-status {
  display: inline-flex; align-items: center; gap: 6px;
  border-radius: 99px; padding: 6px 9px;
  font-size: 11px; font-weight: 800; white-space: nowrap;
}
.bayt-status-done { color: #21663C; background: #E7F4E8; }
.bayt-status-action { color: #963E2E; background: #FCEAE5; }
.bayt-status-progress { color: #815A17; background: #FFF3D7; }
.bayt-status-empty { color: #647166; background: #EEF1EC; }
.bayt-record {
  display: block; width: 100%; text-align: left;
  border: 1px solid var(--bayt-line); border-radius: 15px;
  padding: 17px; background: white; color: inherit;
  transition: border-color .15s, box-shadow .15s, transform .15s;
}
.bayt-record:hover {
  border-color: #9AB58C;
  box-shadow: 0 8px 22px rgba(13,43,30,.06);
  transform: translateY(-1px);
}
@media (max-width: 640px) {
  .bayt-hero { padding: 22px 19px; }
  .bayt-panel { padding: 16px; }
  .bayt-check-item { padding: 12px; }
}
`;

function getStatus(item: Walkthrough) {
  const values = CHECKLIST.flatMap(section =>
    section.items.map(label => item.answers?.[`${section.title}::${label}`] || ""),
  );

  if (values.some(value => value === "Åtgärd krävs")) {
    return { label: "Åtgärd krävs", icon: "!", className: "bayt-status-action" };
  }

  if (values.every(value => value === "Kontrollerat" || value === "Ej aktuellt")) {
    return { label: "Slutförd", icon: "✓", className: "bayt-status-done" };
  }

  if (values.some(Boolean)) {
    return { label: "Påbörjad", icon: "◷", className: "bayt-status-progress" };
  }

  return { label: "Ej påbörjad", icon: "○", className: "bayt-status-empty" };
}

function formatDate(value?: string) {
  if (!value) return "Inget datum";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Inget datum"
    : date.toLocaleDateString("sv-SE", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function GenomgangAvFastighetPage() {
  const [propertyName, setPropertyName] = useState("");
  const [address, setAddress] = useState("");
  const [contact, setContact] = useState("");
  const [visitDate, setVisitDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [generalNotes, setGeneralNotes] = useState("");
  const [savedWalkthroughs, setSavedWalkthroughs] = useState<Walkthrough[]>([]);
  const [currentWalkthroughId, setCurrentWalkthroughId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showChecklist, setShowChecklist] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setSavedWalkthroughs(JSON.parse(saved));
    } catch {
      console.error("Kunde inte läsa sparade genomgångar.");
    }
  }, []);

  const checked = Object.values(answers).filter(
    answer => answer === "Kontrollerat",
  ).length;
  const actionCount = Object.values(answers).filter(
    answer => answer === "Åtgärd krävs",
  ).length;
  const progress = Math.round(
    (Object.values(answers).filter(Boolean).length / TOTAL) * 100,
  );

  function startNewWalkthrough() {
    if (
      (propertyName.trim() || Object.keys(answers).length > 0) &&
      !window.confirm("Starta en ny genomgång? Spara först om du vill behålla ändringarna.")
    ) return;

    setCurrentWalkthroughId(null);
    setPropertyName("");
    setAddress("");
    setContact("");
    setVisitDate(new Date().toISOString().slice(0, 10));
    setAnswers({});
    setComments({});
    setGeneralNotes("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function saveWalkthrough() {
    if (!propertyName.trim() && !address.trim()) {
      alert("Ange minst fastighetens namn eller adress innan du sparar.");
      return;
    }

    const record: Walkthrough = {
      id: currentWalkthroughId ?? crypto.randomUUID(),
      propertyName,
      address,
      contact,
      visitDate,
      answers,
      comments,
      generalNotes,
      updatedAt: new Date().toISOString(),
    };

    const updated = [
      record,
      ...savedWalkthroughs.filter(item => item.id !== record.id),
    ];

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setSavedWalkthroughs(updated);
      setCurrentWalkthroughId(record.id);
      alert("Genomgången har sparats på den här enheten.");
    } catch {
      alert("Kunde inte spara genomgången i webbläsaren.");
    }
  }

  function openWalkthrough(item: Walkthrough) {
    setCurrentWalkthroughId(item.id);
    setPropertyName(item.propertyName ?? "");
    setAddress(item.address ?? "");
    setContact(item.contact ?? "");
    setVisitDate(item.visitDate ?? "");
    setAnswers(item.answers ?? {});
    setComments(item.comments ?? {});
    setGeneralNotes(item.generalNotes ?? "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function exportNotes() {
    const lines = [
      "BAYT – GENOMGÅNG AV FASTIGHET",
      `Fastighet: ${propertyName}`,
      `Adress: ${address}`,
      `Kontaktperson: ${contact}`,
      `Besöksdatum: ${visitDate}`,
      "",
      ...CHECKLIST.flatMap(section => [
        section.title,
        ...section.items.map(item => {
          const key = `${section.title}::${item}`;
          return `- ${item}: ${answers[key] || "Ej bedömt"}${
            comments[key] ? ` – ${comments[key]}` : ""
          }`;
        }),
        "",
      ]),
      "Övergripande anteckningar:",
      generalNotes,
    ];

    const blob = new Blob(["\uFEFF" + lines.join("\n")], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bayt-genomgang-fastighet.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  const filteredWalkthroughs = savedWalkthroughs.filter(item =>
    `${item.propertyName ?? ""} ${item.address ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <div className="bayt-page mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
      <style>{styles}</style>

      <header className="bayt-hero">
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-lime-200 text-3xl font-black text-emerald-950">
              ☷
            </div>
            <div>
              <p className="bayt-eyebrow">BAYT · ANSVAR HELA VÄGEN</p>
              <h1 className="bayt-title">Genomgång av fastighet</h1>
              <p className="max-w-xl text-sm leading-6 text-emerald-100">
                Ett samlat underlag för fastighetens skick, drift och åtgärdsbehov
                inför platsbesök och offert.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="bayt-btn bayt-lime"
            onClick={startNewWalkthrough}
          >
            <span className="text-lg">＋</span> Ny genomgång
          </button>
        </div>
        <div className="relative z-10 mt-7 flex flex-wrap gap-2">
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white">
            {savedWalkthroughs.length} sparade genomgångar
          </span>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white">
            {TOTAL} kontrollpunkter
          </span>
        </div>
      </header>

      <section className="bayt-panel">
        <div className="bayt-section-head">
          <div className="bayt-icon">⌂</div>
          <div>
            <h2 className="text-lg font-extrabold">Grunduppgifter</h2>
            <p className="text-sm bayt-muted">Identifiera fastigheten och besöket.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label>
            <span className="bayt-label">Fastighet / kund</span>
            <input className="bayt-field" value={propertyName}
              onChange={event => setPropertyName(event.target.value)}
              placeholder="Namn på fastigheten eller kunden" />
          </label>
          <label>
            <span className="bayt-label">Adress</span>
            <input className="bayt-field" value={address}
              onChange={event => setAddress(event.target.value)}
              placeholder="Fastighetens adress" />
          </label>
          <label>
            <span className="bayt-label">Kontaktperson</span>
            <input className="bayt-field" value={contact}
              onChange={event => setContact(event.target.value)}
              placeholder="Namn och kontaktuppgifter" />
          </label>
          <label>
            <span className="bayt-label">Besöksdatum</span>
            <input className="bayt-field" type="date" value={visitDate}
              onChange={event => setVisitDate(event.target.value)} />
          </label>
        </div>
      </section>

      <section className="bayt-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="bayt-section-head mb-0">
            <div className="bayt-icon">☷</div>
            <div>
              <h2 className="text-lg font-extrabold">Kontrollöversikt</h2>
              <p className="text-sm bayt-muted">Följ arbetet genom hela besöket.</p>
            </div>
          </div>
          <button type="button" className="bayt-btn bayt-secondary"
            onClick={() => setShowChecklist(value => !value)}>
            {showChecklist ? "Dölj checklista −" : "Visa checklista ＋"}
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-[#F4F7F1] p-4">
            <p className="text-xs font-bold uppercase tracking-wide bayt-muted">Besvarade</p>
            <p className="mt-1 text-2xl font-extrabold text-[#0D2B1E]">
              {Object.values(answers).filter(Boolean).length}
              <span className="text-sm font-semibold bayt-muted"> / {TOTAL}</span>
            </p>
          </div>
          <div className="rounded-xl bg-[#EAF3E8] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[#397247]">Kontrollerade</p>
            <p className="mt-1 text-2xl font-extrabold text-[#205C35]">{checked}</p>
          </div>
          <div className="rounded-xl bg-[#FFF0EA] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[#963E2E]">Åtgärder krävs</p>
            <p className="mt-1 text-2xl font-extrabold text-[#963E2E]">{actionCount}</p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 text-sm">
          <span className="font-bold">Genomförande</span>
          <span className="font-extrabold text-[#0D2B1E]">{progress}%</span>
        </div>
        <div className="bayt-progress mt-2"><div style={{ width: `${progress}%` }} /></div>
      </section>

      {showChecklist && CHECKLIST.map(section => (
        <section className="bayt-check-section" key={section.title}>
          <div className="bayt-check-title">
            <span className="bayt-icon">{section.icon}</span>
            <span>{section.title}</span>
          </div>
          {section.items.map(item => {
            const key = `${section.title}::${item}`;
            const answer = answers[key] || "";
            const statusClass =
              answer === "Kontrollerat" ? "bayt-status-done" :
              answer === "Åtgärd krävs" ? "bayt-status-action" :
              answer === "Ej aktuellt" ? "bayt-status-empty" :
              "bayt-status-progress";

            return (
              <div className="bayt-check-item" key={key}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-bold leading-5">{item}</span>
                  {answer && (
                    <span className={`bayt-status ${statusClass}`}>
                      <span>{answer === "Kontrollerat" ? "✓" :
                        answer === "Åtgärd krävs" ? "!" :
                        answer === "Ej aktuellt" ? "—" : "◷"}</span>
                      {answer}
                    </span>
                  )}
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,220px)_1fr]">
                  <select className="bayt-field text-sm" value={answer}
                    aria-label={`Status för ${item}`}
                    onChange={event => setAnswers(current => ({
                      ...current, [key]: event.target.value,
                    }))}>
                    <option value="">Välj status…</option>
                    <option value="Kontrollerat">✓ Kontrollerat</option>
                    <option value="Åtgärd krävs">! Åtgärd krävs</option>
                    <option value="Ej aktuellt">— Ej aktuellt</option>
                  </select>
                  <textarea className="bayt-field text-sm" rows={2}
                    placeholder="Kommentar eller observation (valfritt)"
                    aria-label={`Kommentar för ${item}`}
                    value={comments[key] || ""}
                    onChange={event => setComments(current => ({
                      ...current, [key]: event.target.value,
                    }))} />
                </div>
              </div>
            );
          })}
        </section>
      ))}

      <section className="bayt-panel">
        <div className="bayt-section-head">
          <div className="bayt-icon">✎</div>
          <div>
            <h2 className="text-lg font-extrabold">Övergripande anteckningar</h2>
            <p className="text-sm bayt-muted">Sammanfattning, risker och underlag inför offert.</p>
          </div>
        </div>
        <textarea className="bayt-field" rows={5}
          placeholder="Kundens önskemål, prioriteringar, risker och nästa steg…"
          value={generalNotes}
          onChange={event => setGeneralNotes(event.target.value)} />
      </section>

      <section className="bayt-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-extrabold">
              {currentWalkthroughId ? "Du arbetar med en sparad genomgång" : "Redo att spara"}
            </p>
            <p className="mt-1 text-sm bayt-muted">
              Uppgifterna sparas på den här enheten, inte automatiskt i databasen.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="bayt-btn bayt-secondary" onClick={exportNotes}>
              ↓ Exportera
            </button>
            <button type="button" className="bayt-btn bayt-primary" onClick={saveWalkthrough}>
              ✓ Spara genomgång
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="bayt-eyebrow" style={{ color: "#64805B" }}>BAYT · DOKUMENTATION</p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight">Sparade genomgångar</h2>
            <p className="mt-1 text-sm bayt-muted">Öppna en genomgång för att fortsätta där du slutade.</p>
          </div>
          <div className="text-sm font-bold bayt-muted">{savedWalkthroughs.length} totalt</div>
        </div>

        {savedWalkthroughs.length > 0 && (
          <input className="bayt-field" value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="⌕  Sök efter fastighet eller adress…" />
        )}

        {savedWalkthroughs.length === 0 ? (
          <div className="bayt-panel py-10 text-center">
            <div className="bayt-icon mx-auto mb-4" style={{ width: 58, height: 58 }}>▤</div>
            <h3 className="text-lg font-extrabold">Inga sparade genomgångar ännu</h3>
            <p className="mx-auto mt-2 max-w-md text-sm bayt-muted">
              Fyll i grunduppgifterna och välj Spara genomgång. Den sparade genomgången visas sedan här.
            </p>
          </div>
        ) : filteredWalkthroughs.length === 0 ? (
          <div className="bayt-panel text-center text-sm bayt-muted">
            Ingen genomgång matchar din sökning.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filteredWalkthroughs.map(item => {
              const status = getStatus(item);
              const answered = Object.values(item.answers ?? {}).filter(Boolean).length;

              return (
                <button key={item.id} type="button"
                  className="bayt-record"
                  onClick={() => openWalkthrough(item)}>
                  <div className="flex items-start gap-3">
                    <div className="bayt-icon">⌂</div>
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words text-base font-extrabold">
                        {item.propertyName || "Namnlös fastighet"}
                      </h3>
                      <p className="mt-1 break-words text-sm bayt-muted">
                        {item.address || "Ingen adress angiven"}
                      </p>
                    </div>
                    <span className="text-xl font-black text-[#0D2B1E]">↗</span>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <span className={`bayt-status ${status.className}`}>
                      <span>{status.icon}</span>{status.label}
                    </span>
                    <span className="text-xs font-semibold bayt-muted">
                      {answered}/{TOTAL} besvarade
                    </span>
                  </div>

                  <div className="bayt-progress mt-3">
                    <div style={{ width: `${Math.round(answered / TOTAL * 100)}%` }} />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#E8ECE6] pt-3 text-xs bayt-muted">
                    <span>◷ Besöksdatum: {formatDate(item.visitDate)}</span>
                    <span>Senast sparad: {formatDate(item.updatedAt)}</span>
                  </div>
                  <div className="mt-3 text-sm font-extrabold text-[#0D2B1E]">
                    Öppna och fortsätt →
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/genomgang-av-fastighet")({
  component: GenomgangAvFastighetPage,
});
