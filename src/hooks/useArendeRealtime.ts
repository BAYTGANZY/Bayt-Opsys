import { useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useMyContactIds } from "@/hooks/useMyContactId";
import { useMyArenden, type MyArendeKind } from "@/hooks/useMyArenden";

/**
 * Ett ärende som tilldelas mig ska synas medan jag står kvar på sidan.
 *
 * BUGGEN DET HÄR STÄNGER
 * `assigned_contact_id` skrivs av en admin i en helt annan webbläsare. Inget i
 * den här klienten vet om det: TanStack Query cachar "mina ärenden" tills något
 * invaliderar nyckeln, och de enda som gjorde det var livscykelknapparna — som
 * bara den inloggade själv trycker på. Följden var att en entreprenör fick logga
 * ut och in igen för att se ett ärende som tilldelats dem. Det var inte en
 * behörighetsfråga; raden fanns och RLS släppte fram den, den var bara aldrig
 * hämtad igen.
 *
 * TRE LAGER, med flit, för att inte hänga på en enda mekanism:
 *   1. Realtime (här) — reagerar på sekunden.
 *   2. `refetchOnWindowFocus` i useMyArenden/useMyContactIds — täcker den som
 *      byter flik tillbaka.
 *   3. `refetchInterval` i samma hookar — sista utvägen om Realtime inte är
 *      påslaget för tabellen i publikationen (`inspections` och `projects` är
 *      inte verifierade, `issues` används redan av AkutWatcher).
 *
 * Kanalen är OFILTRERAD, precis som AkutWatcher: Realtime kan inte filtrera på
 * en lista, och RLS begränsar strömmen ändå. Urvalet görs därför i klienten mot
 * useMyContactIds — samma regel som varje ärendelista använder, inklusive
 * delegerade kontakter.
 */

const ROUTE_FOR_KIND: Record<MyArendeKind, "/issues/$id" | "/inspections/$id" | "/projects/$id"> = {
  issue: "/issues/$id",
  inspection: "/inspections/$id",
  project: "/projects/$id",
};

const NOUN_FOR_KIND: Record<MyArendeKind, string> = {
  issue: "En felanmälan",
  inspection: "En besiktning",
  project: "Ett projekt",
};

/**
 * Cachenycklar som blir inaktuella när ett ärende byter tilldelning eller
 * status. Prefix, inte exakta nycklar — varje lista hänger sitt urval sist i
 * nyckeln och skulle annars behöva räknas upp här.
 *
 * TanStack hämtar bara om *monterade* frågor, så en nyckel ingen tittar på
 * kostar ingenting att invalidera. Listan får därför vara generös.
 */
const STALE_PREFIXES: string[][] = [
  ["mina-arenden"],
  ["byggnadens-arenden"],
  ["entreprenor-property-ids"],
  ["entreprenor-apartment-ids"],
  ["entreprenorer-delade"],
  ["issues"],
  ["inspections"],
  ["projects"],
  ["timeline"],
  ["section-overview-stats"],
  ["oppna-arenden-combined-stats"],
  ["properties-arende-status"],
  ["issues-open-badges"],
  ["apartments-urgency"],
];

export function useArendeRealtime() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { contactIds, isEntreprenor } = useMyContactIds();
  const { arenden, isLoading: arendenLoading } = useMyArenden();

  const mine = useMemo(() => new Set(contactIds ?? []), [contactIds]);

  /**
   * Ärenden vi redan visste var våra. `null` = ännu inte seedad, och då ska
   * ingen toast visas — annars hade första inloggningen poppat en ruta per
   * befintligt ärende.
   */
  const known = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (known.current !== null) return;
    if (!isEntreprenor || contactIds === undefined || arendenLoading) return;
    known.current = new Set(arenden.map((a) => `${a.kind}:${a.id}`));
  }, [arenden, arendenLoading, contactIds, isEntreprenor]);

  // Kontaktlistan byter identitet när den laddas om; en sträng som beroende gör
  // att kanalen inte rivs och byggs upp i onödan varje render.
  const idsKey = contactIds?.join(",") ?? "";

  useEffect(() => {
    const invalidate = () => {
      for (const prefix of STALE_PREFIXES) qc.invalidateQueries({ queryKey: prefix });
    };

    const handle = (kind: MyArendeKind, payload: { new?: Record<string, unknown> }) => {
      const row = payload.new ?? {};
      const id = typeof row.id === "string" ? row.id : null;

      // Admin och styrelse har inget kontakturval — deras listor är byggnads-
      // eller systemvida och blir inaktuella av vilken ändring som helst.
      if (!isEntreprenor) {
        invalidate();
        return;
      }
      if (!id) return;

      const assignedTo = typeof row.assigned_contact_id === "string" ? row.assigned_contact_id : null;
      const key = `${kind}:${id}`;
      const isMine = !!assignedTo && mine.has(assignedTo);

      if (!isMine) {
        // Ärendet kan ha flyttats *från* mig. Då ska det försvinna ur listan,
        // vilket kräver samma omhämtning som när det kommer in.
        if (known.current?.has(key)) {
          known.current.delete(key);
          invalidate();
        }
        return;
      }

      invalidate();

      // Toasten bara för något som inte redan var mitt — en statusändring på ett
      // ärende jag känner till ska inte annonseras som en ny tilldelning.
      if (known.current && !known.current.has(key)) {
        known.current.add(key);
        const title = typeof row.title === "string" && row.title.trim() ? row.title.trim() : null;
        toast.success(`${NOUN_FOR_KIND[kind]} har tilldelats dig${title ? `: ${title}` : ""}`, {
          style: { background: "#3D8A30", color: "#fff" },
          action: {
            label: "Visa",
            onClick: () => navigate({ to: ROUTE_FOR_KIND[kind], params: { id } }),
          },
        });
      }
    };

    const ch = supabase
      .channel("arende-assignments")
      .on("postgres_changes", { event: "*", schema: "public", table: "issues" }, (p) =>
        handle("issue", p as { new?: Record<string, unknown> }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "inspections" }, (p) =>
        handle("inspection", p as { new?: Record<string, unknown> }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, (p) =>
        handle("project", p as { new?: Record<string, unknown> }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
    // `mine` härleds ur idsKey; att lista Set:et självt skulle riva kanalen
    // varje gång kontaktfrågan hämtas om.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, navigate, isEntreprenor, idsKey]);
}
