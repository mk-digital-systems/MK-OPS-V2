-- =============================================================================
-- MK OPS — resmi tatiller ve pazar/tatil günlerinde izinli (puantaj)
--
-- Kurallar (yönetici kararı, 10 Kasım 2026):
--   * Sabit resmi tatiller (1 Oca, 23 Nis, 1 May, 19 May, 15 Tem, 30 Ağu, 29 Eki) sistemde hazır gelir.
--     Ramazan / Kurban Bayramı gibi değişken tatiller yılda bir kez süper admin tarafından girilir
--     (tüm firmalara geçerli; ulusal veridir).
--   * Resmi tatil (RT) PAZAR GİBİ işler: çalışılmasa da ödenen gün sayılır (durum weekly_rest olarak
--     saklanır, ekranda RT görünür); çalışıldıysa +1 mesai günü yazılır.
--   * Pazar ve tatil günlerinde "İzinli" seçilebilir; ücretsiz izin sayılır (ödenen güne eklenmez).
--
-- Tasarım: yeni enum değeri EKLENMEZ. RT, mevcut weekly_rest olarak saklanır; bordro/ekstre SQL'inde
-- "pazar mı?" kontrolü "dinlenme günü mü?" (is_rest_day) olur. Böylece ödenen gün formülleri aynı kalır.
--
-- Geçmişi bozmamak için tatil kuralı yalnızca official_holiday_effective_from() tarihinden itibaren
-- geçerlidir (2026-11-11); önceki tarihlerin hesapları değişmez.
--
-- Bölüm 5'teki 7 fonksiyon, canlıdaki güncel tanımlarından üretilmiştir; tek fark
-- "extract(isodow from X) = 7" yerine "public.is_rest_day(X)" kullanılmasıdır.
-- =============================================================================
begin;

-- 1. Değişken resmi tatiller (bayramlar) --------------------------------------------------------------
create table public.official_holidays (
  holiday_date date primary key,
  name text not null check (char_length(trim(name)) between 2 and 80),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint official_holidays_date_range check (holiday_date between date '2026-01-01' and date '2100-12-31')
);
comment on table public.official_holidays is 'Değişken resmi tatiller (bayramlar). Ulusal veri: tüm firmalara geçerli, yalnızca süper admin yazar (RPC).';

alter table public.official_holidays enable row level security;
create policy "official_holidays_select" on public.official_holidays for select to authenticated using (true);
grant select on public.official_holidays to authenticated;
grant select, insert, update, delete on public.official_holidays to service_role;

-- 2. Yardımcılar -------------------------------------------------------------------------------------
create function public.official_holiday_effective_from()
returns date language sql immutable set search_path = public
as $$ select date '2026-11-11' $$;

create function public.is_official_holiday(p_date date)
returns boolean language sql stable set search_path = public
as $$
  select p_date >= public.official_holiday_effective_from() and (
    to_char(p_date, 'MM-DD') in ('01-01', '04-23', '05-01', '05-19', '07-15', '08-30', '10-29')
    or exists (select 1 from public.official_holidays h where h.holiday_date = p_date)
  );
$$;

create function public.is_rest_day(p_date date)
returns boolean language sql stable set search_path = public
as $$ select extract(isodow from p_date) = 7 or public.is_official_holiday(p_date) $$;

revoke all on function public.official_holiday_effective_from() from public, anon;
revoke all on function public.is_official_holiday(date) from public, anon;
revoke all on function public.is_rest_day(date) from public, anon;
grant execute on function public.official_holiday_effective_from() to authenticated;
grant execute on function public.is_official_holiday(date) to authenticated;
grant execute on function public.is_rest_day(date) to authenticated;

