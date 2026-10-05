-- =============================================================================
-- MK OPS — şirket kaydı, şirkete katılma ve erişim durumu
--
-- * create_company: kullanıcı yeni şirket kurar ve şirketin ana şantiye şefi
--   olur; 48 saatlik deneme süresi başlar.
-- * join_company: kullanıcı şirket adı + 4 haneli kodla katılma isteği
--   gönderir; şantiye şefi onaylayana kadar 'pending' kalır.
-- * Deneme süresi biten, planı sona eren veya askıya alınan şirketin
--   kullanıcıları şirket verisine erişemez (current_company_id null döner).
-- =============================================================================

-- 1. Erişim durumu ---------------------------------------------------------------
create function public.company_access_status(p_company public.companies)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_company.suspended_at is not null then 'suspended'
    when p_company.plan is not null
      and (p_company.plan_ends_at is null or p_company.plan_ends_at > now()) then 'active'
    when p_company.trial_ends_at > now() then 'trial'
    else 'expired'
  end;
$$;

comment on function public.company_access_status(public.companies) is
  'trial | active | expired | suspended';

-- Erişimi açık olmayan şirketin kullanıcısı için null döner; bütün RLS
-- politikaları ve yazma korumaları bu fonksiyona dayandığı için erişim kapanır.
create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select p.company_id
  from public.profiles p
  join public.companies c on c.id = p.company_id
  where p.id = auth.uid()
    and public.company_access_status(c) in ('trial', 'active');
$$;

-- 2. Katılma denemeleri ----------------------------------------------------------
create table public.company_join_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index idx_company_join_attempts_user on public.company_join_attempts (user_id, attempted_at desc);

comment on table public.company_join_attempts is 'Hatalı şirket adı/kod denemeleri; kod tahminini sınırlamak için';

alter table public.company_join_attempts enable row level security;
revoke all on public.company_join_attempts from anon, authenticated;

-- 3. Hesap bilgisi ---------------------------------------------------------------
create function public.get_my_company()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
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
      -- Katılım kodunu yalnızca onaylı şantiye şefi görür.
      'join_code', case
        when v_profile.role = 'site_chief' and v_profile.is_approved then v_company.join_code
      end
    ) end
  );
end;
$$;

comment on function public.get_my_company() is
  'Oturumdaki kullanıcının süper admin olup olmadığı ve şirket bilgisi';

