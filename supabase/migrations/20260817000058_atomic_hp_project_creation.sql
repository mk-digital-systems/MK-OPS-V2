create or replace function public.create_hp_project_with_sheets(p_project jsonb,p_sheets jsonb)
returns setof public.projects language plpgsql security invoker set search_path=public as $$
declare created public.projects; sheet_count integer; unique_count integer;
begin
  select jsonb_array_length(p_sheets) into sheet_count;
  if sheet_count<1 then raise exception 'En az bir pafta girilmelidir.' using errcode='P0001'; end if;
  select count(distinct lower(trim(x.sheet_no))) into unique_count from jsonb_to_recordset(p_sheets) as x(sheet_no text,address text,hp_count integer,notes text);
  if unique_count<>sheet_count then raise exception 'Aynı pafta numarası bir projede birden fazla kullanılamaz.' using errcode='P0001'; end if;
  if exists(select 1 from jsonb_to_recordset(p_sheets) as x(sheet_no text,address text,hp_count integer,notes text) where trim(coalesce(x.sheet_no,''))='') then raise exception 'Her pafta için pafta numarası girilmelidir.' using errcode='P0001'; end if;
  select * into created from public.projects where project_code=trim(p_project->>'project_code') for update;
  if found then
    if created.project_type<>'HP_ODAKLI' or exists(select 1 from public.project_sheets where project_id=created.id) then raise unique_violation using message='Bu Proje ID zaten kayıtlı.'; end if;
    update public.projects set name=trim(p_project->>'name'),location=coalesce(nullif(trim(p_project->>'location'),''),'Adres belirtilmedi'),description=nullif(trim(p_project->>'description'),''),sheet_count=sheet_count,updated_by=(p_project->>'updated_by')::uuid where id=created.id returning * into created;
  else
    insert into public.projects(project_code,name,project_type,location,description,status,received_at,waiting_at,tracks_obk,tracks_excavation,tracks_cable,tracks_joint,sheet_count,hp_count,is_single_sheet,created_by,updated_by)
    values(trim(p_project->>'project_code'),trim(p_project->>'name'),'HP_ODAKLI',coalesce(nullif(trim(p_project->>'location'),''),'Adres belirtilmedi'),nullif(trim(p_project->>'description'),''),'waiting',coalesce((p_project->>'received_at')::date,current_date),coalesce((p_project->>'received_at')::date,current_date),false,false,false,false,sheet_count,null,false,(p_project->>'created_by')::uuid,(p_project->>'updated_by')::uuid) returning * into created;
  end if;
  insert into public.project_sheets(project_id,name,sheet_no,address,hp_count,notes,manual_status,tracks_cable,tracks_joint,tracks_obk,tracks_excavation,created_by)
  select created.id,trim(x.sheet_no),trim(x.sheet_no),nullif(trim(x.address),''),coalesce(x.hp_count,0),nullif(trim(x.notes),''),'not_started',false,false,false,false,(p_project->>'created_by')::uuid
  from jsonb_to_recordset(p_sheets) as x(sheet_no text,address text,hp_count integer,notes text);
  return next created;
end; $$;
grant execute on function public.create_hp_project_with_sheets(jsonb,jsonb) to authenticated;
