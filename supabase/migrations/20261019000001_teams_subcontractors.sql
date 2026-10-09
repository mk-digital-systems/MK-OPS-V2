-- Ekipler ve taşeronlar
--
--   1. Ekipler: ekip başı (personel) + isteğe bağlı taşeron. İş planı ve imalat ekibi ekip başından tanır.
--   2. Taşeronlar: firma bilgisi ve pay yüzdesi (taşerona göre; ör. Ahmet %70, Mehmet %25).
--      İmalat girildiği anda ekibin taşeronu ve yüzdesi kayda işlenir; yüzde sonradan değişse de geçmiş bozulmaz.
--      Taşeron hakedişi = imalatın hakediş tutarı (iş kalemi veya fiyatı girilmiş ek iş) × taşeron yüzdesi.
--   3. Taşeron harcama ve ödemeleri: firmaya özel kategoriler (en fazla 10), elle girilen kayıtlar bakiyeden düşer.
--   4. Taşeron personeli: personel kaydında taşeron ve "SGK ana firmadan" bilgisi; ana firmanın maaş
--      dökümüne girmez, taşeronun kendi maaş dökümü alınır.
--
-- Yetkiler: ekipleri ve taşeron kartlarını firma yöneticisi ile şantiye şefi yönetir; tutarlar, harcama/ödemeler
-- ve taşeron hakedişi "Hakediş" yetkisi olanlara (firma yöneticisi, muhasebe, izin verilmiş şef) açıktır.

-- 1. Taşeronlar -------------------------------------------------------------------------------

create table public.subcontractors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 150),
  contact_name text check (contact_name is null or char_length(contact_name) <= 120),
  phone text check (phone is null or char_length(phone) <= 30),
  tax_number text check (tax_number is null or char_length(tax_number) <= 20),
  iban text check (iban is null or char_length(iban) <= 40),
  share_percent numeric(5,2) not null check (share_percent > 0 and share_percent <= 100),
  is_active boolean not null default true,
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subcontractors_company_id_id_key unique (company_id, id)
);
create unique index subcontractors_company_name on public.subcontractors (company_id, lower(trim(name)));

comment on table public.subcontractors is 'Taşeron firmalar; share_percent taşeronun imalat tutarından aldığı pay';
comment on column public.subcontractors.share_percent is 'Taşeron payı (%); ör. 70 → 100 ₺''lik işin 70 ₺''si taşeronun';

-- 2. Ekipler ----------------------------------------------------------------------------------

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 100),
  leader_personnel_id uuid not null,
  subcontractor_id uuid,
  is_active boolean not null default true,
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teams_company_id_id_key unique (company_id, id),
  constraint teams_leader_fkey foreign key (company_id, leader_personnel_id)
    references public.personnel (company_id, id) on delete cascade,
  constraint teams_subcontractor_fkey foreign key (company_id, subcontractor_id)
    references public.subcontractors (company_id, id)
);
create unique index teams_company_name on public.teams (company_id, lower(trim(name)));
-- Bir personel aynı anda yalnızca bir aktif ekibin başı olabilir.
create unique index teams_active_leader on public.teams (company_id, leader_personnel_id) where is_active;
create index idx_teams_subcontractor on public.teams (subcontractor_id) where subcontractor_id is not null;

comment on table public.teams is 'Kalıcı ekip tanımı: ekip başı + isteğe bağlı taşeron; iş planı/imalat ekibi ekip başından tanır';

-- 3. Taşeron harcama/ödeme kategorileri ve kayıtları ---------------------------------------------

create table public.subcontractor_expense_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint subcontractor_expense_categories_company_id_id_key unique (company_id, id)
);
create unique index subcontractor_expense_categories_name
  on public.subcontractor_expense_categories (company_id, lower(trim(name)));

