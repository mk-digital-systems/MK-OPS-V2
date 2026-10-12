-- Personel ve araç şube geçmişi; puantajda ve yakıtta şube
--
--   1. Personelin ve aracın şube geçmişi tutulur. Şubeyi kartından firma yöneticisi veya Merkez şantiye şefi
--      değiştirir; geçiş tarihi verilebilir (varsayılan bugün). O tarihten itibaren günler yeni şubeye sayılır.
--   2. Puantajda personelin ay içinde hangi şubede kaç gün çalıştığı görünür (get_attendance_branch_days).
--   3. Yakıt kaydı şubeye bağlıdır: seçilmezse aracın o tarihteki şubesi. Araç ekranında şube bazında yakıt.

-- 1. Şube geçmişi ------------------------------------------------------------------------------

create table public.personnel_branch_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id() references public.companies (id) on delete cascade,
  personnel_id uuid not null,
  branch_id uuid not null,
  start_date date not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint personnel_branch_history_unique unique (personnel_id, start_date),
  constraint personnel_branch_history_personnel_fkey foreign key (company_id, personnel_id)
    references public.personnel (company_id, id) on delete cascade,
  constraint personnel_branch_history_branch_fkey foreign key (company_id, branch_id)
    references public.branches (company_id, id) on delete cascade
);

create table public.vehicle_branch_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id() references public.companies (id) on delete cascade,
  vehicle_id uuid not null,
  branch_id uuid not null,
  start_date date not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint vehicle_branch_history_unique unique (vehicle_id, start_date),
  constraint vehicle_branch_history_vehicle_fkey foreign key (company_id, vehicle_id)
    references public.vehicles (company_id, id) on delete cascade,
  constraint vehicle_branch_history_branch_fkey foreign key (company_id, branch_id)
    references public.branches (company_id, id) on delete cascade
);

comment on table public.personnel_branch_history is 'Personelin şube geçmişi: start_date''ten itibaren branch_id şubesinde';
comment on table public.vehicle_branch_history is 'Aracın şube geçmişi: start_date''ten itibaren branch_id şubesinde';

do $$
declare
  v_table text;
begin
  foreach v_table in array array['personnel_branch_history', 'vehicle_branch_history'] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on public.%I from anon', v_table);
    execute format('grant select on public.%I to authenticated', v_table);
    execute format($p$create policy company_isolation on public.%I as restrictive for all to authenticated
      using (company_id = (select public.current_company_id()))
      with check (company_id = (select public.current_company_id()))$p$, v_table);
  end loop;
end $$;

-- Kaydı görebilen geçmişini de görür; yazma yalnızca tetikleyicilerle.
create policy personnel_branch_history_select on public.personnel_branch_history for select to authenticated
  using (exists (select 1 from public.personnel p where p.id = personnel_id));
create policy vehicle_branch_history_select on public.vehicle_branch_history for select to authenticated
  using (exists (select 1 from public.vehicles v where v.id = vehicle_id));

create index idx_personnel_branch_history on public.personnel_branch_history (personnel_id, start_date);
create index idx_vehicle_branch_history on public.vehicle_branch_history (vehicle_id, start_date);

-- Mevcut kayıtlar: bugünkü şubeleri baştan beri.
insert into public.personnel_branch_history (company_id, personnel_id, branch_id, start_date)
select company_id, id, branch_id, date '2000-01-01' from public.personnel;
insert into public.vehicle_branch_history (company_id, vehicle_id, branch_id, start_date)
select company_id, id, branch_id, date '2000-01-01' from public.vehicles;

-- Verilen tarihteki şube: o tarihte başlamış son kayıt; tarihten önce kayıt yoksa ilk kayıt.
create function public.personnel_branch_on(p_personnel_id uuid, p_date date)
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    (select h.branch_id from public.personnel_branch_history h
     where h.personnel_id = p_personnel_id and h.start_date <= p_date order by h.start_date desc limit 1),
    (select h.branch_id from public.personnel_branch_history h
     where h.personnel_id = p_personnel_id order by h.start_date limit 1),
    (select p.branch_id from public.personnel p where p.id = p_personnel_id));
$$;

