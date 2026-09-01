-- ============================================================================
-- entreprenor-portal.sql
--
-- Tabellerna bakom den publika entreprenörssidan /mina-arenden: en entreprenör
-- utan inloggning skriver sin e-post, får en sexsiffrig engångskod i mejlen och
-- ser sedan sina tilldelade felanmälningar — och kan öppna och avsluta dem.
--
-- Kör den här filen för hand i Supabase SQL Editor, som resten av
-- supabase-functions/*.sql. Säker att köra om (allt är IF NOT EXISTS).
--
-- VARFÖR EN KOD OCH INTE BARA E-POSTEN
-- Den boendes /arendestatus får nöja sig med e-posten: den sidan bara *läser*,
-- och bara den boendes egna rader. Den här sidan skriver — den flyttar ett
-- ärendes livscykel — och visar dessutom anmälarens namn och telefonnummer. En
-- entreprenörs e-postadress står på varje faktura och visitkort, alltså är den
-- ingen hemlighet, och får därför inte ensam vara nyckeln till både registret
-- och knapparna. Koden bevisar att den som skriver adressen också läser den.
--
-- RLS PÅ, NOLL POLICIES = bara service_role kommer åt tabellerna. Det är rätt
-- här och motsäger inte varningen i CLAUDE.md om att aldrig slå på RLS: den
-- gäller *befintliga* tabeller som appen redan läser och skriver genom anon-
-- eller authenticated-rollen. De här två är nya och rörs uteslutande av
-- edge-funktionen entreprenor-portal, som kör med service role och går förbi
-- RLS. Ingen klient ska någonsin läsa dem: en kodhash i orätta händer är ett
-- inloggningsförsök, en sessionshash är en inloggning.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Engångskoder
-- ---------------------------------------------------------------------------
create table if not exists public.entreprenor_login_codes (
  id           uuid primary key default gen_random_uuid(),
  -- Normaliserad (lower(btrim(...))) — samma nyckel som kontokontinuiteten i
  -- account-continuity.sql använder, e-posten är det enda som överlever att en
  -- kontaktpost tas bort och skapas om.
  email        text        not null,
  -- Informativ. Sessionen slås upp på e-post, inte på den här, så en kontakt
  -- som tas bort och återskapas bryter inte en pågående inloggning.
  contact_id   uuid        references public.contacts(id) on delete set null,
  -- sha256(email || ':' || code). Koden i klartext lämnar aldrig funktionen
  -- annat än i själva mejlet.
  code_hash    text        not null,
  expires_at   timestamptz not null,
  attempts     integer     not null default 0,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- Uppslaget är alltid "senaste giltiga koden för den här adressen", och samma
-- index bär takräkningen (hur många koder som begärts den senaste timmen).
create index if not exists entreprenor_login_codes_email_idx
  on public.entreprenor_login_codes (email, created_at desc);

-- ---------------------------------------------------------------------------
-- Sessioner
-- ---------------------------------------------------------------------------
create table if not exists public.entreprenor_sessions (
  id           uuid primary key default gen_random_uuid(),
  -- Sessionen tillhör adressen, inte en enskild kontaktpost. Två kontakter kan
  -- dela e-post (dubbletter förekommer, se CLAUDE.md om contacts.profile_id),
  -- och då ska båda kontakternas ärenden synas i listan i stället för att en av
  -- dem tyst försvinner. Kontakt-id:na slås upp på nytt vid varje anrop.
  email        text        not null,
  -- sha256(token). Själva token finns bara i entreprenörens webbläsare.
  token_hash   text        not null unique,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists entreprenor_sessions_email_idx
  on public.entreprenor_sessions (email);

-- ---------------------------------------------------------------------------
-- Städning
-- ---------------------------------------------------------------------------
-- Anropas opportunistiskt av edge-funktionen när en ny kod begärs, så att inget
-- pg_cron-schema behöver sättas upp för det här. Utgångna rader är värdelösa
-- för allt utom att växa: en förbrukad kod går inte att använda igen och en
-- utgången session avvisas ändå vid uppslaget.
create or replace function public.purge_entreprenor_auth()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.entreprenor_login_codes where expires_at < now() - interval '7 days';
  delete from public.entreprenor_sessions    where expires_at < now() - interval '7 days';
end;
$$;

-- ---------------------------------------------------------------------------
-- Åtkomst
-- ---------------------------------------------------------------------------
alter table public.entreprenor_login_codes enable row level security;
alter table public.entreprenor_sessions    enable row level security;

-- Inga policies skapas med flit. Med RLS på och noll policies ser anon och
-- authenticated tomma tabeller oavsett vad de frågar efter, medan service_role
-- (edge-funktionen) går förbi RLS helt. REVOKE nedan är bältet till de
-- hängslena — utan det räcker ett framtida "grant select on all tables" i en
-- annan migration för att öppna dem igen.
revoke all on public.entreprenor_login_codes from anon, authenticated;
revoke all on public.entreprenor_sessions    from anon, authenticated;

-- Funktioner måste revokeas från PUBLIC, inte från anon/authenticated. En ny
-- funktion får automatiskt EXECUTE till PUBLIC, och den grant:en gäller varenda
-- roll — ett "revoke ... from anon" tar inte bort den, det tar bara bort en
-- grant som aldrig fanns. Utan raden nedan hade funktionen alltså varit
-- anropbar av vem som helst med anon-nyckeln, trots revoken. Den är
-- security definer och raderar rader; bara edge-funktionen ska kunna köra den.
revoke all on function public.purge_entreprenor_auth() from public;
grant execute on function public.purge_entreprenor_auth() to service_role;
