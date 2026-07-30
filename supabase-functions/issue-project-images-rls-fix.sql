-- ============================================================================
-- FIX: issue_images / project_images RLS still checked the LEGACY assignment
-- columns (issues.assigned_to, projects.contractor_id — both point at
-- profiles) and, for styrelse on issue_images, the dead `property_access`
-- table (not used by frontend, see reset-testdata.sql). The rest of the
-- schema was already migrated to the assigned_contact_id -> contacts model
-- (issues.entreprenor_read, issues.styrelse_read, has_property_assignment(),
-- etc) but these two image tables were missed.
--
-- Effect of the bug: an admin uploads an image to a felanmalan/projekt, then
-- assigns it to an entreprenor via the real Ansvarig dropdown
-- (assigned_contact_id). The entreprenor could read the arende itself
-- (issues.entreprenor_read matches) but issue_images had no matching policy,
-- so the image row was invisible — RLS silently returned zero rows, same
-- failure shape as the "Öppna säger..." bug in CLAUDE.md's assertWritten()
-- section. Same story for styrelse via has_property_access(), which nothing
-- populates. project_images had no styrelse read policy at all.
--
-- Applied 2026-07-30 via mcp__supabase__apply_migration
-- (fix_issue_project_images_rls_use_contact_scope). Safe to re-run — every
-- CREATE POLICY is preceded by DROP POLICY IF EXISTS.
-- ============================================================================

DROP POLICY IF EXISTS "Contractor can read and upload images for assigned issues" ON public.issue_images;
CREATE POLICY "Contractor can read and upload images for assigned issues" ON public.issue_images
  FOR ALL
  USING (
    is_contractor() AND EXISTS (
      SELECT 1 FROM issues i
      WHERE i.id = issue_images.issue_id
        AND i.assigned_contact_id = my_contact_id()
    )
  );

DROP POLICY IF EXISTS "Styrelse can read and upload images for their issues" ON public.issue_images;
CREATE POLICY "Styrelse can read and upload images for their issues" ON public.issue_images
  FOR ALL
  USING (
    is_styrelse() AND EXISTS (
      SELECT 1 FROM issues i
      WHERE i.id = issue_images.issue_id
        AND i.property_id IN (SELECT my_property_ids())
    )
  );

DROP POLICY IF EXISTS "Contractor can upload images for assigned projects" ON public.project_images;
CREATE POLICY "Contractor can read and upload images for assigned projects" ON public.project_images
  FOR ALL
  USING (
    is_contractor() AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_images.project_id
        AND p.assigned_contact_id = my_contact_id()
    )
  );

-- project_images never had a styrelse read policy at all.
DROP POLICY IF EXISTS "Styrelse can read images for their projects" ON public.project_images;
CREATE POLICY "Styrelse can read images for their projects" ON public.project_images
  FOR SELECT
  USING (
    is_styrelse() AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_images.project_id
        AND p.property_id IN (SELECT my_property_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- VERIFY — read-only.
-- ---------------------------------------------------------------------------
SELECT tablename, policyname, cmd, qual
  FROM pg_policies
 WHERE tablename IN ('issue_images', 'project_images')
 ORDER BY tablename, policyname;
