-- Alt pafta veya dolabı olan proje, bütün alt kayıtlar tamamlanmadan bitirilemez.
create or replace function public.require_all_project_children_completed()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.status='completed' then
    if exists(select 1 from public.project_sheets s where s.project_id=new.id)
      and exists(select 1 from public.project_sheets s where s.project_id=new.id and not s.is_completed) then
      raise exception 'Projenin bütün paftaları tamamlanmadan proje bitirilemez.' using errcode='23514';
    end if;
    if exists(select 1 from public.project_cabinets c where c.project_id=new.id)
      and exists(select 1 from public.project_cabinets c where c.project_id=new.id and not c.is_completed) then
      raise exception 'Projenin bütün dolapları tamamlanmadan proje bitirilemez.' using errcode='23514';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists projects_require_all_children_completed on public.projects;
create trigger projects_require_all_children_completed before insert or update of status on public.projects
for each row execute function public.require_all_project_children_completed();

-- Önceden yanlışlıkla bitmiş görünen fakat eksik alt kaydı olan projeleri tekrar aktife al.
update public.projects p set status='in_progress',is_archived=false,archived_at=null,completed_at=null,
  in_progress_at=coalesce(in_progress_at,current_date)
where p.status='completed' and (
  exists(select 1 from public.project_sheets s where s.project_id=p.id and not s.is_completed)
  or exists(select 1 from public.project_cabinets c where c.project_id=p.id and not c.is_completed)
);
