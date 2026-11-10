-- =============================================================================
-- MK OPS — fiyat listesi, ödeme takibi, yeni kayıt / karşılama, süper admin gelen kutusu
--
-- * plan_prices      : paket fiyatları ve limitleri (KDV DAHİL, TL). RPC-only; süper admin düzenler.
--                      Siteye yalnızca public_plan_prices() ile, yayında olan paketler çıkar.
-- * company_payments : manuel plan atamasında alınan ödeme kaydı. Firmaya bağlı DEĞİL (FK yok):
--                      firma silinse de gelir kaydı ve firma adı kalır. RPC-only.
-- * user_onboarding  : yeni kayıt olan kullanıcıya karşılama e-postası gönderildi mi. RPC-only.
-- * email_templates  : süper adminin düzenlediği karşılama e-postası metni (sistem e-posta GÖNDERMEZ). RPC-only.
-- * admin_inbox()    : süper admin bildirimi (yeni kayıt, açık destek talebi).
--
-- GÜVENLİK İSTİSNASI (bilinçli, SUPABASE_SECURITY.md'ye işlendi): public_plan_prices() oturumsuz
-- ziyaretçiye (anon) açıktır. Yalnızca yayındaki paketlerin adı, limiti ve fiyatını döndürür.
-- =============================================================================
begin;

-- 1. Fiyat listesi -------------------------------------------------------------------------
create table public.plan_prices (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 40),
  sort_order integer not null default 0,
  is_custom boolean not null default false,
  is_published boolean not null default true,
  user_limit integer check (user_limit is null or user_limit >= 1),
  site_chief_limit integer check (site_chief_limit is null or site_chief_limit >= 1),
  manager_limit integer check (manager_limit is null or manager_limit >= 0),
  accounting_limit integer check (accounting_limit is null or accounting_limit >= 0),
  branch_limit integer not null default 0 check (branch_limit >= 0),
  price_1m integer check (price_1m is null or price_1m > 0),
  price_3m integer check (price_3m is null or price_3m > 0),
  price_6m integer check (price_6m is null or price_6m > 0),
  updated_at timestamptz not null default now(),
  check (is_custom or (price_1m is not null and price_3m is not null and price_6m is not null and user_limit is not null)),
  check (user_limit is null
    or coalesce(site_chief_limit, 0) + coalesce(manager_limit, 0) + coalesce(accounting_limit, 0) <= user_limit)
);

comment on table public.plan_prices is 'Paket fiyatları (KDV dahil TL) ve limitleri; RPC-only, süper admin düzenler';

alter table public.plan_prices enable row level security;
grant select, insert, update, delete on public.plan_prices to service_role;

insert into public.plan_prices
  (name, sort_order, is_custom, user_limit, site_chief_limit, manager_limit, accounting_limit, branch_limit, price_1m, price_3m, price_6m)
values
  ('Başlangıç',     1, false,    3, 1,    1, 1, 0,  799,  2157,  4075),
  ('Profesyonel',   2, false,   10, 2,    6, 2, 2, 1499,  4047,  7645),
  ('Kurumsal',      3, false,   25, 3,   20, 2, 5, 2999,  8097, 15295),
  ('Özel Kurumsal', 4, true,  null, null, null, null, 0, null, null, null);

-- 2. Ödemeler ---------------------------------------------------------------------------------
create table public.company_payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  company_id uuid,
  company_name text not null,
  plan text not null,
  months integer not null check (months in (1, 3, 6)),
  amount_tl numeric(12, 2) not null check (amount_tl >= 0),
  list_price_tl numeric(12, 2),
  paid_on date not null,
  method text not null default 'eft' check (method in ('eft', 'nakit', 'diger')),
  period_start date not null,
  period_end date not null,
  note text check (note is null or char_length(note) <= 500),
  recorded_by_email text,
  voided_at timestamptz,
  void_reason text check (void_reason is null or char_length(void_reason) <= 300)
);

comment on table public.company_payments is 'Süper adminin plan atarken kaydettiği ödemeler (firma silinse de kalır; RPC-only)';
create index idx_company_payments_paid on public.company_payments (paid_on desc, created_at desc);
create index idx_company_payments_company on public.company_payments (company_id);

alter table public.company_payments enable row level security;
grant select, insert, update, delete on public.company_payments to service_role;

-- 3. Karşılama (yeni kullanıcı) durumu -----------------------------------------------------------
create table public.user_onboarding (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null check (status in ('sent', 'skipped')),
  handled_at timestamptz not null default now(),
  handled_by_email text
);

