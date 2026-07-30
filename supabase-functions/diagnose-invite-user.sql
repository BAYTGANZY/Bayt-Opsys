-- Diagnostic only — run in Supabase SQL Editor and share the three results back.

-- 1) Does the trigger + function still exist?
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgname = 'on_auth_user_created';

-- 2) What does handle_new_user() actually do right now?
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'handle_new_user';

-- 3) Any NOT NULL columns on profiles with no default? These would break
--    the trigger's INSERT the moment they were added, if the trigger was
--    never updated to supply them.
SELECT column_name, is_nullable, column_default, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;
