-- Medlemmens adress (från Nabo), skilt från bostadens egen adress. Körs för hand; säker att köra om.
alter table public.apartments add column if not exists member_address text;
