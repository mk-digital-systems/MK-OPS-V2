-- Taşeron personelden açılır; firmanın ödediği maaşlar taşeron alacağından düşer
--
--   1. Personel düzenlemede "Taşeron" işaretlenince o kişiye bağlı taşeron hesabı açılır (pay yüzdesiyle).
--      Taşeronun kendisi de kendi taşeron hesabına bağlı personel olur.
--   2. İmalatın ekip başı taşeronun kendisi ya da onun işçisiyse imalat o taşeronun hesabına yazılır
--      (ekip tanımı gerekmez; eski ekip eşleşmesi yedek olarak kalır).
--   3. Taşeron ve ekibinin maaşı girilmişse (> 0) maaşı firma öder; puantaja göre hak edilen maaş
--      taşeron alacağından düşer. Maaş 0 ise taşeron kendi ödüyordur, hakedişin tamamını alır.
--      Avanslar maaşın parçasıdır; ayrıca düşülmez.

-- 1. Taşeron hesabı ↔ personel ----------------------------------------------------------------

alter table public.subcontractors
  add column personnel_id uuid,
  add constraint subcontractors_personnel_fkey foreign key (company_id, personnel_id)
    references public.personnel (company_id, id);
create unique index subcontractors_personnel on public.subcontractors (company_id, personnel_id)
  where personnel_id is not null;

comment on column public.subcontractors.personnel_id is 'Taşeron personelden açıldıysa taşeronun kendisi (personel kaydı)';

-- Taşeronluk biter: hesap pasife alınır, taşeron ve bütün işçileri firma personeli olur.
-- Geçmiş hesap bozulmaz: imalat ve puantaj kayıtları o günkü taşeronu kendi üzerinde tutar.
create function public.end_subcontractor(p_subcontractor_id uuid)
returns void
language sql
security definer
set search_path = public
set row_security = off
as $$
  update public.subcontractors set is_active = false, updated_at = now()
  where id = p_subcontractor_id and is_active;
  update public.personnel set subcontractor_id = null
  where subcontractor_id = p_subcontractor_id;
$$;

revoke all on function public.end_subcontractor(uuid) from public, anon, authenticated;

-- Taşeronun işten çıkışı verilince taşeronluk da biter.
create function public.personnel_end_subcontractor_on_exit()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if old.is_active and not new.is_active then
    perform public.end_subcontractor(s.id)
    from public.subcontractors s
    where s.company_id = new.company_id and s.personnel_id = new.id and s.is_active;
  end if;
  return null;
end;
$$;

revoke all on function public.personnel_end_subcontractor_on_exit() from public, anon, authenticated;

create trigger personnel_end_subcontractor_on_exit
after update of is_active on public.personnel
for each row execute function public.personnel_end_subcontractor_on_exit();

-- Puantaj kaydı o gün kime çalışıldığını tutar (maaş kesintisi buna göre; taşeronluk bitse de geçmiş korunur).
alter table public.attendance_records
  add column subcontractor_id uuid,
  add constraint attendance_records_subcontractor_fkey foreign key (company_id, subcontractor_id)
    references public.subcontractors (company_id, id);
create index idx_attendance_records_subcontractor on public.attendance_records (subcontractor_id, attendance_date)
  where subcontractor_id is not null;

comment on column public.attendance_records.subcontractor_id is 'Kayıt girildiğinde personelin çalıştığı taşeron (anlık görüntü)';

create function public.attendance_set_subcontractor()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if tg_op = 'INSERT' or new.personnel_id is distinct from old.personnel_id then
    select p.subcontractor_id into new.subcontractor_id from public.personnel p where p.id = new.personnel_id;
  else
    new.subcontractor_id := old.subcontractor_id;
  end if;
  return new;
end;
$$;

revoke all on function public.attendance_set_subcontractor() from public, anon, authenticated;

create trigger a2_attendance_set_subcontractor
before insert or update on public.attendance_records
for each row execute function public.attendance_set_subcontractor();

-- Mevcut kayıtlar: personelin bugünkü taşeronu (onaylı aylar kilitli olduğu için tetikleyiciler kapalı).
alter table public.attendance_records disable trigger user;
update public.attendance_records a set subcontractor_id = p.subcontractor_id
from public.personnel p
where p.id = a.personnel_id and p.subcontractor_id is not null;
alter table public.attendance_records enable trigger user;

