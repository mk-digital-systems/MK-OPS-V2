-- =============================================================================
-- MK OPS — süper admin paneli ve destek talepleri
--
-- * Şantiye şefi destek / plan talebi gönderir. Deneme süresi dolmuş veya
--   askıya alınmış şirketin şefi de talep gönderebilir.
-- * Süper admin şirketleri listeler, plan atar, deneme süresini uzatır,
--   askıya alır, siler ve talepleri yanıtlar. Bütün yönetim işlemleri
--   is_super_admin() kontrolü yapan fonksiyonlarla yapılır.
-- =============================================================================

-- 1. Yardımcılar ---------------------------------------------------------------------
-- Erişim durumundan bağımsız olarak kullanıcının şirketi (destek talepleri için).
create function public.profile_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select p.company_id from public.profiles p where p.id = auth.uid();
$$;

create function public.assert_super_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Bu işlem için süper admin yetkisi gerekli' using errcode = '42501';
  end if;
end;
$$;

-- Şirket silinirken profilleri şirketsiz bırakmak için şef korumasına istisna.
create or replace function public.protect_primary_site_chief()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company_id uuid := case when tg_op = 'DELETE' then old.company_id else new.company_id end;
  v_site_chief_id uuid;
begin
  if current_setting('mk_ops.allow_company_reset', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and old.company_id is not null then
    v_company_id := old.company_id;
  end if;

  if v_company_id is not null then
    select id
    into v_site_chief_id
    from public.profiles
    where company_id = v_company_id
      and role = 'site_chief'
    order by approved_at nulls last, created_at, id
    limit 1;
  end if;

  if tg_op = 'DELETE' and old.id = v_site_chief_id then
    if exists (select 1 from public.companies where id = old.company_id) then
      raise exception 'Ana şantiye şefi hesabı silinemez'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op in ('INSERT', 'UPDATE')
    and new.role = 'site_chief'
    and v_site_chief_id is not null
    and new.id <> v_site_chief_id then
    raise exception 'Başka bir kullanıcı şantiye şefi yapılamaz'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and old.id = v_site_chief_id then
    if new.id <> v_site_chief_id
      or new.company_id is distinct from old.company_id
      or new.role <> 'site_chief'
      or new.is_approved is not true
      or new.approved_at is null
      or new.approved_by is distinct from v_site_chief_id then
      raise exception 'Ana şantiye şefinin rolü ve onayı değiştirilemez'
        using errcode = '42501';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE')
    and new.role = 'site_chief'
    and v_site_chief_id is null then
    if new.company_id is null
      or new.is_approved is not true
      or new.approved_at is null
      or new.approved_by is distinct from new.id then
      raise exception 'Ana şantiye şefi yalnız korumalı rol ile oluşturulabilir'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- 2. Destek talepleri ------------------------------------------------------------------
create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  topic text not null check (topic in ('plan', 'support')),
  requested_plan text check (requested_plan is null or char_length(trim(requested_plan)) between 1 and 80),
  message text not null check (char_length(trim(message)) between 3 and 4000),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  admin_reply text check (admin_reply is null or char_length(admin_reply) <= 4000),
  replied_at timestamptz,
  replied_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_support_requests_company on public.support_requests (company_id, created_at desc);
create index idx_support_requests_status on public.support_requests (status, created_at desc);

comment on table public.support_requests is 'Şirketlerden süper admine destek ve plan talepleri';

create trigger support_requests_set_updated_at
before update on public.support_requests
for each row execute function public.set_updated_at();

alter table public.support_requests enable row level security;
revoke all on public.support_requests from anon;
revoke insert, update, delete on public.support_requests from authenticated;

-- Şantiye şefi kendi şirketinin taleplerini görür (erişimi kapalı olsa bile).
create policy "support_requests_select_own_company"
  on public.support_requests for select
  to authenticated
  using (
    company_id = (select public.profile_company_id())
    and (select public.is_site_chief())
  );

create function public.create_support_request(
  p_topic text,
  p_requested_plan text,
  p_message text
)
returns public.support_requests
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company_id uuid := public.profile_company_id();
  v_request public.support_requests;
begin
  if v_company_id is null or not public.is_site_chief() then
    raise exception 'Talep yalnızca şantiye şefi tarafından gönderilebilir' using errcode = '42501';
  end if;
  if p_topic not in ('plan', 'support') then
    raise exception 'Geçersiz talep türü';
  end if;
  if (
    select count(*) from public.support_requests
    where company_id = v_company_id and created_at > now() - interval '1 day'
  ) >= 10 then
    raise exception 'Günlük talep sınırına ulaşıldı. Lütfen yanıt bekleyin.';
  end if;

  insert into public.support_requests (company_id, created_by, topic, requested_plan, message)
  values (
    v_company_id,
    auth.uid(),
    p_topic,
    case when p_topic = 'plan' then nullif(trim(p_requested_plan), '') end,
    trim(coalesce(p_message, ''))
  )
  returning * into v_request;
  return v_request;
end;
$$;

-- 3. Süper admin: şirketler ---------------------------------------------------------------
create function public.admin_list_companies()
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
          'suspended_at', c.suspended_at,
          'access_status', public.company_access_status(c),
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
$$;

create function public.admin_company_users(p_company_id uuid)
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
      'id', p.id,
      'full_name', p.full_name,
      'email', p.email,
      'role', p.role,
      'is_approved', p.is_approved,
      'created_at', p.created_at
    ) order by p.is_approved desc, p.created_at)
    from public.profiles p
    where p.company_id = p_company_id
  ), '[]'::jsonb);
