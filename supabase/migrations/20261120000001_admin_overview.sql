-- =============================================================================
-- MK OPS — süper admin: genel bakış, firma sağlığı, platform işlem geçmişi
--
-- * platform_events: süper adminin firmalar üzerindeki işlemlerinin kaydı (plan/limit/süre
--   değişikliği, askıya alma, silme). audit_logs firma silinince onunla gider; bu tablo
--   firmaya BAĞLI DEĞİLDİR (FK yok), firma silinse de kayıt ve firma adı kalır.
--   RPC-only: istemciye hiçbir tablo yetkisi verilmez; okuma admin_platform_events() ile.
-- * admin_company_health(): firma başına son giriş / son hareket ve kullanım sayıları.
-- * admin_update_company / admin_set_company_suspended / admin_delete_company aynı imzayla
--   yeniden tanımlanır (yetkileri korunur); davranışları aynı, ek olarak olay kaydı yazarlar.
-- =============================================================================
begin;

-- 1. Tablo (RPC-only) ---------------------------------------------------------------------
create table public.platform_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_user_id uuid,
  actor_email text,
  action text not null check (action in ('update_company', 'suspend_company', 'unsuspend_company', 'delete_company')),
  company_id uuid,
  company_name text not null,
  details jsonb not null default '{}'::jsonb
);

comment on table public.platform_events is 'Süper admin işlem geçmişi (firma silinse de kalır; yalnızca ekleme, yalnızca RPC)';
create index idx_platform_events_created on public.platform_events (created_at desc);
create index idx_platform_events_company on public.platform_events (company_id, created_at desc);

alter table public.platform_events enable row level security;
-- Politika yok, istemci rollerine (anon/authenticated) yetki yok: tabloya yalnızca SECURITY DEFINER
-- fonksiyonlar erişir. Identity sequence'ı için de istemci yetkisi gerekmez.
grant select, insert, update, delete on public.platform_events to service_role;

create function public.platform_events_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Platform işlem geçmişi değiştirilemez' using errcode = '42501';
end;
$$;

create trigger platform_events_immutable
before update or delete on public.platform_events
for each row execute function public.platform_events_immutable();

revoke all on function public.platform_events_immutable() from public, anon, authenticated;

