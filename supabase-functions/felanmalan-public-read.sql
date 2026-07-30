-- Allows the public, no-login /felanmalan survey to populate its
-- Fastighet and Lägenhet dropdowns. Read-only, no sensitive columns
-- exposed beyond name/apartment number. Admin policies are untouched.

CREATE POLICY "Public can read property names for felanmalan form"
ON properties FOR SELECT TO anon
USING (true);

CREATE POLICY "Public can read apartment numbers for felanmalan form"
ON apartments FOR SELECT TO anon
USING (true);
