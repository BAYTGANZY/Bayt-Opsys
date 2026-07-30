import { useMemo } from "react";
import { useMyArenden, type MyArendeKind } from "@/hooks/useMyArenden";

/**
 * Sidofältets statusprickar för entreprenören: en prick på Felanmälningar,
 * Besiktningar respektive Projekt så fort något i den sektionen är tilldelat
 * den inloggade — utan att hen behöver öppna sidan för att se det.
 *
 * Bygger uteslutande på useMyArenden, dvs. samma definition av "mina ärenden"
 * som Dag Rapport: `assigned_contact_id` = kontakten som är kopplad till
 * inloggningen. Ingen egen fråga och ingen egen scope-regel — vidgades den här
 * skulle sidofältet lova ärenden som sidan sedan inte visar.
 *
 * Bara entreprenörer får prickar. useMyContactId slår bara upp en kontakt för
 * rollen entreprenor, så för admin/styrelse körs ingen fråga alls och kartan är
 * tom — men rollen kontrolleras ändå explicit här.
 *
 * Färgen sätts inte här: `earliestDueDate` + `count` matas rakt in i den
 * befintliga <StatusDot>, samma prick som fastighetskorten och
 * sektionsknapparna redan använder. Två olika prickregler i samma app vore en
 * motsägelse; härledd status används bara till tooltipens text.
 */

export type ArendeDot = {
  /** Antal öppna (ej avslutade) ärenden av den typen som är tilldelade mig. */
  count: number;
  /** Närmaste tidsgräns i sektionen — StatusDot färgar efter den. */
  earliestDueDate: string | null;
  /** Svensk sammanfattning för title/aria — "3 felanmälningar · 1 försenad". */
  title: string;
};

const ROUTE_FOR_KIND: Record<MyArendeKind, string> = {
  issue: "/issues",
  inspection: "/inspections",
  project: "/projects",
};

const KIND_NOUN: Record<MyArendeKind, { one: string; many: string }> = {
  issue: { one: "felanmälan", many: "felanmälningar" },
  inspection: { one: "besiktning", many: "besiktningar" },
  project: { one: "projekt", many: "projekt" },
};

export function useMyArendeDots(): Record<string, ArendeDot> {
  const { arenden, isEntreprenor } = useMyArenden();

  return useMemo(() => {
    const dots: Record<string, ArendeDot> = {};
    if (!isEntreprenor) return dots;

    for (const kind of ["issue", "inspection", "project"] as MyArendeKind[]) {
      // Avslutade ärenden hör hemma i /avslutat, inte i en prick som säger
      // "här finns arbete". Avbrutna projekt räknas inte heller.
      const open = arenden.filter(
        (a) =>
          a.kind === kind &&
          a.lifecycle !== "avslutat" &&
          a.status.key !== "avslutat" &&
          a.status.key !== "avbruten",
      );
      if (open.length === 0) continue;

      const dues = open.map((a) => a.status.dueDate).filter((d): d is string => !!d);
      const noun = KIND_NOUN[kind];
      const forsenade = open.filter((a) => a.status.key === "forsenad").length;
      const bradskande = open.filter((a) => a.status.key === "bradskande").length;

      const parts = [`${open.length} ${open.length === 1 ? noun.one : noun.many} tilldelade dig`];
      if (forsenade > 0) parts.push(`${forsenade} försenad${forsenade === 1 ? "" : "e"}`);
      if (bradskande > 0) parts.push(`${bradskande} brådskande`);

      dots[ROUTE_FOR_KIND[kind]] = {
        count: open.length,
        earliestDueDate: dues.length > 0 ? dues.reduce((a, b) => (a < b ? a : b)) : null,
        title: parts.join(" · "),
      };
    }
    return dots;
  }, [arenden, isEntreprenor]);
}
