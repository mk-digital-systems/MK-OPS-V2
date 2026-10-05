-- Yeni sabit proje türü: Erişim Zorunluluk.
-- Filtresiz listede TTVPN ve HP Odaklı'dan sonra, BGFD'den önce gösterilir.
drop index if exists public.idx_projects_default_active_list_order;

alter table public.projects
  drop column if exists project_type_sort_order;

alter table public.projects
  add column project_type_sort_order integer generated always as (
    case project_type
      when 'KURUMSAL_TTVPN' then 1
      when 'HP_ODAKLI' then 2
      when 'ERISIM_ZORUNLULUK' then 3
      when 'BGFD' then 999
      else 4
    end
  ) stored;

create index idx_projects_default_active_list_order
  on public.projects(
    project_type_sort_order asc,
    priority_order asc nulls last,
    default_status_sort_order asc,
    updated_at desc
  )
  where is_archived = false;
