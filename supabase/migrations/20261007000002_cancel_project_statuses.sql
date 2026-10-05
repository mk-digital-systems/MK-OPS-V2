-- =============================================================================
-- MK OPS — proje iptal kuralı
-- Biten veya arşivlenmiş olmayan her proje (beklemede ve geciken dahil)
-- iptal edilebilir. Önceden yalnızca Başlamadı / Devam Ediyor iptal edilebiliyordu.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cancel_project(p_project_id uuid, p_reason text) RETURNS public.projects
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_project public.projects;
begin
  if not public.has_module_write_permission('projects') then raise exception 'Proje iptal yetkiniz yok' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 3 then raise exception 'İptal sebebi en az 3 karakter olmalıdır'; end if;
  select * into v_project from public.projects where company_id=public.current_company_id() and id=p_project_id for update;
  if not found then raise exception 'Proje bulunamadı'; end if;
  if v_project.is_cancelled then raise exception 'Proje zaten iptal edilmiş'; end if;
  if v_project.is_archived or v_project.status='completed' then raise exception 'Biten veya arşivlenmiş proje iptal edilemez'; end if;

  insert into public.project_cancellation_history(project_id,reason,cancelled_by)
  values(p_project_id,trim(p_reason),auth.uid());
  update public.projects set is_cancelled=true,cancellation_reason=trim(p_reason),cancelled_at=now(),cancelled_by=auth.uid(),is_archived=false,archived_at=null,updated_by=auth.uid()
  where id=p_project_id returning * into v_project;
  return v_project;
end $$;

revoke execute on function public.cancel_project(uuid, text) from public, anon;
grant execute on function public.cancel_project(uuid, text) to authenticated;
