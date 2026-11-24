-- Sparar texten i det svar som skickats från plattformen, så styrelsen kan läsa det i efterhand.
alter table public.member_feedback add column if not exists reply_text text;