-- Personeli taşeron yapar / taşeronluğu kaldırır. Yetki: firma yöneticisi ve şantiye şefi.
create function public.set_personnel_subcontractor(
  p_personnel_id uuid,
  p_enabled boolean,
  p_share_percent numeric default null,
  p_iban text default null,
  p_tax_number text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company uuid := public.current_company_id();
  v_person public.personnel;
  v_sub_id uuid;
begin
  if not public.can_review_records() or v_company is null then
    raise exception 'Taşeron tanımlamak için firma yöneticisi veya şantiye şefi yetkisi gerekli' using errcode = '42501';
  end if;
  select * into v_person from public.personnel where id = p_personnel_id and company_id = v_company for update;
  if not found then
    raise exception 'Personel bulunamadı';
  end if;
  select id into v_sub_id from public.subcontractors where company_id = v_company and personnel_id = p_personnel_id;

  if not p_enabled then
    if v_sub_id is not null then
      perform public.end_subcontractor(v_sub_id);
    end if;
    return v_sub_id;
  end if;

  if p_share_percent is null or p_share_percent <= 0 or p_share_percent > 100 then
    raise exception 'Taşeron payı 0''dan büyük, en fazla 100 olmalı';
  end if;
  if v_person.approval_status = 'pending' then
    raise exception 'Onay bekleyen personel taşeron yapılamaz';
  end if;

  if v_sub_id is null then
    insert into public.subcontractors (company_id, personnel_id, name, phone, share_percent, iban, tax_number, created_by, updated_by)
    values (v_company, p_personnel_id, v_person.full_name, v_person.phone, p_share_percent,
            nullif(upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g')), ''), nullif(trim(coalesce(p_tax_number, '')), ''),
            auth.uid(), auth.uid())
    returning id into v_sub_id;
  else
    update public.subcontractors set
      name = v_person.full_name,
      share_percent = p_share_percent,
      iban = nullif(upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g')), ''),
      tax_number = nullif(trim(coalesce(p_tax_number, '')), ''),
      is_active = true,
      updated_by = auth.uid(),
      updated_at = now()
    where id = v_sub_id;
  end if;

  update public.personnel set subcontractor_id = v_sub_id, updated_by = auth.uid() where id = p_personnel_id;
  return v_sub_id;
end;
$$;

revoke all on function public.set_personnel_subcontractor(uuid, boolean, numeric, text, text) from public, anon;
grant execute on function public.set_personnel_subcontractor(uuid, boolean, numeric, text, text) to authenticated;

-- Taşeronun adı personel adını izler.
create function public.personnel_sync_subcontractor_name()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.full_name is distinct from old.full_name then
    update public.subcontractors set name = new.full_name, updated_at = now()
    where company_id = new.company_id and personnel_id = new.id;
  end if;
  return null;
end;
$$;

revoke all on function public.personnel_sync_subcontractor_name() from public, anon, authenticated;

create trigger personnel_sync_subcontractor_name
after update of full_name on public.personnel
for each row execute function public.personnel_sync_subcontractor_name();

-- 2. İmalat: taşeron ekip başından bulunur -----------------------------------------------------

create or replace function public.production_entry_set_subcontractor()
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

  -- Ekip başı taşeronun kendisi ya da onun işçisi.
  select s.id, s.share_percent into v_subcontractor, v_percent
  from public.personnel p
  join public.subcontractors s on s.id = p.subcontractor_id and s.is_active
  where p.company_id = new.company_id and p.id = new.team_leader_personnel_id;

  -- Yedek: eski ekip tanımı.
  if v_subcontractor is null then
    select s.id, s.share_percent into v_subcontractor, v_percent
    from public.teams t
    join public.subcontractors s on s.id = t.subcontractor_id and s.is_active
    where t.company_id = new.company_id
      and t.leader_personnel_id = new.team_leader_personnel_id
      and t.is_active
    limit 1;
  end if;

  new.subcontractor_id := v_subcontractor;
  new.subcontractor_share_percent := v_percent;
  return new;
end;
$$;

-- 3. Firmanın ödediği maaşlar ------------------------------------------------------------------

-- Taşeron ve ekibinin puantaja göre hak ettiği maaş (aylık maaş / 30 × gün). Maaş dökümüyle aynı kural:
-- hafta içi çalışılan gün 1, pazar hafta tatili 1, pazar çalışma 2 (tatil + mesai).
create function public.subcontractor_salary_rows(p_company_id uuid, p_subcontractor_id uuid, p_start date, p_end date)
returns table (personnel_id uuid, full_name text, monthly_salary numeric, payable_days integer, amount numeric)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select p.id, p.full_name, p.monthly_salary, d.units, round(p.monthly_salary / 30 * d.units, 2)
  from public.personnel p
  cross join lateral (
    select coalesce(sum(case
      when extract(isodow from a.attendance_date) <> 7 and a.status = 'worked' then 1
      when extract(isodow from a.attendance_date) = 7 and a.status = 'weekly_rest' then 1
      when extract(isodow from a.attendance_date) = 7 and a.status = 'worked' then 2
      else 0 end), 0)::integer as units
    from public.attendance_records a
    where a.personnel_id = p.id
      and a.subcontractor_id = p_subcontractor_id
      and (p_start is null or a.attendance_date >= p_start)
      and (p_end is null or a.attendance_date <= p_end)
  ) d
  where p.company_id = p_company_id
    and p.approval_status = 'approved'
    and p.monthly_salary > 0
    and d.units > 0;
$$;

revoke all on function public.subcontractor_salary_rows(uuid, uuid, date, date) from public, anon, authenticated;

-- Dönem ekstresi: hakediş payı − firmanın ödediği maaşlar − harcama/ödemeler.
create or replace function public.get_subcontractor_statement(p_subcontractor_id uuid, p_start date, p_end date)
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
  v_before_salary numeric;
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
  select coalesce(sum(amount), 0) into v_before_salary
  from public.subcontractor_salary_rows(v_company, v_sub.id, null, p_start - 1);
  select coalesce(sum(amount), 0) into v_before_paid
  from public.subcontractor_transactions
  where subcontractor_id = v_sub.id and transaction_date < p_start;

  return (
    with work as (
      select * from public.subcontractor_work_rows(v_company, v_sub.id, p_start, p_end)
    ),
    salaries as (
      select * from public.subcontractor_salary_rows(v_company, v_sub.id, p_start, p_end)
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
      'salary_total', coalesce((select sum(amount) from salaries), 0),
      'paid_total', coalesce((select sum(amount) from tx), 0),
      'carried_balance', v_before_share - v_before_salary - v_before_paid,
      'balance', v_before_share - v_before_salary - v_before_paid
        + coalesce((select sum(share_amount) from work), 0)
        - coalesce((select sum(amount) from salaries), 0)
        - coalesce((select sum(amount) from tx), 0),
      'rows', coalesce((
        select jsonb_agg(to_jsonb(w) order by w.work_date, w.project_code, w.item_name) from work w
      ), '[]'::jsonb),
      'salaries', coalesce((
        select jsonb_agg(to_jsonb(s) order by s.full_name) from salaries s
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

-- Liste: bakiyeye maaşlar da dahil.
create or replace function public.list_subcontractors()
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
      'id', s.id, 'name', s.name, 'personnel_id', s.personnel_id, 'contact_name', s.contact_name, 'phone', s.phone,
      'tax_number', s.tax_number, 'iban', s.iban, 'share_percent', s.share_percent,
      'is_active', s.is_active, 'notes', s.notes, 'created_at', s.created_at,
      'team_count', (select count(*) from public.teams t where t.subcontractor_id = s.id and t.is_active),
      'personnel_count', (select count(*) from public.personnel p where p.subcontractor_id = s.id and p.is_active),
      'balance', case when v_money then
        (select coalesce(sum(share_amount), 0) from public.subcontractor_work_rows(v_company, s.id, null, null))
        - (select coalesce(sum(amount), 0) from public.subcontractor_salary_rows(v_company, s.id, null, null))
        - (select coalesce(sum(amount), 0) from public.subcontractor_transactions x where x.subcontractor_id = s.id)
      end
    ) order by s.is_active desc, s.name)
    from public.subcontractors s
    where s.company_id = v_company
  ), '[]'::jsonb);
end;
$$;

-- 4. Puantaj: her personelin bağlı olduğu taşeron (çıktılarda firma ve taşeron personeli ayrı gruplanır)
CREATE OR REPLACE FUNCTION public.get_monthly_attendance(p_year integer, p_month integer, p_active_filter text DEFAULT 'active'::text, p_search text DEFAULT ''::text, p_status_filter text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_month_start date;
  v_month_end date;
  v_result jsonb;
begin
  if p_year < 2000 or p_year > 2100 or p_month < 1 or p_month > 12 then
    raise exception 'Geçersiz ay veya yıl';
  end if;
  if p_active_filter not in ('active', 'passive', 'all') then
    raise exception 'Geçersiz personel filtresi';
  end if;
  if p_status_filter not in (
    'all', 'worked', 'absent', 'unexcused_absence', 'leave',
    'medical_report', 'weekly_rest'
  ) then
    raise exception 'Geçersiz puantaj durum filtresi';
  end if;

  perform public.ensure_sunday_attendance_for_month(p_year, p_month);
  v_month_start := make_date(p_year, p_month, 1);
  v_month_end := (v_month_start + interval '1 month - 1 day')::date;

  with monthly_records as (
    select a.*
    from public.attendance_records a
    where a.attendance_date between v_month_start and v_month_end
      and a.attendance_date <= (now() at time zone 'Europe/Istanbul')::date
  ),
  filtered_personnel as (
    select p.*
    from public.personnel p
    where p.approval_status = 'approved'
    and (
      p_active_filter = 'all'
      or (
        p_active_filter = 'active'
        and (
          p.is_active = true
          or exists (
            select 1
            from monthly_records earned_record
            where earned_record.personnel_id = p.id
              and earned_record.status::text in ('worked', 'weekly_rest')
          )
        )
      )
      or (p_active_filter = 'passive' and p.is_active = false)
    )
    and (
      trim(p_search) = ''
      or p.full_name ilike '%' || trim(p_search) || '%'
      or coalesce(p.phone, '') ilike '%' || trim(p_search) || '%'
    )
    and (
      p_status_filter = 'all'
      or exists (
        select 1 from monthly_records filtered_record
        where filtered_record.personnel_id = p.id
          and filtered_record.status::text = p_status_filter
      )
    )
  ),
  personnel_month as (
    select
      p.id, p.full_name, p.phone, p.tc_identity_number, p.is_active,
      p.employment_start_date, p.employment_end_date, p.subcontractor_id,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'date', to_char(a.attendance_date, 'YYYY-MM-DD'),
            'status', a.status,
            'is_auto_generated', a.is_auto_generated,
            'leave_type', a.leave_type
          ) order by a.attendance_date
        ) filter (where a.id is not null),
        '[]'::jsonb
      ) as records,
      count(a.id) filter (where a.status::text = 'worked')::integer as worked,
      count(a.id) filter (where a.status::text = 'absent')::integer as absent,
      count(a.id) filter (where a.status::text = 'unexcused_absence')::integer as unexcused_absence,
      count(a.id) filter (where a.status::text = 'leave')::integer as leave,
      count(a.id) filter (where a.status::text = 'medical_report')::integer as medical_report,
      count(a.id) filter (where a.status::text = 'weekly_rest')::integer as weekly_rest
    from filtered_personnel p
    left join monthly_records a on a.personnel_id = p.id
    group by p.id, p.full_name, p.phone, p.tc_identity_number, p.is_active,
      p.employment_start_date, p.employment_end_date, p.subcontractor_id
  )
  select jsonb_build_object(
    'year', p_year,
    'month', p_month,
    'active_personnel_ids', (
      select coalesce(jsonb_agg(p.id order by p.full_name), '[]'::jsonb)
      from public.personnel p where p.is_active = true and p.approval_status = 'approved'
    ),
    'personnel', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'full_name', full_name,
          'phone', phone,
          'tc_identity_number', tc_identity_number,
          'is_active', is_active,
          'employment_start_date', employment_start_date,
          'employment_end_date', employment_end_date,
          'subcontractor_id', subcontractor_id,
          'subcontractor_name', (select s.name from public.subcontractors s where s.id = subcontractor_id),
          'records', records,
          'totals', jsonb_build_object(
            'worked', worked,
            'absent', absent,
            'unexcused_absence', unexcused_absence,
            'leave', leave,
            'medical_report', medical_report,
            'weekly_rest', weekly_rest
          )
        ) order by full_name
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from personnel_month;

  return v_result;
end;
$function$;