end;
$$;

create function public.admin_update_company(
  p_company_id uuid,
  p_plan text,
  p_plan_ends_at timestamptz,
  p_user_limit integer,
  p_trial_ends_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.assert_super_admin();

  if p_user_limit is not null and p_user_limit < 1 then
    raise exception 'Kullanıcı limiti en az 1 olmalıdır';
  end if;
  if p_trial_ends_at is null then
    raise exception 'Deneme bitiş tarihi zorunlu';
  end if;

  update public.companies
  set
    plan = nullif(trim(p_plan), ''),
    plan_ends_at = case when nullif(trim(p_plan), '') is null then null else p_plan_ends_at end,
    user_limit = p_user_limit,
    trial_ends_at = p_trial_ends_at
  where id = p_company_id;
  if not found then
    raise exception 'Şirket bulunamadı';
  end if;
end;
$$;

create function public.admin_set_company_suspended(p_company_id uuid, p_suspended boolean)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.assert_super_admin();

  update public.companies
  set suspended_at = case when p_suspended then coalesce(suspended_at, now()) end
  where id = p_company_id;
  if not found then
    raise exception 'Şirket bulunamadı';
  end if;
end;
$$;

-- Şirket ve bütün verisi silinir; kullanıcı hesapları kalır ve şirketsiz
-- (onay bekleyen) duruma düşer, isterlerse yeni şirket kurabilir/katılabilir.
create function public.admin_delete_company(p_company_id uuid, p_confirm_name text)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company public.companies;
begin
  perform public.assert_super_admin();

  select * into v_company from public.companies where id = p_company_id for update;
  if not found then
    raise exception 'Şirket bulunamadı';
  end if;
  if lower(trim(coalesce(p_confirm_name, ''))) <> lower(trim(v_company.name)) then
    raise exception 'Onay için şirket adını aynen yazın';
  end if;

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

-- 4. Süper admin: destek talepleri ------------------------------------------------------------
create function public.admin_list_support_requests()
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
      'id', r.id,
      'company_id', r.company_id,
      'company_name', c.name,
      'company_access_status', public.company_access_status(c),
      'created_by_name', p.full_name,
      'created_by_email', p.email,
      'topic', r.topic,
      'requested_plan', r.requested_plan,
      'message', r.message,
      'status', r.status,
      'admin_reply', r.admin_reply,
      'replied_at', r.replied_at,
      'created_at', r.created_at
    ) order by (r.status = 'open') desc, r.created_at desc)
    from public.support_requests r
    join public.companies c on c.id = r.company_id
    left join public.profiles p on p.id = r.created_by
  ), '[]'::jsonb);
end;
$$;

create function public.admin_reply_support_request(p_request_id uuid, p_reply text, p_status text)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.assert_super_admin();

  if p_status not in ('open', 'answered', 'closed') then
    raise exception 'Geçersiz talep durumu';
  end if;

  update public.support_requests
  set
    admin_reply = nullif(trim(p_reply), ''),
    status = p_status,
    replied_at = case when nullif(trim(p_reply), '') is null then replied_at else now() end,
    replied_by = case when nullif(trim(p_reply), '') is null then replied_by else auth.uid() end
  where id = p_request_id;
  if not found then
    raise exception 'Talep bulunamadı';
  end if;
end;
$$;

-- 5. Yetkiler -------------------------------------------------------------------------------
do $$
declare
  v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'profile_company_id', 'assert_super_admin', 'create_support_request',
        'admin_list_companies', 'admin_company_users', 'admin_update_company',
        'admin_set_company_suspended', 'admin_delete_company',
        'admin_list_support_requests', 'admin_reply_support_request'
      )
  loop
    execute format('revoke execute on function %s from public, anon', v_function);
    execute format('grant execute on function %s to authenticated, service_role', v_function);
  end loop;
end $$;
