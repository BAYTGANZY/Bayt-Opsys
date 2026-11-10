-- Gör bucketen "documents" privat.
-- Appen signerar redan alla nedladdningar (createSignedUrl / useSignedFileUrls), och inga
-- mejl eller publika sidor använder de öppna länkarna, så inget i appen ska märkas.
-- Efteråt går filerna bara att nå via tidsbegränsade länkar för inloggade med rätt behörighet.
-- Kör i Supabase SQL Editor. Säker att köra om.

-- 1. Före: visa nuvarande läge
select id, public from storage.buckets where id = 'documents';

-- 2. Gör privat
update storage.buckets set public = false where id = 'documents';

-- 3. Efter: ska visa public = false
select id, public from storage.buckets where id = 'documents';

-- Ångra vid behov:
-- update storage.buckets set public = true where id = 'documents';
