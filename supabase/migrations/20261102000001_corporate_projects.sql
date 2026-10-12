-- Kurumsal projeler (telekom eklentisi, süper admin açar)
--
--   Kurumsal türün (project_types.screen = 'corporate') aşaması ve bölümü yoktur. Durum elle seçilir:
--     not_started     → Başlamadı      (status waiting)
--     permit_waiting  → Kazı izni bekliyor (status on_hold, neden "Kazı izni bekleniyor")
--     in_progress     → Devam ediyor   (mevcut ekip başı zorunlu; planlanan bitiş geçtiyse Gecikti)
--     completed       → Bitti          (bitiren ekip başı ve bitiş tarihi zorunlu)
--   Toplam proje tarihi projects.project_date, öncelik projects.priority_order sütunundadır.

comment on column public.projects.project_date is 'Kurumsal projede toplam proje tarihi';

create function public.set_corporate_project_status(
  p_project_id uuid,
  p_status text,
  p_leader_id uuid,
  p_leader_name text,
  p_completed_at date
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  c_permit constant text := 'Kazı izni bekleniyor';
  v_project public.projects;
  v_leader_name text := nullif(trim(p_leader_name), '');
  v_today date := timezone('Europe/Istanbul', now())::date;
begin
  if not public.has_module_write_permission('projects') then
    raise exception 'Proje düzenleme yetkiniz yok' using errcode = '42501';
  end if;
  select * into v_project from public.projects
  where id = p_project_id and company_id = public.current_company_id()
  for update;
  if not found then
    raise exception 'Proje bulunamadı';
  end if;
  if not public.can_access_branch(v_project.branch_id) then
    raise exception 'Bu kayıt erişiminiz olmayan bir şubeye ait' using errcode = '42501';
  end if;
  if not exists (select 1 from public.project_types t where t.id = v_project.project_type_id and t.screen = 'corporate') then
    raise exception 'Bu proje kurumsal değil';
  end if;
  if v_project.is_archived or v_project.is_cancelled then
    raise exception 'Arşivdeki veya iptal edilen projenin durumu değiştirilemez';
  end if;
  if p_status not in ('not_started', 'permit_waiting', 'in_progress', 'completed') then
    raise exception 'Geçersiz durum';
  end if;
  if p_status = 'in_progress' and v_leader_name is null then
    raise exception 'Devam eden projenin ekip başını seçin';
  end if;
  if p_status = 'completed' and v_leader_name is null then
    raise exception 'Projeyi bitiren ekip başını seçin';
  end if;
  if p_status = 'completed' and p_completed_at is not null and p_completed_at > v_today then
    raise exception 'Bitiş tarihi ileri bir tarih olamaz';
  end if;
  if p_leader_id is not null and not exists (
    select 1 from public.personnel where id = p_leader_id and company_id = v_project.company_id
  ) then
    raise exception 'Ekip başı bulunamadı';
  end if;

  update public.projects
  set
    status = case p_status
      when 'completed' then 'completed'::public.project_status
      when 'permit_waiting' then 'on_hold'::public.project_status
      when 'in_progress' then 'in_progress'::public.project_status
      else 'waiting'::public.project_status end,
    hold_reason = case when p_status = 'permit_waiting' then c_permit end,
    has_activity = p_status in ('in_progress', 'completed'),
    progress_percent = case when p_status = 'completed' then 100 else 0 end,
    completed_at = case when p_status = 'completed' then coalesce(p_completed_at, v_today) end,
    completed_by_personnel_id = case when p_status = 'completed' then p_leader_id end,
    completed_by_name = case when p_status = 'completed' then v_leader_name end,
    current_team_leader_personnel_id = case when p_status = 'in_progress' then p_leader_id else current_team_leader_personnel_id end,
    current_team_leader_name = case when p_status = 'in_progress' then v_leader_name else current_team_leader_name end,
    updated_by = auth.uid()
  where id = p_project_id;
end;
$$;

revoke all on function public.set_corporate_project_status(uuid, text, uuid, text, date) from public, anon;
grant execute on function public.set_corporate_project_status(uuid, text, uuid, text, date) to authenticated;
