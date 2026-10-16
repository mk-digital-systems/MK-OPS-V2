-- Taşeron personeline verilen avans ve yapılan maaş ödemesi taşeron hesabına yansır
--
--   * personnel_advances'a tür eklenir: 'advance' (avans) ve 'salary' (maaş ödemesi). Maaş dökümü ikisini de "verilen" sayar,
--     bu yüzden ödenecek kalan tutar ödemeden sonra düşer.
--   * Taşeron ekstresinde firmanın taşeron personeline fiilen ödediği tutar (avans + maaş ödemesi) taşeronun hesabından
--     hakediş gününde düşülür. Eski kural (puantaja göre hak edilen maaşın düşülmesi) kalktı; hak edilen maaş ekstrede
--     bilgi olarak gösterilir, ödenmemiş kısım "kalan" olarak görünür.
--   * Maaşından fazla avans verilmişse (personel taşerona borçlu) taşeron hesabından verilen avans kadar düşülür.

alter table public.personnel_advances
  add column kind text not null default 'advance' check (kind in ('advance', 'salary'));
comment on column public.personnel_advances.kind is 'advance: avans; salary: maaş ödemesi';

drop function public.subcontractor_salary_rows(uuid, uuid, date, date);

-- Taşeron personeli için dönem satırları. amount = hesaptan düşen tutar (avans + maaş ödemesi);
-- earned = puantaja göre hak edilen maaş (aylık maaş / 30 × gün; pazar hafta tatili 1, pazar çalışma 2).
create function public.subcontractor_salary_rows(p_company_id uuid, p_subcontractor_id uuid, p_start date, p_end date)
returns table (personnel_id uuid, full_name text, monthly_salary numeric, payable_days integer, earned numeric,
               advance_paid numeric, salary_paid numeric, amount numeric)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select p.id, p.full_name, p.monthly_salary, d.units,
         round(p.monthly_salary / 30 * d.units, 2),
         paid.advance_paid, paid.salary_paid, paid.advance_paid + paid.salary_paid
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
$$;

revoke all on function public.subcontractor_salary_rows(uuid, uuid, date, date) from public, anon, authenticated;
