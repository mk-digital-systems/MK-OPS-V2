-- Taşeron hakediş dönemi kapatma
--
--   * Biten bir hakediş dönemi kapatılınca o günkü ekstre (hakediş payı, ödemeler, personel avans/maaşları, araç kirası ve
--     yakıtı, bakiye) olduğu gibi saklanır; geçmiş dönem hep bu kayıttan görülür.
--   * Kapalı döneme tarihli taşeron ödemesi/harcaması ve taşeron personeline avans/maaş ödemesi girilemez ve değiştirilemez;
--     önce dönem yeniden açılır (yalnızca firma yöneticisi). Araçtan doğan yakıt/kira kayıtları ve imalat girişi engellenmez;
--     kapanıştan sonra değişen bakiye ekranda uyarı olarak gösterilir.

create table public.subcontractor_period_closures (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade,
  subcontractor_id uuid not null,
  period_start date not null,
  period_end date not null,
  statement jsonb not null,
  closed_by uuid references auth.users (id) on delete set null,
  closed_at timestamptz not null default now(),
  constraint subcontractor_period_closures_dates check (period_end >= period_start),
  constraint subcontractor_period_closures_unique unique (subcontractor_id, period_start, period_end),
  constraint subcontractor_period_closures_sub_fkey foreign key (company_id, subcontractor_id)
    references public.subcontractors (company_id, id) on delete cascade
);
create index idx_subcontractor_period_closures_sub on public.subcontractor_period_closures (subcontractor_id, period_start);

comment on table public.subcontractor_period_closures is 'Kapatılmış taşeron hakediş dönemleri ve kapanıştaki ekstre (değişmez kayıt)';

alter table public.subcontractor_period_closures enable row level security;
revoke all on public.subcontractor_period_closures from anon;
revoke insert, update, delete on public.subcontractor_period_closures from authenticated;

create policy "company_isolation" on public.subcontractor_period_closures
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "subcontractor_period_closures_select" on public.subcontractor_period_closures for select to authenticated
  using ((select public.has_module_write_permission('hakedis')));

-- Dönemi kapatır: biten dönem, başka kapalı dönemle çakışmaz.
create function public.close_subcontractor_period(p_subcontractor_id uuid, p_start date, p_end date)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company uuid := public.current_company_id();
  v_today date := timezone('Europe/Istanbul', now())::date;
  v_id uuid;
begin
  if v_company is null or not public.has_module_write_permission('hakedis') then
    raise exception 'Dönemi kapatmak için hakediş yetkisi gerekli' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'Geçersiz tarih aralığı';
  end if;
  if p_end >= v_today then
    raise exception 'Dönem bitmeden kapatılamaz';
  end if;
  if exists (
    select 1 from public.subcontractor_period_closures c
    where c.subcontractor_id = p_subcontractor_id and c.period_start <= p_end and c.period_end >= p_start
  ) then
    raise exception 'Bu dönem (ya da bir kısmı) zaten kapatılmış';
  end if;

  insert into public.subcontractor_period_closures (company_id, subcontractor_id, period_start, period_end, statement, closed_by)
  values (v_company, p_subcontractor_id, p_start, p_end,
          public.get_subcontractor_statement(p_subcontractor_id, p_start, p_end), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.close_subcontractor_period(uuid, date, date) from public, anon;
grant execute on function public.close_subcontractor_period(uuid, date, date) to authenticated;

-- Kapalı dönemi yeniden açar (yalnızca firma yöneticisi).
create function public.reopen_subcontractor_period(p_closure_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.is_site_chief() then
    raise exception 'Kapalı dönemi yalnızca firma yöneticisi yeniden açabilir' using errcode = '42501';
  end if;
  delete from public.subcontractor_period_closures
  where id = p_closure_id and company_id = public.current_company_id();
  if not found then
    raise exception 'Kapalı dönem bulunamadı';
  end if;
end;
$$;

revoke all on function public.reopen_subcontractor_period(uuid) from public, anon;
grant execute on function public.reopen_subcontractor_period(uuid) to authenticated;

-- Kapalı döneme elle ödeme/harcama ve taşeron personeline avans/maaş ödemesi girilemez.
create function public.guard_subcontractor_closed_period()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_sub uuid;
  v_dates date[];
begin
  if not public.is_tenant_request()
    or coalesce(current_setting('mk_ops.vehicle_cost_sync', true), '') = 'on'
    or pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'subcontractor_transactions' then
    v_sub := coalesce(new.subcontractor_id, old.subcontractor_id);
    v_dates := array_remove(array[
      case when tg_op <> 'INSERT' then old.transaction_date end,
      case when tg_op <> 'DELETE' then new.transaction_date end], null);
  else
    select p.subcontractor_id into v_sub from public.personnel p where p.id = coalesce(new.personnel_id, old.personnel_id);
    v_dates := array_remove(array[
      case when tg_op <> 'INSERT' then old.advance_date end,
      case when tg_op <> 'DELETE' then new.advance_date end], null);
  end if;

  if v_sub is not null and exists (
    select 1 from public.subcontractor_period_closures c
    where c.subcontractor_id = v_sub and exists (
      select 1 from unnest(v_dates) d where d between c.period_start and c.period_end)
  ) then
    raise exception 'Bu hakediş dönemi kapatıldı; kayıt eklemek veya değiştirmek için önce dönemi yeniden açın' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function public.guard_subcontractor_closed_period() from public, anon, authenticated;

create trigger a2_guard_closed_period before insert or update or delete on public.subcontractor_transactions
for each row execute function public.guard_subcontractor_closed_period();
create trigger a2_guard_closed_period before insert or update or delete on public.personnel_advances
for each row execute function public.guard_subcontractor_closed_period();