comment on table public.user_onboarding is 'Yeni kullanıcıya karşılama e-postası gönderildi mi (sent) / gerek yok (skipped); RPC-only';

alter table public.user_onboarding enable row level security;
grant select, insert, update, delete on public.user_onboarding to service_role;

-- Bu özellikten önce kayıtlı olan herkes "önceden kayıtlı" sayılır; yalnızca yeni kayıtlar listede bekler.
insert into public.user_onboarding (user_id, status, handled_at)
select p.id, 'skipped', now() from public.profiles p
on conflict do nothing;

-- 3b. E-posta şablonu (süper admin düzenler; düz metin; sistem e-posta GÖNDERMEZ) ------------------------------
create table public.email_templates (
  kind text primary key check (kind in ('welcome')),
  subject text not null default '' check (char_length(subject) <= 200),
  body text not null default '' check (char_length(body) <= 10000),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by_email text
);

comment on table public.email_templates is 'Süper adminin elle göndereceği e-posta şablonları (düz metin; yer tutucular {{ad}}, {{firma}}, {{deneme_bitis}}); RPC-only';

alter table public.email_templates enable row level security;
grant select, insert, update, delete on public.email_templates to service_role;

insert into public.email_templates (kind, subject, body) values (
  'welcome',
  'MK OPS''e hoş geldiniz',
  E'Merhaba {{ad}},\n\nMK OPS''e kayıt olduğunuz için teşekkür ederiz. {{firma}} için ücretsiz deneme süreniz {{deneme_bitis}} tarihine kadar sürüyor; bütün modülleri deneyebilirsiniz.\n\nBaşlamak için:\n1. Panelin ilk sayfasındaki Kurulum rehberini izleyin (projeler, personel, araçlar).\n2. Takıldığınız her konuda panel içindeki Destek sayfasından bize yazabilirsiniz.\n\nİsterseniz kısa bir görüşmeyle kurulumu birlikte yapabiliriz; uygun olduğunuz zamanı yazmanız yeterli.\n\nİyi çalışmalar,\nMK Digital Systems'
);

-- 4. Platform olay türleri genişler ------------------------------------------------------------------
alter table public.platform_events drop constraint platform_events_action_check;
alter table public.platform_events add constraint platform_events_action_check
  check (action in ('update_company', 'suspend_company', 'unsuspend_company', 'delete_company',
                    'assign_plan', 'void_payment', 'update_prices'));

-- 5. Herkese açık fiyat listesi (anon'a açık TEK fonksiyon) ---------------------------------------------
create function public.public_plan_prices()
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', p.name,
    'is_custom', p.is_custom,
    'user_limit', p.user_limit,
    'branch_limit', p.branch_limit,
    'price_1m', p.price_1m,
    'price_3m', p.price_3m,
    'price_6m', p.price_6m
  ) order by p.sort_order, p.name), '[]'::jsonb)
  from public.plan_prices p
  where p.is_published;
$$;

-- 6. Süper admin: fiyat listesi ----------------------------------------------------------------------------
create function public.admin_list_plan_prices()
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
      'id', p.id, 'name', p.name, 'sort_order', p.sort_order, 'is_custom', p.is_custom,
      'is_published', p.is_published, 'user_limit', p.user_limit, 'site_chief_limit', p.site_chief_limit,
      'manager_limit', p.manager_limit, 'accounting_limit', p.accounting_limit, 'branch_limit', p.branch_limit,
      'price_1m', p.price_1m, 'price_3m', p.price_3m, 'price_6m', p.price_6m, 'updated_at', p.updated_at
    ) order by p.sort_order, p.name)
    from public.plan_prices p
  ), '[]'::jsonb);
end;
$$;

-- p_plans: [{id, is_published, user_limit, site_chief_limit, manager_limit, accounting_limit, branch_limit,
--            price_1m, price_3m, price_6m}] — ad ve "özel" niteliği değişmez.
create function public.admin_save_plan_prices(p_plans jsonb)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_item jsonb;
  v_old public.plan_prices;
  v_new public.plan_prices;
  v_key text;
  v_changes jsonb := '{}'::jsonb;
  v_plan_changes jsonb;
  v_users integer;
  v_chief integer;
  v_manager integer;
  v_accounting integer;
  v_branch integer;
  v_1 integer;
  v_3 integer;
  v_6 integer;
