create table if not exists public.attendance_month_notes (
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (year, month)
);

drop trigger if exists attendance_month_notes_set_updated_at on public.attendance_month_notes;
create trigger attendance_month_notes_set_updated_at
before update on public.attendance_month_notes
for each row execute function public.set_updated_at();

alter table public.attendance_month_notes enable row level security;
grant select, insert, update on public.attendance_month_notes to authenticated;

drop policy if exists "attendance_month_notes_select" on public.attendance_month_notes;
create policy "attendance_month_notes_select" on public.attendance_month_notes
for select to authenticated using (public.can_view_personnel_attendance());

drop policy if exists "attendance_month_notes_insert" on public.attendance_month_notes;
create policy "attendance_month_notes_insert" on public.attendance_month_notes
for insert to authenticated with check (public.has_module_write_permission('attendance'));

drop policy if exists "attendance_month_notes_update" on public.attendance_month_notes;
create policy "attendance_month_notes_update" on public.attendance_month_notes
for update to authenticated using (public.has_module_write_permission('attendance'))
with check (public.has_module_write_permission('attendance'));
