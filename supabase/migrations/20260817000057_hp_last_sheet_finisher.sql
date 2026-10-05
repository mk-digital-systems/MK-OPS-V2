-- Projeyi bitiren ekip başı, projeyi kapatan son paftanın ekip başıdır.
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
