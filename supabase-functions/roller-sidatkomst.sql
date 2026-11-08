-- Sidåtkomst per användare + en fastighet per styrelse. Additiv: ändrar ingen befintlig data.
-- Körs för hand i Supabase SQL Editor. Säker att köra om.

-- 1. Vilka sidor en användare får se. Ingen rad = rollens standard (som idag).
CREATE TABLE IF NOT EXISTS public.user_page_access (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  page_key   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, page_key)
);
ALTER TABLE public.user_page_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_page_access_select ON public.user_page_access;
CREATE POLICY user_page_access_select ON public.user_page_access
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS user_page_access_admin_write ON public.user_page_access;
CREATE POLICY user_page_access_admin_write ON public.user_page_access
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- 2. Förhandskontroll: finns styrelser med mer än en fastighet? (Ska vara 0 rader innan steg 3.)
SELECT profile_id, count(*) AS antal FROM public.styrelse_properties GROUP BY profile_id HAVING count(*) > 1;

-- 3. En fastighet per styrelse (kör först när steg 2 gav 0 rader).
CREATE UNIQUE INDEX IF NOT EXISTS styrelse_properties_one_per_profile ON public.styrelse_properties (profile_id);
