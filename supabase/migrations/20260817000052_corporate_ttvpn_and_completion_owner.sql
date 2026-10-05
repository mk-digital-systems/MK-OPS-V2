-- Kurumsal TTVPN sade takip alanları ve proje bitiren ekip başı bilgisi.
alter table public.projects
  add column if not exists project_date date null,
  add column if not exists priority_order integer null check (priority_order is null or priority_order > 0),
  add column if not exists completed_by_personnel_id uuid null references public.personnel(id) on delete set null,
  add column if not exists completed_by_name text null;

alter table public.project_sheets
  add column if not exists completed_by_personnel_id uuid null references public.personnel(id) on delete set null,
  add column if not exists completed_by_name text null;

create index if not exists idx_projects_ttvpn_priority
  on public.projects(priority_order asc, created_at asc)
  where project_type='KURUMSAL_TTVPN' and is_archived=false and priority_order is not null;

-- Kurumsal TTVPN durumu kullanıcı tarafından yönetilir; eski otomatik aşama hesabına girmez.
drop trigger if exists projects_derive_automatic_status on public.projects;
create trigger projects_derive_automatic_status
before insert or update of received_at,tracks_obk,obk_pulled,joint_done,cable_pulled,tracks_excavation,excavation_done
on public.projects for each row
when (new.project_type <> 'KURUMSAL_TTVPN')
execute function public.projects_derive_automatic_status();

-- HP projesini son tamamlanan paftanın ekip başıyla kapat.
create or replace function public.refresh_hp_focused_project()
returns trigger language plpgsql security definer set search_path=public as $$
declare p_id uuid; total_count integer; done_count integer; next_status public.project_status;
  finisher_id uuid; finisher_name text;
begin
  if tg_op='DELETE' then p_id:=old.project_id; else p_id:=new.project_id; end if;
  select count(*),count(*) filter(where manual_status='completed') into total_count,done_count
  from public.project_sheets where project_id=p_id;
  if total_count>0 and done_count=total_count then next_status:='completed';
  elsif exists(select 1 from public.project_sheets where project_id=p_id and manual_status='in_progress') then next_status:='in_progress';
  elsif exists(select 1 from public.project_sheets where project_id=p_id and manual_status='excavation_permit_waiting') then next_status:='excavation_permit_waiting';
  else next_status:='waiting'; end if;
  if next_status='completed' then
    select completed_by_personnel_id,completed_by_name into finisher_id,finisher_name
    from public.project_sheets where project_id=p_id and manual_status='completed'
    order by completed_at desc nulls last,updated_at desc limit 1;
  end if;
  update public.projects set status=next_status,
    progress_percent=case when total_count=0 then 0 else round(done_count*100.0/total_count)::int end,
    is_archived=next_status='completed', archived_at=case when next_status='completed' then coalesce(archived_at,now()) else null end,
    completed_at=case when next_status='completed' then coalesce(completed_at,current_date) else null end,
    completed_by_personnel_id=case when next_status='completed' then finisher_id else null end,
    completed_by_name=case when next_status='completed' then finisher_name else null end
  where id=p_id and project_type='HP_ODAKLI';
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;

-- BGFD tamamlandığında son aktarımı yapan ekip başını proje bitiren olarak kaydet.
create or replace function public.set_project_completion_owner()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.status='completed' and new.completed_by_name is null and new.project_type='BGFD' then
    select cp.team_leader_personnel_id,cp.team_leader_name
      into new.completed_by_personnel_id,new.completed_by_name
    from public.project_cabinet_progress cp
    join public.project_cabinets c on c.id=cp.cabinet_id
    where c.project_id=new.id and cp.stage='transfer'
    order by cp.progress_date desc,cp.created_at desc limit 1;
  end if;
  if new.status<>'completed' then
    new.completed_by_personnel_id:=null; new.completed_by_name:=null;
  end if;
  return new;
end; $$;
drop trigger if exists projects_set_completion_owner on public.projects;
create trigger projects_set_completion_owner before update of status on public.projects
for each row execute function public.set_project_completion_owner();

-- Daha önce tamamlanmış HP/BGFD kayıtlarında mevcut son işlemden ekip başını doldur.
with latest as (
  select distinct on (ps.project_id) ps.project_id,ps.completed_by_personnel_id,ps.completed_by_name
  from public.project_sheets ps
  where ps.is_completed and ps.completed_by_name is not null
  order by ps.project_id,ps.completed_at desc nulls last,ps.updated_at desc
)
update public.projects p set completed_by_personnel_id=latest.completed_by_personnel_id,completed_by_name=latest.completed_by_name
from latest where latest.project_id=p.id and p.project_type='HP_ODAKLI' and p.status='completed' and p.completed_by_name is null;

with latest as (
  select distinct on (c.project_id) c.project_id,cp.team_leader_personnel_id,cp.team_leader_name
  from public.project_cabinet_progress cp join public.project_cabinets c on c.id=cp.cabinet_id
  where cp.stage='transfer'
  order by c.project_id,cp.progress_date desc,cp.created_at desc
)
update public.projects p set completed_by_personnel_id=latest.team_leader_personnel_id,completed_by_name=latest.team_leader_name
from latest where latest.project_id=p.id and p.project_type='BGFD' and p.status='completed' and p.completed_by_name is null;
