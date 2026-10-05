alter table public.project_cabinets
  add column if not exists is_completed boolean not null default false,
  add column if not exists completed_at date null;

create or replace function public.validate_bgfd_transfer()
returns trigger language plpgsql set search_path=public as $$
declare excavation_required boolean; missing_stage text;
begin
  if new.stage <> 'transfer' then return new; end if;
  select tracks_excavation into excavation_required from public.project_cabinets where id=new.cabinet_id;
  select required.stage into missing_stage from unnest(
    case when excavation_required
      then array['cable','excavation_permit_waiting','excavation_waiting','excavation_done','energy_cable','energy','cabinet_installation','joint']
      else array['cable','energy_cable','energy','cabinet_installation','joint'] end
  ) required(stage)
  where not exists (select 1 from public.project_cabinet_progress p where p.cabinet_id=new.cabinet_id and p.stage=required.stage)
  limit 1;
  if missing_stage is not null then raise exception 'Aktarma öncesinde eksik aşama: %', missing_stage; end if;
  return new;
end; $$;

create or replace function public.refresh_bgfd_cabinet_completion()
returns trigger language plpgsql security definer set search_path=public as $$
declare excavation_required boolean; all_done boolean;
begin
  select tracks_excavation into excavation_required
  from public.project_cabinets where id=new.cabinet_id;

  select
    exists(select 1 from public.project_cabinet_progress where cabinet_id=new.cabinet_id and stage='cable') and
    exists(select 1 from public.project_cabinet_progress where cabinet_id=new.cabinet_id and stage='energy_cable') and
    exists(select 1 from public.project_cabinet_progress where cabinet_id=new.cabinet_id and stage='energy') and
    exists(select 1 from public.project_cabinet_progress where cabinet_id=new.cabinet_id and stage='cabinet_installation') and
    exists(select 1 from public.project_cabinet_progress where cabinet_id=new.cabinet_id and stage='joint') and
    exists(select 1 from public.project_cabinet_progress where cabinet_id=new.cabinet_id and stage='transfer') and
    (not excavation_required or (
      exists(select 1 from public.project_cabinet_progress where cabinet_id=new.cabinet_id and stage='excavation_permit_waiting') and
      exists(select 1 from public.project_cabinet_progress where cabinet_id=new.cabinet_id and stage='excavation_waiting') and
      exists(select 1 from public.project_cabinet_progress where cabinet_id=new.cabinet_id and stage='excavation_done')
    )) into all_done;

  update public.project_cabinets
  set is_completed=all_done,
      completed_at=case when all_done then coalesce(completed_at,new.progress_date) else null end
  where id=new.cabinet_id;
  return new;
end; $$;

drop trigger if exists refresh_bgfd_cabinet_completion on public.project_cabinet_progress;
create trigger refresh_bgfd_cabinet_completion
after insert or update on public.project_cabinet_progress
for each row execute function public.refresh_bgfd_cabinet_completion();

-- Daha önce bütün aşamaları girilmiş dolapları da tamamla.
update public.project_cabinets c set
  is_completed=true,
  completed_at=coalesce(c.completed_at, current_date)
where exists(select 1 from public.project_cabinet_progress p where p.cabinet_id=c.id and p.stage='cable')
  and exists(select 1 from public.project_cabinet_progress p where p.cabinet_id=c.id and p.stage='energy_cable')
  and exists(select 1 from public.project_cabinet_progress p where p.cabinet_id=c.id and p.stage='energy')
  and exists(select 1 from public.project_cabinet_progress p where p.cabinet_id=c.id and p.stage='cabinet_installation')
  and exists(select 1 from public.project_cabinet_progress p where p.cabinet_id=c.id and p.stage='joint')
  and exists(select 1 from public.project_cabinet_progress p where p.cabinet_id=c.id and p.stage='transfer')
  and (not c.tracks_excavation or (
    exists(select 1 from public.project_cabinet_progress p where p.cabinet_id=c.id and p.stage='excavation_permit_waiting')
    and exists(select 1 from public.project_cabinet_progress p where p.cabinet_id=c.id and p.stage='excavation_waiting')
    and exists(select 1 from public.project_cabinet_progress p where p.cabinet_id=c.id and p.stage='excavation_done')
  ));

create or replace function public.refresh_bgfd_project_status()
returns trigger language plpgsql security definer set search_path=public as $$
declare p_id uuid; total_count integer; completed_count integer;
begin
  select project_id into p_id from public.project_cabinets where id=new.cabinet_id;
  select count(*), count(*) filter(where is_completed)
    into total_count, completed_count from public.project_cabinets where project_id=p_id;
  if total_count > 0 and completed_count=total_count then
    update public.projects set status='completed', completed_at=coalesce(completed_at,new.progress_date), tracks_obk=false
    where id=p_id and project_type='BGFD';
  else
    update public.projects set status='in_progress', in_progress_at=coalesce(in_progress_at,new.progress_date),
      is_archived=false, archived_at=null, completed_at=null, tracks_obk=false
    where id=p_id and project_type='BGFD' and status in ('waiting','completed');
  end if;
  return new;
end; $$;

update public.projects p set status='in_progress', is_archived=false, archived_at=null, completed_at=null
where p.project_type='BGFD' and p.status='completed' and exists (
  select 1 from public.project_cabinets c where c.project_id=p.id and not c.is_completed
);
