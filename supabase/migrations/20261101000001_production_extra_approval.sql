-- İmalattaki özel iş kalemi (ek iş) fiyat onayı
--
--   Ek iş (production_items.kind = 'extra') projenin iş kalemi listesine girmez. Fiyatı girilmemiş ek iş
--   içeren imalat "fiyat onayı bekliyor" sayılır: hakediş yetkilisi Onaylar ekranında her ek işin birim
--   fiyatını girip onaylar; fiyatlar eksikse onaylanamaz. O zamana kadar ek iş hakediş toplamına girmez.
--   Aynı imalattaki projenin iş kalemi satırları beklemez; kaydedildiği anda projeye işlenir.

-- 1. Onay bekleyen ek işler ------------------------------------------------------------------------
create function public.list_pending_production_extras()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company uuid := public.current_company_id();
begin
  if v_company is null or not public.has_module_write_permission('hakedis') then
    raise exception 'Ek iş fiyatı için hakediş yetkisi gerekli' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(entry order by entry ->> 'work_date' desc, entry ->> 'created_at' desc)
    from (
      select jsonb_build_object(
        'entry_id', e.id,
        'work_date', e.work_date,
        'team_leader_name', e.team_leader_name_snapshot,
        'branch_id', e.branch_id,
        'created_at', e.created_at,
        'items', jsonb_agg(jsonb_build_object(
          'id', i.id,
          'item_name', i.item_name_snapshot,
          'quantity', i.quantity,
          'unit', i.unit_snapshot,
          'project_code', j.project_code_snapshot,
          'project_name', j.project_name_snapshot
        ) order by j.sort_order, i.sort_order)
      ) as entry
      from public.production_entries e
      join public.production_jobs j on j.production_entry_id = e.id
      join public.production_items i on i.production_job_id = j.id
      left join public.hakedis_extra_values v on v.production_item_id = i.id
      where e.company_id = v_company
        and public.can_access_branch(e.branch_id)
        and i.kind = 'extra'
        and v.production_item_id is null
      group by e.id
    ) pending
  ), '[]'::jsonb);
end;
$$;

-- 2. Onay: bütün fiyatı girilmemiş ek işlerin fiyatıyla birlikte ------------------------------------
-- p_prices: [{ "item_id": uuid, "unit_price": number }, …]
create function public.approve_production_extras(p_entry_id uuid, p_prices jsonb)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company uuid := public.current_company_id();
  v_entry public.production_entries;
  v_item record;
  v_price numeric;
begin
  if v_company is null or not public.has_module_write_permission('hakedis') then
    raise exception 'Ek iş fiyatı için hakediş yetkisi gerekli' using errcode = '42501';
  end if;
  select * into v_entry from public.production_entries where id = p_entry_id and company_id = v_company;
  if v_entry.id is null then
    raise exception 'İmalat kaydı bulunamadı';
  end if;
  if not public.can_access_branch(v_entry.branch_id) then
    raise exception 'Bu kayıt erişiminiz olmayan bir şubeye ait' using errcode = '42501';
  end if;

  for v_item in
    select i.id, i.item_name_snapshot
    from public.production_items i
    join public.production_jobs j on j.id = i.production_job_id
    left join public.hakedis_extra_values v on v.production_item_id = i.id
    where j.production_entry_id = p_entry_id and i.kind = 'extra' and v.production_item_id is null
    order by j.sort_order, i.sort_order
  loop
    select nullif(x ->> 'unit_price', '')::numeric into v_price
    from jsonb_array_elements(coalesce(p_prices, '[]'::jsonb)) x
    where x ->> 'item_id' = v_item.id::text
    limit 1;
    if v_price is null then
      raise exception '% için birim fiyat girin', v_item.item_name_snapshot;
    end if;
    perform public.set_production_extra_price(v_item.id, v_price);
  end loop;
end;
$$;

revoke all on function public.list_pending_production_extras() from public, anon;
grant execute on function public.list_pending_production_extras() to authenticated;
revoke all on function public.approve_production_extras(uuid, jsonb) from public, anon;
grant execute on function public.approve_production_extras(uuid, jsonb) to authenticated;

-- 3. Bildirim: fiyat onayı bekleyen imalat (ek işler "fiyatı girilmemiş kayıtlar"dan ayrıldı) -------
-- Gövdenin geri kalanı 20261027000001 ile aynı.
CREATE OR REPLACE FUNCTION public.get_my_notifications()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
declare
  v_company uuid := public.current_company_id();
  v_today date := timezone('Europe/Istanbul', now())::date;
  v_chief boolean;
  v_users boolean;
  v_projects boolean;
  v_vehicles boolean;
  v_hakedis boolean;
