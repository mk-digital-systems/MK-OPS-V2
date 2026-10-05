-- Erişim Zorunluluk projeleri Kurumsal TTVPN gibi manuel durumla yönetilir.
create index if not exists idx_projects_access_obligation_priority
  on public.projects(priority_order asc, created_at asc)
  where project_type = 'ERISIM_ZORUNLULUK'
    and is_archived = false
    and priority_order is not null;

drop trigger if exists projects_derive_automatic_status on public.projects;
create trigger projects_derive_automatic_status
before insert or update of received_at,tracks_obk,obk_pulled,joint_done,cable_pulled,tracks_excavation,excavation_done
on public.projects for each row
when (new.project_type not in ('KURUMSAL_TTVPN', 'ERISIM_ZORUNLULUK'))
execute function public.projects_derive_automatic_status();
