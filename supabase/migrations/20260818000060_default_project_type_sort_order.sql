-- Filtresiz aktif proje listesi: TTVPN, HP Odaklı, yeni türler ve en son BGFD.
alter table public.projects
  add column if not exists project_type_sort_order integer generated always as (
    case project_type
      when 'KURUMSAL_TTVPN' then 1
      when 'HP_ODAKLI' then 2
      when 'BGFD' then 999
      else 3
    end
  ) stored,
  add column if not exists default_status_sort_order integer generated always as (
    case
      when project_type <> 'KURUMSAL_TTVPN' then 0
      when status = 'in_progress' then 1
      when status = 'excavation_permit_waiting' then 2
      when status = 'waiting' then 3
      when status = 'completed' then 4
      else 3
    end
  ) stored;

create index if not exists idx_projects_default_active_list_order
  on public.projects(
    project_type_sort_order asc,
    priority_order asc nulls last,
    default_status_sort_order asc,
    updated_at desc
  )
  where is_archived = false;