begin
  if auth.uid() is null or v_company is null or public.current_user_role() = 'pending' then
    return '[]'::jsonb;
  end if;
  v_chief := public.is_site_chief();
  v_users := public.can_manage_users();
  v_projects := public.can_view_all() or public.has_module_write_permission('projects');
  v_vehicles := public.can_view_all() or public.has_module_write_permission('vehicles');
  v_hakedis := public.has_module_write_permission('hakedis');

  return (
    with items as (
      -- Katılım isteği
      select 'join:' || p.id as key, 'join_request' as type, 'Katılım isteği' as title,
             coalesce(nullif(p.full_name, ''), p.email) || ' firmanıza katılmak istiyor.' as body,
             '/panel/users' as link, p.created_at as at
      from public.profiles p
      where v_users and p.company_id = v_company and not p.is_approved and p.role = 'pending'

      union all
      -- Onay bekleyen personel / araç: firma yöneticisi ve Merkez şantiye şefi onaylar
      select 'pending_' || x.kind || ':' || x.n || ':' || extract(epoch from x.at)::bigint, 'pending_approval',
             case x.kind when 'personnel' then 'Onay bekleyen personel' else 'Onay bekleyen araç' end,
             x.n || case x.kind when 'personnel' then ' personel' else ' araç' end || ' kaydı onayınızı bekliyor.',
             '/panel/approvals', x.at
      from (
        select 'personnel' as kind, count(*) as n, max(created_at) as at
        from public.personnel where company_id = v_company and approval_status = 'pending' and public.can_access_branch(branch_id)
        union all
        select 'vehicle', count(*), max(created_at)
        from public.vehicles where company_id = v_company and approval_status = 'pending' and public.can_access_branch(branch_id)
      ) x
      where public.is_head_office() and x.n > 0

      union all
      -- Şubeye irsaliye ile malzeme girişi: her irsaliye ayrı bildirim, onaylanana kadar
      select 'pending_receipt:' || r.id, 'pending_approval', b.name || ' şubesine malzeme girişi',
             l.name || ' · İrsaliye ' || r.dispatch_number || ' · ' || r.received_by || ' · '
               || (select count(*) from public.inventory_receipt_lines rl where rl.receipt_id = r.id)
               || ' kalem. Malzemeleri inceleyip onaylayın.',
             '/panel/approvals', r.created_at
      from public.inventory_receipts r
      join public.branches b on b.id = r.branch_id
      join public.inventory_locations l on l.id = r.location_id
      where public.is_head_office() and r.company_id = v_company and r.status = 'pending'

      union all
      -- Onay bekleyen malzeme talepleri (talep onayı veya stok girişi onayı)
      select 'pending_request:' || s.n || ':' || extract(epoch from s.at)::bigint, 'pending_approval', 'Onay bekleyen malzeme talebi',
             s.n || ' malzeme talebi onayınızı bekliyor.', '/panel/approvals', s.at
      from (
        select count(*) as n, max(q.created_at) as at from public.inventory_requests q
        where q.company_id = v_company and q.status in ('requested', 'receipt_review') and public.can_access_branch(q.branch_id)
      ) s
      where public.is_head_office() and s.n > 0

      union all
      -- Geçen ayın puantajı onaylanmadı
      select 'attendance_month:' || to_char(m.month_start, 'YYYY-MM') || ':' || b.id, 'attendance_approval', 'Puantaj onayı bekliyor',
             b.name || ' · ' || to_char(m.month_start, 'MM.YYYY') || ' puantajı henüz onaylanmadı. Onaylanınca ay kesinleşir.',
             '/panel/attendance?year=' || extract(year from m.month_start)::integer || '&month=' || extract(month from m.month_start)::integer,
             (m.month_start + interval '1 month')::timestamptz
      from (select (date_trunc('month', v_today) - interval '1 month')::date as month_start) m
      cross join public.branches b
      where v_users
        and b.company_id = v_company
        and public.can_access_branch(b.id)
        and exists (
          select 1 from public.attendance_records a
          join public.personnel p on p.id = a.personnel_id
          where a.company_id = v_company and p.branch_id = b.id
            and a.attendance_date >= m.month_start and a.attendance_date < m.month_start + interval '1 month')
        and not public.attendance_month_is_locked(v_company, b.id, m.month_start)

      union all
      -- Destek talebi yanıtı (son 30 gün)
      select 'support:' || s.id || ':' || extract(epoch from s.replied_at)::bigint, 'support_reply',
             'Destek talebiniz yanıtlandı', left(coalesce(s.admin_reply, ''), 160), '/panel/support', s.replied_at
      from public.support_requests s
      where v_chief and s.company_id = v_company and s.replied_at is not null and s.replied_at > now() - interval '30 days'

      union all
      -- Geciken proje
      select 'project_delayed:' || p.id || ':' || coalesce(p.estimated_end_date::text, ''), 'project_delayed', 'Proje gecikti',
             concat_ws(' · ', p.name, p.project_code) || coalesce(' — planlanan bitiş ' || to_char(p.estimated_end_date, 'DD.MM.YYYY'), ''),
             '/panel/projects/' || p.id, coalesce(p.estimated_end_date + 1, p.delayed_at, v_today)::timestamptz
      from public.projects p
      where v_projects and p.company_id = v_company and public.can_access_branch(p.branch_id) and not p.is_cancelled and not p.is_archived
        and p.status <> 'completed'
        and (p.status = 'delayed' or p.estimated_end_date < v_today)

      union all
      -- Bitişi 3 gün içinde olan proje
      select 'project_due:' || p.id || ':' || p.estimated_end_date, 'project_due', 'Proje bitişi yaklaşıyor',
             concat_ws(' · ', p.name, p.project_code) || ' — planlanan bitiş ' || to_char(p.estimated_end_date, 'DD.MM.YYYY'),
             '/panel/projects/' || p.id, (p.estimated_end_date - 3)::timestamptz
      from public.projects p
      where v_projects and p.company_id = v_company and public.can_access_branch(p.branch_id) and not p.is_cancelled and not p.is_archived
        and p.status not in ('completed', 'delayed')
        and p.estimated_end_date between v_today and v_today + 3

      union all
      -- Araç muayene / sigorta (15 gün içinde veya geçmiş)
      select 'vehicle_' || d.kind || ':' || v.id || ':' || d.due, 'vehicle_deadline',
             case d.kind when 'inspection' then 'Araç muayenesi' else 'Araç sigortası' end
               || case when d.due < v_today then ' tarihi geçti' else ' yaklaşıyor' end,
             v.plate || ' — ' || to_char(d.due, 'DD.MM.YYYY'), '/panel/vehicles', (d.due - 15)::timestamptz
      from public.vehicles v
      cross join lateral (values ('inspection', v.inspection_date), ('insurance', v.insurance_date)) as d(kind, due)
      where v_vehicles and v.company_id = v_company and public.can_access_branch(v.branch_id) and d.due is not null and d.due <= v_today + 15

      union all
      -- Deneme süresi son 24 saat
      select 'trial_end:' || extract(epoch from c.trial_ends_at)::bigint, 'subscription', 'Deneme süresi bitiyor',
             'Deneme süreniz ' || to_char(timezone('Europe/Istanbul', c.trial_ends_at), 'DD.MM.YYYY HH24:MI')
               || ' tarihinde bitiyor. Plan talebi için Destek sayfasını kullanın.',
             '/panel/support', c.trial_ends_at - interval '24 hours'
      from public.companies c
      where v_chief and c.id = v_company and c.plan is null
        and c.trial_ends_at between now() and now() + interval '24 hours'

      union all
      -- Plan bitişi son 7 gün
      select 'plan_end:' || extract(epoch from c.plan_ends_at)::bigint, 'subscription', 'Plan süresi bitiyor',
             'Planınız ' || to_char(timezone('Europe/Istanbul', c.plan_ends_at), 'DD.MM.YYYY') || ' tarihinde bitiyor. Yenilemek için Destek sayfasını kullanın.',
             '/panel/support', c.plan_ends_at - interval '7 days'
      from public.companies c
      where v_chief and c.id = v_company and c.plan is not null and c.plan_ends_at is not null
        and c.plan_ends_at between now() and now() + interval '7 days'

      union all
      -- Fiyatı girilmemiş iş kayıtları (son 31 gün)
      select 'hakedis_unpriced:' || u.n, 'hakedis_unpriced', 'Fiyatı girilmemiş kayıtlar',
             u.n || ' iş kaydının fiyatı girilmemiş; hakediş toplamına dahil değil.',
             '/panel/hakedis', now()
      from (
        select count(*) as n from public.project_stage_logs l
        left join public.hakedis_log_values hv on hv.log_id = l.id
        join public.project_stage_progress sp on sp.id = l.progress_id
        join public.projects pr on pr.id = sp.project_id
        where l.company_id = v_company and l.quantity is not null and hv.log_id is null
          and public.can_access_branch(pr.branch_id)
          and l.log_date >= v_today - 31
      ) u
      where v_hakedis and u.n > 0

      union all
      -- İmalattaki özel iş kalemi (ek iş): fiyatı onaylanırken hakediş yetkilisi girer
      select 'pending_extra:' || x.n || ':' || extract(epoch from x.at)::bigint, 'pending_approval', 'Fiyat onayı bekleyen imalat',
             x.n || ' imalatta özel iş kaleminin fiyatı girilmedi. Onaylarken birim fiyatlarını girin; o zamana kadar hakedişe dahil değil.',
             case when public.is_head_office() then '/panel/approvals' else '/panel/hakedis' end, x.at
      from (
        select count(distinct e.id) as n, max(e.updated_at) as at
        from public.production_items i
        join public.production_jobs j on j.id = i.production_job_id
        join public.production_entries e on e.id = j.production_entry_id
        left join public.hakedis_extra_values v on v.production_item_id = i.id
        where i.company_id = v_company and i.kind = 'extra' and v.production_item_id is null
          and public.can_access_branch(e.branch_id)
      ) x
      where v_hakedis and x.n > 0
    ),
    latest as (
      select * from items order by at desc limit 50
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'key', l.key, 'type', l.type, 'title', l.title, 'body', l.body, 'link', l.link, 'at', l.at,
      'read', r.key is not null
    ) order by l.at desc), '[]'::jsonb)
    from latest l
    left join public.notification_reads r on r.user_id = auth.uid() and r.key = l.key
  );
end;
$function$;
