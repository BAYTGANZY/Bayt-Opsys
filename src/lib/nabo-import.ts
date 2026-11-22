// ---------------------------------------------------------------------------
// Nabo → lägenhetsregistret. Ren TypeScript, inget nätverk, så att reglerna går att köra och läsa för sig.
//
// Nabo kallar bostaden "Beteckning" ("1152, Vougts väg 7") och numrerar den på sitt eget sätt, inte efter
// folkbokföringen. Plattformen följer det numret: det står i lägenhetens Status ("Bostadsrätt nr 1152").
// Därför matchas en rad i Nabos fil mot `apartments` via numret i Status — aldrig via lägenhetsnummer/trappa.
//
// Reglerna (klientkrav 2026-11-22):
//  * Samma ägare kvar  → komplettera. Telefon och e-post som vi lagt in rörs ALDRIG, även om Nabo saknar dem.
//  * Ny ägare          → ersätt allt som hör till den förra: namn, telefon, e-post, in-/utflyttningsdatum.
//  * Plattformen tar aldrig bort en lägenhet eller en uppgift för att Nabo saknar den. Bara en NY ägare tömmer.
// ---------------------------------------------------------------------------

export type NaboMember = { name: string; entry: string | null };
export type NaboUnit = { number: string; address: string | null; members: NaboMember[] };

export type NaboParse = {
  units: Map<string, NaboUnit>;
  memberRows: number;
  warnings: string[];
};

/** Lägenheten så som importen behöver se den. */
export type AptRow = {
  id: string;
  apartment_number: string;
  trappa: string | null;
  status: string | null;
  tenant_name: string | null;
  tenant_phone: string | null;
  tenant_email: string | null;
  member_address?: string | null; // finns bara om member-address.sql körts
  move_in_date: string | null;
  move_out_date: string | null;
};

export type ChangeKind =
  | "ny_agare" // ingen i plattformens namn finns i Nabo → allt ersätts
  | "samma" // samma ägare (eller fler tillagda) → kompletteras
  | "delvis" // en del av ägarna är kvar, en del är borta → namn uppdateras, kontaktuppgifter behålls, kontrolleras
  | "ny_uppgift"; // plattformen hade ingen ägare inlagd → fylls i

export type Change = { field: string; label: string; from: string | null; to: string | null };

export type PlanRow = {
  apt: AptRow;
  unit: NaboUnit;
  kind: ChangeKind;
  changes: Change[];
  patch: Record<string, string | null>;
  flags: string[];
};

export type Plan = {
  rows: PlanRow[]; // bara de som faktiskt ändras
  unchanged: number;
  noApartment: NaboUnit[]; // finns i Nabo, saknar lägenhet i plattformen
  notInNabo: AptRow[]; // har ett nummer i Status men finns inte i Nabos lista — rörs inte
  noNumber: AptRow[]; // Status saknar "nr 1234" — kan inte matchas
  ambiguous: Array<{ number: string; apts: AptRow[] }>; // samma nummer på flera lägenheter — rörs inte
};

// ------------------------------------------------------------------------------------------------ CSV
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ø/gi, "o")
    .replace(/æ/gi, "ae")
    .replace(/ß/g, "ss")
    .toLowerCase();

/** "Strands, Sanne" → "Sanne Strands". Nabo skriver ibland Efternamn, Förnamn i Namn-kolumnen. */
export function cleanName(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim();
  const m = s.match(/^([^,]+),\s*([^,]+)$/);
  if (m) s = `${m[2].trim()} ${m[1].trim()}`;
  return s;
}

