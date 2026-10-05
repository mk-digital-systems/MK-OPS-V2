-- Devam eden projelerde sorumlu ekip başı.
alter table public.projects
  add column if not exists current_team_leader_personnel_id uuid null references public.personnel(id) on delete set null,
  add column if not exists current_team_leader_name text null;
alter table public.project_sheets
  add column if not exists current_team_leader_personnel_id uuid null references public.personnel(id) on delete set null,
  add column if not exists current_team_leader_name text null;

-- HP projesinde en son güncellenen devam eden paftanın ekip başını projeye taşı.
create or replace function public.refresh_hp_focused_project()
returns trigger language plpgsql security definer set search_path=public as $$
declare p_id uuid; total_count integer; done_count integer; next_status public.project_status;
  finisher_id uuid; finisher_name text; leader_id uuid; leader_name text;
begin
  if tg_op='DELETE' then p_id:=old.project_id; else p_id:=new.project_id; end if;
  select count(*),count(*) filter(where manual_status='completed') into total_count,done_count
  from public.project_sheets where project_id=p_id;
  if total_count>0 and done_count=total_count then next_status:='completed';
  elsif exists(select 1 from public.project_sheets where project_id=p_id and manual_status='in_progress') then next_status:='in_progress';
  elsif exists(select 1 from public.project_sheets where project_id=p_id and manual_status='excavation_permit_waiting') then next_status:='excavation_permit_waiting';
  else next_status:='waiting'; end if;
  if next_status='completed' then
    if tg_op<>'DELETE' and new.manual_status='completed' then
      finisher_id:=new.completed_by_personnel_id; finisher_name:=new.completed_by_name;
    else
      select completed_by_personnel_id,completed_by_name into finisher_id,finisher_name from public.project_sheets
      where project_id=p_id and manual_status='completed' order by completed_at desc nulls last,updated_at desc limit 1;
    end if;
  elsif next_status='in_progress' then
    select current_team_leader_personnel_id,current_team_leader_name into leader_id,leader_name from public.project_sheets
    where project_id=p_id and manual_status='in_progress' order by updated_at desc limit 1;
  end if;
  update public.projects set status=next_status,
    progress_percent=case when total_count=0 then 0 else round(done_count*100.0/total_count)::int end,
    is_archived=next_status='completed',archived_at=case when next_status='completed' then coalesce(archived_at,now()) else null end,
    completed_at=case when next_status='completed' then coalesce(completed_at,current_date) else null end,
    completed_by_personnel_id=case when next_status='completed' then finisher_id else null end,
    completed_by_name=case when next_status='completed' then finisher_name else null end,
    current_team_leader_personnel_id=case when next_status='in_progress' then leader_id else null end,
    current_team_leader_name=case when next_status='in_progress' then leader_name else null end
  where id=p_id and project_type='HP_ODAKLI';
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;

-- BGFD'de son dolap ilerlemesini yapan ekip başı, devam eden projenin sorumlusudur.
create or replace function public.set_bgfd_current_team_leader()
returns trigger language plpgsql security definer set search_path=public as $$
declare p_id uuid;
begin
  select project_id into p_id from public.project_cabinets where id=new.cabinet_id;
  update public.projects set current_team_leader_personnel_id=new.team_leader_personnel_id,
    current_team_leader_name=new.team_leader_name
  where id=p_id and project_type='BGFD' and status<>'completed';
  return new;
end; $$;
drop trigger if exists bgfd_set_current_team_leader on public.project_cabinet_progress;
create trigger bgfd_set_current_team_leader after insert or update on public.project_cabinet_progress
for each row execute function public.set_bgfd_current_team_leader();

create or replace function public.set_project_completion_owner()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.status='completed' then
    new.current_team_leader_personnel_id:=null; new.current_team_leader_name:=null;
    if new.completed_by_name is null and new.project_type='BGFD' then
      select cp.team_leader_personnel_id,cp.team_leader_name into new.completed_by_personnel_id,new.completed_by_name
      from public.project_cabinet_progress cp join public.project_cabinets c on c.id=cp.cabinet_id
      where c.project_id=new.id and cp.stage='transfer' order by cp.progress_date desc,cp.created_at desc limit 1;
    end if;
  else
    new.completed_by_personnel_id:=null; new.completed_by_name:=null;
  end if;
  return new;
end; $$;

-- Mevcut devam eden kayıtlarda son ilerleme ekip başını geriye dönük doldur.
with latest as (
  select distinct on (sp.sheet_id) sp.sheet_id,sp.team_leader_personnel_id,sp.team_leader_name
  from public.project_sheet_progress sp order by sp.sheet_id,sp.progress_date desc,sp.created_at desc
)
update public.project_sheets s set current_team_leader_personnel_id=latest.team_leader_personnel_id,
  current_team_leader_name=latest.team_leader_name
from latest where latest.sheet_id=s.id and s.manual_status='in_progress' and s.current_team_leader_name is null;

with latest as (
  select distinct on (c.project_id) c.project_id,cp.team_leader_personnel_id,cp.team_leader_name
  from public.project_cabinet_progress cp join public.project_cabinets c on c.id=cp.cabinet_id
  order by c.project_id,cp.progress_date desc,cp.created_at desc
)
update public.projects p set current_team_leader_personnel_id=latest.team_leader_personnel_id,
  current_team_leader_name=latest.team_leader_name
from latest where latest.project_id=p.id and p.project_type='BGFD' and p.status='in_progress' and p.current_team_leader_name is null;
