-- Alla svar som skickats på en synpunkt, så att tråden kan följas när den blir långdragen.
-- Skrivs bara av edge-funktionen submit-synpunkt (service role). Ingen klientskrivning.
create table if not exists public.member_feedback_replies (
  id           uuid primary key default gen_random_uuid(),
  feedback_id  uuid not null references public.member_feedback(id) on delete cascade,
  property_id  uuid not null,
  body         text not null,
  sent_to      text,
  copied_to    text,
  sent_by_name text,
  created_at   timestamptz not null default now()
);

create index if not exists member_feedback_replies_idx on public.member_feedback_replies (feedback_id, created_at);

alter table public.member_feedback_replies enable row level security;

drop policy if exists member_feedback_replies_select on public.member_feedback_replies;
create policy member_feedback_replies_select on public.member_feedback_replies for select to authenticated
  using ((select public.is_admin())
         or (public.is_styrelse() and property_id in (select public.my_property_ids())));

drop policy if exists member_feedback_replies_admin_delete on public.member_feedback_replies;
create policy member_feedback_replies_admin_delete on public.member_feedback_replies for delete to authenticated
  using ((select public.is_admin()));

revoke all on public.member_feedback_replies from anon;
grant select, delete on public.member_feedback_replies to authenticated;

do $$
begin
  if exists (select 1 from pg_proc where proname = 'is_medarbetare') then
    execute 'drop policy if exists medarbetare_select on public.member_feedback_replies';
    execute 'create policy medarbetare_select on public.member_feedback_replies for select to authenticated using (public.is_medarbetare())';
  end if;
end $$;
