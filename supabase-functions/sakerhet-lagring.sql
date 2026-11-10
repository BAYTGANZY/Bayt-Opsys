-- Säkerhetsrättning 2026-11-10: lagringsbucketar (storage.objects)
-- Kör för hand i Supabase SQL Editor. Säker att köra om.
--
-- Fynd från granskningen:
--  1. "mf select"/"mf insert" jämförde foldername(p.name) -- p.name är FASTIGHETENS namn,
--     inte objektets. Villkoret blev aldrig sant, så styrelse nådde aldrig sina filer.
--     Sökvägen är <property_id>/<action_id>/<fil> (MaintenancePlan.tsx), så mappnivå 1 = property_id.
--  2. Vem som helst inloggad (även styrelse, som är skrivskyddad) kunde ladda upp till
--     documents / project-files / protocols, och ändra property-images.

-- 1. maintenance-files
DROP POLICY IF EXISTS "mf select" ON storage.objects;
CREATE POLICY "mf select" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'maintenance-files'
  AND ( is_admin()
        OR ( my_role() = 'styrelse'
             AND (storage.foldername(objects.name))[1] IN (SELECT my_property_ids()::text) ) )
);

DROP POLICY IF EXISTS "mf insert" ON storage.objects;
CREATE POLICY "mf insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'maintenance-files'
  AND ( is_admin()
        OR ( my_role() = 'styrelse'
             AND (storage.foldername(objects.name))[1] IN (SELECT my_property_ids()::text) ) )
);

-- 2. Uppladdning: bara admin och entreprenör (styrelse är läsande)
DROP POLICY IF EXISTS "Authenticated upload documents"           ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
CREATE POLICY "documents upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'documents' AND my_role() IN ('admin','entreprenor'));

DROP POLICY IF EXISTS "Authenticated users can upload project-files" ON storage.objects;
CREATE POLICY "project-files upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'project-files' AND my_role() IN ('admin','entreprenor'));

DROP POLICY IF EXISTS "Authenticated users can upload protocols" ON storage.objects;
CREATE POLICY "protocols upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'protocols' AND my_role() IN ('admin','entreprenor'));

-- 3. Fastighetsbilder: bara admin
DROP POLICY IF EXISTS "Auth upload property-images" ON storage.objects;
DROP POLICY IF EXISTS "Auth update property-images" ON storage.objects;
CREATE POLICY "property-images admin insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'property-images' AND is_admin());
CREATE POLICY "property-images admin update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'property-images' AND is_admin());

-- 4. Dubbletter av avatar-policyn (ingen funktionsändring)
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;

-- Kontroll
SELECT policyname, cmd FROM pg_policies
WHERE schemaname='storage' AND tablename='objects'
  AND (policyname ILIKE 'mf %' OR policyname ILIKE '%upload%' OR policyname ILIKE 'property-images%')
ORDER BY policyname;