begin
  perform public.assert_super_admin();
  if p_plans is null or jsonb_typeof(p_plans) <> 'array' or jsonb_array_length(p_plans) = 0 then
    raise exception 'Kaydedilecek paket yok';
  end if;

  for v_item in select * from jsonb_array_elements(p_plans) loop
    select * into v_old from public.plan_prices where id = nullif(v_item->>'id', '')::uuid for update;
    if not found then
      raise exception 'Paket bulunamadı';
    end if;

    v_users := nullif(v_item->>'user_limit', '')::integer;
    v_chief := nullif(v_item->>'site_chief_limit', '')::integer;
    v_manager := nullif(v_item->>'manager_limit', '')::integer;
    v_accounting := nullif(v_item->>'accounting_limit', '')::integer;
    v_branch := coalesce(nullif(v_item->>'branch_limit', '')::integer, 0);
    v_1 := nullif(v_item->>'price_1m', '')::integer;
    v_3 := nullif(v_item->>'price_3m', '')::integer;
    v_6 := nullif(v_item->>'price_6m', '')::integer;

    if v_old.is_custom then
      v_users := null; v_chief := null; v_manager := null; v_accounting := null; v_branch := 0;
      v_1 := null; v_3 := null; v_6 := null;
    else
      if v_users is null or v_users < 1 then
        raise exception '% için kullanıcı sayısı en az 1 olmalıdır', v_old.name;
      end if;
      if v_chief is null or v_chief < 1 then
        raise exception '% için en az 1 firma yöneticisi tanımlanmalıdır', v_old.name;
      end if;
      if coalesce(v_manager, 0) < 0 or coalesce(v_accounting, 0) < 0 or v_branch < 0 then
        raise exception '% için sayılar negatif olamaz', v_old.name;
      end if;
      if v_chief + coalesce(v_manager, 0) + coalesce(v_accounting, 0) > v_users then
        raise exception '% için rol sayılarının toplamı (%) kullanıcı sayısını (%) aşıyor',
          v_old.name, v_chief + coalesce(v_manager, 0) + coalesce(v_accounting, 0), v_users;
      end if;
      if v_1 is null or v_3 is null or v_6 is null or v_1 < 1 or v_3 < 1 or v_6 < 1 then
        raise exception '% için 1, 3 ve 6 aylık fiyatların üçü de girilmeli ve 0''dan büyük olmalıdır', v_old.name;
      end if;
    end if;

    update public.plan_prices set
      is_published = coalesce((v_item->>'is_published')::boolean, is_published),
      user_limit = v_users, site_chief_limit = v_chief, manager_limit = v_manager,
      accounting_limit = v_accounting, branch_limit = v_branch,
      price_1m = v_1, price_3m = v_3, price_6m = v_6,
      updated_at = now()
    where id = v_old.id
    returning * into v_new;

    v_plan_changes := '{}'::jsonb;
    for v_key in select unnest(array[
      'is_published', 'user_limit', 'site_chief_limit', 'manager_limit', 'accounting_limit',
      'branch_limit', 'price_1m', 'price_3m', 'price_6m'
    ]) loop
      if (to_jsonb(v_old) -> v_key) is distinct from (to_jsonb(v_new) -> v_key) then
        v_plan_changes := v_plan_changes || jsonb_build_object(v_key,
          jsonb_build_object('old', to_jsonb(v_old) -> v_key, 'new', to_jsonb(v_new) -> v_key));
      end if;
    end loop;
    if v_plan_changes <> '{}'::jsonb then
      v_changes := v_changes || jsonb_build_object(v_new.name, v_plan_changes);
    end if;
  end loop;

  if v_changes <> '{}'::jsonb then
    insert into public.platform_events (actor_user_id, actor_email, action, company_id, company_name, details)
    values (auth.uid(), (select email from public.profiles where id = auth.uid()),
            'update_prices', null, 'Fiyat listesi', v_changes);
  end if;
end;
$$;

