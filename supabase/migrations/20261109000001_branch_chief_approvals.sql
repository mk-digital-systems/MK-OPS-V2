-- Şantiye şefi şubesinin ekleme ve onay yetkilisidir; firma yöneticisi izleme ve denetim içindir.
--
--   1. Şantiye şefi (her şube kendi şefi) kendi şubesinde personel, araç, irsaliye ekler ve doğrudan onaylı olur;
--      muhasebenin eklediği kayıtlar şubenin şefine (ya da firma yöneticisine) onaya düşer.
--   2. Bekleyen personel, araç, irsaliye ve malzeme talebini şef yalnızca kendi şubesinde onaylar/reddeder;
--      bildirim şubenin şefine ve firma yöneticisine gider.
--   3. Bütün şubeleri görme (is_head_office) ve personeli/aracı şubeler arasında taşıma yalnızca firma yöneticisinde kalır.

create function public.can_approve_records()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.current_user_role() in ('site_chief', 'company_manager');
$$;

revoke all on function public.can_approve_records() from public, anon;
grant execute on function public.can_approve_records() to authenticated;

CREATE OR REPLACE FUNCTION public.approve_inventory_request(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
begin
  if not public.can_approve_records() then
    raise exception 'Talebi şantiye şefi (kendi şubesi) veya firma yöneticisi onaylar' using errcode = '42501';
  end if;
  update public.inventory_requests set status = 'approved', approved_at = now(), approved_by = auth.uid()
  where id = p_request_id and company_id = public.current_company_id() and status = 'requested' and public.can_access_branch(branch_id);
  if not found then raise exception 'Yalnızca talep edilmiş kayıt onaylanabilir'; end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_inventory_request_receipt(p_request_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
declare
  v_request public.inventory_requests; v_receipt_id uuid; v_location uuid; v_items jsonb;
begin
  if not public.can_approve_records() then
    raise exception 'Stok girişini şantiye şefi (kendi şubesi) veya firma yöneticisi onaylar' using errcode = '42501';
  end if;
  select * into v_request from public.inventory_requests
  where company_id = public.current_company_id() and id = p_request_id and public.can_access_branch(branch_id) for update;
  if not found or v_request.status <> 'receipt_review' then raise exception 'Yalnızca stok onayı bekleyen irsaliye onaylanabilir'; end if;
  v_location := coalesce(v_request.location_id, public.inventory_branch_location(v_request.branch_id),
    public.inventory_main_location(public.current_company_id()));

  insert into public.inventory_receipts (receipt_date, received_by, dispatch_number, notes, created_by,
    location_id, branch_id, status, approved_by, approved_at)
  select v_request.pending_receipt_date, v_request.pending_received_by, v_request.pending_dispatch_number,
    v_request.pending_receipt_notes, auth.uid(), v_location, l.branch_id, 'approved', auth.uid(), now()
  from public.inventory_locations l where l.id = v_location
  returning id into v_receipt_id;

  select jsonb_agg(jsonb_build_object('catalog_id', catalog_id, 'material_code', material_code, 'quantity', quantity))
  into v_items
  from public.inventory_request_receipt_items
  where company_id = public.current_company_id() and request_id = p_request_id;
  perform public.inventory_post_receipt(v_receipt_id, v_items, 'Malzeme talebinden irsaliye ile stok girişi');

  update public.inventory_requests set status = 'received', received_at = now(), receipt_id = v_receipt_id, location_id = v_location
  where id = p_request_id;
  return v_receipt_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_inventory_receipt(p_receipt_date date, p_received_by text, p_dispatch_number text, p_notes text, p_items jsonb, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
declare
  v_id uuid; v_location uuid; v_branch uuid; v_direct boolean := public.can_approve_records();
begin
  if not (public.has_module_write_permission('inventory') or public.current_user_role() = 'accounting') then
    raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode = '42501';
  end if;
  if p_receipt_date is null or char_length(trim(coalesce(p_received_by, ''))) < 2
     or char_length(trim(coalesce(p_dispatch_number, ''))) < 1 then
    raise exception 'Tarih, teslim alan ve irsaliye numarası zorunlu';
  end if;
  v_location := public.inventory_resolve_location(p_location_id);
  perform public.inventory_require_branch_access(v_location);
  perform public.inventory_check_receipt_items(p_items, null);
  select branch_id into v_branch from public.inventory_locations where id = v_location;

  insert into public.inventory_receipts (receipt_date, received_by, dispatch_number, notes, created_by,
    location_id, branch_id, status, approved_by, approved_at)
  values (p_receipt_date, trim(p_received_by), trim(p_dispatch_number), nullif(trim(p_notes), ''), auth.uid(),
    v_location, v_branch, case when v_direct then 'approved' else 'pending' end,
    case when v_direct then auth.uid() end, case when v_direct then now() end)
  returning id into v_id;

  if v_direct then
    perform public.inventory_post_receipt(v_id, p_items, 'İrsaliye ile stok girişi');
  else
    insert into public.inventory_receipt_lines (receipt_id, catalog_id, material_code, quantity)
    select v_id, c.id, case when c.has_id then nullif(trim(x ->> 'material_code'), '') end, (x ->> 'quantity')::numeric
    from jsonb_array_elements(p_items) x
    join public.inventory_catalog c on c.id = (x ->> 'catalog_id')::uuid and c.company_id = public.current_company_id();
  end if;
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_branches()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  select jsonb_build_object(
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'is_main', b.is_main, 'sort_order', b.sort_order)
                       order by b.is_main desc, b.sort_order, b.name)
      from public.branches b
      where b.company_id = public.current_company_id() and public.can_access_branch(b.id)
    ), '[]'::jsonb),
    'total_count', (select count(*) from public.branches b where b.company_id = public.current_company_id()),
    'head_office', public.is_head_office(),
    'can_approve', public.can_approve_records(),
    'assignments', case when public.is_site_chief() then coalesce((
      select jsonb_agg(jsonb_build_object('user_id', ub.user_id, 'branch_id', ub.branch_id))
      from public.user_branches ub where ub.company_id = public.current_company_id()
    ), '[]'::jsonb) end,
    'head_office_users', case when public.is_site_chief() then coalesce((
      select jsonb_agg(g.user_id)
      from public.head_office_grants g where g.company_id = public.current_company_id()
    ), '[]'::jsonb) end
  );