const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export function parseNabo(text: string): NaboParse {
  const warnings: string[] = [];
  const rows = parseCsv(text);
  if (rows.length < 2) return { units: new Map(), memberRows: 0, warnings: ["Filen verkar vara tom."] };
  const head = rows[0].map((h) => fold(h).trim());
  const col = (pred: (h: string) => boolean) => head.findIndex(pred);
  const cName = col((h) => h === "namn");
  const cEntry = col((h) => h.startsWith("intr")); // Inträdesdatum
  const cUnit = col((h) => h.includes("lgh") || h.includes("beteckning"));
  if (cName < 0 || cUnit < 0) {
    return { units: new Map(), memberRows: 0, warnings: ["Hittade inte kolumnerna Namn och Lgh.nr./Beteckning. Är det rätt fil från Nabo?"] };
  }
  const units = new Map<string, NaboUnit>();
  let memberRows = 0;
  for (const r of rows.slice(1)) {
    const name = cleanName(r[cName] ?? "");
    if (!name) continue;
    const entryRaw = (cEntry >= 0 ? r[cEntry] ?? "" : "").trim();
    const entry = isIsoDate(entryRaw) ? entryRaw : null;
    // En medlem kan äga flera bostäder: "1111, Vougts väg 7;1112, Vougts väg 7".
    const parts = (r[cUnit] ?? "").split(";").map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) { warnings.push(`${name}: saknar bostad i filen.`); continue; }
    memberRows++;
    for (const part of parts) {
      const m = part.match(/^\s*(\d+)\s*(?:,\s*(.*))?$/);
      if (!m) { warnings.push(`${name}: förstod inte "${part}".`); continue; }
      const number = m[1];
      const u = units.get(number) ?? { number, address: m[2]?.trim() || null, members: [] };
      if (!u.members.some((x) => fold(x.name) === fold(name))) u.members.push({ name, entry });
      units.set(number, u);
    }
  }
  for (const u of units.values()) u.members.sort((a, b) => (a.entry ?? "9999").localeCompare(b.entry ?? "9999") || a.name.localeCompare(b.name, "sv"));
  return { units, memberRows, warnings };
}

// ------------------------------------------------------------------------------------------ jämförelse
/** Numret i Status: "Bostadsrätt nr 1051" → "1051". Tål "nr.", "Nr", och stavfelet "bostasdsrätt nr 1032". */
export function unitNumberOfStatus(status: string | null | undefined): string | null {
  const m = (status ?? "").match(/\bnr\.?\s*(\d{1,6})\b/i);
  return m ? m[1] : null;
}