-- 3. İstemci için liste (sabit + bayramlar) ----------------------------------------------------------
create function public.list_official_holidays(p_year integer)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Oturum gerekli' using errcode = '42501';
  end if;
  if p_year is null or p_year < 2026 or p_year > 2100 then
    raise exception 'Geçersiz yıl';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('date', h.d, 'name', h.name, 'kind', h.kind) order by h.d)
    from (
      select make_date(p_year, split_part(f.md, '-', 1)::int, split_part(f.md, '-', 2)::int) as d, f.name, 'fixed' as kind
      from (values
        ('01-01', 'Yılbaşı'),
        ('04-23', 'Ulusal Egemenlik ve Çocuk Bayramı'),
        ('05-01', 'Emek ve Dayanışma Günü'),
        ('05-19', 'Atatürk''ü Anma, Gençlik ve Spor Bayramı'),
        ('07-15', 'Demokrasi ve Millî Birlik Günü'),
        ('08-30', 'Zafer Bayramı'),
        ('10-29', 'Cumhuriyet Bayramı')
      ) as f(md, name)
      union all
      select o.holiday_date, o.name, 'movable'
      from public.official_holidays o
      where extract(year from o.holiday_date) = p_year
    ) h
    where h.d >= public.official_holiday_effective_from()
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_official_holidays(integer) from public, anon;
grant execute on function public.list_official_holidays(integer) to authenticated;

-- 4. Süper admin: bayram ekle / sil -------------------------------------------------------------------
create function public.admin_save_official_holiday(p_name text, p_start date, p_days integer)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_count integer;
begin
  perform public.assert_super_admin();
  if p_start is null or p_start < date '2026-01-01' or p_start > date '2100-12-31' then
    raise exception 'Geçersiz başlangıç tarihi';
  end if;
  if p_days is null or p_days < 1 or p_days > 5 then
    raise exception 'Gün sayısı 1 ile 5 arasında olmalıdır';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 80 then
    raise exception 'Tatil adı 2-80 karakter olmalıdır';
  end if;

  insert into public.official_holidays (holiday_date, name, created_by)
  select p_start + g, trim(p_name) || case when p_days > 1 then ' (' || (g + 1) || '. gün)' else '' end, auth.uid()
  from generate_series(0, p_days - 1) as g
  on conflict (holiday_date) do update set name = excluded.name;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function public.admin_delete_official_holiday(p_date date)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.assert_super_admin();
  delete from public.official_holidays where holiday_date = p_date;
end;
$$;

revoke all on function public.admin_save_official_holiday(text, date, integer) from public, anon;
grant execute on function public.admin_save_official_holiday(text, date, integer) to authenticated;
revoke all on function public.admin_delete_official_holiday(date) from public, anon;
grant execute on function public.admin_delete_official_holiday(date) to authenticated;

-- 5. Dinlenme günü mantığı: mevcut fonksiyonlar (canlı tanımlarından türetildi) -------------------------

CREATE OR REPLACE FUNCTION public.ensure_current_sunday_attendance()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
begin
  if not public.is_rest_day(current_date::date) then
    return 0;
  end if;

  return public.ensure_sunday_attendance_for_month(
    extract(year from current_date)::integer,
    extract(month from current_date)::integer
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_sunday_attendance_for_month(p_year integer, p_month integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
declare
  v_month_start date;
  v_month_end date;
  v_today date := timezone('Europe/Istanbul', now())::date;
  v_now_time time := timezone('Europe/Istanbul', now())::time;
  v_last_date date;
  v_inserted integer;
begin
  if auth.uid() is not null and not public.has_module_write_permission('attendance') then return 0; end if;
  if p_year < 2000 or p_year > 2100 or p_month < 1 or p_month > 12 then raise exception 'Geçersiz ay veya yıl'; end if;
  v_month_start := make_date(p_year,p_month,1);
  v_month_end := (v_month_start + interval '1 month - 1 day')::date;
  v_last_date := least(v_month_end,case when v_now_time >= time '09:00' then v_today else v_today-1 end);
  if v_last_date < v_month_start then return 0; end if;
  insert into public.attendance_records(company_id,personnel_id,attendance_date,status,is_auto_generated)
  select p.company_id,p.id,d.attendance_date,'weekly_rest'::public.attendance_status,true
  from public.personnel p
  cross join lateral (
    select generated_date::date attendance_date
    from generate_series(v_month_start::timestamp,v_last_date::timestamp,interval '1 day') generated_date
    where public.is_rest_day(generated_date::date)
  ) d
  where (auth.uid() is null or (p.company_id = public.current_company_id() and public.can_access_branch(p.branch_id)))
    and p.approval_status = 'approved'
    and not public.attendance_month_is_locked(p.company_id, p.branch_id, d.attendance_date)
    and coalesce(p.employment_start_date,(p.created_at at time zone 'Europe/Istanbul')::date)<=d.attendance_date
    and (p.employment_end_date is null or p.employment_end_date>=d.attendance_date)
  on conflict(personnel_id,attendance_date) do nothing;
  get diagnostics v_inserted=row_count;
  return v_inserted;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_attendance_month_archives()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with months as (
    select
      date_trunc('month', a.attendance_date)::date as month_start,
      count(*) filter (where a.status = 'worked')::integer as worked,
      count(*) filter (where a.status = 'absent')::integer as absent,
      count(*) filter (where a.status = 'leave')::integer as leave,
      count(*) filter (where a.status = 'medical_report')::integer as medical_report,
      count(*) filter (where a.status = 'weekly_rest')::integer as weekly_rest,
      count(distinct a.attendance_date) filter (
        where a.status = 'worked'
          and public.is_rest_day(a.attendance_date::date)
      )::integer as sunday_worked
    from public.attendance_records a
    where a.attendance_date <= (now() at time zone 'Europe/Istanbul')::date
    group by date_trunc('month', a.attendance_date)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'year', extract(year from m.month_start)::integer,
        'month', extract(month from m.month_start)::integer,
        'active_personnel', (
          select count(*)::integer
          from public.personnel p
          where p.approval_status = 'approved'
          and coalesce(
            p.employment_start_date,
            (p.created_at at time zone 'Europe/Istanbul')::date
          ) <= (m.month_start + interval '1 month - 1 day')::date
          and (
            p.employment_end_date is null
            or p.employment_end_date >= m.month_start
          )
        ),
        'worked', m.worked,
        'absent', m.absent,
        'leave', m.leave,
        'medical_report', m.medical_report,
        'weekly_rest', m.weekly_rest,
        'sunday_worked', m.sunday_worked
      ) order by m.month_start desc
    ),
    '[]'::jsonb
  )
  from months m;
