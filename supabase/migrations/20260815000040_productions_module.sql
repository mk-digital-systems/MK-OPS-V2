-- Günlük ekip başı imalat kayıtları. Mevcut modüllerden bağımsızdır.
alter table public.company_manager_permissions
  add column if not exists productions_write boolean not null default false;

create table if not exists public.production_item_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) >= 2),
  unit text not null check (char_length(trim(unit)) >= 1),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.production_entries (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  team_leader_personnel_id uuid not null references public.personnel(id) on delete restrict,
  team_leader_name_snapshot text not null,
  source_work_plan_id uuid references public.daily_work_plans(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_entry_day_leader_unique unique(work_date, team_leader_personnel_id)
);

create table if not exists public.production_jobs (
  id uuid primary key default gen_random_uuid(),
  production_entry_id uuid not null references public.production_entries(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  project_name_snapshot text not null check (char_length(trim(project_name_snapshot)) >= 2),
  project_code_snapshot text,
  source text not null check (source in ('work_plan','manual')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.production_items (
  id uuid primary key default gen_random_uuid(),
  production_job_id uuid not null references public.production_jobs(id) on delete cascade,
  production_item_definition_id uuid references public.production_item_definitions(id) on delete set null,
  item_name_snapshot text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_snapshot text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_production_entries_date_leader on public.production_entries(work_date desc, team_leader_personnel_id);
create index if not exists idx_production_jobs_entry_order on public.production_jobs(production_entry_id, sort_order);
create index if not exists idx_production_items_job_order on public.production_items(production_job_id, sort_order);

drop trigger if exists production_definitions_set_updated_at on public.production_item_definitions;
create trigger production_definitions_set_updated_at before update on public.production_item_definitions
for each row execute function public.set_updated_at();
drop trigger if exists production_entries_set_updated_at on public.production_entries;
create trigger production_entries_set_updated_at before update on public.production_entries
for each row execute function public.set_updated_at();

alter table public.production_item_definitions enable row level security;
alter table public.production_entries enable row level security;
alter table public.production_jobs enable row level security;
alter table public.production_items enable row level security;
grant select on public.production_item_definitions, public.production_entries, public.production_jobs, public.production_items to authenticated;

drop policy if exists "production_definitions_select" on public.production_item_definitions;
drop policy if exists "production_entries_select" on public.production_entries;
drop policy if exists "production_jobs_select" on public.production_jobs;
drop policy if exists "production_items_select" on public.production_items;
drop policy if exists "production_definitions_write" on public.production_item_definitions;
create policy "production_definitions_select" on public.production_item_definitions for select to authenticated using (public.can_view_all());
create policy "production_entries_select" on public.production_entries for select to authenticated using (public.can_view_all());
create policy "production_jobs_select" on public.production_jobs for select to authenticated using (public.can_view_all());
create policy "production_items_select" on public.production_items for select to authenticated using (public.can_view_all());
create policy "production_definitions_write" on public.production_item_definitions for all to authenticated
using (public.has_module_write_permission('productions')) with check (public.has_module_write_permission('productions'));

create or replace function public.has_module_write_permission(p_module text)
returns boolean language sql stable security definer set search_path = public set row_security = off
as $$
  select case when public.current_user_role() = 'site_chief' then true
  when public.current_user_role() <> 'company_manager' then false
  else coalesce((select case p_module
    when 'projects' then projects_write when 'work_plans' then work_plans_write
    when 'personnel' then personnel_write when 'attendance' then attendance_write
    when 'vehicles' then vehicles_write when 'inventory' then inventory_write
    when 'custody' then custody_write when 'productions' then productions_write
    else false end from public.company_manager_permissions where user_id = auth.uid()), false) end;
$$;

create or replace function public.set_company_manager_permission(p_user_id uuid, p_module text, p_enabled boolean)
returns public.company_manager_permissions language plpgsql security definer
set search_path = public set row_security = off
as $$
declare v public.company_manager_permissions;
begin
  if not public.is_site_chief() then raise exception 'Bu işlem için şantiye şefi yetkisi gerekli' using errcode='42501'; end if;
  if p_module not in ('projects','work_plans','personnel','attendance','vehicles','inventory','custody','productions') then raise exception 'Geçersiz yetki alanı'; end if;
  insert into public.company_manager_permissions(user_id,updated_by) values(p_user_id,auth.uid()) on conflict(user_id) do nothing;
  update public.company_manager_permissions set
    projects_write=case when p_module='projects' then p_enabled else projects_write end,
    work_plans_write=case when p_module='work_plans' then p_enabled else work_plans_write end,
    personnel_write=case when p_module='personnel' then p_enabled else personnel_write end,
    attendance_write=case when p_module='attendance' then p_enabled else attendance_write end,
    vehicles_write=case when p_module='vehicles' then p_enabled else vehicles_write end,
    inventory_write=case when p_module='inventory' then p_enabled else inventory_write end,
    custody_write=case when p_module='custody' then p_enabled else custody_write end,
    productions_write=case when p_module='productions' then p_enabled else productions_write end,
    updated_by=auth.uid() where user_id=p_user_id returning * into v;
  return v;
end; $$;

create or replace function public.save_production_entry(
  p_entry_id uuid, p_work_date date, p_team_leader_personnel_id uuid,
  p_team_leader_name text, p_source_work_plan_id uuid, p_jobs jsonb
)
returns uuid language plpgsql security definer set search_path=public set row_security=off
as $$
declare v_entry_id uuid; v_job jsonb; v_item jsonb; v_job_id uuid; v_def public.production_item_definitions;
begin
  if not public.has_module_write_permission('productions') then raise exception 'İmalat yazma yetkisi gerekli' using errcode='42501'; end if;
  if p_source_work_plan_id is not null and not exists (
    select 1 from public.daily_work_plans plan join public.daily_work_plan_teams team on team.plan_id=plan.id
    where plan.id=p_source_work_plan_id and plan.plan_date=p_work_date
      and team.chief_personnel_id=p_team_leader_personnel_id
  ) then raise exception 'Personel seçilen tarihte kaynak iş planında ekip başı değil'; end if;
  if jsonb_array_length(coalesce(p_jobs,'[]'::jsonb))=0 then raise exception 'En az bir iş gerekli'; end if;
  insert into public.production_entries(id,work_date,team_leader_personnel_id,team_leader_name_snapshot,source_work_plan_id,created_by,updated_by)
  values(coalesce(p_entry_id,gen_random_uuid()),p_work_date,p_team_leader_personnel_id,trim(p_team_leader_name),p_source_work_plan_id,auth.uid(),auth.uid())
  on conflict(work_date,team_leader_personnel_id) do update set
    team_leader_name_snapshot=excluded.team_leader_name_snapshot, source_work_plan_id=coalesce(public.production_entries.source_work_plan_id,excluded.source_work_plan_id), updated_by=auth.uid()
  returning id into v_entry_id;
  delete from public.production_jobs where production_entry_id=v_entry_id;
  for v_job in select * from jsonb_array_elements(p_jobs) loop
    if char_length(trim(coalesce(v_job->>'project_name','')))<2 then raise exception 'Proje adı zorunlu'; end if;
    insert into public.production_jobs(production_entry_id,project_id,project_name_snapshot,project_code_snapshot,source,sort_order)
    values(v_entry_id,nullif(v_job->>'project_id','')::uuid,trim(v_job->>'project_name'),nullif(trim(v_job->>'project_code'),''),v_job->>'source',coalesce((v_job->>'sort_order')::int,0)) returning id into v_job_id;
    for v_item in select * from jsonb_array_elements(coalesce(v_job->'items','[]'::jsonb)) loop
      select * into v_def from public.production_item_definitions where id=(v_item->>'definition_id')::uuid;
      if not found then raise exception 'İmalat kalemi bulunamadı'; end if;
      insert into public.production_items(production_job_id,production_item_definition_id,item_name_snapshot,quantity,unit_snapshot,sort_order)
      values(v_job_id,v_def.id,v_def.name,(v_item->>'quantity')::numeric,v_def.unit,coalesce((v_item->>'sort_order')::int,0));
    end loop;
  end loop;
  return v_entry_id;
end; $$;

create or replace function public.delete_production_entry(p_entry_id uuid)
returns void language plpgsql security definer set search_path=public set row_security=off
as $$ begin
  if not public.has_module_write_permission('productions') then raise exception 'İmalat silme yetkisi gerekli' using errcode='42501'; end if;
  delete from public.production_entries where id=p_entry_id;
end; $$;
grant execute on function public.save_production_entry(uuid,date,uuid,text,uuid,jsonb) to authenticated;
grant execute on function public.delete_production_entry(uuid) to authenticated;
