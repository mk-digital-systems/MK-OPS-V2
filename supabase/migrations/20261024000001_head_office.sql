-- Merkez yetkisi ve personel/araç onayı
--
--   1. Merkez şubesine atanmış şantiye şefi ("Merkez şantiye şefi") firma yöneticisi gibi bütün şubeleri
--      görür ve işler: personel, araç, irsaliye kabulü, Genel Bakış'ta bütün şubeler veya şube bazında.
--   2. Personel ve aracı firma yöneticisi ya da Merkez şantiye şefi eklerse kayıt hemen kullanıma açılır.
--      Şube şantiye şefi veya muhasebe eklerse "Onay bekliyor" olarak düşer.
--   3. Bekleyen personel/aracı yalnızca firma yöneticisi ve Merkez şantiye şefi onaylar/reddeder;
--      bildirim de onlara gider ve Onaylar sayfasına yönlendirir.

create function public.is_head_office()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select case public.current_user_role()
    when 'site_chief' then true
    when 'company_manager' then exists (
      select 1 from public.user_branches ub
      join public.branches b on b.id = ub.branch_id
      where ub.user_id = auth.uid() and b.company_id = public.current_company_id() and b.is_main)
    else false
  end;
$$;

comment on function public.is_head_office() is
  'Firma yöneticisi veya Merkez şubesine atanmış şantiye şefi: bütün şubeler ve personel/araç onayı';

revoke all on function public.is_head_office() from public, anon;
grant execute on function public.is_head_office() to authenticated;

create or replace function public.can_access_branch(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select case
    when p_branch_id is null then false
    when public.is_head_office() then
      exists (select 1 from public.branches b where b.id = p_branch_id and b.company_id = public.current_company_id())
    when public.current_user_role() in ('company_manager', 'accounting') then
      exists (select 1 from public.user_branches ub where ub.user_id = auth.uid() and ub.branch_id = p_branch_id)
    else false
  end;
$$;

comment on function public.can_access_branch(uuid) is
  'Firma yöneticisi ve Merkez şantiye şefi bütün şubelere, diğer şantiye şefleri ve muhasebe atandıkları şubelere erişir';

-- Eklemede onay durumu: firma yöneticisi ve Merkez şantiye şefi dışındaki kayıtlar onay bekler.
create or replace function public.set_record_approval()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if tg_op = 'INSERT' then
    if public.is_tenant_request() then
      new.created_by := auth.uid();
      if not public.is_head_office() then
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
$$;

create or replace function public.review_pending_record(p_kind text, p_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company uuid := public.current_company_id();
begin
  if not public.is_head_office() or v_company is null then
    raise exception 'Onay için firma yöneticisi veya Merkez şantiye şefi yetkisi gerekli' using errcode = '42501';
  end if;
  if p_kind not in ('personnel', 'vehicle') then
    raise exception 'Geçersiz kayıt türü';
  end if;

  if p_kind = 'personnel' then
    perform 1 from public.personnel
    where id = p_id and company_id = v_company and approval_status = 'pending'
    for update;
  else
    perform 1 from public.vehicles
    where id = p_id and company_id = v_company and approval_status = 'pending'
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
$$;

-- Şube listesine Merkez yetkisi bayrağı eklenir.
create or replace function public.get_my_branches()
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select jsonb_build_object(
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'is_main', b.is_main, 'sort_order', b.sort_order)
                       order by b.is_main desc, b.sort_order, b.name)
      from public.branches b
      where b.company_id = public.current_company_id() and public.can_access_branch(b.id)
    ), '[]'::jsonb),
    'total_count', (select count(*) from public.branches b where b.company_id = public.current_company_id()),
    'head_office', public.is_head_office(),
    'assignments', case when public.is_site_chief() then coalesce((
      select jsonb_agg(jsonb_build_object('user_id', ub.user_id, 'branch_id', ub.branch_id))
      from public.user_branches ub where ub.company_id = public.current_company_id()
    ), '[]'::jsonb) end
  );
$$;

-- Bildirimler: onay bekleyen personel/araç yalnızca onaylayabilenlere
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
      -- Fiyatı girilmemiş hakediş kayıtları (son 31 gün)
      select 'hakedis_unpriced:' || u.n, 'hakedis_unpriced', 'Fiyatı girilmemiş kayıtlar',
             u.n || ' iş kaydının veya ek işin fiyatı girilmemiş; hakediş toplamına dahil değil.',
             '/panel/hakedis', now()
      from (
        select (
          (select count(*) from public.project_stage_logs l
           left join public.hakedis_log_values hv on hv.log_id = l.id
           join public.project_stage_progress sp on sp.id = l.progress_id
           join public.projects pr on pr.id = sp.project_id
           where l.company_id = v_company and l.quantity is not null and hv.log_id is null
             and public.can_access_branch(pr.branch_id)
             and l.log_date >= v_today - 31)
          +
          (select count(*) from public.production_items i
           join public.production_jobs j on j.id = i.production_job_id
           join public.production_entries e on e.id = j.production_entry_id
           left join public.hakedis_extra_values x on x.production_item_id = i.id
           where i.company_id = v_company and i.kind = 'extra' and x.production_item_id is null
             and public.can_access_branch(e.branch_id)
             and e.work_date >= v_today - 31)
        ) as n
      ) u
      where v_hakedis and u.n > 0
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
