-- Firmaya özel proje eklentileri (süper admin açar)
--
--   hp         HP odaklı projeler: pafta, HP adedi, pafta durumu ve ekip başı
--   corporate  Kurumsal projeler: elle durum, öncelik sırası, lokasyon
--
--   Varsayılan boş: eklenti açılmayan firmada hiçbir şey değişmez. Firma kullanıcıları
--   şirket kaydını yalnızca okuyabildiği için eklentiyi yalnız süper admin açıp kapatır.

alter table public.companies
  add column project_addons text[] not null default '{}'
    constraint companies_project_addons_valid check (project_addons <@ array['hp', 'corporate']::text[]);

comment on column public.companies.project_addons is 'Süper adminin açtığı proje eklentileri (hp, corporate)';

-- Oturumdaki firmada eklenti açık mı (ekranlar ve sonraki eklenti fonksiyonları için).
create function public.company_has_project_addon(p_addon text)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    (select p_addon = any (c.project_addons) from public.companies c where c.id = public.current_company_id()),
    false
  );
$$;

revoke all on function public.company_has_project_addon(text) from public, anon;
grant execute on function public.company_has_project_addon(text) to authenticated;

create function public.admin_set_company_project_addons(p_company_id uuid, p_addons text[])
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.assert_super_admin();

  update public.companies
  set project_addons = coalesce(
    (select array_agg(distinct addon order by addon) from unnest(p_addons) as addon),
    '{}'
  )
  where id = p_company_id;
  if not found then
    raise exception 'Şirket bulunamadı';
  end if;
end;
$$;

revoke all on function public.admin_set_company_project_addons(uuid, text[]) from public, anon;
grant execute on function public.admin_set_company_project_addons(uuid, text[]) to authenticated, service_role;

-- Şirket listesine eklentiler eklenir; geri kalanı 20261006000003 ile aynı.
create or replace function public.admin_list_companies()
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
$$;
