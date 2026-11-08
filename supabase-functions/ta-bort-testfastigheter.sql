-- Ta bort testfastigheterna (Brf Test 1 / Brf Test 2). Brf RTB rörs aldrig.
-- STEG 1 är bara en förhandsvisning. Kör den först och skicka resultatet.
-- Kräver att admin-delete.sql redan körts (kaskad). Ta gärna en backup i Supabase först.

-- STEG 1: vad som skulle försvinna
SELECT p.id, p.name,
  (SELECT count(*) FROM apartments  a WHERE a.property_id = p.id) AS lagenheter,
  (SELECT count(*) FROM issues      i WHERE i.property_id = p.id) AS felanmalningar,
  (SELECT count(*) FROM inspections n WHERE n.property_id = p.id) AS besiktningar,
  (SELECT count(*) FROM projects    j WHERE j.property_id = p.id) AS projekt
FROM properties p
ORDER BY p.name;

-- STEG 2 (kör först när du sett att listan stämmer): raderar bara de två testfastigheterna.
-- Skyddet: namnet måste börja med 'Brf Test', så RTB kan aldrig matchas.
-- DELETE FROM properties WHERE name ILIKE 'Brf Test%' AND name NOT ILIKE '%RTB%';
