// Utskrift av en andrahandsansökan (och beslutet, när det finns) för signering och arkiv.
// Öppnar ett eget fönster med ren utskriftsvy — inget sparas, inget skickas.

export type PrintableApp = {
  reference: string;
  apartment_number: string;
  trappa: string | null;
  applicant_name: string;
  applicant_email: string;
  applicant_phone: string | null;
  tenant_name: string;
  tenant_contact: string | null;
  start_date: string;
  end_date: string;
  reason: string;
  reason_text: string | null;
  status: "ny" | "komplettering" | "godkand" | "nekad";
  decision_note: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  created_at: string;
};

export type Letterhead = {
  property_id: string;
  org_name?: string | null;
  org_number?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  logo_data?: string | null;
};

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const date = (iso: string | null) =>
  iso ? new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" }) : "—";

export function printSubletApplication(a: PrintableApp, propertyName: string, lh?: Letterhead | null): boolean {
  const decided = a.status === "godkand" || a.status === "nekad";
  const verdict = a.status === "godkand" ? "GODKÄND" : a.status === "nekad" ? "NEKAD" : null;
  const row = (k: string, v: string) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`;

  const contact = [lh?.address, lh?.phone, lh?.email, lh?.website].filter((x): x is string => !!x && !!x.trim());
  const orgName = lh?.org_name?.trim() || propertyName;
  const logo = lh?.logo_data && lh.logo_data.startsWith("data:image/") ? lh.logo_data : null;
  const head = `<div class="lh">${logo ? `<img src="${logo}" alt="">` : ""}<div><div class="lh-name">${esc(orgName)}</div>${lh?.org_number ? `<div>Org.nr ${esc(lh.org_number)}</div>` : ""}${contact.map((c) => `<div>${esc(c)}</div>`).join("")}</div></div>`;

  const html = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>Andrahandsuthyrning ${esc(a.reference)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body { font: 13.5px/1.55 Inter, Arial, sans-serif; color: #111; margin: 0; }
  h1 { font: 700 22px Outfit, Arial, sans-serif; margin: 0 0 2px; color: #0D2B1E; }
  .lh { display: flex; gap: 16px; align-items: center; border-bottom: 2px solid #0D2B1E; padding-bottom: 12px; margin-bottom: 18px; font-size: 12px; color: #444; }
  .lh img { max-height: 64px; max-width: 170px; object-fit: contain; }
  .lh-name { font: 700 15px Outfit, Arial, sans-serif; color: #111; }
  .sub { color: #555; margin-bottom: 18px; }
  h2 { font: 700 13px Outfit, Arial, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: #0D2B1E; margin: 22px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; width: 34%; font-weight: 600; color: #444; padding: 4px 8px 4px 0; vertical-align: top; }
  td { padding: 4px 0; }
  .verdict { margin-top: 6px; padding: 10px 14px; border: 2px solid ${a.status === "godkand" ? "#3D8A30" : "#C2334D"}; border-radius: 8px; font-weight: 700; font-size: 16px; color: ${a.status === "godkand" ? "#3D8A30" : "#C2334D"}; }
  .sign { display: flex; gap: 36px; margin-top: 54px; }
  .sign div { flex: 1; border-top: 1px solid #111; padding-top: 4px; font-size: 12px; color: #444; }
  .foot { margin-top: 30px; font-size: 11px; color: #777; }
  .bar { position: fixed; top: 10px; right: 10px; }
  .bar button { font: 600 14px Inter, Arial; padding: 8px 16px; border-radius: 8px; border: 0; background: #3D8A30; color: #fff; cursor: pointer; }
  @media print { .bar { display: none; } }
</style></head><body>
<div class="bar"><button onclick="window.print()">Skriv ut</button></div>
${head}
<h1>Andrahandsuthyrning</h1>
<div class="sub">${esc(propertyName)} · Ärende ${esc(a.reference)} · inkom ${date(a.created_at)}</div>

<h2>Lägenheten</h2>
<table>${row("Lägenhet", `${esc(a.apartment_number)}${a.trappa ? `, trappa ${esc(a.trappa)}` : ""}`)}</table>

<h2>Medlem som hyr ut</h2>
<table>${row("Namn", esc(a.applicant_name))}${row("E-post", esc(a.applicant_email))}${a.applicant_phone ? row("Telefon", esc(a.applicant_phone)) : ""}</table>

<h2>Hyresgäst</h2>
<table>${row("Namn", esc(a.tenant_name))}${a.tenant_contact ? row("Kontakt", esc(a.tenant_contact)) : ""}</table>

<h2>Uthyrningen</h2>
<table>${row("Period", `${date(a.start_date)} till ${date(a.end_date)}`)}${row("Skäl", esc(a.reason))}${a.reason_text ? row("Förklaring", esc(a.reason_text)) : ""}</table>

<h2>Styrelsens beslut</h2>
${
  decided
    ? `<div class="verdict">${verdict}</div>
<table style="margin-top:8px">${row("Beslutat av", esc(a.decided_by_name ?? "—"))}${row("Datum", date(a.decided_at))}${a.decision_note ? row("Meddelande", esc(a.decision_note)) : ""}</table>`
    : `<p style="color:#555">Inget beslut är fattat ännu. Utskriften är en kopia av ansökan.</p>`
}

<div class="sign">
  <div>Ort och datum</div>
  <div>Underskrift, styrelsen${a.decided_by_name ? ` (${esc(a.decided_by_name)})` : ""}</div>
</div>
${decided ? "" : `<div class="sign"><div>Underskrift, medlem</div><div>Underskrift, hyresgäst</div></div>`}

<div class="foot">Utskriven ${date(new Date().toISOString())}. Referens ${esc(a.reference)}.</div>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  return true;
}