create table public.subcontractor_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade,
  subcontractor_id uuid not null,
  category_id uuid not null,
  transaction_date date not null default (timezone('Europe/Istanbul', now()))::date,
  amount numeric(14,2) not null check (amount > 0),
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subcontractor_transactions_subcontractor_fkey foreign key (company_id, subcontractor_id)
    references public.subcontractors (company_id, id),
  constraint subcontractor_transactions_category_fkey foreign key (company_id, category_id)
    references public.subcontractor_expense_categories (company_id, id)
);
create index idx_subcontractor_transactions_sub on public.subcontractor_transactions (subcontractor_id, transaction_date);

comment on table public.subcontractor_transactions is 'Taşerona yapılan ödeme ve harcamalar (personel, yakıt, SGK...); taşeron bakiyesinden düşer';

-- Firma başına en fazla 10 kategori.
create function public.limit_subcontractor_categories()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if (select count(*) from public.subcontractor_expense_categories where company_id = new.company_id) >= 10 then
    raise exception 'En fazla 10 harcama/ödeme kategorisi tanımlanabilir';
  end if;
  return new;
end;
$$;

-- Hazır kategoriler: yeni firmalarda otomatik, mevcut firmalara bir kez.
create function public.seed_subcontractor_categories(p_company_id uuid)
returns void
language sql
security definer
set search_path = public
set row_security = off
as $$
  insert into public.subcontractor_expense_categories (company_id, name, sort_order)
  select p_company_id, c.name, c.sort_order
  from (values ('Hakediş ödemesi', 1), ('Avans', 2), ('Personel ödemesi', 3), ('Yakıt ödemesi', 4), ('SGK ödemesi', 5))
    as c(name, sort_order)
  on conflict do nothing;
$$;

create function public.companies_seed_subcontractor_categories()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.seed_subcontractor_categories(new.id);
  return new;
end;
$$;

create trigger companies_seed_subcontractor_categories
after insert on public.companies
for each row execute function public.companies_seed_subcontractor_categories();

select public.seed_subcontractor_categories(id) from public.companies;

-- 4. Personel: taşeron ve SGK bilgisi; imalat: taşeron anlık görüntüsü -----------------------------

alter table public.personnel
  add column subcontractor_id uuid,
  add column sgk_paid_by_main boolean not null default false,
  add constraint personnel_subcontractor_fkey foreign key (company_id, subcontractor_id)
    references public.subcontractors (company_id, id);
create index idx_personnel_subcontractor on public.personnel (subcontractor_id) where subcontractor_id is not null;

comment on column public.personnel.subcontractor_id is 'Taşeron personeli ise bağlı olduğu taşeron; ana firmanın maaş dökümüne girmez';
comment on column public.personnel.sgk_paid_by_main is 'Taşeron personelinin SGK primi ana firma üzerinden yatıyor';

alter table public.production_entries
  add column subcontractor_id uuid,
  add column subcontractor_share_percent numeric(5,2),
  add constraint production_entries_subcontractor_fkey foreign key (company_id, subcontractor_id)
    references public.subcontractors (company_id, id);
create index idx_production_entries_subcontractor on public.production_entries (subcontractor_id, work_date)
  where subcontractor_id is not null;

comment on column public.production_entries.subcontractor_id is 'İmalat girildiğinde ekibin bağlı olduğu taşeron (anlık görüntü)';
comment on column public.production_entries.subcontractor_share_percent is 'İmalat girildiğindeki taşeron yüzdesi (anlık görüntü)';

-- Ekip başı değişmedikçe taşeron ve yüzde değişmez; böylece yeniden kaydetmek geçmişi bozmaz.
create function public.production_entry_set_subcontractor()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_subcontractor uuid;
  v_percent numeric(5,2);
begin
  if tg_op = 'UPDATE' and new.team_leader_personnel_id is not distinct from old.team_leader_personnel_id then
    new.subcontractor_id := old.subcontractor_id;
    new.subcontractor_share_percent := old.subcontractor_share_percent;
    return new;
  end if;

  select s.id, s.share_percent into v_subcontractor, v_percent
  from public.teams t
  join public.subcontractors s on s.id = t.subcontractor_id and s.is_active
  where t.company_id = new.company_id
    and t.leader_personnel_id = new.team_leader_personnel_id
    and t.is_active
  limit 1;

  new.subcontractor_id := v_subcontractor;
  new.subcontractor_share_percent := v_percent;
  return new;