-- 7. Süper admin: plan ata + ödemeyi kaydet -------------------------------------------------------------------
-- Aynı plan: süre mevcut bitişten uzar (süresi dolmuşsa bugünden). Farklı plan: bugünden başlar.
-- Hazır planda limitler fiyat listesinden dolar; "Özel Kurumsal"da firmanın mevcut limitleri korunur.
create function public.admin_assign_plan(
  p_company_id uuid,
  p_plan text,
  p_months integer,
  p_amount numeric,
  p_paid_on date,
  p_method text default 'eft',
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company public.companies;
  v_plan public.plan_prices;
  v_today date := timezone('Europe/Istanbul', now())::date;
  v_start date;
  v_end date;
  v_ends_at timestamptz;
  v_list numeric;
  v_payment uuid;
begin
  perform public.assert_super_admin();

  if p_months is null or p_months not in (1, 3, 6) then
    raise exception 'Süre 1, 3 veya 6 ay olmalıdır';
  end if;
  if p_amount is null or p_amount < 0 or p_amount > 10000000 then
    raise exception 'Ödeme tutarı geçersiz';
  end if;
  if p_paid_on is null or p_paid_on > v_today then
    raise exception 'Ödeme tarihi boş veya ileri tarihli olamaz';
  end if;
  if p_method is null or p_method not in ('eft', 'nakit', 'diger') then
    raise exception 'Ödeme yöntemi geçersiz';
  end if;
  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'Not en fazla 500 karakter olabilir';
  end if;

  select * into v_plan from public.plan_prices where name = p_plan;
  if not found then
    raise exception 'Bu plan fiyat listesinde yok';
  end if;

  select * into v_company from public.companies where id = p_company_id for update;
  if not found then
    raise exception 'Şirket bulunamadı';
  end if;

  if v_company.plan is not distinct from v_plan.name and v_company.plan_ends_at is not null then
    v_start := greatest(v_today, timezone('Europe/Istanbul', v_company.plan_ends_at)::date);
  else
    v_start := v_today;
  end if;
  v_end := (v_start + make_interval(months => p_months))::date;
  v_ends_at := (v_end::timestamp + time '23:59:59') at time zone 'Europe/Istanbul';

  v_list := case p_months when 1 then v_plan.price_1m when 3 then v_plan.price_3m else v_plan.price_6m end;

  perform public.admin_update_company(
    p_company_id,
    v_plan.name,
    v_ends_at,
    case when v_plan.is_custom then v_company.user_limit else v_plan.user_limit end,
    v_company.trial_ends_at,
    case when v_plan.is_custom then v_company.site_chief_limit else v_plan.site_chief_limit end,
    case when v_plan.is_custom then v_company.manager_limit else v_plan.manager_limit end,
    case when v_plan.is_custom then v_company.accounting_limit else v_plan.accounting_limit end,
    case when v_plan.is_custom then v_company.branch_limit else v_plan.branch_limit end
  );

  insert into public.company_payments
    (company_id, company_name, plan, months, amount_tl, list_price_tl, paid_on, method,
     period_start, period_end, note, recorded_by_email)
  values
    (v_company.id, v_company.name, v_plan.name, p_months, p_amount, v_list, p_paid_on, p_method,
     v_start, v_end, nullif(trim(p_note), ''), (select email from public.profiles where id = auth.uid()))
  returning id into v_payment;

  insert into public.platform_events (actor_user_id, actor_email, action, company_id, company_name, details)
  values (auth.uid(), (select email from public.profiles where id = auth.uid()),
          'assign_plan', v_company.id, v_company.name,
          jsonb_build_object('plan', v_plan.name, 'months', p_months, 'amount_tl', p_amount,
                             'period_end', v_end, 'payment_id', v_payment));

  return jsonb_build_object('payment_id', v_payment, 'plan_ends_at', v_ends_at, 'period_start', v_start, 'period_end', v_end);
end;
$$;

create function public.admin_list_payments(p_year integer default null)
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
    select jsonb_agg(to_jsonb(x) order by x.paid_on desc, x.created_at desc)
    from (
      select id, created_at, company_id, company_name, plan, months, amount_tl, list_price_tl, paid_on, method,
             period_start, period_end, note, recorded_by_email, voided_at, void_reason
      from public.company_payments
      where p_year is null or extract(year from paid_on) = p_year
      order by paid_on desc, created_at desc
      limit 2000
    ) x
  ), '[]'::jsonb);
end;
$$;