$function$
;

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
      -- Onay bekleyen personel / araç: şantiye şefi ve firma yöneticisi onaylar
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
      where public.can_approve_records() and x.n > 0

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
      where public.can_approve_records() and r.company_id = v_company and r.status = 'pending' and public.can_access_branch(r.branch_id)

      union all
      -- Onay bekleyen malzeme talepleri (talep onayı veya stok girişi onayı)
      select 'pending_request:' || s.n || ':' || extract(epoch from s.at)::bigint, 'pending_approval', 'Onay bekleyen malzeme talebi',
             s.n || ' malzeme talebi onayınızı bekliyor.', '/panel/approvals', s.at
      from (
        select count(*) as n, max(q.created_at) as at from public.inventory_requests q
        where q.company_id = v_company and q.status in ('requested', 'receipt_review') and public.can_access_branch(q.branch_id)
      ) s
      where public.can_approve_records() and s.n > 0

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
             case when public.can_approve_records() then '/panel/approvals' else '/panel/hakedis' end, x.at
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
$function$
;

CREATE OR REPLACE FUNCTION public.review_inventory_receipt(p_receipt_id uuid, p_approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
declare
  v_items jsonb;
begin
  if not public.can_approve_records() then
    raise exception 'İrsaliyeyi şantiye şefi (kendi şubesi) veya firma yöneticisi onaylar' using errcode = '42501';
  end if;
  perform 1 from public.inventory_receipts
  where id = p_receipt_id and company_id = public.current_company_id() and status = 'pending' and public.can_access_branch(branch_id)
  for update;
  if not found then raise exception 'Onay bekleyen irsaliye bulunamadı'; end if;

  if not p_approve then
    delete from public.inventory_receipts where id = p_receipt_id;
    return;
  end if;

  select jsonb_agg(jsonb_build_object('catalog_id', catalog_id, 'material_code', material_code, 'quantity', quantity))
  into v_items
  from public.inventory_receipt_lines where receipt_id = p_receipt_id;
  delete from public.inventory_receipt_lines where receipt_id = p_receipt_id;
  update public.inventory_receipts set status = 'approved', approved_by = auth.uid(), approved_at = now()
  where id = p_receipt_id;
  perform public.inventory_post_receipt(p_receipt_id, v_items, 'İrsaliye ile stok girişi (onaylı)');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.review_pending_record(p_kind text, p_id uuid, p_approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
declare
  v_company uuid := public.current_company_id();
begin
  if not public.can_approve_records() or v_company is null then
    raise exception 'Onay için şantiye şefi (kendi şubesi) veya firma yöneticisi yetkisi gerekli' using errcode = '42501';
  end if;
  if p_kind not in ('personnel', 'vehicle') then
    raise exception 'Geçersiz kayıt türü';
  end if;

  if p_kind = 'personnel' then
    perform 1 from public.personnel
    where id = p_id and company_id = v_company and approval_status = 'pending' and public.can_access_branch(branch_id)
    for update;
  else
    perform 1 from public.vehicles
    where id = p_id and company_id = v_company and approval_status = 'pending' and public.can_access_branch(branch_id)
    for update;
  end if;
  if not found then
    raise exception 'Onay bekleyen kayıt bulunamadı';
  end if;

  if p_approve then
    perform set_config('mk_ops.record_review', 'on', true);
    if p_kind = 'personnel' then
      update public.personnel
      set approval_status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_by = auth.uid()
      where id = p_id;
    else
      update public.vehicles
      set approval_status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_by = auth.uid()
      where id = p_id;
    end if;
    perform set_config('mk_ops.record_review', 'off', true);
  elsif p_kind = 'personnel' then
    delete from public.personnel where id = p_id;
  else
    delete from public.vehicles where id = p_id;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_record_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
begin
  if tg_op = 'INSERT' then
    if public.is_tenant_request() then
      new.created_by := auth.uid();
      if not public.can_approve_records() then
        new.approval_status := 'pending';
        new.approved_by := null;
        new.approved_at := null;
      else
        new.approval_status := 'approved';
        new.approved_by := auth.uid();
        new.approved_at := now();
      end if;
    end if;
    return new;
  end if;

  if (new.approval_status, new.approved_by, new.approved_at)
       is distinct from (old.approval_status, old.approved_by, old.approved_at)
    and public.is_tenant_request()
    and coalesce(current_setting('mk_ops.record_review', true), '') <> 'on' then
    raise exception 'Onay durumu yalnızca onay işlemiyle değiştirilebilir' using errcode = '42501';
  end if;
  return new;
end;
$function$
;
