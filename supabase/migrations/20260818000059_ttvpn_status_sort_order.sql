-- Kurumsal TTVPN liste sırası: öncelikler, devam eden, kazı izni bekleyen, başlamayan, biten.
alter table public.projects
  add column if not exists status_sort_order integer generated always as (
    case status
      when 'in_progress' then 1
      when 'excavation_permit_waiting' then 2
      when 'waiting' then 3
      when 'completed' then 4
      else 3
    end
  ) stored;

create index if not exists idx_projects_ttvpn_list_order
  on public.projects(priority_order asc nulls last,status_sort_order asc,updated_at desc)
  where project_type='KURUMSAL_TTVPN';
