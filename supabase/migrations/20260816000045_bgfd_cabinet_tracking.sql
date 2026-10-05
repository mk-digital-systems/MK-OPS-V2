-- BGFD: proje > dolap > ilerleme hiyerarşisi.
create table if not exists public.project_cabinets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  cabinet_type text not null check (cabinet_type in ('T7','T9','T11','T21','T23')),
  cabinet_no integer not null check (cabinet_no > 0),
  name text not null,
  location text null,
  coordinates text null,
  tracks_excavation boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(project_id, cabinet_type, cabinet_no)
);

create table if not exists public.project_cabinet_progress (
  id uuid primary key default gen_random_uuid(),
  cabinet_id uuid not null references public.project_cabinets(id) on delete cascade,
  stage text not null check (stage in ('cable','excavation_permit_waiting','excavation_waiting','excavation_done','energy_cable','energy','cabinet_installation','joint','transfer')),
  cable_info text null,
  energy_cable_info text null,
  transfer_info text null,
  team_leader_personnel_id uuid references public.personnel(id) on delete set null,
  team_leader_name text not null,
  progress_date date not null default current_date,
  notes text null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.project_cabinet_progress
  add constraint cabinet_energy_cable_info_required check (stage <> 'energy_cable' or nullif(trim(energy_cable_info),'') is not null),
  add constraint cabinet_transfer_info_required check (stage <> 'transfer' or nullif(trim(transfer_info),'') is not null);

create index if not exists project_cabinets_project_idx on public.project_cabinets(project_id);
create index if not exists project_cabinet_progress_idx on public.project_cabinet_progress(cabinet_id, progress_date desc);
alter table public.project_cabinets enable row level security;
alter table public.project_cabinet_progress enable row level security;
drop policy if exists "project_cabinets_authenticated" on public.project_cabinets;
create policy "project_cabinets_authenticated" on public.project_cabinets for all to authenticated using (true) with check (true);
drop policy if exists "project_cabinet_progress_authenticated" on public.project_cabinet_progress;
create policy "project_cabinet_progress_authenticated" on public.project_cabinet_progress for all to authenticated using (true) with check (true);

create or replace function public.validate_bgfd_transfer()
returns trigger language plpgsql set search_path=public as $$
declare excavation_required boolean; missing_stage text;
begin
  if new.stage <> 'transfer' then return new; end if;
  select tracks_excavation into excavation_required from public.project_cabinets where id=new.cabinet_id;
  select required.stage into missing_stage from unnest(
    case when excavation_required
      then array['cable','excavation_done','energy_cable','energy','cabinet_installation','joint']
      else array['cable','energy_cable','energy','cabinet_installation','joint'] end
  ) required(stage)
  where not exists (select 1 from public.project_cabinet_progress p where p.cabinet_id=new.cabinet_id and p.stage=required.stage)
  limit 1;
  if missing_stage is not null then raise exception 'Aktarma öncesinde eksik aşama: %', missing_stage; end if;
  return new;
end; $$;
drop trigger if exists validate_bgfd_transfer on public.project_cabinet_progress;
create trigger validate_bgfd_transfer before insert or update on public.project_cabinet_progress
for each row execute function public.validate_bgfd_transfer();

create or replace function public.refresh_bgfd_project_status()
returns trigger language plpgsql security definer set search_path=public as $$
declare p_id uuid; total_count integer; transferred_count integer;
begin
  select project_id into p_id from public.project_cabinets where id = new.cabinet_id;
  select count(*) into total_count from public.project_cabinets where project_id = p_id;
  select count(*) into transferred_count from public.project_cabinets c
    where c.project_id = p_id and exists (
      select 1 from public.project_cabinet_progress cp where cp.cabinet_id=c.id and cp.stage='transfer'
    );
  if total_count > 0 and transferred_count = total_count then
    update public.projects set status='completed', completed_at=new.progress_date, tracks_obk=false where id=p_id and project_type='BGFD';
  else
    update public.projects set status='in_progress', in_progress_at=coalesce(in_progress_at,new.progress_date), tracks_obk=false where id=p_id and project_type='BGFD' and status='waiting';
  end if;
  return new;
end; $$;
drop trigger if exists refresh_bgfd_project_status on public.project_cabinet_progress;
create trigger refresh_bgfd_project_status after insert or update on public.project_cabinet_progress
for each row execute function public.refresh_bgfd_project_status();
