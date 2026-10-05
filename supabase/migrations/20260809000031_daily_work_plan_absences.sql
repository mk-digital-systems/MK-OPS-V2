-- Günlük İş Planı izinli/raporlu personel snapshot kayıtları.
-- Puantaj (attendance) modülünden tamamen bağımsızdır.

do $$
begin
  create type public.work_plan_absence_status as enum ('leave', 'sick_report');
exception
  when duplicate_object then null;
end
$$;

create table public.daily_work_plan_absences (
  id uuid primary key default gen_random_uuid(),
  work_plan_id uuid not null
    references public.daily_work_plans (id) on delete cascade,
  personnel_id uuid not null
    references public.personnel (id) on delete restrict,
  full_name text not null,
  status public.work_plan_absence_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dwp_absences_person_unique unique (work_plan_id, personnel_id),
  constraint dwp_absences_name_length
    check (char_length(trim(full_name)) >= 2)
);

comment on table public.daily_work_plan_absences is
  'Günlük iş planına özel izinli/raporlu personel snapshot kayıtları; puantajdan bağımsızdır';

create index idx_dwp_absences_work_plan
  on public.daily_work_plan_absences (work_plan_id);
create index idx_dwp_absences_personnel
  on public.daily_work_plan_absences (personnel_id);

alter table public.daily_work_plan_absences enable row level security;

create policy "dwp_absences_select_authenticated"
  on public.daily_work_plan_absences for select to authenticated
  using (true);

create policy "dwp_absences_insert_module_writer"
  on public.daily_work_plan_absences for insert to authenticated
  with check (public.has_module_write_permission('work_plans'));

create policy "dwp_absences_update_module_writer"
  on public.daily_work_plan_absences for update to authenticated
  using (public.has_module_write_permission('work_plans'))
  with check (public.has_module_write_permission('work_plans'));

create policy "dwp_absences_delete_module_writer"
  on public.daily_work_plan_absences for delete to authenticated
  using (public.has_module_write_permission('work_plans'));
