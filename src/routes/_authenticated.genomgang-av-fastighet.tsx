import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Droplets,
  FileText,
  HardHat,
  MapPin,
  MessageSquareText,
  Save,
  ShieldCheck,
  Sprout,
  Trash2,
  UserRound,
  Wrench,
  CircleAlert,
  CircleDashed,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type Mode = "offer" | "control";
type Item = { t: string; m?: Mode };
type Section = { title: string; m?: Mode; items: Item[] };

const MODE_LABEL: Record<Mode, string> = { offer: "Första besök (offert)", control: "Kontrollrunda" };

// m = bara i det läget. Saknas m visas punkten i båda lägena.
const CHECKLIST: Section[] = [
  {
    title: "1. Allmänt om fastigheten",
    items: [
      { t: "Fastighetens adress och typ" },
      { t: "Antal byggnader och lägenheter" },
      { t: "Byggår och större renoveringar" },
      { t: "Kontaktperson och ansvarig förvaltare" },
      { t: "Föreningens organisation och styrelsens sammansättning", m: "offer" },
      { t: "Nuvarande förvaltare, avtal och uppsägningstid", m: "offer" },
      { t: "Senaste underhållsplan och besiktningsprotokoll finns tillgängliga" },
      { t: "Åtgärder sedan föregående besök är genomförda", m: "control" },
      { t: "Öppna punkter från föregående besök är genomgångna", m: "control" },
    ],
  },
  {
    title: "2. Utemiljö och byggnad",
    items: [
      { t: "Fasad och sockel" },
      { t: "Tak och takavvattning" },
      { t: "Fönster och entréer" },
      { t: "Gårdar, gångar och parkering" },
      { t: "Belysning och skyltning" },
      { t: "Balkonger, balkongräcken och uteplatser" },
      { t: "Markavvattning, dagvatten och brunnar" },
      { t: "Lekplats och lekutrustning" },
      { t: "Grönytor, träd och buskar" },
      { t: "Snöröjning och halkbekämpning fungerar" },
      { t: "Cykelrum, cykelställ och carport" },
    ],
  },
  {
    title: "3. Gemensamma utrymmen",
    items: [
      { t: "Trapphus och korridorer" },
      { t: "Tvättstuga" },
      { t: "Källare och vind" },
      { t: "Soprum och avfallshantering" },
      { t: "Förråd och tekniska utrymmen" },
      { t: "Entrédörrar, portar och passersystem" },
      { t: "Brevlådor och anslagstavlor" },
      { t: "Städning och allmänt skick" },
      { t: "Spår av skadedjur" },
    ],
  },
  {
    title: "4. Tekniska installationer",
    items: [
      { t: "Värme och ventilation" },
      { t: "Vatten och avlopp" },
      { t: "El och belysning" },
      { t: "Brandskydd och utrymningsvägar" },
      { t: "Hissar, om sådana finns" },
      { t: "Undercentral, pumpar och expansionskärl" },
      { t: "Ventilationsaggregat, don och filter" },
      { t: "Elcentraler, märkning och jordfelsbrytare" },
      { t: "Avstängningsventiler är märkta och åtkomliga" },
      { t: "Stammar: tecken på läckage eller rostvatten" },
      { t: "Brandvarnare, släckare, brandlarm och rökluckor" },
      { t: "Porttelefon, fiber och bredband" },
      { t: "Laddstolpar och solceller, om sådana finns" },
    ],
  },
  {
    title: "5. Drift och förvaltning",
    items: [
      { t: "Pågående fel och brister" },
      { t: "Befintliga serviceavtal" },
      { t: "Återkommande tillsyn och kontroller" },
      { t: "Kontakt med entreprenörer" },
      { t: "Akuta behov och prioriteringar" },
      { t: "Felanmälan och jour är skyltad och fungerar" },
      { t: "Nyckelhantering och nyckelskåp" },
      { t: "Underhållsplanen är aktuell och avsättningen följs upp" },
    ],
  },
  {
    title: "6. Fukt och skador",
    items: [
      { t: "Fukt i källare, vind och tvättstuga" },
      { t: "Mögel eller mögellukt" },
      { t: "Sprickor i fasad, grund och bärande delar" },
      { t: "Vattenskador i trapphus och gemensamma utrymmen" },
      { t: "Läckage från tak och fönster" },
    ],
  },
  {
    title: "7. Säkerhet och myndighetskrav",
    items: [
      { t: "OVK är genomförd och intyg finns" },
      { t: "Energideklarationen är giltig" },
      { t: "Systematiskt brandskyddsarbete (SBA) är dokumenterat" },
      { t: "Hissbesiktning är genomförd, om hiss finns" },
      { t: "Lekplatsbesiktning är genomförd, om lekplats finns" },
      { t: "Elsäkerhet och egenkontroll" },
      { t: "Legionella: egenkontroll av varmvatten" },
      { t: "Miljöinventering (asbest, PCB), särskilt äldre hus" },
      { t: "Försäkringen är giltig och omfattar rätt värden" },
    ],
  },
  {
    title: "8. Offertunderlag",
    m: "offer",
    items: [
      { t: "Kundens önskemål och prioriteringar" },
      { t: "Omfattning: teknisk, administrativ och ekonomisk förvaltning" },
      { t: "Kända problem och risker" },
      { t: "Akuta åtgärder som behövs före uppdragsstart" },
      { t: "Uppskattad besöksfrekvens och tidsåtgång" },
      { t: "Foton är tagna av alla områden" },
      { t: "Nästa steg och tidplan är överenskommet" },
    ],
  },
  {
    title: "9. Uppföljning",
    m: "control",
    items: [
      { t: "Nya brister är dokumenterade med foto" },
      { t: "Brådskande brister är felanmälda i BAYT" },
      { t: "Utförda åtgärder är markerade som klara" },
      { t: "Rapport är skickad till styrelsen" },
      { t: "Datum för nästa kontrollrunda är bestämt" },
    ],
  },
];

