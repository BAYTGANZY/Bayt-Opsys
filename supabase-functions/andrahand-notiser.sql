-- Notiser för nya andrahandsansökningar (klockan i plattformen uppdateras direkt)
-- Körs EN gång för hand i Supabase → SQL Editor. Säker att köra om.
-- Utan den här filen fungerar klockan ändå — den uppdateras då var 60:e sekund och när fliken får fokus.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sublet_applications'
     ) then
    alter publication supabase_realtime add table public.sublet_applications;
  end if;
end $$;
