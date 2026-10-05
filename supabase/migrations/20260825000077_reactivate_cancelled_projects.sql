-- Yalnizca iptal projeleri yeniden aktiflestirir; arsiv projelerini engeller.
create or replace function public.reactivate_cancelled_project(p_project_id uuid)
returns public.projects
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare v_project public.projects;
begin
  if not public.has_module_write_permission('projects') then
    raise exception 'Proje aktifleştirme yetkiniz yok' using errcode = '42501';
  end if;

  select * into v_project from public.projects where id = p_project_id for update;
  if not found then raise exception 'Proje bulunamadı'; end if;
  if v_project.is_archived or v_project.status = 'completed' then
    raise exception 'Biten veya arşivlenmiş proje yeniden aktif edilemez';
  end if;
  if not v_project.is_cancelled then
    raise exception 'Yalnızca iptal edilmiş proje yeniden aktif edilebilir';
  end if;

  update public.projects
  set is_cancelled = false,
      cancellation_reason = null,
      cancelled_at = null,
      cancelled_by = null,
      updated_by = auth.uid()
  where id = p_project_id
  returning * into v_project;
  return v_project;
end;
$$;

revoke all on function public.reactivate_cancelled_project(uuid) from public;
grant execute on function public.reactivate_cancelled_project(uuid) to authenticated;
