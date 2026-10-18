import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  HardHat,
  MapPin,
  MessageSquareText,
  Save,
  ShieldCheck,
  Sprout,
  UserRound,
  Wrench,
  CircleAlert,
  CircleDashed,
} from "lucide-react";

const CHECKLIST = [
  {
    title: "1. Allmänt om fastigheten",
    items: [
      "Fastighetens adress och typ",
      "Antal byggnader och lägenheter",
      "Byggår och större renoveringar",
      "Kontaktperson och ansvarig förvaltare",
    ],
  },
  {
    title: "2. Utemiljö och byggnad",
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
    items: [
      "Pågående fel och brister",
      "Befintliga serviceavtal",
      "Återkommande tillsyn och kontroller",
      "Kontakt med entreprenörer",
      "Akuta behov och prioriteringar",
    ],
  },
];

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
const [savedWalkthroughs, setSavedWalkthroughs] = useState<any[]>([]);
const [currentWalkthroughId, setCurrentWalkthroughId] = useState<string | null>(null);

useEffect(() => {
  try {
    const saved = localStorage.getItem("bayt-property-walkthroughs");
    if (saved) setSavedWalkthroughs(JSON.parse(saved));
  } catch {
    console.error("Kunde inte läsa sparade genomgångar.");
  }
}, []);