-- 2. Yönetim işlemleri: aynı imza, ek olarak olay kaydı ---------------------------------------
create or replace function public.admin_update_company(
  p_company_id uuid,
  p_plan text,
  p_plan_ends_at timestamptz,
  p_user_limit integer,
  p_trial_ends_at timestamptz,
  p_site_chief_limit integer default null,
  p_manager_limit integer default null,
  p_accounting_limit integer default null,
  p_branch_limit integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_count integer;
  v_old public.companies;
  v_new public.companies;
  v_changes jsonb := '{}'::jsonb;
  v_key text;
begin
  perform public.assert_super_admin();

  if p_user_limit is not null and p_user_limit < 1 then
    raise exception 'Kullanıcı limiti en az 1 olmalıdır';
  end if;
  if p_site_chief_limit is not null and p_site_chief_limit < 1 then
    raise exception 'En az 1 firma yöneticisi tanımlanmalıdır';
  end if;
  if p_manager_limit is not null and p_manager_limit < 0 or p_accounting_limit is not null and p_accounting_limit < 0 then
    raise exception 'Rol sayıları negatif olamaz';
  end if;
  if p_branch_limit is null or p_branch_limit < 0 then
    raise exception 'Şube sayısı 0 veya daha büyük olmalıdır';
  end if;
  if p_user_limit is not null
    and coalesce(p_site_chief_limit, 0) + coalesce(p_manager_limit, 0) + coalesce(p_accounting_limit, 0) > p_user_limit then
    raise exception 'Rol sayılarının toplamı (%) toplam kullanıcı sayısını (%) aşıyor',
      coalesce(p_site_chief_limit, 0) + coalesce(p_manager_limit, 0) + coalesce(p_accounting_limit, 0), p_user_limit;
  end if;
  if p_trial_ends_at is null then
    raise exception 'Deneme bitiş tarihi zorunlu';
  end if;

  -- Kota, firmada şu an görevde olan kullanıcı sayısının altına düşürülemez.
  select count(*) into v_count from public.profiles where company_id = p_company_id and is_approved and role = 'site_chief';
  if p_site_chief_limit is not null and p_site_chief_limit < v_count then
    raise exception 'Firmada % firma yöneticisi var; kota bunun altına indirilemez', v_count;
  end if;
  select count(*) into v_count from public.profiles where company_id = p_company_id and is_approved and role = 'company_manager';
  if p_manager_limit is not null and p_manager_limit < v_count then
    raise exception 'Firmada % şantiye şefi var; kota bunun altına indirilemez', v_count;
  end if;
  select count(*) into v_count from public.profiles where company_id = p_company_id and is_approved and role = 'accounting';
  if p_accounting_limit is not null and p_accounting_limit < v_count then
    raise exception 'Firmada % muhasebe kullanıcısı var; kota bunun altına indirilemez', v_count;
  end if;
  select count(*) into v_count from public.branches where company_id = p_company_id and not is_main;
  if p_branch_limit < v_count then
    raise exception 'Firmada % ek şube açık; şube sayısı bunun altına indirilemez', v_count;
  end if;

  select * into v_old from public.companies where id = p_company_id;
  if not found then
    raise exception 'Şirket bulunamadı';
  end if;

  update public.companies
  set
    plan = nullif(trim(p_plan), ''),
    plan_ends_at = case when nullif(trim(p_plan), '') is null then null else p_plan_ends_at end,
    user_limit = p_user_limit,
    site_chief_limit = p_site_chief_limit,
    manager_limit = p_manager_limit,
    accounting_limit = p_accounting_limit,
    branch_limit = p_branch_limit,
    trial_ends_at = p_trial_ends_at
  where id = p_company_id
  returning * into v_new;

  for v_key in select unnest(array[
    'plan', 'plan_ends_at', 'trial_ends_at', 'user_limit',
    'site_chief_limit', 'manager_limit', 'accounting_limit', 'branch_limit'
  ]) loop
    if (to_jsonb(v_old) -> v_key) is distinct from (to_jsonb(v_new) -> v_key) then
      v_changes := v_changes || jsonb_build_object(v_key,
        jsonb_build_object('old', to_jsonb(v_old) -> v_key, 'new', to_jsonb(v_new) -> v_key));
    end if;
  end loop;

  if v_changes <> '{}'::jsonb then
    insert into public.platform_events (actor_user_id, actor_email, action, company_id, company_name, details)
    values (auth.uid(), (select email from public.profiles where id = auth.uid()),
            'update_company', v_new.id, v_new.name, v_changes);
  end if;
end;
$$;

create or replace function public.admin_set_company_suspended(p_company_id uuid, p_suspended boolean)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_old public.companies;
  v_new public.companies;
begin
  perform public.assert_super_admin();

  select * into v_old from public.companies where id = p_company_id;
  if not found then
    raise exception 'Şirket bulunamadı';
  end if;

  update public.companies
  set suspended_at = case when p_suspended then coalesce(suspended_at, now()) end
  where id = p_company_id
  returning * into v_new;

  if (v_old.suspended_at is not null) is distinct from (v_new.suspended_at is not null) then
    insert into public.platform_events (actor_user_id, actor_email, action, company_id, company_name)
    values (auth.uid(), (select email from public.profiles where id = auth.uid()),
            case when p_suspended then 'suspend_company' else 'unsuspend_company' end,
            v_new.id, v_new.name);
  end if;
end;
$$;

-- Şirket ve bütün verisi silinir; kullanıcı hesapları kalır ve şirketsiz
-- (onay bekleyen) duruma düşer. Silme platform_events'e yazılır (firma adı ve yönetici ile).
create or replace function public.admin_delete_company(p_company_id uuid, p_confirm_name text)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company public.companies;
  v_owner_email text;
  v_users integer;
begin
  perform public.assert_super_admin();

  select * into v_company from public.companies where id = p_company_id for update;
  if not found then
    raise exception 'Şirket bulunamadı';
  end if;
  if lower(trim(coalesce(p_confirm_name, ''))) <> lower(trim(v_company.name)) then
    raise exception 'Onay için şirket adını aynen yazın';
  end if;

  select email into v_owner_email from public.profiles where id = v_company.owner_user_id;
  select count(*) into v_users from public.profiles where company_id = p_company_id;

  insert into public.platform_events (actor_user_id, actor_email, action, company_id, company_name, details)
  values (auth.uid(), (select email from public.profiles where id = auth.uid()),
          'delete_company', v_company.id, v_company.name,
          jsonb_build_object('owner_email', v_owner_email, 'plan', v_company.plan, 'user_count', v_users));

  perform set_config('mk_ops.allow_company_reset', 'on', true);
  perform set_config('mk_ops.allow_company_assignment', 'on', true);
  delete from public.company_manager_permissions where company_id = p_company_id;
  update public.profiles
  set company_id = null, role = 'pending', is_approved = false,
      approved_at = null, approved_by = null
  where company_id = p_company_id;
  delete from public.companies where id = p_company_id;
  perform set_config('mk_ops.allow_company_assignment', 'off', true);
  perform set_config('mk_ops.allow_company_reset', 'off', true);
end;
$$;

-- 3. Firma sağlığı --------------------------------------------------------------------------
create function public.admin_company_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.assert_super_admin();

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'company_id', c.id,
      'last_sign_in_at', s.last_sign_in_at,
      'last_activity_at', greatest(s.last_sign_in_at, a.last_audit_at),
      'activity_30d', a.audit_30d,
      'project_count', (select count(*) from public.projects x where x.company_id = c.id),
      'personnel_count', (select count(*) from public.personnel x where x.company_id = c.id),
      'vehicle_count', (select count(*) from public.vehicles x where x.company_id = c.id)
    ))
    from public.companies c
    left join lateral (
      select max(u.last_sign_in_at) as last_sign_in_at
      from public.profiles p
      join auth.users u on u.id = p.id
      where p.company_id = c.id
    ) s on true
    left join lateral (
      select max(l.created_at) as last_audit_at,
             count(*) filter (where l.created_at > now() - interval '30 days') as audit_30d
      from public.audit_logs l
      where l.company_id = c.id
    ) a on true
  ), '[]'::jsonb);
end;
$$;

-- 4. Platform işlem geçmişi ---------------------------------------------------------------
create function public.admin_platform_events(p_company_id uuid default null, p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.assert_super_admin();

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id,
      'created_at', e.created_at,
      'actor_email', e.actor_email,
      'action', e.action,
      'company_id', e.company_id,
      'company_name', e.company_name,
      'details', e.details
    ) order by e.created_at desc, e.id desc)
    from (
      select * from public.platform_events x
      where p_company_id is null or x.company_id = p_company_id
      order by x.created_at desc, x.id desc
      limit least(greatest(coalesce(p_limit, 200), 1), 500)
    ) e
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_company_health() from public, anon;
grant execute on function public.admin_company_health() to authenticated;
revoke all on function public.admin_platform_events(uuid, integer) from public, anon;
grant execute on function public.admin_platform_events(uuid, integer) to authenticated;

commit;
