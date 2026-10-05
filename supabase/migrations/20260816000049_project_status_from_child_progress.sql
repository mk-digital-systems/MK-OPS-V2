-- Proje durumu artık proje altındaki pafta/dolap ilerlemelerini de dikkate alır.
create or replace function public.projects_derive_automatic_status()
returns trigger language plpgsql set search_path=public as $$
declare
  v_all_required_steps_done boolean;
  v_has_started_step boolean;
  v_sheet_count integer;
  v_completed_sheet_count integer;
  v_cabinet_count integer;
  v_completed_cabinet_count integer;
begin
  new.received_at := coalesce(new.received_at,current_date);

  select count(*),count(*) filter(where is_completed)
    into v_sheet_count,v_completed_sheet_count
  from public.project_sheets where project_id=new.id;
  select count(*),count(*) filter(where is_completed)
    into v_cabinet_count,v_completed_cabinet_count
  from public.project_cabinets where project_id=new.id;

  v_has_started_step :=
    new.obk_pulled is true or new.joint_done is true or new.cable_pulled is true or
    exists(select 1 from public.project_sheet_progress sp join public.project_sheets s on s.id=sp.sheet_id where s.project_id=new.id) or
    exists(select 1 from public.project_cabinet_progress cp join public.project_cabinets c on c.id=cp.cabinet_id where c.project_id=new.id);

  if new.project_type='BGFD' and v_cabinet_count>0 then
    v_all_required_steps_done := v_completed_cabinet_count=v_cabinet_count;
  elsif v_sheet_count>0 then
    v_all_required_steps_done := v_completed_sheet_count=v_sheet_count;
  else
    v_all_required_steps_done := new.joint_done is true and new.cable_pulled is true
      and (not new.tracks_obk or new.obk_pulled is true)
      and (not new.tracks_excavation or new.excavation_done is true);
  end if;

  if v_all_required_steps_done then
    new.status := 'completed';
    new.completed_at := coalesce(new.completed_at,current_date);
    new.is_archived := true;
    new.archived_at := coalesce(new.archived_at,now());
  elsif v_has_started_step then
    new.status := 'in_progress';
    new.in_progress_at := coalesce(new.in_progress_at,current_date);
    new.completed_at := null;
    new.is_archived := false;
    new.archived_at := null;
  elsif new.received_at <= current_date-30 then
    new.status := 'delayed';
    new.delayed_at := coalesce(new.delayed_at,current_date);
    new.completed_at := null;
    new.is_archived := false;
    new.archived_at := null;
  else
    new.status := 'waiting';
    new.waiting_at := coalesce(new.waiting_at,new.received_at,current_date);
    new.completed_at := null;
    new.is_archived := false;
    new.archived_at := null;
  end if;
  return new;
end; $$;

-- Pafta ilerlemesi Kurumsal dahil bütün paftalı proje türlerini başlatır/tamamlar.
create or replace function public.recalculate_project_sheet_completion(p_sheet_id uuid,p_date date default current_date)
returns void language plpgsql security definer set search_path=public as $$
declare s public.project_sheets; all_done boolean; total_sheets integer; completed_sheets integer;
begin
  select * into s from public.project_sheets where id=p_sheet_id;
  if not found then return; end if;
  all_done :=
    (not s.tracks_cable or (exists(select 1 from public.project_sheet_cables c where c.sheet_id=s.id) and not exists(
      select 1 from public.project_sheet_cables c where c.sheet_id=s.id and
      coalesce((select sum(p.quantity) from public.project_sheet_progress p where p.cable_id=c.id and p.stage='cable'),0)<c.quantity))) and
    (not s.tracks_joint or exists(select 1 from public.project_sheet_progress p where p.sheet_id=s.id and p.stage='joint')) and
    (not s.tracks_obk or exists(select 1 from public.project_sheet_progress p where p.sheet_id=s.id and p.stage='obk')) and
    (not s.tracks_excavation or (
      exists(select 1 from public.project_sheet_progress p where p.sheet_id=s.id and p.stage='excavation_permit_waiting') and
      exists(select 1 from public.project_sheet_progress p where p.sheet_id=s.id and p.stage='excavation_waiting') and
      exists(select 1 from public.project_sheet_progress p where p.sheet_id=s.id and p.stage='excavation_done')));
  update public.project_sheets set is_completed=all_done,
    completed_at=case when all_done then coalesce(completed_at,p_date) else null end where id=s.id;
  select count(*),count(*) filter(where is_completed) into total_sheets,completed_sheets
    from public.project_sheets where project_id=s.project_id;
  update public.projects set
    status=case when total_sheets>0 and completed_sheets=total_sheets then 'completed'::public.project_status else 'in_progress'::public.project_status end,
    completed_at=case when total_sheets>0 and completed_sheets=total_sheets then coalesce(completed_at,p_date) else null end,
    is_archived=total_sheets>0 and completed_sheets=total_sheets,
    archived_at=case when total_sheets>0 and completed_sheets=total_sheets then coalesce(archived_at,now()) else null end,
    in_progress_at=coalesce(in_progress_at,p_date)
  where id=s.project_id and project_type<>'BGFD';
end; $$;

-- Mevcut projelerin yanlış kalan durumlarını hemen düzelt.
update public.projects set received_at=received_at;
