-- ============================================================================
-- Projektbilder: låt admin + entreprenör LADDA UPP, alla tre roller SE.
--
-- Tabellsidan är redan klar (issue-project-images-rls-fix.sql, applicerad
-- 2026-07-30): entreprenören får skriva project_images-rader för projekt där
-- p.assigned_contact_id = my_contact_id(), styrelse har enbart SELECT. Men en
-- bilduppladdning har TVÅ skrivningar — raden i project_images OCH filen i
-- storage-bucketen `project-files` (storage.objects har egen RLS). Utan
-- policies här stannar entreprenörens uppladdning på steg 1 med
-- "Uppladdning misslyckades: new row violates row-level security policy",
-- och styrelsens/entreprenörens miniatyrer kan inte signeras (createSignedUrls
-- kräver SELECT på objektet) — trasiga bilder fast raden syns.
--
-- Sökvägskontraktet: klienten laddar alltid upp till `<project_id>/<filnamn>`
-- (`_authenticated.projects.$id.tsx`, handleUpload), så första mappen i
-- objektnyckeln ÄR projekt-id:t — (storage.foldername(name))[1]. Det är samma
-- behörighetsfråga som tabellpolicyn, ställd mot filen i stället för raden.
--
-- Permissiva policies OR:as ihop — det här kan bara vidga, aldrig strypa en
-- befintlig admin-policy. Säkert att köra om: DROP IF EXISTS före varje CREATE.
--
-- ⚠ EJ APPLICERAD ännu — körs för hand i Supabase SQL editor.
-- ============================================================================

-- Admin: allt i bucketen. (Defensivt — admin-uppladdning fungerar sannolikt
-- redan via en Lovable-genererad policy, men namnen på dem är oförutsägbara.)
DROP POLICY IF EXISTS "Admin full access to project-files" ON storage.objects;
CREATE POLICY "Admin full access to project-files" ON storage.objects
  FOR ALL
  USING (bucket_id = 'project-files' AND is_admin())
  WITH CHECK (bucket_id = 'project-files' AND is_admin());

-- Entreprenör: ladda upp + läsa filer för projekt tilldelade dem.
DROP POLICY IF EXISTS "Contractor upload to assigned project files" ON storage.objects;
CREATE POLICY "Contractor upload to assigned project files" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'project-files' AND is_contractor() AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.assigned_contact_id = my_contact_id()
    )
  );

DROP POLICY IF EXISTS "Contractor read assigned project files" ON storage.objects;
CREATE POLICY "Contractor read assigned project files" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'project-files' AND is_contractor() AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.assigned_contact_id = my_contact_id()
    )
  );

-- Styrelse: enbart läsa (spegel av project_images-policyn — läs-only by spec).
DROP POLICY IF EXISTS "Styrelse read project files in their buildings" ON storage.objects;
CREATE POLICY "Styrelse read project files in their buildings" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'project-files' AND is_styrelse() AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.property_id IN (SELECT my_property_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- VERIFY — läs-only.
-- 1) Bucketen finns (annars har inget här någon effekt):
SELECT id, public FROM storage.buckets WHERE id = 'project-files';
-- 2) Policyerna landade:
SELECT policyname, cmd, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects'
   AND policyname ILIKE '%project%file%'
 ORDER BY policyname;
