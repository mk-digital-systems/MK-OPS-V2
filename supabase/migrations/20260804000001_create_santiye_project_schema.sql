-- =============================================================================
-- MK Digital Systems — Şantiye Proje Takip Sistemi
-- Production schema v1
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

create type public.project_status as enum (
  'waiting',
  'in_progress',
  'excavation_permit_waiting',
  'delayed',
  'completed'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  role text not null default 'chief' check (role in ('chief', 'admin', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Uygulama kullanıcı profilleri';

create table public.app_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

comment on table public.app_settings is 'Uygulama ayarları (manuel proje türleri vb.)';

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  project_code text not null unique,
  name text not null,
  project_type text not null,
  location text not null,
  team_name text,
  description text,
  status public.project_status not null default 'waiting',
  received_at date,
  start_date date,
  estimated_end_date date,
  waiting_at date,
  in_progress_at date,
  excavation_permit_waiting_at date,
  delayed_at date,
  completed_at date,
  cable_pulled boolean,
  joint_done boolean,
  progress_notes text,
  is_archived boolean not null default false,
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_name_length check (char_length(trim(name)) >= 2),
  constraint projects_location_length check (char_length(trim(location)) >= 2),
  constraint projects_type_not_empty check (char_length(trim(project_type)) >= 1),
  constraint projects_code_not_empty check (char_length(trim(project_code)) >= 1)
);

comment on table public.projects is 'Şantiye projeleri — aşama takip';
comment on column public.projects.project_code is 'Firma tarafından verilen proje ID — manuel girilir';
comment on column public.projects.location is 'Manuel mevki alanı — sistem yorumlamaz';
comment on column public.projects.team_name is 'Geçici — çoklu ekip modülü gelene kadar kullanılmıyor';
comment on column public.projects.received_at is 'Projenin alındığı tarih — girişte girilir';
comment on column public.projects.waiting_at is 'Bekliyor aşamasına geçiş tarihi';
comment on column public.projects.in_progress_at is 'Devam Ediyor aşamasına geçiş tarihi';
comment on column public.projects.excavation_permit_waiting_at is 'Kazı İzni Bekliyor aşamasına geçiş tarihi';
comment on column public.projects.delayed_at is 'Gecikmiş aşamasına geçiş tarihi';
comment on column public.projects.completed_at is 'Bitiş tarihi — yalnız arşive (Tamamlandı) aktarımında işlenir';
comment on column public.projects.cable_pulled is 'true=çekildi, false=çekilmedi, null=belirtilmedi';
comment on column public.projects.joint_done is 'true=ek yapıldı, false=yapılmadı, null=belirtilmedi';
comment on column public.projects.progress_notes is 'Devam eden iş adımları açıklaması';
comment on column public.projects.is_archived is 'Tamamlanan projeler arşive alınır, silinmez';
comment on column public.projects.start_date is 'Kullanımdan kaldırıldı';
comment on column public.projects.estimated_end_date is 'Kullanımdan kaldırıldı';

-- Indexes
create index idx_projects_status_active on public.projects (status) where is_archived = false;
create index idx_projects_type on public.projects (project_type);
create index idx_projects_archived on public.projects (is_archived);
create index idx_projects_updated_at on public.projects (updated_at desc);
create index idx_projects_created_at on public.projects (created_at desc);
create index idx_projects_location on public.projects (location);
create index idx_projects_team_name on public.projects (team_name);
create index idx_projects_code on public.projects (project_code);
create index idx_projects_status_archived on public.projects (status, is_archived);
create index idx_projects_active_updated on public.projects (updated_at desc) where is_archived = false;
create index idx_projects_name_trgm on public.projects using gin (name gin_trgm_ops);
create index idx_projects_location_trgm on public.projects using gin (location gin_trgm_ops);
create index idx_projects_team_trgm on public.projects using gin (team_name gin_trgm_ops);
create index idx_projects_description_trgm on public.projects using gin (coalesce(description, '') gin_trgm_ops);
create index idx_projects_code_trgm on public.projects using gin (project_code gin_trgm_ops);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create trigger app_settings_set_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

create or replace function public.projects_archive_on_complete()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    new.is_archived := true;
    new.archived_at := coalesce(new.archived_at, now());
    new.completed_at := coalesce(new.completed_at, current_date);
  end if;
  return new;
end;
$$;

create trigger projects_archive_on_complete
before insert or update of status on public.projects
for each row execute function public.projects_archive_on_complete();

-- İlk kayıt = Bekliyor + aşama tarihleri
create or replace function public.projects_set_stage_dates()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'waiting';
    new.received_at := coalesce(new.received_at, current_date);
    new.waiting_at := coalesce(new.waiting_at, new.received_at, current_date);
    new.is_archived := false;
    new.archived_at := null;
    -- Girişte tahmini bitiş / tamamlanma işlenmez
    new.estimated_end_date := null;
    new.completed_at := null;
    new.start_date := null;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    case new.status
      when 'waiting' then
        new.waiting_at := coalesce(new.waiting_at, current_date);
      when 'in_progress' then
        new.in_progress_at := coalesce(new.in_progress_at, current_date);
      when 'excavation_permit_waiting' then
        new.excavation_permit_waiting_at :=
          coalesce(new.excavation_permit_waiting_at, current_date);
      when 'delayed' then
        new.delayed_at := coalesce(new.delayed_at, current_date);
      when 'completed' then
        -- Bitiş tarihi yalnız arşive aktarımda
        new.completed_at := coalesce(new.completed_at, current_date);
      else
        null;
    end case;
  end if;

  return new;
end;
$$;

create trigger projects_apply_stage_dates
before insert or update of status,
  waiting_at, in_progress_at, excavation_permit_waiting_at, delayed_at, completed_at
on public.projects
for each row execute function public.projects_set_stage_dates();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.app_settings (key, value)
values (
  'custom_project_types',
  jsonb_build_object(
    'custom_1', 'Özel Kategori 1',
    'custom_2', 'Özel Kategori 2',
    'custom_3', 'Özel Kategori 3',
    'custom_4', 'Özel Kategori 4'
  )
)
on conflict (key) do nothing;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.app_settings enable row level security;

create policy "profiles_select_authenticated"
  on public.profiles for select to authenticated
  using (true);

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "projects_select_authenticated"
  on public.projects for select to authenticated
  using (true);

create policy "projects_insert_authenticated"
  on public.projects for insert to authenticated
  with check (auth.uid() is not null);

create policy "projects_update_authenticated"
  on public.projects for update to authenticated
  using (true)
  with check (true);

create policy "projects_delete_authenticated"
  on public.projects for delete to authenticated
  using (true);

create policy "app_settings_select_authenticated"
  on public.app_settings for select to authenticated
  using (true);

create policy "app_settings_update_authenticated"
  on public.app_settings for update to authenticated
  using (true)
  with check (true);

create policy "app_settings_insert_authenticated"
  on public.app_settings for insert to authenticated
  with check (auth.uid() is not null);

create or replace function public.get_location_suggestions(p_query text default '', p_limit int default 20)
returns table (value text)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct p.location as value
  from public.projects p
  where p_query = '' or p.location ilike '%' || p_query || '%'
  order by p.location
  limit greatest(1, least(p_limit, 50));
$$;

create or replace function public.get_team_suggestions(p_query text default '', p_limit int default 20)
returns table (value text)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct p.team_name as value
  from public.projects p
  where p_query = '' or p.team_name ilike '%' || p_query || '%'
  order by p.team_name
  limit greatest(1, least(p_limit, 50));
$$;

grant execute on function public.get_location_suggestions(text, int) to authenticated;
grant execute on function public.get_team_suggestions(text, int) to authenticated;

create or replace function public.get_dashboard_stats()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'total',
      (select count(*)::int from public.projects where is_archived = false),
    'waiting',
      (select count(*)::int from public.projects where is_archived = false and status = 'waiting'),
    'in_progress',
      (select count(*)::int from public.projects where is_archived = false and status = 'in_progress'),
    'excavation_permit_waiting',
      (select count(*)::int from public.projects where is_archived = false and status = 'excavation_permit_waiting'),
    'delayed',
      (select count(*)::int from public.projects where is_archived = false and status = 'delayed'),
    'completed',
      (select count(*)::int from public.projects where status = 'completed'),
    'archived',
      (select count(*)::int from public.projects where is_archived = true)
  );
$$;

grant execute on function public.get_dashboard_stats() to authenticated;
