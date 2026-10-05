-- Alt kayıt tamamlama kontrolü yalnızca alt kayıt kullanan proje türlerinde çalışır.
-- TTVPN ve Erişim Zorunluluk projeleri manuel durumla yönetilir ve pafta kullanmaz.
create or replace function public.require_all_project_children_completed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'completed' then
    if new.project_type = 'HP_ODAKLI'
      and exists (
        select 1
        from public.project_sheets s
        where s.project_id = new.id
          and not s.is_completed
      ) then
      raise exception 'Projenin bütün paftaları tamamlanmadan proje bitirilemez.'
        using errcode = '23514';
    end if;

    if new.project_type = 'BGFD'
      and exists (
        select 1
        from public.project_cabinets c
        where c.project_id = new.id
          and not c.is_completed
      ) then
      raise exception 'Projenin bütün dolapları tamamlanmadan proje bitirilemez.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.require_all_project_children_completed() is
  'HP Odaklı projelerde paftaları, BGFD projelerinde dolapları tamamlanmadan proje bitişini engeller.';
