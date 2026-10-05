-- Yeni ana türler ve HP odaklı pafta modeli.
update public.projects set project_type='HP_ODAKLI' where project_type in ('BF','GF');
update public.projects set project_type='KURUMSAL_TTVPN' where project_type='Kurumsal';

alter table public.projects add column if not exists progress_percent integer not null default 0
  check(progress_percent between 0 and 100);
alter table public.project_sheets
  add column if not exists sheet_no text null,
  add column if not exists address text null,
  add column if not exists notes text null,
  add column if not exists manual_status text not null default 'not_started';
alter table public.project_sheets drop constraint if exists project_sheets_manual_status_check;
alter table public.project_sheets add constraint project_sheets_manual_status_check
  check(manual_status in ('not_started','excavation_permit_waiting','in_progress','completed'));

update public.project_sheets set
  sheet_no=coalesce(sheet_no,name), address=coalesce(address,location),
  manual_status=case when is_completed then 'completed' else 'not_started' end;

create or replace function public.refresh_hp_focused_project()
returns trigger language plpgsql security definer set search_path=public as $$
declare p_id uuid; total_count integer; done_count integer; next_status public.project_status;
begin
  if tg_op='DELETE' then p_id:=old.project_id; else p_id:=new.project_id; end if;
  select count(*),count(*) filter(where manual_status='completed') into total_count,done_count
  from public.project_sheets where project_id=p_id;
  if total_count>0 and done_count=total_count then next_status:='completed';
  elsif exists(select 1 from public.project_sheets where project_id=p_id and manual_status='in_progress') then next_status:='in_progress';
  elsif exists(select 1 from public.project_sheets where project_id=p_id and manual_status='excavation_permit_waiting') then next_status:='excavation_permit_waiting';
  else next_status:='waiting'; end if;
  update public.projects set status=next_status, progress_percent=case when total_count=0 then 0 else round(done_count*100.0/total_count)::int end,
    is_archived=next_status='completed', archived_at=case when next_status='completed' then coalesce(archived_at,now()) else null end,
    completed_at=case when next_status='completed' then coalesce(completed_at,current_date) else null end
  where id=p_id and project_type='HP_ODAKLI';
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;
drop trigger if exists refresh_hp_focused_project on public.project_sheets;
create trigger refresh_hp_focused_project after insert or update or delete on public.project_sheets
for each row execute function public.refresh_hp_focused_project();

do $$ declare item record; begin
  for item in select id from public.project_sheets loop
    update public.project_sheets set manual_status=manual_status where id=item.id;
  end loop;
end $$;