-- 4. Şirket kurma ------------------------------------------------------------------
create function public.create_company(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_profile public.profiles;
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Oturum gerekli' using errcode = '42501';
  end if;
  if public.is_super_admin() then
    raise exception 'Süper admin hesabı şirket kuramaz' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = auth.uid() for update;
  if not found then
    raise exception 'Profil bulunamadı';
  end if;
  if v_profile.company_id is not null then
    raise exception 'Hesabınız zaten bir şirkete bağlı';
  end if;
  if char_length(v_name) not between 2 and 120 then
    raise exception 'Şirket adı 2-120 karakter olmalıdır';
  end if;

  begin
    insert into public.companies (name, join_code, owner_user_id)
    values (v_name, lpad(floor(random() * 10000)::integer::text, 4, '0'), auth.uid())
    returning id into v_company_id;
  exception
    when unique_violation then
      raise exception 'Bu şirket adı zaten kayıtlı. Şirkete katılmak için katılım kodunu kullanın.';
  end;

  perform set_config('mk_ops.allow_company_assignment', 'on', true);
  update public.profiles
  set
    company_id = v_company_id,
    role = 'site_chief',
    is_approved = true,
    approved_at = now(),
    approved_by = auth.uid()
  where id = auth.uid();
  perform set_config('mk_ops.allow_company_assignment', 'off', true);

  return public.get_my_company();
end;
$$;

comment on function public.create_company(text) is
  'Yeni şirket kurar; kuran kullanıcı ana şantiye şefi olur ve 48 saatlik deneme başlar.';

-- 5. Şirkete katılma ---------------------------------------------------------------
-- Hatalı denemeler kayıt altında kalsın diye hata fırlatmak yerine sonuç döner.
create function public.join_company(p_name text, p_join_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_profile public.profiles;
  v_company public.companies;
begin
  if auth.uid() is null then
    raise exception 'Oturum gerekli' using errcode = '42501';
  end if;
  if public.is_super_admin() then
    raise exception 'Süper admin hesabı şirkete katılamaz' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = auth.uid() for update;
  if not found then
    raise exception 'Profil bulunamadı';
  end if;
  if v_profile.company_id is not null then
    return jsonb_build_object('ok', false, 'error', 'Hesabınız zaten bir şirkete bağlı');
  end if;

  if (
    select count(*)
    from public.company_join_attempts
    where user_id = auth.uid()
      and attempted_at > now() - interval '1 hour'
  ) >= 5 then
    return jsonb_build_object('ok', false, 'error', 'Çok fazla hatalı deneme. Bir saat sonra tekrar deneyin.');
  end if;

  select * into v_company
  from public.companies
  where lower(trim(name)) = lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'))
    and join_code = trim(coalesce(p_join_code, ''));

  if v_company.id is null then
    insert into public.company_join_attempts (user_id) values (auth.uid());
    return jsonb_build_object('ok', false, 'error', 'Şirket adı veya katılım kodu hatalı');
  end if;

  if public.company_access_status(v_company) not in ('trial', 'active') then
    return jsonb_build_object('ok', false, 'error', 'Bu şirketin hesabı şu anda aktif değil');
  end if;

  perform set_config('mk_ops.allow_company_assignment', 'on', true);
  update public.profiles
  set company_id = v_company.id, role = 'pending', is_approved = false,
      approved_at = null, approved_by = null
  where id = auth.uid();
  perform set_config('mk_ops.allow_company_assignment', 'off', true);

  return jsonb_build_object('ok', true, 'company_name', v_company.name);
end;
$$;

comment on function public.join_company(text, text) is
  'Şirket adı + katılım koduyla şirkete onay bekleyen kullanıcı olarak katılır.';

-- 6. Bekleyen katılım isteğini iptal etme / reddetme --------------------------------
create function public.leave_pending_company()
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform set_config('mk_ops.allow_company_assignment', 'on', true);
  update public.profiles
  set company_id = null
  where id = auth.uid()
    and role = 'pending'
    and is_approved = false
    and company_id is not null;
  if not found then
    raise exception 'İptal edilecek katılım isteği bulunamadı';
  end if;
  perform set_config('mk_ops.allow_company_assignment', 'off', true);
end;
$$;

create function public.reject_join_request(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.is_site_chief() or public.current_company_id() is null then
    raise exception 'Bu işlem için şantiye şefi yetkisi gerekli' using errcode = '42501';
  end if;

  perform set_config('mk_ops.allow_company_assignment', 'on', true);
  update public.profiles
  set company_id = null
  where id = p_user_id
    and company_id = public.current_company_id()
    and role = 'pending'
    and is_approved = false;
  if not found then
    raise exception 'Bekleyen katılım isteği bulunamadı';
  end if;
  perform set_config('mk_ops.allow_company_assignment', 'off', true);
end;
$$;

-- 7. Plan kullanıcı limiti -----------------------------------------------------------
create or replace function public.enforce_role_user_limits()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_role_count integer;
  v_user_limit integer;
begin
  perform pg_advisory_xact_lock(hashtext('mk-ops-role-assignment:' || coalesce(new.company_id::text, '')));

  if new.is_approved = true and new.role = 'company_manager' then
    select count(*)::integer
    into v_role_count
    from public.profiles
    where role = 'company_manager'
      and is_approved = true
      and company_id = new.company_id
      and id <> new.id;

    if v_role_count >= 3 then
      raise exception 'En fazla 3 şirket yöneticisi atanabilir';
    end if;
  end if;

  if new.is_approved = true and new.role = 'accounting' then
    select count(*)::integer
    into v_role_count
    from public.profiles
    where role = 'accounting'
      and is_approved = true
      and company_id = new.company_id
      and id <> new.id;

    if v_role_count >= 2 then
      raise exception 'En fazla 2 muhasebe kullanıcısı atanabilir';
    end if;
  end if;

  if new.is_approved = true
    and new.company_id is not null
    and (tg_op = 'INSERT' or old.is_approved is distinct from true) then
    select user_limit into v_user_limit from public.companies where id = new.company_id;
    if v_user_limit is not null then
      select count(*)::integer
      into v_role_count
      from public.profiles
      where company_id = new.company_id
        and is_approved = true
        and id <> new.id;
      if v_role_count >= v_user_limit then
        raise exception 'Planınızın kullanıcı limitine (%) ulaşıldı', v_user_limit;
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- 8. Yetkiler ------------------------------------------------------------------------
revoke execute on function public.company_access_status(public.companies) from public, anon;
revoke execute on function public.get_my_company() from public, anon;
revoke execute on function public.create_company(text) from public, anon;
revoke execute on function public.join_company(text, text) from public, anon;
revoke execute on function public.leave_pending_company() from public, anon;
revoke execute on function public.reject_join_request(uuid) from public, anon;
grant execute on function public.company_access_status(public.companies) to authenticated, service_role;
grant execute on function public.get_my_company() to authenticated, service_role;
grant execute on function public.create_company(text) to authenticated;
grant execute on function public.join_company(text, text) to authenticated;
grant execute on function public.leave_pending_company() to authenticated;
grant execute on function public.reject_join_request(uuid) to authenticated;
