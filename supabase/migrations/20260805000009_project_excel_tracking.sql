-- =============================================================================
-- 00009 — Excel benzeri proje takibi alanları ve toplu satır güncelleme
-- 00008'den sonra çalıştırılmalıdır.
-- =============================================================================

alter table public.projects
  add column if not exists tracks_joint boolean not null default false,
  add column if not exists tracks_cable boolean not null default false,
  add column if not exists tracks_excavation boolean not null default false,
  add column if not exists excavation_done boolean;

-- Mevcut kayıtların daha önce girilmiş takip bilgilerini koru.
update public.projects
set
  tracks_joint = tracks_joint or joint_done is not null,
  tracks_cable = tracks_cable or cable_pulled is not null,
  tracks_excavation =
    tracks_excavation or status = 'excavation_permit_waiting',
  excavation_done = case
    when status = 'excavation_permit_waiting'
      and excavation_done is null then false
    else excavation_done
  end;

comment on column public.projects.tracks_joint is
  'Projede ek işlemi takibi var/yok';
comment on column public.projects.tracks_cable is
  'Projede kablo çekimi takibi var/yok';
comment on column public.projects.tracks_excavation is
  'Projede kazı işlemi takibi var/yok';
comment on column public.projects.excavation_done is
  'Kazı takibi varsa true=yapıldı, false=yapılmadı, null=belirtilmedi';

create index if not exists idx_projects_excel_tracking
  on public.projects (
    tracks_obk,
    obk_pulled,
    tracks_joint,
    joint_done,
    tracks_cable,
    cable_pulled,
    tracks_excavation,
    excavation_done
  )
  where is_archived = false;

create or replace function public.bulk_update_project_tracking(p_updates jsonb)
returns setof public.projects
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Oturum gerekli' using errcode = '42501';
  end if;

  if jsonb_typeof(p_updates) <> 'array' then
    raise exception 'Güncellemeler JSON dizisi olmalıdır';
  end if;

  if jsonb_array_length(p_updates) > 250 then
    raise exception 'Tek işlemde en fazla 250 proje güncellenebilir';
  end if;

  return query
  update public.projects as p
  set
    tracks_obk = u.tracks_obk,
    obk_pulled = case when u.tracks_obk then u.obk_pulled else null end,
    tracks_joint = u.tracks_joint,
    joint_done = case when u.tracks_joint then u.joint_done else null end,
    tracks_cable = u.tracks_cable,
    cable_pulled = case when u.tracks_cable then u.cable_pulled else null end,
    tracks_excavation = u.tracks_excavation,
    excavation_done =
      case when u.tracks_excavation then u.excavation_done else null end,
    status = u.status::public.project_status,
    updated_by = auth.uid()
  from jsonb_to_recordset(p_updates) as u(
    id uuid,
    tracks_obk boolean,
    obk_pulled boolean,
    tracks_joint boolean,
    joint_done boolean,
    tracks_cable boolean,
    cable_pulled boolean,
    tracks_excavation boolean,
    excavation_done boolean,
    status text
  )
  where p.id = u.id
  returning p.*;
end;
$$;

grant execute on function public.bulk_update_project_tracking(jsonb)
  to authenticated;

comment on function public.bulk_update_project_tracking(jsonb) is
  'Projeler ekranında yalnız değişen satırların takip alanlarını tek sorguda günceller.';