-- İptal: kayıt silinmez, "iptal" işaretlenir ve gelir toplamından düşer. Firmanın planı otomatik geri alınmaz.
create function public.admin_void_payment(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_payment public.company_payments;
begin
  perform public.assert_super_admin();
  if p_reason is null or char_length(trim(p_reason)) < 3 or char_length(p_reason) > 300 then
    raise exception 'İptal nedeni 3-300 karakter olmalıdır';
  end if;
  select * into v_payment from public.company_payments where id = p_id for update;
  if not found then
    raise exception 'Ödeme kaydı bulunamadı';
  end if;
  if v_payment.voided_at is not null then
    raise exception 'Bu ödeme zaten iptal edilmiş';
  end if;
  update public.company_payments set voided_at = now(), void_reason = trim(p_reason) where id = p_id;
  insert into public.platform_events (actor_user_id, actor_email, action, company_id, company_name, details)
  values (auth.uid(), (select email from public.profiles where id = auth.uid()),
          'void_payment', v_payment.company_id, v_payment.company_name,
          jsonb_build_object('plan', v_payment.plan, 'amount_tl', v_payment.amount_tl, 'reason', trim(p_reason)));
end;
$$;

-- 8. Yeni kayıtlar ve karşılama ------------------------------------------------------------------------------------
-- "Yeni kullanıcı": kayıt olan HER kullanıcı (süper adminler hariç): şirket kuran, şirkete katılan veya şirketsiz.
-- p_status: 'pending' (e-posta bekleyen) | 'sent' (karşılananlar) | 'all' (önceden kayıtlılar dahil hepsi)
-- Dönüş: {total, items[]}; sayfalama p_offset / p_limit (en çok 100).
create function public.admin_list_new_users(p_status text default 'pending', p_offset integer default 0, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_total integer;
  v_items jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform public.assert_super_admin();
  if p_status is null or p_status not in ('pending', 'sent', 'all') then
    raise exception 'Geçersiz süzgeç';
  end if;

  select count(*) into v_total
  from public.profiles p
  left join public.companies c on c.id = p.company_id
  left join public.user_onboarding o on o.user_id = p.id
  where not exists (select 1 from public.platform_admins a where a.user_id = p.id)
    and (p_status = 'all' or (p_status = 'pending' and o.user_id is null) or (p_status = 'sent' and o.status = 'sent'));

  select coalesce(jsonb_agg(row_data order by created_at desc), '[]'::jsonb) into v_items
  from (
    select p.created_at,
      jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'email', p.email,
        'created_at', p.created_at,
        'email_confirmed_at', u.email_confirmed_at,
        'last_sign_in_at', u.last_sign_in_at,
        'company_id', c.id,
        'company_name', c.name,
        'role', p.role,
        'is_approved', p.is_approved,
        'is_owner', (c.owner_user_id = p.id),
        'company_status', case when c.id is null then null else public.company_access_status(c) end,
        'trial_ends_at', c.trial_ends_at,
        'onboarding_status', o.status,
        'handled_at', o.handled_at,
        'handled_by_email', o.handled_by_email
      ) as row_data
    from public.profiles p
    left join auth.users u on u.id = p.id
    left join public.companies c on c.id = p.company_id
    left join public.user_onboarding o on o.user_id = p.id
    where not exists (select 1 from public.platform_admins a where a.user_id = p.id)
        and (p_status = 'all' or (p_status = 'pending' and o.user_id is null) or (p_status = 'sent' and o.status = 'sent'))
    order by p.created_at desc
    offset v_offset limit v_limit
  ) rows;

  return jsonb_build_object('total', v_total, 'items', v_items);
end;
$$;

-- E-posta şablonu: okuma ve kaydetme ---------------------------------------------------------------------------
create function public.admin_get_email_templates()
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
    select jsonb_agg(to_jsonb(t) order by t.kind) from public.email_templates t
  ), '[]'::jsonb);
end;
$$;

create function public.admin_save_email_template(p_kind text, p_subject text, p_body text)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_key text;
  v_version integer;
begin
  perform public.assert_super_admin();
  if p_kind is null or p_kind not in ('welcome') then
    raise exception 'Geçersiz şablon';
  end if;
  if char_length(coalesce(p_subject, '')) > 200 then
    raise exception 'Konu en fazla 200 karakter olabilir';
  end if;
  if char_length(coalesce(p_body, '')) > 10000 then
    raise exception 'Metin en fazla 10.000 karakter olabilir';
  end if;
  for v_key in
    select m[1] from regexp_matches(coalesce(p_subject, '') || ' ' || coalesce(p_body, ''), '\{\{\s*([A-Za-z0-9_]*)\s*\}\}', 'g') as m
  loop
    if v_key not in ('ad', 'firma', 'deneme_bitis') then
      raise exception 'Bilinmeyen yer tutucu: {{%}}. Yalnızca {{ad}}, {{firma}} ve {{deneme_bitis}} kullanılabilir.', v_key;
    end if;
  end loop;

  update public.email_templates
  set subject = coalesce(p_subject, ''), body = coalesce(p_body, ''), version = version + 1,
      updated_at = now(), updated_by_email = (select email from public.profiles where id = auth.uid())
  where kind = p_kind
  returning version into v_version;
  if not found then
    raise exception 'Şablon bulunamadı';
  end if;
  return v_version;
