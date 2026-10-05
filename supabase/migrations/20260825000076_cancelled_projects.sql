-- Aktif ve arsiv projelerinden bagimsiz iptal alani.
alter table public.projects
  add column if not exists is_cancelled boolean not null default false,
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null;

alter table public.projects drop constraint if exists projects_cancellation_fields_check;
alter table public.projects add constraint projects_cancellation_fields_check check (
  (is_cancelled = false and cancellation_reason is null and cancelled_at is null)
  or
  (is_cancelled = true and char_length(trim(cancellation_reason)) >= 3 and cancelled_at is not null and is_archived = false)
);

create index if not exists idx_projects_cancelled
  on public.projects (is_cancelled, cancelled_at desc);

create or replace function public.cancel_project(p_project_id uuid, p_reason text)
returns public.projects
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare v_project public.projects;
begin
  if not public.has_module_write_permission('projects') then
    raise exception 'Proje iptal yetkiniz yok' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'İptal sebebi en az 3 karakter olmalıdır';
  end if;

  select * into v_project from public.projects where id = p_project_id for update;
  if not found then raise exception 'Proje bulunamadı'; end if;
  if v_project.is_cancelled then raise exception 'Proje zaten iptal edilmiş'; end if;
  if v_project.is_archived or v_project.status = 'completed' then
    raise exception 'Biten veya arşivlenmiş proje iptal edilemez';
  end if;
  if v_project.status not in ('waiting', 'in_progress') then
    raise exception 'Yalnızca Başlamadı veya Devam Ediyor durumundaki proje iptal edilebilir';
  end if;

  update public.projects
  set is_cancelled = true,
      cancellation_reason = trim(p_reason),
      cancelled_at = now(),
      cancelled_by = auth.uid(),
      is_archived = false,
      archived_at = null,
      updated_by = auth.uid()
  where id = p_project_id
  returning * into v_project;
  return v_project;
end;
$$;

revoke all on function public.cancel_project(uuid, text) from public;
grant execute on function public.cancel_project(uuid, text) to authenticated;

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

create or replace function public.refresh_overdue_project_statuses()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare v_updated integer;
begin
  update public.projects
  set received_at = received_at
  where is_archived = false
    and is_cancelled = false
    and status <> 'completed'
    and received_at <= current_date - 30
    and status <> 'delayed';
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;
