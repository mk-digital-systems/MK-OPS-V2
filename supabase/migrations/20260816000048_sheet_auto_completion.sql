alter table public.project_sheets
  add column if not exists is_completed boolean not null default false,
  add column if not exists completed_at date null;

create or replace function public.recalculate_project_sheet_completion(p_sheet_id uuid, p_date date default current_date)
returns void language plpgsql security definer set search_path=public as $$
declare s public.project_sheets; all_done boolean; total_sheets integer; completed_sheets integer;
begin
  select * into s from public.project_sheets where id=p_sheet_id;
  if not found then return; end if;
  all_done :=
    (not s.tracks_cable or (
      exists(select 1 from public.project_sheet_cables c where c.sheet_id=s.id) and
      not exists(
        select 1 from public.project_sheet_cables c where c.sheet_id=s.id and
        coalesce((select sum(p.quantity) from public.project_sheet_progress p where p.cable_id=c.id and p.stage='cable'),0) < c.quantity
      )
    )) and
    (not s.tracks_joint or exists(select 1 from public.project_sheet_progress p where p.sheet_id=s.id and p.stage='joint')) and
    (not s.tracks_obk or exists(select 1 from public.project_sheet_progress p where p.sheet_id=s.id and p.stage='obk')) and
    (not s.tracks_excavation or (
      exists(select 1 from public.project_sheet_progress p where p.sheet_id=s.id and p.stage='excavation_permit_waiting') and
      exists(select 1 from public.project_sheet_progress p where p.sheet_id=s.id and p.stage='excavation_waiting') and
      exists(select 1 from public.project_sheet_progress p where p.sheet_id=s.id and p.stage='excavation_done')
    ));

  update public.project_sheets set is_completed=all_done,
    completed_at=case when all_done then coalesce(completed_at,p_date) else null end
  where id=s.id;

  select count(*), count(*) filter(where is_completed)
    into total_sheets, completed_sheets from public.project_sheets where project_id=s.project_id;
  if total_sheets > 0 and completed_sheets = total_sheets then
    update public.projects set status='completed', completed_at=coalesce(completed_at,p_date)
    where id=s.project_id and project_type in ('BF','GF');
  else
    update public.projects set status='in_progress', is_archived=false, archived_at=null, completed_at=null,
      in_progress_at=coalesce(in_progress_at,p_date)
    where id=s.project_id and project_type in ('BF','GF') and status in ('waiting','completed');
  end if;
end; $$;

create or replace function public.refresh_sheet_completion_from_progress()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='DELETE' then perform public.recalculate_project_sheet_completion(old.sheet_id,old.progress_date); return old;
  else perform public.recalculate_project_sheet_completion(new.sheet_id,new.progress_date); return new; end if;
end; $$;
drop trigger if exists refresh_sheet_completion_from_progress on public.project_sheet_progress;
create trigger refresh_sheet_completion_from_progress after insert or update or delete on public.project_sheet_progress
for each row execute function public.refresh_sheet_completion_from_progress();

create or replace function public.refresh_sheet_completion_from_cable()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='DELETE' then perform public.recalculate_project_sheet_completion(old.sheet_id,current_date); return old;
  else perform public.recalculate_project_sheet_completion(new.sheet_id,current_date); return new; end if;
end; $$;
drop trigger if exists refresh_sheet_completion_from_cable on public.project_sheet_cables;
create trigger refresh_sheet_completion_from_cable after insert or update or delete on public.project_sheet_cables
for each row execute function public.refresh_sheet_completion_from_cable();

create or replace function public.refresh_sheet_completion_from_tracking()
returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.recalculate_project_sheet_completion(new.id,current_date); return new; end; $$;
drop trigger if exists refresh_sheet_completion_from_tracking on public.project_sheets;
create trigger refresh_sheet_completion_from_tracking
after update of tracks_cable,tracks_joint,tracks_obk,tracks_excavation on public.project_sheets
for each row execute function public.refresh_sheet_completion_from_tracking();

do $$ declare item record; begin
  for item in select id from public.project_sheets loop
    perform public.recalculate_project_sheet_completion(item.id,current_date);
  end loop;
end $$;