end;
$$;

-- p_status: 'sent' | 'skipped' | null (işareti kaldır → yeniden "bekliyor")
create function public.admin_set_user_onboarding(p_user_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.assert_super_admin();
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Kullanıcı bulunamadı';
  end if;
  if p_status is null then
    delete from public.user_onboarding where user_id = p_user_id;
    return;
  end if;
  if p_status not in ('sent', 'skipped') then
    raise exception 'Geçersiz durum';
  end if;
  insert into public.user_onboarding (user_id, status, handled_at, handled_by_email)
  values (p_user_id, p_status, now(), (select email from public.profiles where id = auth.uid()))
  on conflict (user_id) do update
    set status = excluded.status, handled_at = excluded.handled_at, handled_by_email = excluded.handled_by_email;
end;
$$;

-- 9. Süper admin gelen kutusu (bildirim) -------------------------------------------------------------------------------
create function public.admin_inbox()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_new_users integer;
  v_open integer;
  v_items jsonb;
begin
  perform public.assert_super_admin();

  select count(*) into v_new_users
  from public.profiles p
  left join public.companies c on c.id = p.company_id
  where not exists (select 1 from public.platform_admins a where a.user_id = p.id)
    and not exists (select 1 from public.user_onboarding o where o.user_id = p.id);

  select count(*) into v_open from public.support_requests where status = 'open';

  select coalesce(jsonb_agg(to_jsonb(i) order by i.at desc), '[]'::jsonb) into v_items
  from (
    (select 'new_user' as type, 'user:' || p.id as key, 'Yeni kayıt' as title,
            coalesce(nullif(p.full_name, ''), p.email) || coalesce(' · ' || c.name, ' · şirketsiz') as body,
            '/admin/yeni-kayitlar' as link, p.created_at as at
     from public.profiles p
     left join public.companies c on c.id = p.company_id
     where not exists (select 1 from public.platform_admins a where a.user_id = p.id)
          and not exists (select 1 from public.user_onboarding o where o.user_id = p.id)
     order by p.created_at desc limit 8)
    union all
    (select 'support', 'support:' || s.id,
            case s.topic when 'plan' then 'Yeni plan talebi' else 'Yeni destek talebi' end,
            c.name || ' · ' || left(s.message, 80), '/admin/support', s.created_at
     from public.support_requests s
     join public.companies c on c.id = s.company_id
     where s.status = 'open'
     order by s.created_at desc limit 8)
  ) i;

  return jsonb_build_object('new_users', v_new_users, 'open_support', v_open, 'items', v_items);
end;
$$;

-- 10. Yetkiler -------------------------------------------------------------------------------------------------------------
revoke all on function public.public_plan_prices() from public, anon;
grant execute on function public.public_plan_prices() to anon, authenticated;

revoke all on function public.admin_list_plan_prices() from public, anon;
revoke all on function public.admin_save_plan_prices(jsonb) from public, anon;
revoke all on function public.admin_assign_plan(uuid, text, integer, numeric, date, text, text) from public, anon;
revoke all on function public.admin_list_payments(integer) from public, anon;
revoke all on function public.admin_void_payment(uuid, text) from public, anon;
revoke all on function public.admin_list_new_users(text, integer, integer) from public, anon;
revoke all on function public.admin_get_email_templates() from public, anon;
revoke all on function public.admin_save_email_template(text, text, text) from public, anon;
revoke all on function public.admin_set_user_onboarding(uuid, text) from public, anon;
revoke all on function public.admin_inbox() from public, anon;
grant execute on function public.admin_list_plan_prices() to authenticated;
grant execute on function public.admin_save_plan_prices(jsonb) to authenticated;
grant execute on function public.admin_assign_plan(uuid, text, integer, numeric, date, text, text) to authenticated;
grant execute on function public.admin_list_payments(integer) to authenticated;
grant execute on function public.admin_void_payment(uuid, text) to authenticated;
grant execute on function public.admin_list_new_users(text, integer, integer) to authenticated;
grant execute on function public.admin_get_email_templates() to authenticated;
grant execute on function public.admin_save_email_template(text, text, text) to authenticated;
grant execute on function public.admin_set_user_onboarding(uuid, text) to authenticated;
grant execute on function public.admin_inbox() to authenticated;

commit;
