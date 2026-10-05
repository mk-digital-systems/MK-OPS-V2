-- İmalatlar yalnızca personel kaydına bağlanır; proje ve imalat bilgileri manuel tutulur.
create or replace function public.save_production_entry(
  p_entry_id uuid, p_work_date date, p_team_leader_personnel_id uuid,
  p_team_leader_name text, p_source_work_plan_id uuid, p_jobs jsonb
)
returns uuid language plpgsql security definer set search_path=public set row_security=off
as $$
declare
  v_entry_id uuid;
  v_job jsonb;
  v_item jsonb;
  v_job_id uuid;
  v_item_name text;
  v_unit text;
begin
  if not public.has_module_write_permission('productions') then
    raise exception 'İmalat yazma yetkisi gerekli' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.personnel
    where id = p_team_leader_personnel_id and is_active = true
  ) then
    raise exception 'Aktif ekip personeli bulunamadı';
  end if;
  if jsonb_array_length(coalesce(p_jobs, '[]'::jsonb)) = 0 then
    raise exception 'En az bir proje gerekli';
  end if;

  if p_entry_id is not null and exists (select 1 from public.production_entries where id = p_entry_id) then
    update public.production_entries set
      work_date = p_work_date,
      team_leader_personnel_id = p_team_leader_personnel_id,
      team_leader_name_snapshot = trim(p_team_leader_name),
      source_work_plan_id = null,
      updated_by = auth.uid()
    where id = p_entry_id
    returning id into v_entry_id;
  else
    insert into public.production_entries(
      work_date, team_leader_personnel_id, team_leader_name_snapshot,
      source_work_plan_id, created_by, updated_by
    ) values (
      p_work_date, p_team_leader_personnel_id, trim(p_team_leader_name),
      null, auth.uid(), auth.uid()
    )
    on conflict(work_date, team_leader_personnel_id) do update set
      team_leader_name_snapshot = excluded.team_leader_name_snapshot,
      source_work_plan_id = null,
      updated_by = auth.uid()
    returning id into v_entry_id;
  end if;

  delete from public.production_jobs where production_entry_id = v_entry_id;
  for v_job in select * from jsonb_array_elements(p_jobs) loop
    if char_length(trim(coalesce(v_job->>'project_name', ''))) < 2 then
      raise exception 'Proje adı zorunlu';
    end if;
    insert into public.production_jobs(
      production_entry_id, project_id, project_name_snapshot,
      project_code_snapshot, source, sort_order
    ) values (
      v_entry_id, null, trim(v_job->>'project_name'),
      nullif(trim(v_job->>'project_code'), ''), 'manual',
      coalesce((v_job->>'sort_order')::int, 0)
    ) returning id into v_job_id;

    if jsonb_array_length(coalesce(v_job->'items', '[]'::jsonb)) = 0 then
      raise exception 'Her projede en az bir imalat gerekli';
    end if;
    for v_item in select * from jsonb_array_elements(coalesce(v_job->'items', '[]'::jsonb)) loop
      v_item_name := trim(coalesce(v_item->>'item_name', ''));
      v_unit := upper(trim(coalesce(v_item->>'unit', '')));
      if char_length(v_item_name) < 2 or char_length(v_unit) < 1 then
        raise exception 'İmalat adı ve birim zorunlu';
      end if;
      insert into public.production_items(
        production_job_id, production_item_definition_id, item_name_snapshot,
        quantity, unit_snapshot, sort_order
      ) values (
        v_job_id, null, v_item_name, (v_item->>'quantity')::numeric,
        v_unit, coalesce((v_item->>'sort_order')::int, 0)
      );
    end loop;
  end loop;
  return v_entry_id;
end;
$$;

grant execute on function public.save_production_entry(uuid,date,uuid,text,uuid,jsonb) to authenticated;
