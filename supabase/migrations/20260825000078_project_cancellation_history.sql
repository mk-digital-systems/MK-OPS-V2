-- Proje yeniden aktif edilse bile iptal gerekcesini ve tarihlerini korur.
create table if not exists public.project_cancellation_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  reason text not null check (char_length(trim(reason)) >= 3),
  cancelled_at timestamptz not null default now(),
  cancelled_by uuid references auth.users(id) on delete set null,
  reactivated_at timestamptz,
  reactivated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_project_cancellation_history_project
  on public.project_cancellation_history(project_id, cancelled_at desc);

alter table public.project_cancellation_history enable row level security;
grant select on public.project_cancellation_history to authenticated;
drop policy if exists "project_cancellation_history_select" on public.project_cancellation_history;
create policy "project_cancellation_history_select"
  on public.project_cancellation_history for select to authenticated using (true);

create or replace function public.cancel_project(p_project_id uuid, p_reason text)
returns public.projects language plpgsql security definer set search_path=public set row_security=off as $$
declare v_project public.projects;
begin
  if not public.has_module_write_permission('projects') then raise exception 'Proje iptal yetkiniz yok' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 3 then raise exception 'İptal sebebi en az 3 karakter olmalıdır'; end if;
  select * into v_project from public.projects where id=p_project_id for update;
  if not found then raise exception 'Proje bulunamadı'; end if;
  if v_project.is_cancelled then raise exception 'Proje zaten iptal edilmiş'; end if;
  if v_project.is_archived or v_project.status='completed' then raise exception 'Biten veya arşivlenmiş proje iptal edilemez'; end if;
  if v_project.status not in ('waiting','in_progress') then raise exception 'Yalnızca Başlamadı veya Devam Ediyor durumundaki proje iptal edilebilir'; end if;

  insert into public.project_cancellation_history(project_id,reason,cancelled_by)
  values(p_project_id,trim(p_reason),auth.uid());
  update public.projects set is_cancelled=true,cancellation_reason=trim(p_reason),cancelled_at=now(),cancelled_by=auth.uid(),is_archived=false,archived_at=null,updated_by=auth.uid()
  where id=p_project_id returning * into v_project;
  return v_project;
end $$;

create or replace function public.reactivate_cancelled_project(p_project_id uuid)
returns public.projects language plpgsql security definer set search_path=public set row_security=off as $$
declare v_project public.projects;
begin
  if not public.has_module_write_permission('projects') then raise exception 'Proje aktifleştirme yetkiniz yok' using errcode='42501'; end if;
  select * into v_project from public.projects where id=p_project_id for update;
  if not found then raise exception 'Proje bulunamadı'; end if;
  if v_project.is_archived or v_project.status='completed' then raise exception 'Biten veya arşivlenmiş proje yeniden aktif edilemez'; end if;
  if not v_project.is_cancelled then raise exception 'Yalnızca iptal edilmiş proje yeniden aktif edilebilir'; end if;

  update public.project_cancellation_history set reactivated_at=now(),reactivated_by=auth.uid()
  where id=(select id from public.project_cancellation_history where project_id=p_project_id and reactivated_at is null order by cancelled_at desc limit 1);
  update public.projects set is_cancelled=false,cancellation_reason=null,cancelled_at=null,cancelled_by=null,updated_by=auth.uid()
  where id=p_project_id returning * into v_project;
  return v_project;
end $$;

revoke all on function public.cancel_project(uuid,text) from public;
revoke all on function public.reactivate_cancelled_project(uuid) from public;
grant execute on function public.cancel_project(uuid,text) to authenticated;
grant execute on function public.reactivate_cancelled_project(uuid) to authenticated;