create function public.vehicle_branch_on(p_vehicle_id uuid, p_date date)
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    (select h.branch_id from public.vehicle_branch_history h
     where h.vehicle_id = p_vehicle_id and h.start_date <= p_date order by h.start_date desc limit 1),
    (select h.branch_id from public.vehicle_branch_history h
     where h.vehicle_id = p_vehicle_id order by h.start_date limit 1),
    (select v.branch_id from public.vehicles v where v.id = p_vehicle_id));
$$;

revoke all on function public.personnel_branch_on(uuid, date) from public, anon;
revoke all on function public.vehicle_branch_on(uuid, date) from public, anon;
grant execute on function public.personnel_branch_on(uuid, date) to authenticated;
grant execute on function public.vehicle_branch_on(uuid, date) to authenticated;

-- Eklemede ilk kayıt; şube değişince geçiş tarihinden (change_record_branch ile verilir, yoksa bugün) yeni kayıt.
create function public.record_branch_history()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_start date;
begin
  if tg_op = 'INSERT' then
    v_start := coalesce((to_jsonb(new) ->> 'employment_start_date')::date, date '2000-01-01');
  elsif new.branch_id is distinct from old.branch_id then
    v_start := coalesce(nullif(current_setting('mk_ops.branch_start_date', true), '')::date,
                        timezone('Europe/Istanbul', now())::date);
  else
    return null;
  end if;

  if tg_table_name = 'personnel' then
    delete from public.personnel_branch_history where personnel_id = new.id and start_date >= v_start and tg_op = 'UPDATE';
    insert into public.personnel_branch_history (company_id, personnel_id, branch_id, start_date, created_by)
    values (new.company_id, new.id, new.branch_id, v_start, auth.uid());
  else
    delete from public.vehicle_branch_history where vehicle_id = new.id and start_date >= v_start and tg_op = 'UPDATE';
    insert into public.vehicle_branch_history (company_id, vehicle_id, branch_id, start_date, created_by)
    values (new.company_id, new.id, new.branch_id, v_start, auth.uid());
  end if;
  return null;
end;
$$;

revoke all on function public.record_branch_history() from public, anon, authenticated;

create trigger zz_record_branch_history after insert or update of branch_id on public.personnel
for each row execute function public.record_branch_history();
create trigger zz_record_branch_history after insert or update of branch_id on public.vehicles
for each row execute function public.record_branch_history();

