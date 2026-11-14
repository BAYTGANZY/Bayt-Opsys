-- Digitalt intyg för godkänd andrahandsuthyrning: verifieringskod som en myndighet kan kontrollera på /verifiera.
-- Körs för hand i Supabase SQL Editor. Säker att köra om.
alter table public.sublet_applications add column if not exists verify_code text;
create unique index if not exists sublet_applications_verify_code_uidx
  on public.sublet_applications (verify_code) where verify_code is not null;
