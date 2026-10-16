-- Plan sınırları: rol kotaları ve şube sayısı (süper admin panelinden verilir)
--
--   * Firmaya toplam kullanıcı sayısına ek olarak kaç firma yöneticisi, şantiye şefi ve muhasebe atanabileceği girilir
--     (ör. 8 kullanıcı = 2 firma yöneticisi + 4 şantiye şefi + 2 muhasebe). Boş bırakılan rol sınırsızdır.
--   * Firmanın açabileceği ek şube sayısı (Merkez hariç) süper admin tarafından verilir; varsayılan 0 = yalnızca Merkez.
--     Mevcut firmalarda şu an açık olan şube sayısı korunur.

alter table public.companies
  add column site_chief_limit integer check (site_chief_limit is null or site_chief_limit >= 1),
  add column manager_limit integer check (manager_limit is null or manager_limit >= 0),
  add column accounting_limit integer check (accounting_limit is null or accounting_limit >= 0),
  add column branch_limit integer not null default 0 check (branch_limit >= 0);

comment on column public.companies.site_chief_limit is 'Atanabilecek firma yöneticisi sayısı; null ise sınırsız';
comment on column public.companies.manager_limit is 'Atanabilecek şantiye şefi sayısı; null ise sınırsız';
comment on column public.companies.accounting_limit is 'Atanabilecek muhasebe kullanıcı sayısı; null ise sınırsız';
comment on column public.companies.branch_limit is 'Açılabilecek ek şube sayısı (Merkez hariç)';

update public.companies c
set branch_limit = (select count(*) from public.branches b where b.company_id = c.id and not b.is_main);

CREATE OR REPLACE FUNCTION public.enforce_role_user_limits()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
declare
  v_count integer;
  v_user_limit integer;
  v_role_limit integer;
  v_role_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('mk-ops-role-assignment:' || coalesce(new.company_id::text, '')));

  if new.is_approved = true
    and new.company_id is not null
    and (tg_op = 'INSERT' or old.is_approved is distinct from true) then
    select user_limit into v_user_limit from public.companies where id = new.company_id;
    if v_user_limit is not null then
      select count(*)::integer
      into v_count
      from public.profiles
      where company_id = new.company_id
        and is_approved = true
        and id <> new.id;
      if v_count >= v_user_limit then
        raise exception 'Planınızın kullanıcı limitine (%) ulaşıldı', v_user_limit;
      end if;
    end if;
  end if;


  -- Rol kotası: süper admin firmaya kaç firma yöneticisi, şantiye şefi ve muhasebe atanabileceğini belirler (boş = sınırsız).
  if new.is_approved = true
    and new.company_id is not null
    and new.role in ('site_chief', 'company_manager', 'accounting')
    and (tg_op = 'INSERT' or old.is_approved is distinct from true or old.role is distinct from new.role) then
    select case new.role when 'site_chief' then c.site_chief_limit when 'company_manager' then c.manager_limit else c.accounting_limit end
    into v_role_limit
    from public.companies c where c.id = new.company_id;
    if v_role_limit is not null then
      select count(*)::integer into v_role_count
      from public.profiles
      where company_id = new.company_id and is_approved = true and role = new.role and id <> new.id;
      if v_role_count >= v_role_limit then
        raise exception 'Planınızda en fazla % % kullanıcısı tanımlı',
          v_role_limit,
          case new.role when 'site_chief' then 'firma yöneticisi' when 'company_manager' then 'şantiye şefi' else 'muhasebe' end;
      end if;
    end if;
  end if;

  return new;
end;
$function$
;

-- Şube sayısı sınırı: Merkez her zaman vardır; ek şubeler firmanın sınırıyla açılır.
create function public.enforce_branch_limit()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_limit integer;
begin
  if new.is_main then
    return new;
  end if;
  select branch_limit into v_limit from public.companies where id = new.company_id;
  if (select count(*) from public.branches b where b.company_id = new.company_id and not b.is_main) >= coalesce(v_limit, 0) then
    raise exception 'Planınızda en fazla % ek şube açılabilir; şube sayısını artırmak için destek ile iletişime geçin', coalesce(v_limit, 0);
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_branch_limit() from public, anon, authenticated;

create trigger a0_enforce_branch_limit before insert on public.branches
for each row execute function public.enforce_branch_limit();

