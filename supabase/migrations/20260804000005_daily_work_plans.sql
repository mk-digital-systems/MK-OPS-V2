-- =============================================================================
-- 00005 — Günlük İş Planı modülü (personnel + snapshot planlar)
-- Mevcut projects tablolarına dokunmaz.
-- =============================================================================

create table public.personnel (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  is_active boolean not null default true,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personnel_name_length check (char_length(trim(full_name)) >= 2)
);

comment on table public.personnel is 'İş planı personel listesi — ekibe kalıcı bağlı değil';

create index idx_personnel_active on public.personnel (is_active);
create index idx_personnel_name on public.personnel (full_name);
create index idx_personnel_name_trgm on public.personnel using gin (full_name gin_trgm_ops);

create table public.daily_work_plans (
  id uuid primary key default gen_random_uuid(),
  plan_date date not null,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_work_plans_date_unique unique (plan_date)
);

comment on table public.daily_work_plans is 'Günlük iş planı — tarih başına bir plan';

create index idx_daily_work_plans_date on public.daily_work_plans (plan_date desc);

create table public.daily_work_plan_teams (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.daily_work_plans (id) on delete cascade,
  sort_order integer not null default 0,
  project_code text not null,
  project_name text not null,
  team_type text not null,
  vehicle_plate text not null,
  chief_personnel_id uuid references public.personnel (id) on delete set null,
  chief_name text not null,
  chief_phone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dwp_teams_project_code check (char_length(trim(project_code)) >= 1),
  constraint dwp_teams_project_name check (char_length(trim(project_name)) >= 2),
  constraint dwp_teams_type check (char_length(trim(team_type)) >= 1),
  constraint dwp_teams_plate check (char_length(trim(vehicle_plate)) >= 1),
  constraint dwp_teams_chief_name check (char_length(trim(chief_name)) >= 2),
  constraint dwp_teams_chief_phone check (char_length(trim(chief_phone)) >= 7)
);

comment on table public.daily_work_plan_teams is 'Günlük plan ekipleri — proje/araç snapshot';
comment on column public.daily_work_plan_teams.chief_name is 'Ekip şefi adı snapshot';
comment on column public.daily_work_plan_teams.chief_phone is 'Ekip şefi telefon snapshot';

create index idx_dwp_teams_plan on public.daily_work_plan_teams (plan_id, sort_order);
create index idx_dwp_teams_project_code on public.daily_work_plan_teams (project_code);
create index idx_dwp_teams_type on public.daily_work_plan_teams (team_type);
create index idx_dwp_teams_plate on public.daily_work_plan_teams (vehicle_plate);
create index idx_dwp_teams_chief_name on public.daily_work_plan_teams (chief_name);
create index idx_dwp_teams_project_code_trgm on public.daily_work_plan_teams using gin (project_code gin_trgm_ops);
create index idx_dwp_teams_project_name_trgm on public.daily_work_plan_teams using gin (project_name gin_trgm_ops);

create table public.daily_work_plan_team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.daily_work_plan_teams (id) on delete cascade,
  sort_order integer not null default 0,
  personnel_id uuid references public.personnel (id) on delete set null,
  full_name text not null,
  phone text,
  is_chief boolean not null default false,
  created_at timestamptz not null default now(),
  constraint dwp_members_name check (char_length(trim(full_name)) >= 2)
);

comment on table public.daily_work_plan_team_members is 'Ekip personel snapshot — geçmiş planlar değişmez';
comment on column public.daily_work_plan_team_members.is_chief is 'true ise ilk sırada; WhatsApp etiket yazılmaz';
comment on column public.daily_work_plan_team_members.phone is 'Yalnız şef satırında WhatsApp çıktısına yazılır';

create index idx_dwp_members_team on public.daily_work_plan_team_members (team_id, sort_order);
create index idx_dwp_members_name on public.daily_work_plan_team_members (full_name);
create index idx_dwp_members_name_trgm on public.daily_work_plan_team_members using gin (full_name gin_trgm_ops);
create index idx_dwp_members_personnel on public.daily_work_plan_team_members (personnel_id);

create trigger personnel_set_updated_at
before update on public.personnel
for each row execute function public.set_updated_at();

create trigger daily_work_plans_set_updated_at
before update on public.daily_work_plans
for each row execute function public.set_updated_at();

create trigger daily_work_plan_teams_set_updated_at
before update on public.daily_work_plan_teams
for each row execute function public.set_updated_at();

-- RLS
alter table public.personnel enable row level security;
alter table public.daily_work_plans enable row level security;
alter table public.daily_work_plan_teams enable row level security;
alter table public.daily_work_plan_team_members enable row level security;

create policy "personnel_select_authenticated"
  on public.personnel for select to authenticated using (true);
create policy "personnel_insert_authenticated"
  on public.personnel for insert to authenticated
  with check (auth.uid() is not null);
create policy "personnel_update_authenticated"
  on public.personnel for update to authenticated using (true) with check (true);
create policy "personnel_delete_authenticated"
  on public.personnel for delete to authenticated using (true);

create policy "dwp_select_authenticated"
  on public.daily_work_plans for select to authenticated using (true);
create policy "dwp_insert_authenticated"
  on public.daily_work_plans for insert to authenticated
  with check (auth.uid() is not null);
create policy "dwp_update_authenticated"
  on public.daily_work_plans for update to authenticated using (true) with check (true);
-- DENEME SÜRECİ: sistem gerçek kullanıma geçtiğinde kısıtlanacak
create policy "dwp_delete_authenticated_temporary"
  on public.daily_work_plans for delete to authenticated
  using (auth.uid() is not null);

create policy "dwp_teams_select_authenticated"
  on public.daily_work_plan_teams for select to authenticated using (true);
create policy "dwp_teams_insert_authenticated"
  on public.daily_work_plan_teams for insert to authenticated
  with check (auth.uid() is not null);
create policy "dwp_teams_update_authenticated"
  on public.daily_work_plan_teams for update to authenticated using (true) with check (true);
create policy "dwp_teams_delete_authenticated"
  on public.daily_work_plan_teams for delete to authenticated using (true);

create policy "dwp_members_select_authenticated"
  on public.daily_work_plan_team_members for select to authenticated using (true);
create policy "dwp_members_insert_authenticated"
  on public.daily_work_plan_team_members for insert to authenticated
  with check (auth.uid() is not null);
create policy "dwp_members_update_authenticated"
  on public.daily_work_plan_team_members for update to authenticated using (true) with check (true);
create policy "dwp_members_delete_authenticated"
  on public.daily_work_plan_team_members for delete to authenticated using (true);

-- Öneri RPC
create or replace function public.get_team_type_suggestions(p_query text default '', p_limit int default 20)
returns table (value text)
language sql stable security invoker set search_path = public
as $$
  select distinct t.team_type as value
  from public.daily_work_plan_teams t
  where p_query = '' or t.team_type ilike '%' || p_query || '%'
  order by t.team_type
  limit greatest(1, least(p_limit, 50));
$$;

create or replace function public.get_vehicle_plate_suggestions(p_query text default '', p_limit int default 20)
returns table (value text)
language sql stable security invoker set search_path = public
as $$
  select distinct t.vehicle_plate as value
  from public.daily_work_plan_teams t
  where p_query = '' or t.vehicle_plate ilike '%' || p_query || '%'
  order by t.vehicle_plate
  limit greatest(1, least(p_limit, 50));
$$;

grant execute on function public.get_team_type_suggestions(text, int) to authenticated;
grant execute on function public.get_vehicle_plate_suggestions(text, int) to authenticated;
