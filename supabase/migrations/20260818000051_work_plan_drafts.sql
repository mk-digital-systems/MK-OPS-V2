create table public.daily_work_plan_drafts (
  id uuid primary key default gen_random_uuid(),
  plan_date date not null,
  notes text,
  teams jsonb not null default '[]'::jsonb,
  absences jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_daily_work_plan_drafts_updated
  on public.daily_work_plan_drafts (updated_at desc);

create trigger daily_work_plan_drafts_set_updated_at
before update on public.daily_work_plan_drafts
for each row execute function public.set_updated_at();

alter table public.daily_work_plan_drafts enable row level security;

create policy "work_plan_drafts_select" on public.daily_work_plan_drafts
  for select to authenticated using (true);
create policy "work_plan_drafts_insert" on public.daily_work_plan_drafts
  for insert to authenticated
  with check (public.has_module_write_permission('work_plans') and created_by = auth.uid());
create policy "work_plan_drafts_update" on public.daily_work_plan_drafts
  for update to authenticated
  using (public.has_module_write_permission('work_plans'))
  with check (public.has_module_write_permission('work_plans'));
create policy "work_plan_drafts_delete" on public.daily_work_plan_drafts
  for delete to authenticated
  using (public.has_module_write_permission('work_plans'));