/** Plattformens fält kan innehålla flera personer: "Hekmatullah Osmanzai, Asmatullah Osmanzai". */
export function splitPersons(s: string | null | undefined): string[] {
  return (s ?? "")
    .split(/\s*(?:,|;|&|\/|\boch\b)\s*/i)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const tokens = (s: string) => fold(s).split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Samma person? Alla ord i det kortare namnet ska finnas i det längre ("Charles Kelly" = "Charles Kelly
 * Ifeanyichukwu", "Gulcan Celikli" = "Gülcan Çelikli"). Minst två ord, annars räcker inte ett förnamn.
 */
export function samePerson(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (short.length < 2) return short.join(" ") === long.join(" ");
  return short.every((t) => long.includes(t));
}

const orNull = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);

/** Datumet för en bostad: bara när alla medlemmar har samma, annars null (då rörs inget och det flaggas). */
function unitEntryDate(u: NaboUnit): { date: string | null; differing: boolean } {
  const ds = [...new Set(u.members.map((m) => m.entry).filter((d): d is string => !!d))];
  if (ds.length === 1) return { date: ds[0], differing: false };
  return { date: null, differing: ds.length > 1 };
}

function pushChange(changes: Change[], patch: Record<string, string | null>, field: string, label: string, from: string | null, to: string | null) {
  if ((from ?? null) === (to ?? null)) return;
  changes.push({ field, label, from, to });
  patch[field] = to;
}

export function planNaboImport(apts: AptRow[], units: Map<string, NaboUnit>): Plan {
  const byNumber = new Map<string, AptRow[]>();
  const noNumber: AptRow[] = [];
  for (const a of apts) {
    const n = unitNumberOfStatus(a.status);
    if (!n) { noNumber.push(a); continue; }
    byNumber.set(n, [...(byNumber.get(n) ?? []), a]);
  }

  const rows: PlanRow[] = [];
  const ambiguous: Plan["ambiguous"] = [];
  const notInNabo: AptRow[] = [];
  let unchanged = 0;

  for (const [number, list] of byNumber) {
    const unit = units.get(number);
    if (!unit) { notInNabo.push(...list); continue; }
    if (list.length > 1) { ambiguous.push({ number, apts: list }); continue; }
    const apt = list[0];

    const naboPersons = unit.members.map((m) => m.name);
    const platPersons = splitPersons(apt.tenant_name);
    const flags: string[] = [];
    const changes: Change[] = [];
    const patch: Record<string, string | null> = {};

    let kind: ChangeKind;
    if (platPersons.length === 0) kind = "ny_uppgift";
    else {
      const matchedPlat = platPersons.filter((p) => naboPersons.some((n) => samePerson(p, n)));
      if (matchedPlat.length === 0) kind = "ny_agare";
      else if (matchedPlat.length === platPersons.length) kind = "samma";
      else kind = "delvis";
    }

    // Samma ägare behåller vår ordning (vi byter bara stavning till Nabos och lägger till nya medägare), så att en
    // oförändrad lägenhet inte ändras bara för att Nabo sorterar efter inträdesdatum.
    let newName = naboPersons.join(", ");
    if (kind === "samma") {
      const used = new Set<string>();
      const kept = platPersons.map((p) => {
        const hit = naboPersons.find((n) => samePerson(p, n));
        if (hit) used.add(hit);
        return hit ?? p;
      });
      newName = [...kept, ...naboPersons.filter((n) => !used.has(n))].filter((n, i, all) => all.indexOf(n) === i).join(", ");
    }
    const { date, differing } = unitEntryDate(unit);
    if (differing) flags.push("Medlemmarna har olika inträdesdatum i Nabo — datumet rörs inte.");
    if (kind === "delvis") flags.push("Någon av de tidigare ägarna finns inte längre i Nabo. Kontakta- och telefonuppgifter är kvar — kontrollera dem.");
    if (kind === "samma" && naboPersons.length > platPersons.length) flags.push("Fler medlemmar i Nabo än hos oss — de läggs till i namnet.");
    if (/\bdb\b/i.test(newName)) flags.push("Dödsbo.");

    pushChange(changes, patch, "tenant_name", "Namn", orNull(apt.tenant_name), newName);
    if (kind === "ny_agare") {
      // Nya ägare: allt som hörde till den förra försvinner. Datumet sätts bara om Nabo vet det.
      pushChange(changes, patch, "tenant_phone", "Telefon", orNull(apt.tenant_phone), null);
      pushChange(changes, patch, "tenant_email", "E-post", orNull(apt.tenant_email), null);
      pushChange(changes, patch, "move_out_date", "Utflyttning", orNull(apt.move_out_date), null);
      pushChange(changes, patch, "move_in_date", "Inflyttning", orNull(apt.move_in_date), date);
    } else if (date) {
      pushChange(changes, patch, "move_in_date", "Inflyttning", orNull(apt.move_in_date), date);
    }

    // Medlemmens adress ur Nabo läggs i ett eget fält. Bostadens egen adress och allt annat som lagts in rörs aldrig,
    // och en tom adress i Nabo tar inte bort en befintlig. Fältet hoppas över om kolumnen inte finns än.
    if ("member_address" in apt && unit.address) {
      pushChange(changes, patch, "member_address", "Medlemmens adress", orNull(apt.member_address), unit.address);
    }

    if (changes.length === 0) { unchanged++; continue; }
    rows.push({ apt, unit, kind, changes, patch, flags });
  }

  const noApartment = [...units.values()].filter((u) => !byNumber.has(u.number)).sort((a, b) => Number(a.number) - Number(b.number));
  const order: Record<ChangeKind, number> = { ny_agare: 0, delvis: 1, ny_uppgift: 2, samma: 3 };
  rows.sort((a, b) => order[a.kind] - order[b.kind] || Number(a.unit.number) - Number(b.unit.number));
  return { rows, unchanged, noApartment, notInNabo, noNumber, ambiguous };
}