$function$;

CREATE OR REPLACE FUNCTION public.get_monthly_payroll(p_year integer, p_month integer, p_subcontractor_id uuid DEFAULT NULL::uuid)
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
      count(*) filter(where ar.status='worked' and not public.is_rest_day(ar.attendance_date::date))::integer worked_days,
      count(*) filter(where public.is_rest_day(ar.attendance_date::date) and ar.status in ('weekly_rest','worked'))::integer weekly_rest_days,
      count(*) filter(where ar.status::text in('absent','unexcused_absence'))::integer absence_days,
      count(*) filter(where ar.status='medical_report')::integer report_days,
      count(*) filter(where ar.status='worked' and public.is_rest_day(ar.attendance_date::date))::integer overtime_days
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

CREATE OR REPLACE FUNCTION public.get_personnel_attendance_detail(p_personnel_id uuid, p_year integer, p_month integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with limits as (
    select
      make_date(p_year, p_month, 1) as month_start,
      (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date as month_end,
      make_date(p_year, 1, 1) as year_start,
      make_date(p_year, 12, 31) as year_end,
      (now() at time zone 'Europe/Istanbul')::date as today
  ),
  person_records as (
    select a.*
    from public.attendance_records a
    cross join limits l
    where a.personnel_id = p_personnel_id
      and a.attendance_date <= l.today
  ),
  month_totals as (
    select
      count(*) filter (where status = 'worked')::integer as worked,
      count(*) filter (where status = 'absent')::integer as absent,
      count(*) filter (where status = 'leave')::integer as leave,
      count(*) filter (where status = 'medical_report')::integer as medical_report,
      count(*) filter (where status = 'weekly_rest')::integer as weekly_rest,
      count(*) filter (
        where status = 'worked' and public.is_rest_day(attendance_date::date)
      )::integer as sunday_worked
    from person_records r cross join limits l
    where r.attendance_date between l.month_start and least(l.month_end, l.today)
  ),
  year_totals as (
    select
      count(*) filter (where status = 'worked')::integer as worked,
      count(*) filter (where status = 'absent')::integer as absent,
      count(*) filter (where status = 'leave')::integer as leave,
      count(*) filter (where status = 'medical_report')::integer as medical_report,
      count(*) filter (where status = 'weekly_rest')::integer as weekly_rest,
      count(*) filter (
        where status = 'worked' and public.is_rest_day(attendance_date::date)
      )::integer as sunday_worked,
      count(*)::integer as total
    from person_records r cross join limits l
    where r.attendance_date between l.year_start and least(l.year_end, l.today)
  ),
  month_distribution as (
    select
      month_number,
      count(r.id) filter (where r.status = 'worked')::integer as worked,
      count(r.id) filter (where r.status = 'leave')::integer as leave,
      count(r.id) filter (where r.status = 'medical_report')::integer as medical_report,
      count(r.id)::integer as total
    from generate_series(1, 12) month_number
    cross join limits l
    left join person_records r
      on extract(month from r.attendance_date) = month_number
      and extract(year from r.attendance_date) = p_year
      and r.attendance_date <= l.today
    group by month_number
  ),
  leave_history as (
    select
      extract(year from attendance_date)::integer as year,
      count(*)::integer as days
    from person_records
    where status = 'leave'
    group by extract(year from attendance_date)
    order by year desc
  )
  select jsonb_build_object(
    'personnel_id', p_personnel_id,
    'year', p_year,
    'month', p_month,
    'month_records', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'date', to_char(r.attendance_date, 'YYYY-MM-DD'),
            'status', r.status,
            'leave_type', r.leave_type
          ) order by r.attendance_date
        ),
        '[]'::jsonb
      )
      from person_records r cross join limits l
      where r.attendance_date between l.month_start and least(l.month_end, l.today)
    ),
    'month_totals', (select to_jsonb(mt) from month_totals mt),
    'year_totals', (select to_jsonb(yt) from year_totals yt),
    'month_distribution', (
      select jsonb_agg(to_jsonb(md) order by md.month_number)
      from month_distribution md
    ),
    'leave_history', (
      select coalesce(jsonb_agg(to_jsonb(lh) order by lh.year desc), '[]'::jsonb)
      from leave_history lh
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.subcontractor_salary_rows(p_company_id uuid, p_subcontractor_id uuid, p_start date, p_end date)
 RETURNS TABLE(personnel_id uuid, full_name text, monthly_salary numeric, payable_days integer, earned numeric, advance_paid numeric, salary_paid numeric, amount numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  select p.id, p.full_name, p.monthly_salary, d.units,
         round(p.monthly_salary / 30 * d.units, 2),
         paid.advance_paid, paid.salary_paid, paid.advance_paid + paid.salary_paid
  from public.personnel p
  cross join lateral (
    select coalesce(sum(case
      when not public.is_rest_day(a.attendance_date::date) and a.status = 'worked' then 1
      when public.is_rest_day(a.attendance_date::date) and a.status = 'weekly_rest' then 1
      when public.is_rest_day(a.attendance_date::date) and a.status = 'worked' then 2
      else 0 end), 0)::integer as units
    from public.attendance_records a
    where a.personnel_id = p.id
      and a.subcontractor_id = p_subcontractor_id
      and (p_start is null or a.attendance_date >= p_start)
      and (p_end is null or a.attendance_date <= p_end)
  ) d
  cross join lateral (
    select coalesce(sum(x.amount) filter (where x.kind = 'advance'), 0) as advance_paid,
           coalesce(sum(x.amount) filter (where x.kind = 'salary'), 0) as salary_paid
    from public.personnel_advances x
    where x.personnel_id = p.id
      and (p_start is null or x.advance_date >= p_start)
      and (p_end is null or x.advance_date <= p_end)
  ) paid
  where p.company_id = p_company_id
    and p.approval_status = 'approved'
    and (p.subcontractor_id = p_subcontractor_id or d.units > 0)
    and (paid.advance_paid + paid.salary_paid > 0 or (p.monthly_salary > 0 and d.units > 0));
$function$;

CREATE OR REPLACE FUNCTION public.validate_attendance_date_and_weekly_rest()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_now timestamp := timezone('Europe/Istanbul', now());
begin
  if new.attendance_date > v_now::date
    or (new.attendance_date = v_now::date and v_now::time < time '09:00') then
    raise exception 'Puantaj yalnızca ilgili gün saat 09:00 sonrası veya geçmiş tarihler için girilebilir';
  end if;
  if new.status = 'weekly_rest' and not public.is_rest_day(new.attendance_date::date) then
    raise exception 'Hafta tatili ve resmi tatil yalnızca pazar veya resmi tatil günü olabilir';
  end if;
  return new;
end;
$function$;

commit;