-- Kart üzerinden şube değişikliği (geçiş tarihiyle). Yetki şube değiştirme korumasındadır (Merkez).
create function public.change_record_branch(p_kind text, p_id uuid, p_branch_id uuid, p_start_date date default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_start date := coalesce(p_start_date, timezone('Europe/Istanbul', now())::date);
begin
  if not public.is_head_office() then
    raise exception 'Şubeyi yalnızca firma yöneticisi veya Merkez şantiye şefi değiştirebilir' using errcode = '42501';
  end if;
  if p_kind not in ('personnel', 'vehicle') then raise exception 'Geçersiz kayıt türü'; end if;
  if v_start > timezone('Europe/Istanbul', now())::date + 31 then raise exception 'Geçiş tarihi en fazla bir ay sonrası olabilir'; end if;
  perform set_config('mk_ops.branch_start_date', v_start::text, true);
  if p_kind = 'personnel' then
    update public.personnel set branch_id = p_branch_id, updated_by = auth.uid() where id = p_id and branch_id is distinct from p_branch_id;
  else
    update public.vehicles set branch_id = p_branch_id, updated_by = auth.uid() where id = p_id and branch_id is distinct from p_branch_id;
  end if;
  perform set_config('mk_ops.branch_start_date', '', true);
end;
$$;

revoke all on function public.change_record_branch(text, uuid, uuid, date) from public, anon;
grant execute on function public.change_record_branch(text, uuid, uuid, date) to authenticated;

-- 2. Puantaj: ay içinde şube bazında çalışılan gün --------------------------------------------------

create function public.get_attendance_branch_days(p_year integer, p_month integer)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select case when public.can_view_personnel_attendance() then coalesce((
    select jsonb_agg(jsonb_build_object('personnel_id', x.personnel_id, 'branch_id', x.branch_id,
                                        'branch_name', b.name, 'worked', x.worked)
                     order by x.personnel_id, b.is_main desc, b.sort_order, b.name)
    from (
      select a.personnel_id, public.personnel_branch_on(a.personnel_id, a.attendance_date) as branch_id,
             count(*)::integer as worked
      from public.attendance_records a
      join public.personnel p on p.id = a.personnel_id
      where a.company_id = public.current_company_id()
        and public.can_access_branch(p.branch_id)
        and a.status::text = 'worked'
        and a.attendance_date >= make_date(p_year, p_month, 1)
        and a.attendance_date < make_date(p_year, p_month, 1) + interval '1 month'
      group by 1, 2
    ) x
    join public.branches b on b.id = x.branch_id
  ), '[]'::jsonb) end;
$$;

revoke all on function public.get_attendance_branch_days(integer, integer) from public, anon;
grant execute on function public.get_attendance_branch_days(integer, integer) to authenticated;

-- 3. Yakıt kaydında şube ------------------------------------------------------------------------------

alter table public.vehicle_fuel_logs add column branch_id uuid;
alter table public.vehicle_fuel_logs disable trigger user;
update public.vehicle_fuel_logs f set branch_id = (select v.branch_id from public.vehicles v where v.id = f.vehicle_id);
alter table public.vehicle_fuel_logs enable trigger user;
alter table public.vehicle_fuel_logs
  alter column branch_id set not null,
  add constraint vehicle_fuel_logs_branch_fkey foreign key (company_id, branch_id)
    references public.branches (company_id, id);
create index idx_vehicle_fuel_logs_branch on public.vehicle_fuel_logs (branch_id, fuel_date);

comment on column public.vehicle_fuel_logs.branch_id is 'Yakıtın yazıldığı şube (varsayılan: aracın o tarihteki şubesi)';

create function public.vehicle_fuel_set_branch()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.branch_id is null then
    new.branch_id := public.vehicle_branch_on(new.vehicle_id, new.fuel_date);
  elsif public.is_tenant_request() and not public.can_access_branch(new.branch_id) then
    raise exception 'Bu şubeye yakıt yazamazsınız' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.vehicle_fuel_set_branch() from public, anon, authenticated;

create trigger a2_vehicle_fuel_set_branch before insert or update of branch_id on public.vehicle_fuel_logs
for each row execute function public.vehicle_fuel_set_branch();

drop function public.record_vehicle_fuel_purchase(uuid, date, bigint, numeric, text);
create function public.record_vehicle_fuel_purchase(p_vehicle_id uuid, p_fuel_date date, p_odometer_km bigint, p_liters numeric,
  p_notes text default null, p_branch_id uuid default null)
returns public.vehicle_fuel_logs
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_vehicle public.vehicles;
  v_latest_km bigint;
  v_log public.vehicle_fuel_logs;
begin
  if not public.has_module_write_permission('vehicles') then
    raise exception 'Araç işlem yetkisi gerekli' using errcode = '42501';
  end if;
  if p_fuel_date is null or p_fuel_date > current_date then
    raise exception 'Yakıt tarihi geçersiz';
  end if;
  if p_liters is null or p_liters <= 0 then raise exception 'Litre sıfırdan büyük olmalıdır'; end if;

  select * into v_vehicle from public.vehicles where company_id = public.current_company_id() and id = p_vehicle_id for update;
  if not found then raise exception 'Araç bulunamadı'; end if;
  select max(odometer_km) into v_latest_km from public.vehicle_fuel_logs
  where company_id = public.current_company_id() and vehicle_id = p_vehicle_id;
  v_latest_km := greatest(v_vehicle.current_km, coalesce(v_latest_km, 0));
  if p_odometer_km < v_latest_km then
    raise exception 'Yeni kilometre mevcut kilometreden düşük olamaz. Mevcut: % km', v_latest_km;
  end if;

  insert into public.vehicle_fuel_logs (vehicle_id, fuel_date, odometer_km, liters, notes, created_by, branch_id)
  values (p_vehicle_id, p_fuel_date, p_odometer_km, p_liters, nullif(trim(p_notes), ''), auth.uid(), p_branch_id)
  returning * into v_log;
  update public.vehicles set current_km = greatest(current_km, p_odometer_km), updated_by = auth.uid()
  where id = p_vehicle_id;
  return v_log;
end;
$$;

revoke all on function public.record_vehicle_fuel_purchase(uuid, date, bigint, numeric, text, uuid) from public, anon;
grant execute on function public.record_vehicle_fuel_purchase(uuid, date, bigint, numeric, text, uuid) to authenticated;

-- 4. Bildirimler: şubeye malzeme girişi her irsaliye için ayrı ---------------------------------
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
