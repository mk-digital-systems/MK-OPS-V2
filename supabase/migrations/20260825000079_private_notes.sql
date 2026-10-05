-- Her kullanicinin yalnizca kendi gorebildigi gizli notlar.
create table if not exists public.private_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 150),
  content text not null default '' check (char_length(content) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_private_notes_owner_updated
  on public.private_notes(user_id, updated_at desc);

drop trigger if exists private_notes_set_updated_at on public.private_notes;
create trigger private_notes_set_updated_at before update on public.private_notes
for each row execute function public.set_updated_at();

alter table public.private_notes enable row level security;
revoke all on public.private_notes from anon, authenticated;
grant select, insert, update, delete on public.private_notes to authenticated;

drop policy if exists "private_notes_select_own" on public.private_notes;
create policy "private_notes_select_own" on public.private_notes for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
drop policy if exists "private_notes_insert_own" on public.private_notes;
create policy "private_notes_insert_own" on public.private_notes for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);
drop policy if exists "private_notes_update_own" on public.private_notes;
create policy "private_notes_update_own" on public.private_notes for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);
drop policy if exists "private_notes_delete_own" on public.private_notes;
create policy "private_notes_delete_own" on public.private_notes for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

