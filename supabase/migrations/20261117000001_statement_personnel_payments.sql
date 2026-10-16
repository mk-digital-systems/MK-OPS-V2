-- Taşeron ekstresine personele verilen avans ve maaş ödemelerinin satırları eklenir (personnel_payments).
-- Bu satırlar bakiyeyi ayrıca etkilemez (tutarları zaten 'salaries' / salary_total içinde düşülür); "Harcama ve Ödemeler"
-- sekmesinde firmanın verdiği bütün paraların görünmesi içindir.

CREATE OR REPLACE FUNCTION public.get_subcontractor_statement(p_subcontractor_id uuid, p_start date, p_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
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
  if not found or (v_sub.personnel_id is not null and not exists (
    select 1 from public.personnel p where p.id = v_sub.personnel_id and public.can_access_branch(p.branch_id))) then
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
    ppay as (
      select a.id, a.advance_date, a.amount, a.kind, a.notes, p.id as personnel_id, p.full_name
      from public.personnel_advances a
      join public.personnel p on p.id = a.personnel_id
      where a.advance_date between p_start and p_end
        and a.personnel_id in (select personnel_id from salaries)
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
      'personnel_payments', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.advance_date, x.full_name) from ppay x
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
$function$;