function saveWalkthrough() {
  const record = {
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
    ...savedWalkthroughs.filter((item) => item.id !== record.id),
  ];

  try {
    localStorage.setItem(
      "bayt-property-walkthroughs",
      JSON.stringify(updated),
    );
    setSavedWalkthroughs(updated);
    setCurrentWalkthroughId(record.id);
    alert("Genomgången har sparats på den här enheten.");
  } catch {
    alert("Kunde inte spara genomgången i webbläsaren.");
  }
}
  const total = CHECKLIST.reduce(
    (sum, section) => sum + section.items.length,
    0,
  );
  const checked = Object.values(answers).filter(
    (answer) => answer === "Kontrollerat",
  ).length;
  const needsAction = Object.values(answers).filter(
    (answer) => answer === "Åtgärd krävs",
  ).length;
  const notApplicable = Object.values(answers).filter(
    (answer) => answer === "Ej aktuellt",
  ).length;
  const assessed = checked + needsAction + notApplicable;
  const sectionIcons = [Building2, Sprout, ClipboardCheck, Wrench, ShieldCheck];

  function exportNotes() {
    const lines = [
      "BAYT – GENOMGÅNG AV FASTIGHET",
      `Fastighet: ${propertyName}`,
      `Adress: ${address}`,
      `Kontaktperson: ${contact}`,
      `Besöksdatum: ${visitDate}`,
      "",
      ...CHECKLIST.flatMap((section) => [
        section.title,
        ...section.items.map((item) => {
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

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
      <header className="relative overflow-hidden rounded-2xl bg-[#123d32] p-6 text-white shadow-lg md:p-8">
        <div className="absolute -right-12 -top-16 h-56 w-56 rounded-full border-[32px] border-white/5" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-200/20 bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[.18em] text-emerald-100">
              <Building2 className="h-4 w-4" /> BAYT <span className="text-emerald-300">/</span> NY KUND
            </div>
            <h1 className="text-3xl font-black tracking-tight md:text-4xl">Platsbesök<span className="text-emerald-300">.</span></h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-emerald-50/75 md:text-base">
              Skapa ett tydligt beslutsunderlag inför offert. Gå igenom varje område, fånga risker och lämna inget åt minnet.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-emerald-50/80">
            <span className="block text-[10px] font-bold uppercase tracking-[.16em] text-emerald-200/70">Genomgångens status</span>
            <span className="mt-1 flex items-center gap-2 font-semibold text-white"><ClipboardCheck className="h-4 w-4 text-emerald-300" /> {assessed} av {total} bedömda</span>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-emerald-950/10 bg-white p-5 shadow-sm md:p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800"><Building2 className="h-5 w-5" /></span>
          <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-emerald-700">01 · Start här</p><h2 className="text-lg font-extrabold tracking-tight text-[#173c32]">Grunduppgifter</h2></div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { label: "Fastighet / kund", value: propertyName, change: setPropertyName, placeholder: "Namn på fastigheten eller kunden", icon: Building2 },
            { label: "Adress", value: address, change: setAddress, placeholder: "Fastighetens adress", icon: MapPin },
            { label: "Kontaktperson", value: contact, change: setContact, placeholder: "Namn och kontaktuppgifter", icon: UserRound },
          ].map(({ label, value, change, placeholder, icon: Icon }) => (
            <label key={label} className="space-y-1.5">
              <span className="text-xs font-bold text-slate-700">{label}</span>
              <span className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 focus-within:border-emerald-700 focus-within:ring-2 focus-within:ring-emerald-700/10">
                <Icon className="h-4 w-4 shrink-0 text-emerald-800/60" />
                <input className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-slate-400" value={value} onChange={(event) => change(event.target.value)} placeholder={placeholder} />
              </span>
            </label>
          ))}
          <label className="space-y-1.5">
            <span className="text-xs font-bold text-slate-700">Besöksdatum</span>
            <span className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 focus-within:border-emerald-700 focus-within:ring-2 focus-within:ring-emerald-700/10"><CalendarDays className="h-4 w-4 shrink-0 text-emerald-800/60" /><input className="w-full bg-transparent py-2.5 text-sm outline-none" type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} /></span>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-emerald-950/10 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#123d32] text-emerald-200"><ClipboardCheck className="h-5 w-5" /></span>
              <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-emerald-700">02 · Systematisk genomgång</p><h2 className="text-xl font-black tracking-tight text-[#173c32]">Checklista</h2></div>
            </div>
            <p className="text-xs font-semibold text-slate-500"><span className="text-[#123d32]">{checked} klara</span><span className="mx-2 text-slate-300">·</span><span className={needsAction ? "text-rose-700" : ""}>{needsAction} kräver åtgärd</span><span className="mx-2 text-slate-300">·</span>{total - assessed} återstår</p>
          </div>
          <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-emerald-700 to-lime-400 transition-all duration-500" style={{ width: `${(checked / total) * 100}%` }} /></div>
          <div className="mt-2 flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400"><span>{Math.round((checked / total) * 100)}% kontrollerat</span><span>{notApplicable} ej aktuella</span></div>
        </div>

        <div className="divide-y divide-slate-100">
          {CHECKLIST.map((section, sectionIndex) => {
            const SectionIcon = sectionIcons[sectionIndex] ?? HardHat;
            const sectionChecked = section.items.filter((item) => answers[`${section.title}::${item}`] === "Kontrollerat").length;
            const sectionAction = section.items.filter((item) => answers[`${section.title}::${item}`] === "Åtgärd krävs").length;
            return (
              <section key={section.title} className="p-4 md:p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800"><SectionIcon className="h-[18px] w-[18px]" /></span><div className="min-w-0"><h3 className="text-sm font-extrabold text-[#173c32]">{section.title.replace(/^\d+\.\s*/, "")}</h3><p className="text-[11px] font-medium text-slate-400">{sectionChecked}/{section.items.length} kontrollerade{sectionAction > 0 ? ` · ${sectionAction} att åtgärda` : ""}</p></div></div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black tracking-wider text-slate-500">0{sectionIndex + 1}</span>
                </div>
                <div className="space-y-2">
                  {section.items.map((item) => {
                    const key = `${section.title}::${item}`;
                    const status = answers[key] || "";
                    const statusStyle = status === "Kontrollerat" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : status === "Åtgärd krävs" ? "border-rose-200 bg-rose-50 text-rose-800" : status === "Ej aktuellt" ? "border-slate-200 bg-slate-100 text-slate-600" : "border-slate-200 bg-white text-slate-500";
                    const StatusIcon = status === "Kontrollerat" ? CheckCircle2 : status === "Åtgärd krävs" ? CircleAlert : status === "Ej aktuellt" ? CircleDashed : CircleDashed;
                    return (
                      <article key={key} className={`rounded-xl border p-3 transition-colors ${status === "Åtgärd krävs" ? "border-rose-200 bg-rose-50/40" : status === "Kontrollerat" ? "border-emerald-100 bg-emerald-50/30" : "border-slate-200 bg-slate-50/60"}`}>
                        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-2.5"><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${status === "Kontrollerat" ? "bg-emerald-700 text-white" : status === "Åtgärd krävs" ? "bg-rose-100 text-rose-700" : "bg-white text-slate-400"}`}>{status === "Kontrollerat" ? <Check className="h-3.5 w-3.5" /> : <StatusIcon className="h-3.5 w-3.5" />}</span><span className="text-sm font-bold leading-snug text-slate-800">{item}</span></div>
                          <label className={`flex shrink-0 items-center gap-2 self-start rounded-lg border px-2.5 py-1.5 sm:self-auto ${statusStyle}`}><StatusIcon className="h-3.5 w-3.5" /><select aria-label={`Status: ${item}`} className="max-w-[170px] cursor-pointer bg-transparent text-xs font-bold outline-none" value={status} onChange={(event) => setAnswers((current) => ({ ...current, [key]: event.target.value }))}><option value="">Ej bedömt</option><option value="Kontrollerat">Kontrollerat</option><option value="Åtgärd krävs">Åtgärd krävs</option><option value="Ej aktuellt">Ej aktuellt</option></select></label>
                        </div>
                        <label className="mt-2.5 flex items-start gap-2 rounded-lg border border-transparent bg-white/80 px-2.5 py-2 focus-within:border-emerald-200"><MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-800/50" /><textarea className="min-h-6 w-full resize-y bg-transparent text-xs leading-relaxed text-slate-700 outline-none placeholder:text-slate-400" rows={1} aria-label={`Kommentar: ${item}`} placeholder="Lägg till observation eller kommentar…" value={comments[key] || ""} onChange={(event) => setComments((current) => ({ ...current, [key]: event.target.value }))} /></label>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-950/10 bg-white p-5 shadow-sm md:p-6">
        <div className="mb-3 flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800"><FileText className="h-[18px] w-[18px]" /></span><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-emerald-700">03 · Summering</p><h2 className="text-lg font-extrabold text-[#173c32]">Övergripande anteckningar</h2></div></div>
        <textarea className="w-full rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm leading-relaxed outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10" rows={4} placeholder="Sammanfattning, kundens önskemål, risker och underlag inför offert..." value={generalNotes} onChange={(event) => setGeneralNotes(event.target.value)} />
      </section>

      <section className="rounded-2xl bg-[#123d32] p-4 text-white shadow-lg md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div><p className="flex items-center gap-2 text-sm font-extrabold"><ClipboardCheck className="h-4 w-4 text-emerald-300" />{checked} av {total} punkter kontrollerade</p><p className="mt-1 text-xs text-emerald-100/65">Sparar lokalt på den här enheten. Uppgifterna sparas inte automatiskt i databasen.</p></div>
          <div className="flex flex-wrap gap-2"><button type="button" className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/10" onClick={exportNotes}><Download className="h-4 w-4" /> Exportera anteckningar</button><button type="button" className="inline-flex items-center gap-2 rounded-lg bg-lime-300 px-4 py-2.5 text-xs font-black text-[#173c32] transition hover:bg-lime-200" onClick={saveWalkthrough}><Save className="h-4 w-4" /> Spara genomgång</button></div>
        </div>
      </section>

      {savedWalkthroughs.length > 0 && (
        <section className="rounded-2xl border border-emerald-950/10 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-4 flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800"><Save className="h-[18px] w-[18px]" /></span><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-emerald-700">Dina utkast</p><h2 className="text-lg font-extrabold text-[#173c32]">Sparade genomgångar</h2></div></div>
          <div className="grid gap-2 md:grid-cols-2">{savedWalkthroughs.map((item) => (
            <button key={item.id} type="button" className="group rounded-xl border border-slate-200 p-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50/40" onClick={() => { setCurrentWalkthroughId(item.id); setPropertyName(item.propertyName ?? ""); setAddress(item.address ?? ""); setContact(item.contact ?? ""); setVisitDate(item.visitDate ?? ""); setAnswers(item.answers ?? {}); setComments(item.comments ?? {}); setGeneralNotes(item.generalNotes ?? ""); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
              <span className="flex items-start justify-between gap-2"><span className="font-extrabold text-[#173c32]">{item.propertyName || "Namnlös fastighet"}</span><CheckCircle2 className="h-4 w-4 text-emerald-700 opacity-50 group-hover:opacity-100" /></span><span className="mt-1 block text-xs text-slate-500">{item.address || "Ingen adress angiven"}</span><span className="mt-2 block text-[10px] font-medium text-slate-400">Senast sparad: {new Date(item.updatedAt).toLocaleString("sv-SE")}</span>
            </button>
          ))}</div>
        </section>
      )}
    </main>
  );
}

export const Route = createFileRoute("/_authenticated/genomgang-av-fastighet")({
  component: GenomgangAvFastighetPage,
});
