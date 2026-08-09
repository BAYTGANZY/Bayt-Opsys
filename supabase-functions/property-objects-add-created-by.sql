-- property_objects was missing created_by, unlike every other entity table
-- (properties, issues, inspections, projects, contacts...). The insert in
-- _authenticated.properties.$id.objects.new.tsx already wrote created_by,
-- causing "Could not find the 'created_by' column of 'property_objects' in
-- the schema cache". Already applied to the live DB 2026-08-08.

ALTER TABLE public.property_objects
  ADD COLUMN created_by UUID REFERENCES public.profiles(id);
