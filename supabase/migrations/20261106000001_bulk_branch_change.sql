-- Toplu şube tayini: seçilen personel veya araçlar geçiş tarihiyle başka şubeye alınır.
-- Her kayıt için change_record_branch çalışır (yetki: firma yöneticisi / Merkez şantiye şefi; şube geçmişi
-- tutulur). Hepsi ya birlikte olur ya hiç olmaz.

create function public.change_records_branch(p_kind text, p_ids uuid[], p_branch_id uuid, p_start_date date default null)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  if not public.is_head_office() then
    raise exception 'Şubeyi yalnızca firma yöneticisi veya Merkez şantiye şefi değiştirebilir' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_ids), 0) = 0 then
    raise exception 'Kayıt seçilmedi';
  end if;
  if cardinality(p_ids) > 500 then
    raise exception 'Bir seferde en fazla 500 kayıt taşınabilir';
  end if;
  if not exists (select 1 from public.branches where id = p_branch_id and company_id = public.current_company_id()) then
    raise exception 'Şube bulunamadı';
  end if;

  foreach v_id in array p_ids
  loop
    if p_kind = 'personnel' and not exists (select 1 from public.personnel where id = v_id) then
      raise exception 'Personel bulunamadı';
    elsif p_kind = 'vehicle' and not exists (select 1 from public.vehicles where id = v_id) then
      raise exception 'Araç bulunamadı';
    end if;
    perform public.change_record_branch(p_kind, v_id, p_branch_id, p_start_date);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.change_records_branch(text, uuid[], uuid, date) from public, anon;
grant execute on function public.change_records_branch(text, uuid[], uuid, date) to authenticated;