end;
$$;

create trigger a2_production_entry_set_subcontractor
before insert or update on public.production_entries
for each row execute function public.production_entry_set_subcontractor();

-- 5. Erişim ---------------------------------------------------------------------------------

do $$
declare
  v_table text;
begin
  foreach v_table in array array['subcontractors', 'teams', 'subcontractor_expense_categories', 'subcontractor_transactions'] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on public.%I from anon', v_table);
    execute format('grant select, insert, update, delete on public.%I to authenticated', v_table);
    execute format($p$create policy company_isolation on public.%I as restrictive for all to authenticated
      using (company_id = (select public.current_company_id()))
      with check (company_id = (select public.current_company_id()))$p$, v_table);
    -- Kategoriler firma kurulurken (kullanıcı henüz firmaya bağlı değilken) oluşur; orada ayrımı
    -- kısıtlayıcı politika sağlar.
    if v_table <> 'subcontractor_expense_categories' then
      execute format('create trigger a0_enforce_company_scope before insert or update or delete on public.%I
        for each row execute function public.enforce_company_scope()', v_table);
    end if;
  end loop;
end $$;

create trigger a1_limit_subcontractor_categories
before insert on public.subcontractor_expense_categories
for each row execute function public.limit_subcontractor_categories();

-- Taşeron kartı ve ekipler: firma yöneticisi ve şantiye şefi yönetir; hakediş yetkisi olan da görür/düzenler.
create policy subcontractors_select on public.subcontractors for select to authenticated
  using (public.can_review_records() or public.has_module_write_permission('hakedis'));
create policy subcontractors_write on public.subcontractors for all to authenticated
  using (public.can_review_records() or public.has_module_write_permission('hakedis'))
  with check (public.can_review_records() or public.has_module_write_permission('hakedis'));

create policy teams_select on public.teams for select to authenticated
  using (public.can_view_resources());
create policy teams_write on public.teams for all to authenticated
  using (public.can_review_records())
  with check (public.can_review_records());

-- Tutarlar: yalnızca hakediş yetkisi.
create policy subcontractor_categories_access on public.subcontractor_expense_categories for all to authenticated
  using (public.has_module_write_permission('hakedis'))
  with check (public.has_module_write_permission('hakedis'));
create policy subcontractor_transactions_access on public.subcontractor_transactions for all to authenticated
  using (public.has_module_write_permission('hakedis'))
  with check (public.has_module_write_permission('hakedis'));

do $$
declare
  v_function regprocedure;
begin
  foreach v_function in array array[
    'public.limit_subcontractor_categories()'::regprocedure,
    'public.seed_subcontractor_categories(uuid)'::regprocedure,
    'public.companies_seed_subcontractor_categories()'::regprocedure,
    'public.production_entry_set_subcontractor()'::regprocedure
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_function);
  end loop;
end $$;

-- 6. Taşeron hakediş hesabı -----------------------------------------------------------------------

-- Taşeron ekiplerinin imalat satırları: işveren tutarı ve taşeron payı.
create function public.subcontractor_work_rows(p_company_id uuid, p_subcontractor_id uuid, p_start date, p_end date)
returns table (
  item_id uuid, kind text, work_date date, project_code text, project_name text, item_name text,
  unit text, quantity numeric, unit_price numeric, amount numeric, share_percent numeric,
  share_amount numeric, team_leader_name text
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    i.id, i.kind, e.work_date,
    coalesce(p.project_code, j.project_code_snapshot, '—'), coalesce(p.name, j.project_name_snapshot),
    i.item_name_snapshot, i.unit_snapshot, i.quantity,
    coalesce(lv.unit_price, xv.unit_price),
    coalesce(lv.amount, xv.amount),
    e.subcontractor_share_percent,
    round(coalesce(lv.amount, xv.amount) * e.subcontractor_share_percent / 100, 2),
    e.team_leader_name_snapshot
  from public.production_entries e
  join public.production_jobs j on j.production_entry_id = e.id
  join public.production_items i on i.production_job_id = j.id and i.kind in ('stage', 'extra')
  left join public.projects p on p.id = j.project_id
  left join public.hakedis_log_values lv on i.kind = 'stage' and lv.log_id = i.stage_log_id
  left join public.hakedis_extra_values xv on i.kind = 'extra' and xv.production_item_id = i.id
  where e.company_id = p_company_id
    and e.subcontractor_id = p_subcontractor_id
    and (p_start is null or e.work_date >= p_start)
    and (p_end is null or e.work_date <= p_end);
$$;

revoke all on function public.subcontractor_work_rows(uuid, uuid, date, date) from public, anon, authenticated;

-- Dönem ekstresi: imalat satırları, harcama/ödemeler, devreden ve kalan bakiye.
create function public.get_subcontractor_statement(p_subcontractor_id uuid, p_start date, p_end date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company uuid := public.current_company_id();
  v_sub public.subcontractors;
  v_before_share numeric;
  v_before_paid numeric;
begin
  if v_company is null or not public.has_module_write_permission('hakedis') then
    raise exception 'Taşeron hakedişi için hakediş yetkisi gerekli' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'Geçersiz tarih aralığı';
  end if;
  select * into v_sub from public.subcontractors where id = p_subcontractor_id and company_id = v_company;
  if not found then
    raise exception 'Taşeron bulunamadı';
  end if;

  select coalesce(sum(share_amount), 0) into v_before_share
  from public.subcontractor_work_rows(v_company, v_sub.id, null, p_start - 1);
  select coalesce(sum(amount), 0) into v_before_paid
  from public.subcontractor_transactions
  where subcontractor_id = v_sub.id and transaction_date < p_start;

  return (
    with work as (
      select * from public.subcontractor_work_rows(v_company, v_sub.id, p_start, p_end)
    ),
    tx as (
      select t.id, t.transaction_date, t.amount, t.notes, c.id as category_id, c.name as category_name
      from public.subcontractor_transactions t
      join public.subcontractor_expense_categories c on c.id = t.category_id
      where t.subcontractor_id = v_sub.id and t.transaction_date between p_start and p_end
    )
    select jsonb_build_object(
      'subcontractor_id', v_sub.id,
      'start', p_start,
      'end', p_end,
      'employer_total', coalesce((select sum(amount) from work), 0),
      'share_total', coalesce((select sum(share_amount) from work), 0),
      'company_total', coalesce((select sum(amount - share_amount) from work), 0),
      'unpriced_count', (select count(*) from work where amount is null),
      'paid_total', coalesce((select sum(amount) from tx), 0),
      'carried_balance', v_before_share - v_before_paid,
      'balance', v_before_share - v_before_paid
        + coalesce((select sum(share_amount) from work), 0) - coalesce((select sum(amount) from tx), 0),
      'rows', coalesce((
        select jsonb_agg(to_jsonb(w) order by w.work_date, w.project_code, w.item_name) from work w
      ), '[]'::jsonb),
      'transactions', coalesce((
        select jsonb_agg(to_jsonb(t) order by t.transaction_date, t.category_name) from tx t
      ), '[]'::jsonb),
      'by_category', coalesce((
        select jsonb_agg(x order by x.amount desc) from (
          select category_name, sum(amount) as amount from tx group by category_name
        ) x
      ), '[]'::jsonb)
    )
  );
end;
$$;

-- Liste: ekip/personel sayısı; hakediş yetkisi varsa güncel bakiye.
create function public.list_subcontractors()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company uuid := public.current_company_id();
  v_money boolean := public.has_module_write_permission('hakedis');
begin
  if v_company is null or not (public.can_review_records() or v_money) then
    raise exception 'Taşeronlar için yetki gerekli' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'contact_name', s.contact_name, 'phone', s.phone,
      'tax_number', s.tax_number, 'iban', s.iban, 'share_percent', s.share_percent,
      'is_active', s.is_active, 'notes', s.notes, 'created_at', s.created_at,
      'team_count', (select count(*) from public.teams t where t.subcontractor_id = s.id and t.is_active),
      'personnel_count', (select count(*) from public.personnel p where p.subcontractor_id = s.id and p.is_active),
      'balance', case when v_money then
        (select coalesce(sum(share_amount), 0) from public.subcontractor_work_rows(v_company, s.id, null, null))
        - (select coalesce(sum(amount), 0) from public.subcontractor_transactions x where x.subcontractor_id = s.id)
      end
    ) order by s.is_active desc, s.name)
    from public.subcontractors s
    where s.company_id = v_company
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_subcontractor_statement(uuid, date, date) from public, anon;
revoke all on function public.list_subcontractors() from public, anon;
grant execute on function public.get_subcontractor_statement(uuid, date, date) to authenticated;
grant execute on function public.list_subcontractors() to authenticated;

-- 7. Maaş dökümü: ana firma ve taşeron personeli ayrı ------------------------------------------------

-- p_subcontractor_id boşsa yalnızca ana firmanın personeli; doluysa o taşeronun personeli.
drop function public.get_monthly_payroll(integer, integer);
CREATE FUNCTION public.get_monthly_payroll(p_year integer, p_month integer, p_subcontractor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_start date;
  v_end date;
  v_effective_end date;
  v_today date := timezone('Europe/Istanbul',now())::date;
  v_now_time time := timezone('Europe/Istanbul',now())::time;
  v_result jsonb;
begin
  if p_year<2000 or p_year>2100 or p_month<1 or p_month>12 then raise exception 'Geçersiz ay veya yıl'; end if;
  v_start:=make_date(p_year,p_month,1);
  v_end:=(v_start+interval '1 month - 1 day')::date;
  v_effective_end:=least(v_end,case when v_now_time>=time '09:00' then v_today else v_today-1 end);
  select coalesce(jsonb_agg(jsonb_build_object(
    'personnel_id',p.id,'full_name',p.full_name,'monthly_salary',p.monthly_salary,
    'worked_days',coalesce(a.worked_days,0),'weekly_rest_days',coalesce(a.weekly_rest_days,0),
    'payable_days',coalesce(a.worked_days,0)+coalesce(a.weekly_rest_days,0)+coalesce(a.overtime_days,0),
    'absence_days',coalesce(a.absence_days,0),'report_days',coalesce(a.report_days,0),
    'overtime_days',coalesce(a.overtime_days,0),'advance_total',coalesce(v.advance_total,0),'absence_deduction',0,
    'overtime_payment',round((p.monthly_salary/30)*coalesce(a.overtime_days,0),2),
    'gross_accrued',round((p.monthly_salary/30)*(coalesce(a.worked_days,0)+coalesce(a.weekly_rest_days,0)),2),
    'net_receivable',greatest(0,round((p.monthly_salary/30)*(coalesce(a.worked_days,0)+coalesce(a.weekly_rest_days,0)+coalesce(a.overtime_days,0))-coalesce(v.advance_total,0),2))
  ) order by p.full_name),'[]'::jsonb) into v_result
  from public.personnel p
  left join lateral (
    select
      count(*) filter(where ar.status='worked' and extract(isodow from ar.attendance_date)<>7)::integer worked_days,
      count(*) filter(where extract(isodow from ar.attendance_date)=7 and ar.status in ('weekly_rest','worked'))::integer weekly_rest_days,
      count(*) filter(where ar.status::text in('absent','unexcused_absence'))::integer absence_days,
      count(*) filter(where ar.status='medical_report')::integer report_days,
      count(*) filter(where ar.status='worked' and extract(isodow from ar.attendance_date)=7)::integer overtime_days
    from public.attendance_records ar
    where ar.personnel_id=p.id and ar.attendance_date between v_start and v_effective_end
  ) a on true
  left join lateral (
    select coalesce(sum(pa.amount),0) advance_total from public.personnel_advances pa
    where pa.personnel_id=p.id and pa.advance_date between v_start and least(v_end,v_today)
  ) v on true
  where p.approval_status = 'approved'
    and p.subcontractor_id is not distinct from p_subcontractor_id;
  return v_result;
end;
$function$;

revoke all on function public.get_monthly_payroll(integer, integer, uuid) from public, anon;
grant execute on function public.get_monthly_payroll(integer, integer, uuid) to authenticated;

-- 8. İşlem geçmişi ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.audit_row_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_company_id uuid;
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_label text;
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_actor_role text;
  -- Kayda yazılmayan teknik / türetilmiş alanlar
  v_ignored text[] := array[
    'id', 'company_id', 'created_at', 'updated_at', 'created_by', 'updated_by',
    'progress_percent', 'has_activity', 'status_sort_order', 'priority_order',
    'waiting_at', 'in_progress_at', 'on_hold_at', 'delayed_at', 'archived_at',
    'cancelled_at', 'cancelled_by', 'done_quantity', 'percent', 'started_at',
    'stock_quantity', 'avatar_path', 'approved_at', 'approved_by',
    'priced_at', 'owner_user_id'
  ];
  -- Değeri gösterilmeyen hassas alanlar
  v_masked text[] := array['tc_identity_number'];
begin
  if pg_trigger_depth() > 1 or current_setting('mk_ops.allow_company_reset', true) = 'on' then
    return null;
  end if;

  v_company_id := case
    when tg_table_name = 'companies' then (v_row ->> 'id')::uuid
    else coalesce((v_new ->> 'company_id')::uuid, (v_old ->> 'company_id')::uuid)
  end;
  if v_company_id is null or not exists (select 1 from public.companies c where c.id = v_company_id) then
    return null;
  end if;

  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      continue when v_key = any (v_ignored);
      if (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_changes := v_changes || jsonb_build_object(v_key,
          case when v_key = any (v_masked)
            then jsonb_build_object('old', '***', 'new', '***')
            else jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key)
          end);
      end if;
    end loop;
    if v_changes = '{}'::jsonb and coalesce(tg_argv[1], '') <> 'always' then
      return null;
    end if;
  else
    for v_key in select jsonb_object_keys(v_row) loop
      continue when v_key = any (v_ignored) or jsonb_typeof(v_row -> v_key) = 'null';
      v_changes := v_changes || jsonb_build_object(v_key,
        case when v_key = any (v_masked) then to_jsonb('***'::text) else v_row -> v_key end);
    end loop;
  end if;

  v_label := case tg_table_name
    when 'projects' then concat_ws(' · ', v_row ->> 'name', v_row ->> 'project_code')
    when 'project_types' then v_row ->> 'name'
    when 'project_sections' then (
      select concat_ws(' · ', p.name, v_row ->> 'name') from public.projects p where p.id = (v_row ->> 'project_id')::uuid)
    when 'project_stage_progress' then (
      select concat_ws(' · ', p.name, ps.name, st.name)
      from public.projects p
      left join public.project_sections ps on ps.id = (v_row ->> 'section_id')::uuid
      left join public.project_type_stages st on st.id = (v_row ->> 'stage_id')::uuid
      where p.id = (v_row ->> 'project_id')::uuid)
    when 'project_stage_logs' then (
      select concat_ws(' · ', p.name, ps.name, st.name)
      from public.project_stage_progress pr
      join public.projects p on p.id = pr.project_id
      left join public.project_sections ps on ps.id = pr.section_id
      left join public.project_type_stages st on st.id = pr.stage_id
      where pr.id = (v_row ->> 'progress_id')::uuid)
    when 'hakedis_stage_prices' then (
      select concat_ws(' · ', t.name, st.name)
      from public.project_type_stages st join public.project_types t on t.id = st.project_type_id
      where st.id = (v_row ->> 'stage_id')::uuid)
    when 'hakedis_project_prices' then (
      select concat_ws(' · ', p.name, ps.name, st.name)
      from public.project_stage_progress pr
      join public.projects p on p.id = pr.project_id
      left join public.project_sections ps on ps.id = pr.section_id
      left join public.project_type_stages st on st.id = pr.stage_id
      where pr.id = (v_row ->> 'progress_id')::uuid)
    when 'personnel' then v_row ->> 'full_name'
    when 'personnel_advances' then (
      select p.full_name from public.personnel p where p.id = (v_row ->> 'personnel_id')::uuid)
    when 'vehicles' then v_row ->> 'plate'
    when 'inventory_catalog' then v_row ->> 'material_name'
    when 'inventory_materials' then concat_ws(' · ', v_row ->> 'material_name', v_row ->> 'material_code')
    when 'inventory_categories' then v_row ->> 'name'
    when 'inventory_locations' then v_row ->> 'name'
    when 'daily_work_plans' then 'İş planı ' || to_char((v_row ->> 'plan_date')::date, 'DD.MM.YYYY')
    when 'production_entries' then concat_ws(' · ',
      to_char((v_row ->> 'work_date')::date, 'DD.MM.YYYY'), v_row ->> 'team_leader_name_snapshot')
    when 'profiles' then coalesce(nullif(v_row ->> 'full_name', ''), v_row ->> 'email')
    when 'company_manager_permissions' then (
      select coalesce(nullif(pr.full_name, ''), pr.email) from public.profiles pr where pr.id = (v_row ->> 'user_id')::uuid)
    when 'companies' then v_row ->> 'name'
    when 'subcontractors' then v_row ->> 'name'
    when 'teams' then v_row ->> 'name'
    when 'subcontractor_transactions' then (
      select concat_ws(' · ', s.name, c.name)
      from public.subcontractors s, public.subcontractor_expense_categories c
      where s.id = (v_row ->> 'subcontractor_id')::uuid and c.id = (v_row ->> 'category_id')::uuid)
    else null
  end;

  -- Üst kayıt (proje / personel / aşama) silinirken zincirleme silinen alt satırlar yazılmaz;
  -- üst kaydın silinmesi zaten kayıtta.
  if tg_op = 'DELETE' and v_label is null and tg_table_name in (
    'project_sections', 'project_stage_progress', 'project_stage_logs',
    'hakedis_stage_prices', 'hakedis_project_prices', 'personnel_advances',
    'company_manager_permissions'
  ) then
    return null;
  end if;

  if v_actor is not null then
    select coalesce(nullif(p.full_name, ''), p.email), p.role
    into v_actor_name, v_actor_role
    from public.profiles p where p.id = v_actor;
    if public.is_super_admin() then
      v_actor_role := 'super_admin';
      v_actor_name := coalesce(v_actor_name, 'MK OPS Destek');
    end if;
  end if;

  insert into public.audit_logs
    (company_id, actor_user_id, actor_name, actor_role, module, entity_type, entity_id, entity_label, action, changes)
  values (
    v_company_id,
    v_actor,
    coalesce(v_actor_name, case when v_actor is null then 'Sistem' end),
    v_actor_role,
    tg_argv[0],
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'user_id'),
    left(v_label, 300),
    lower(tg_op),
    v_changes
  );
  return null;
end;
$function$;

create trigger zz_audit_row_change after insert or update or delete on public.subcontractors
for each row execute function public.audit_row_change('hakedis');
create trigger zz_audit_row_change after insert or update or delete on public.subcontractor_transactions
for each row execute function public.audit_row_change('hakedis');
create trigger zz_audit_row_change after insert or update or delete on public.teams
for each row execute function public.audit_row_change('personnel');