CREATE OR REPLACE FUNCTION public.admin_list_companies()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
begin
  perform public.assert_super_admin();

  return coalesce((
    select jsonb_agg(row_data order by created_at desc)
    from (
      select
        c.created_at,
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'join_code', c.join_code,
          'created_at', c.created_at,
          'trial_ends_at', c.trial_ends_at,
          'plan', c.plan,
          'plan_ends_at', c.plan_ends_at,
          'user_limit', c.user_limit,
          'site_chief_limit', c.site_chief_limit,
          'manager_limit', c.manager_limit,
          'accounting_limit', c.accounting_limit,
          'branch_limit', c.branch_limit,
          'site_chief_count', (select count(*) from public.profiles x where x.company_id = c.id and x.is_approved and x.role = 'site_chief'),
          'manager_count', (select count(*) from public.profiles x where x.company_id = c.id and x.is_approved and x.role = 'company_manager'),
          'accounting_count', (select count(*) from public.profiles x where x.company_id = c.id and x.is_approved and x.role = 'accounting'),
          'extra_branch_count', (select count(*) from public.branches b where b.company_id = c.id and not b.is_main),
          'suspended_at', c.suspended_at,
          'access_status', public.company_access_status(c),
          'project_addons', to_jsonb(c.project_addons),
          'owner_name', o.full_name,
          'owner_email', o.email,
          'approved_users', (select count(*) from public.profiles p where p.company_id = c.id and p.is_approved),
          'pending_users', (select count(*) from public.profiles p where p.company_id = c.id and not p.is_approved),
          'open_requests', (select count(*) from public.support_requests r where r.company_id = c.id and r.status = 'open')
        ) as row_data
      from public.companies c
      left join public.profiles o on o.id = c.owner_user_id
    ) rows
  ), '[]'::jsonb);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_company()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
declare
  v_profile public.profiles;
  v_company public.companies;
begin
  if auth.uid() is null then
    return null;
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.company_id is not null then
    select * into v_company from public.companies where id = v_profile.company_id;
  end if;

  return jsonb_build_object(
    'is_super_admin', public.is_super_admin(),
    'company', case when v_company.id is null then null else jsonb_build_object(
      'id', v_company.id,
      'name', v_company.name,
      'access_status', public.company_access_status(v_company),
      'trial_ends_at', v_company.trial_ends_at,
      'plan', v_company.plan,
      'plan_ends_at', v_company.plan_ends_at,
      'user_limit', v_company.user_limit,
      'site_chief_limit', v_company.site_chief_limit,
      'manager_limit', v_company.manager_limit,
      'accounting_limit', v_company.accounting_limit,
      'branch_limit', v_company.branch_limit,
      'site_chief_count', (select count(*) from public.profiles x where x.company_id = v_company.id and x.is_approved and x.role = 'site_chief'),
      'manager_count', (select count(*) from public.profiles x where x.company_id = v_company.id and x.is_approved and x.role = 'company_manager'),
      'accounting_count', (select count(*) from public.profiles x where x.company_id = v_company.id and x.is_approved and x.role = 'accounting'),
      'extra_branch_count', (select count(*) from public.branches b where b.company_id = v_company.id and not b.is_main),
      'payroll_start_day', v_company.payroll_start_day,
      'currency_code', v_company.currency_code,
      'logo_path', v_company.logo_path,
      'primary_manager_id', case when v_profile.is_approved then public.company_primary_manager(v_company.id) end,
      -- Katılım kodunu yalnızca onaylı Firma Yöneticisi ve Şantiye Şefi görür.
      'join_code', case
        when v_profile.role in ('site_chief', 'company_manager') and v_profile.is_approved then v_company.join_code
      end
    ) end
  );
end;
$function$
;

drop function public.admin_update_company(uuid, text, timestamptz, integer, timestamptz);
create function public.admin_update_company(
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
  where id = p_company_id;
  if not found then
    raise exception 'Şirket bulunamadı';
  end if;
end;
$$;

revoke all on function public.admin_update_company(uuid, text, timestamptz, integer, timestamptz, integer, integer, integer, integer) from public, anon;
grant execute on function public.admin_update_company(uuid, text, timestamptz, integer, timestamptz, integer, integer, integer, integer) to authenticated;
