-- Entreprenörer får bara ändra det som hör till deras uppgift på ett ärende.
-- RLS tillåter i dag UPDATE på hela raden för ett tilldelat ärende; den här triggern begränsar
-- vilka KOLUMNER en entreprenör får ändra. Admin och styrelse påverkas inte (styrelse kan ändå inte skriva).
-- Tillåtet: notis (contractor_note), klarmarkering (contractor_done_at), status/livscykel (knapparna),
-- deadline och tidsfält, prioritet (stämplas av appen när deadline ändras), viewed_at/updated_at.
-- Vill du släppa fler fält senare: lägg till namnet i listan nedan och kör filen igen. Säker att köra om.

CREATE OR REPLACE FUNCTION public.entreprenor_limit_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  allowed text[] := ARRAY[
    'contractor_note','contractor_done_at',
    'status','arende_status',
    'deadline','priority','next_due_date','last_completed_date','end_date',
    'viewed_at','updated_at'
  ];
BEGIN
  IF coalesce(public.my_role(), '') = 'entreprenor' THEN
    IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
      RAISE EXCEPTION 'Entreprenörer får bara ändra notis, deadline och status på ett ärende'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS entreprenor_limit_columns_trg ON public.issues;
CREATE TRIGGER entreprenor_limit_columns_trg BEFORE UPDATE ON public.issues
  FOR EACH ROW EXECUTE FUNCTION public.entreprenor_limit_columns();

DROP TRIGGER IF EXISTS entreprenor_limit_columns_trg ON public.inspections;
CREATE TRIGGER entreprenor_limit_columns_trg BEFORE UPDATE ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.entreprenor_limit_columns();

DROP TRIGGER IF EXISTS entreprenor_limit_columns_trg ON public.projects;
CREATE TRIGGER entreprenor_limit_columns_trg BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.entreprenor_limit_columns();