const SECTION_ICONS = [Building2, Sprout, ClipboardCheck, Wrench, HardHat, Droplets, ShieldCheck, FileText, CheckCircle2];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Walkthrough = Record<string, any>;

function GenomgangAvFastighetPage() {
  const [mode, setMode] = useState<Mode>("offer");
  const [properties, setProperties] = useState<Array<{ id: string; name: string; address: string | null }>>([]);
  const [propertyId, setPropertyId] = useState("");
  const [propertyName, setPropertyName] = useState("");
  const [address, setAddress] = useState("");
  const [contact, setContact] = useState("");
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 10));
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [generalNotes, setGeneralNotes] = useState("");
  const [saved, setSaved] = useState<Walkthrough[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [localDrafts, setLocalDrafts] = useState<Walkthrough[]>([]);

  async function loadSaved() {
    const { data, error } = await supabase.from("property_walkthroughs").select("*").order("updated_at", { ascending: false });
    if (error) {
      toast.error(`Kunde inte hämta sparade genomgångar: ${error.message}`);
      return;
    }
    setSaved((data ?? []) as Walkthrough[]);
  }

  useEffect(() => {
    void loadSaved();
    supabase
      .from("properties")
      .select("id, name, address")
      .order("name")
      .then(({ data }) => setProperties((data ?? []) as Array<{ id: string; name: string; address: string | null }>));
    try {
      const raw = localStorage.getItem("bayt-property-walkthroughs");
      if (raw) setLocalDrafts(JSON.parse(raw));
    } catch {
      /* ignoreras */
    }
  }, []);

  const visibleSections = CHECKLIST.filter((s) => !s.m || s.m === mode)
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.m || i.m === mode) }))
    .filter((s) => s.items.length > 0);
  const keyOf = (section: Section, item: Item) => `${section.title}::${item.t}`;
  const allKeys = visibleSections.flatMap((s) => s.items.map((i) => keyOf(s, i)));
  const total = allKeys.length;
  const count = (v: string) => allKeys.filter((k) => answers[k] === v).length;
  const checked = count("Kontrollerat");
  const needsAction = count("Åtgärd krävs");
  const notApplicable = count("Ej aktuellt");
  const assessed = checked + needsAction + notApplicable;

  function pickProperty(id: string) {
    setPropertyId(id);
    const p = properties.find((x) => x.id === id);
    if (p) {
      setPropertyName(p.name);
      setAddress(p.address ?? "");
    }
  }

  function reset() {
    setCurrentId(null);
    setPropertyId("");
    setPropertyName("");
    setAddress("");
    setContact("");
    setVisitDate(new Date().toISOString().slice(0, 10));
    setAnswers({});
    setComments({});
    setGeneralNotes("");
  }

  async function saveWalkthrough() {
    setSaving(true);
    const row = {
      property_id: propertyId || null,
      visit_type: mode,
      property_name: propertyName || null,
      address: address || null,
      contact: contact || null,
      visit_date: visitDate || null,
      answers,
      comments,
      general_notes: generalNotes || null,
      updated_at: new Date().toISOString(),
    };
    try {
      if (currentId) {
        const { error } = await supabase.from("property_walkthroughs").update(row).eq("id", currentId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("property_walkthroughs").insert(row).select("id").single();
        if (error) throw error;
        setCurrentId(data.id as string);
      }
      toast.success("Genomgången är sparad", { style: { background: "#3D8A30", color: "#fff" } });
      await loadSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte spara");
    } finally {
      setSaving(false);
    }
  }

  async function deleteWalkthrough(id: string) {
    if (!window.confirm("Ta bort den sparade genomgången? Det går inte att ångra.")) return;
    const { error } = await supabase.from("property_walkthroughs").delete().eq("id", id);
    if (error) return void toast.error(error.message);
    if (currentId === id) reset();
    await loadSaved();
  }

  async function moveLocalDrafts() {
    const rows = localDrafts.map((d) => ({
      property_name: d.propertyName || null,
      address: d.address || null,
      contact: d.contact || null,
      visit_date: d.visitDate || null,
      visit_type: "offer",
      answers: d.answers ?? {},
      comments: d.comments ?? {},
      general_notes: d.generalNotes || null,
    }));
    const { error } = await supabase.from("property_walkthroughs").insert(rows);
    if (error) return void toast.error(error.message);
    try {
      localStorage.removeItem("bayt-property-walkthroughs");
    } catch {
      /* ignoreras */
    }
    setLocalDrafts([]);
    toast.success(`${rows.length} utkast flyttades till databasen`);
    await loadSaved();
  }

  function load(item: Walkthrough) {
    setCurrentId(item.id);
    setMode((item.visit_type as Mode) ?? "offer");
    setPropertyId(item.property_id ?? "");
    setPropertyName(item.property_name ?? "");
    setAddress(item.address ?? "");
    setContact(item.contact ?? "");
    setVisitDate(item.visit_date ?? "");
    setAnswers(item.answers ?? {});
    setComments(item.comments ?? {});
    setGeneralNotes(item.general_notes ?? "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function exportNotes() {
    const lines = [
      `BAYT – ${MODE_LABEL[mode].toUpperCase()}`,
      `Fastighet: ${propertyName}`,
      `Adress: ${address}`,
      `Kontaktperson: ${contact}`,
      `Besöksdatum: ${visitDate}`,
      "",
      ...visibleSections.flatMap((section) => [
        section.title,
        ...section.items.map((item) => {
          const key = keyOf(section, item);
          return `- ${item.t}: ${answers[key] || "Ej bedömt"}${comments[key] ? ` – ${comments[key]}` : ""}`;
        }),
        "",
      ]),
      "Övergripande anteckningar:",
      generalNotes,
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bayt-platsbesok.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  const modeBtn = (m: Mode) => (
    <button
      key={m}
      type="button"
      onClick={() => setMode(m)}
      className={`rounded-lg px-4 py-2 text-xs font-black transition ${mode === m ? "bg-lime-300 text-[#173c32]" : "bg-white/10 text-white hover:bg-white/20"}`}
    >
      {MODE_LABEL[m]}
    </button>
  );

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
      <header className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#123d32] via-[#13745d] to-[#2f9e78] p-6 text-white shadow-lg md:p-8">
        <div className="absolute -right-12 -top-16 h-56 w-56 rounded-full border-[32px] border-lime-200/20" />
        <div className="absolute -bottom-20 right-48 h-40 w-40 rounded-full bg-emerald-300/10 blur-2xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[.18em] text-emerald-50">
              <Building2 className="h-4 w-4" />
              BAYT <span className="text-lime-300">/</span> {mode === "offer" ? "NY KUND" : "KONTROLLRUNDA"}
            </div>
            <h1 className="text-3xl font-black tracking-tight md:text-4xl">
              Platsbesök<span className="text-lime-300">.</span>
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-teal-50/90 md:text-base">
              {mode === "offer"
                ? "Skapa ett tydligt beslutsunderlag inför offert. Gå igenom varje område, fånga risker och lämna inget åt minnet."
                : "Gå igenom fastigheten systematiskt, dokumentera brister och följ upp punkter från föregående besök."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">{(["offer", "control"] as Mode[]).map(modeBtn)}</div>
          </div>
          <div className="rounded-xl border border-white/25 bg-white/15 px-4 py-3 text-sm text-emerald-50">
            <span className="block text-[10px] font-bold uppercase tracking-[.16em] text-lime-100/80">Genomgångens status</span>
            <span className="mt-1 flex items-center gap-2 font-semibold text-white">
              <ClipboardCheck className="h-4 w-4 text-lime-300" />
              {assessed} av {total} bedömda
            </span>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-emerald-950/10 bg-white p-5 shadow-sm md:p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800"><Building2 className="h-5 w-5" /></span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-emerald-700">01 · Start här</p>
            <h2 className="text-lg font-extrabold tracking-tight text-[#173c32]">Grunduppgifter</h2>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-bold text-slate-700">Koppla till fastighet i BAYT (valfritt)</span>
            <select
              className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm outline-none focus:border-emerald-700"
              value={propertyId}
              onChange={(e) => pickProperty(e.target.value)}
            >
              <option value="">Ingen koppling (ny kund)</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
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
            <span className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 focus-within:border-emerald-700 focus-within:ring-2 focus-within:ring-emerald-700/10">
              <CalendarDays className="h-4 w-4 shrink-0 text-emerald-800/60" />
              <input className="w-full bg-transparent py-2.5 text-sm outline-none" type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} />
            </span>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-emerald-950/10 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#123d32] text-emerald-200"><ClipboardCheck className="h-5 w-5" /></span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.16em] text-emerald-700">02 · Systematisk genomgång</p>
                <h2 className="text-xl font-black tracking-tight text-[#173c32]">Checklista · {MODE_LABEL[mode]}</h2>
              </div>
            </div>
            <p className="text-xs font-semibold text-slate-500">
              <span className="text-[#123d32]">{checked} klara</span>
              <span className="mx-2 text-slate-300">·</span>
              <span className={needsAction ? "text-rose-700" : ""}>{needsAction} kräver åtgärd</span>
              <span className="mx-2 text-slate-300">·</span>
              {total - assessed} återstår
            </p>
          </div>
          <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-700 to-lime-400 transition-all duration-500" style={{ width: `${total ? (checked / total) * 100 : 0}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <span>{total ? Math.round((checked / total) * 100) : 0}% kontrollerat</span>
            <span>{notApplicable} ej aktuella</span>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {visibleSections.map((section) => {
            const origIndex = CHECKLIST.findIndex((s) => s.title === section.title);
            const SectionIcon = SECTION_ICONS[origIndex] ?? HardHat;
            const sectionChecked = section.items.filter((i) => answers[keyOf(section, i)] === "Kontrollerat").length;
            const sectionAction = section.items.filter((i) => answers[keyOf(section, i)] === "Åtgärd krävs").length;
            return (
              <section key={section.title} className="p-4 md:p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800"><SectionIcon className="h-[18px] w-[18px]" /></span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-extrabold text-[#173c32]">{section.title.replace(/^\d+\.\s*/, "")}</h3>
                      <p className="text-[11px] font-medium text-slate-400">
                        {sectionChecked}/{section.items.length} kontrollerade{sectionAction > 0 ? ` · ${sectionAction} att åtgärda` : ""}
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black tracking-wider text-slate-500">{section.title.match(/^\d+/)?.[0].padStart(2, "0")}</span>
                </div>
                <div className="space-y-2">
                  {section.items.map((item) => {
                    const key = keyOf(section, item);
                    const status = answers[key] || "";
                    const statusStyle =
                      status === "Kontrollerat" ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : status === "Åtgärd krävs" ? "border-rose-200 bg-rose-50 text-rose-800"
                      : status === "Ej aktuellt" ? "border-slate-200 bg-slate-100 text-slate-600"
                      : "border-slate-200 bg-white text-slate-500";
                    const StatusIcon = status === "Kontrollerat" ? CheckCircle2 : status === "Åtgärd krävs" ? CircleAlert : CircleDashed;
                    return (
                      <article key={key} className={`rounded-xl border p-3 transition-colors ${status === "Åtgärd krävs" ? "border-rose-200 bg-rose-50/40" : status === "Kontrollerat" ? "border-emerald-100 bg-emerald-50/30" : "border-slate-200 bg-slate-50/60"}`}>
                        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-2.5">
                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${status === "Kontrollerat" ? "bg-emerald-700 text-white" : status === "Åtgärd krävs" ? "bg-rose-100 text-rose-700" : "bg-white text-slate-400"}`}>
                              {status === "Kontrollerat" ? <Check className="h-3.5 w-3.5" /> : <StatusIcon className="h-3.5 w-3.5" />}
                            </span>
                            <span className="text-sm font-bold leading-snug text-slate-800">{item.t}</span>
                          </div>
                          <label className={`flex shrink-0 items-center gap-2 self-start rounded-lg border px-2.5 py-1.5 sm:self-auto ${statusStyle}`}>
                            <StatusIcon className="h-3.5 w-3.5" />
                            <select
                              aria-label={`Status: ${item.t}`}
                              className="max-w-[170px] cursor-pointer bg-transparent text-xs font-bold outline-none"
                              value={status}
                              onChange={(event) => setAnswers((current) => ({ ...current, [key]: event.target.value }))}
                            >
                              <option value="">Ej bedömt</option>
                              <option value="Kontrollerat">Kontrollerat</option>
                              <option value="Åtgärd krävs">Åtgärd krävs</option>
                              <option value="Ej aktuellt">Ej aktuellt</option>
                            </select>
                          </label>
                        </div>
                        <label className="mt-2.5 flex items-start gap-2 rounded-lg border border-transparent bg-white/80 px-2.5 py-2 focus-within:border-emerald-200">
                          <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-800/50" />
                          <textarea
                            className="min-h-6 w-full resize-y bg-transparent text-xs leading-relaxed text-slate-700 outline-none placeholder:text-slate-400"
                            rows={1}
                            aria-label={`Kommentar: ${item.t}`}
                            placeholder="Lägg till observation eller kommentar…"
                            value={comments[key] || ""}
                            onChange={(event) => setComments((current) => ({ ...current, [key]: event.target.value }))}
                          />
                        </label>
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
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800"><FileText className="h-[18px] w-[18px]" /></span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-emerald-700">03 · Summering</p>
            <h2 className="text-lg font-extrabold text-[#173c32]">Övergripande anteckningar</h2>
          </div>
        </div>
        <textarea
          className="w-full rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm leading-relaxed outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
          rows={4}
          placeholder={mode === "offer" ? "Sammanfattning, kundens önskemål, risker och underlag inför offert..." : "Sammanfattning av rundan, viktigaste brister och rekommenderade åtgärder..."}
          value={generalNotes}
          onChange={(event) => setGeneralNotes(event.target.value)}
        />
      </section>

      <section className="rounded-2xl bg-[#123d32] p-4 text-white shadow-lg md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-extrabold"><ClipboardCheck className="h-4 w-4 text-emerald-300" />{checked} av {total} punkter kontrollerade</p>
            <p className="mt-1 text-xs text-emerald-100/65">Sparas i databasen och kan visas i fastighetspresentationen när genomgången är kopplad till en fastighet.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/10" onClick={reset}>
              Ny genomgång
            </button>
            <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/10" onClick={exportNotes}>
              <Download className="h-4 w-4" /> Exportera anteckningar
            </button>
            <button type="button" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-lime-300 px-4 py-2.5 text-xs font-black text-[#173c32] transition hover:bg-lime-200 disabled:opacity-60" onClick={() => void saveWalkthrough()}>
              <Save className="h-4 w-4" /> {saving ? "Sparar…" : "Spara genomgång"}
            </button>
          </div>
        </div>
      </section>

      {localDrafts.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Det finns {localDrafts.length} utkast sparade i den här webbläsaren från tidigare.{" "}
          <button type="button" className="font-bold underline" onClick={() => void moveLocalDrafts()}>
            Flytta dem till databasen
          </button>
        </section>
      )}

      {saved.length > 0 && (
        <section className="rounded-2xl border border-emerald-950/10 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800"><Save className="h-[18px] w-[18px]" /></span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-emerald-700">Arkiv</p>
              <h2 className="text-lg font-extrabold text-[#173c32]">Sparade genomgångar</h2>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {saved.map((item) => (
              <div key={item.id} className={`group relative rounded-xl border p-3 transition hover:border-emerald-300 hover:bg-emerald-50/40 ${item.id === currentId ? "border-emerald-400 bg-emerald-50/50" : "border-slate-200"}`}>
                <button type="button" className="block w-full text-left" onClick={() => load(item)}>
                  <span className="flex items-start justify-between gap-2 pr-6">
                    <span className="font-extrabold text-[#173c32]">{item.property_name || "Namnlös fastighet"}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{MODE_LABEL[(item.visit_type as Mode) ?? "offer"]}</span>
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">{item.address || "Ingen adress angiven"}</span>
                  <span className="mt-2 block text-[10px] font-medium text-slate-400">
                    Besök {item.visit_date ?? "—"} · senast sparad {new Date(item.updated_at).toLocaleString("sv-SE")}
                  </span>
                </button>
                <button type="button" aria-label="Ta bort" className="absolute right-2 top-2 rounded p-1 text-slate-400 hover:text-rose-600" onClick={() => void deleteWalkthrough(item.id)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

export const Route = createFileRoute("/_authenticated/genomgang-av-fastighet")({
  component: GenomgangAvFastighetPage,
});
