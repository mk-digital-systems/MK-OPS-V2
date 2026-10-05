-- Proje > pafta > kablo > ilerleme hiyerarşisi.
alter table public.projects
  add column sheet_count integer null check (sheet_count is null or sheet_count > 0),
  add column hp_count integer null check (hp_count is null or hp_count >= 0),
  add column is_single_sheet boolean not null default false;

create table public.project_sheets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  hp_count integer null check (hp_count is null or hp_count >= 0),
  tracks_cable boolean not null default true,
  tracks_joint boolean not null default true,
  tracks_obk boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, name)
);

create table public.project_sheet_cables (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.project_sheets(id) on delete cascade,
  fiber_count integer not null check (fiber_count > 0),
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now()
);

create table public.project_sheet_progress (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.project_sheets(id) on delete cascade,
  cable_id uuid references public.project_sheet_cables(id) on delete cascade,
  stage text not null check (stage in ('cable','joint','obk','completed')),
  quantity integer not null default 1 check (quantity > 0),
  team_leader_personnel_id uuid references public.personnel(id) on delete set null,
  team_leader_name text not null,
  progress_date date not null default current_date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint cable_stage_requires_cable check (stage <> 'cable' or cable_id is not null)
);

create index project_sheets_project_idx on public.project_sheets(project_id);
create index project_sheet_cables_sheet_idx on public.project_sheet_cables(sheet_id);
create index project_sheet_progress_sheet_idx on public.project_sheet_progress(sheet_id, progress_date desc);

create or replace function public.validate_sheet_progress_quantity()
returns trigger language plpgsql set search_path = public as $$
declare available integer; used integer;
begin
  if new.stage = 'cable' then
    select quantity into available from public.project_sheet_cables
      where id = new.cable_id and sheet_id = new.sheet_id;
    if available is null then raise exception 'Seçilen kablo bu paftaya ait değil'; end if;
    select coalesce(sum(quantity), 0) into used from public.project_sheet_progress
      where cable_id = new.cable_id and stage = 'cable' and id is distinct from new.id;
    if used + new.quantity > available then
      raise exception 'Kablo ilerleme adedi tanımlı adedi aşamaz';
    end if;
  end if;
  return new;
end;
$$;
create trigger validate_sheet_progress_quantity before insert or update on public.project_sheet_progress
for each row execute function public.validate_sheet_progress_quantity();
create trigger project_sheets_set_updated_at before update on public.project_sheets
for each row execute function public.set_updated_at();

alter table public.project_sheets enable row level security;
alter table public.project_sheet_cables enable row level security;
alter table public.project_sheet_progress enable row level security;
create policy "project_sheets_authenticated" on public.project_sheets for all to authenticated using (true) with check (true);
create policy "project_sheet_cables_authenticated" on public.project_sheet_cables for all to authenticated using (true) with check (true);
create policy "project_sheet_progress_authenticated" on public.project_sheet_progress for all to authenticated using (true) with check (true);

comment on column public.projects.sheet_count is 'GF/BF için beklenen toplam pafta sayısı';
comment on column public.projects.hp_count is 'GF/BF proje geneli HP bilgisi';
comment on column public.projects.is_single_sheet is 'Pafta alanları proje içinde tek pafta olarak gösterilir';
