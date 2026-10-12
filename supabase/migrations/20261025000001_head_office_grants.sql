-- Merkez yetkisi verme ve şube değiştirme
--
--   1. Firma yöneticisi, Merkez'e atanmamış bir şantiye şefine de Merkez yetkisi verebilir: bütün şubeler,
--      personel/araç onayı ve şube değiştirme. Kullanıcı şantiye şefi olmaktan çıkar ya da firmadan ayrılırsa yetki düşer.
--   2. Personelin ve aracın şubesini yalnızca firma yöneticisi ve Merkez yetkili şantiye şefi değiştirir;
--      şube şantiye şefi kendi şubeleri arasında da taşıyamaz.

create table public.head_office_grants (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.head_office_grants is 'Firma yöneticisinin Merkez yetkisi verdiği şantiye şefleri (yalnızca fonksiyonlarla okunur/yazılır)';

alter table public.head_office_grants enable row level security;
revoke all on public.head_office_grants from anon, authenticated;

-- Rol veya firma değişince yetki düşer.
create function public.profiles_clear_head_office_grant()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.role is distinct from 'company_manager' or new.company_id is distinct from old.company_id then
    delete from public.head_office_grants where user_id = new.id;
  end if;
  return null;
end;
$$;

revoke all on function public.profiles_clear_head_office_grant() from public, anon, authenticated;

create trigger profiles_clear_head_office_grant
after update of role, company_id on public.profiles
for each row execute function public.profiles_clear_head_office_grant();

create or replace function public.is_head_office()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select case public.current_user_role()
    when 'site_chief' then true
    when 'company_manager' then
      exists (
        select 1 from public.user_branches ub
        join public.branches b on b.id = ub.branch_id
        where ub.user_id = auth.uid() and b.company_id = public.current_company_id() and b.is_main)
      or exists (
        select 1 from public.head_office_grants g
        where g.user_id = auth.uid() and g.company_id = public.current_company_id())
    else false
  end;
$$;

comment on function public.is_head_office() is
  'Firma yöneticisi, Merkez şubesine atanmış ya da Merkez yetkisi verilmiş şantiye şefi';

create function public.set_user_head_office(p_user_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company uuid := public.current_company_id();
begin
  if not public.is_site_chief() or v_company is null then
    raise exception 'Merkez yetkisini yalnızca firma yöneticisi verebilir' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and company_id = v_company
                 and is_approved and role = 'company_manager') then
    raise exception 'Merkez yetkisi yalnızca şantiye şefine verilir';
  end if;
  if p_enabled then
    insert into public.head_office_grants (user_id, company_id, granted_by)
    values (p_user_id, v_company, auth.uid())
    on conflict (user_id) do nothing;
  else
    delete from public.head_office_grants where user_id = p_user_id;
  end if;
end;
$$;

revoke all on function public.set_user_head_office(uuid, boolean) from public, anon;
grant execute on function public.set_user_head_office(uuid, boolean) to authenticated;

-- Firma yöneticisine Merkez yetkisi verilmiş kullanıcılar da döner.
create or replace function public.get_my_branches()
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select jsonb_build_object(
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'is_main', b.is_main, 'sort_order', b.sort_order)
                       order by b.is_main desc, b.sort_order, b.name)
      from public.branches b
      where b.company_id = public.current_company_id() and public.can_access_branch(b.id)
    ), '[]'::jsonb),
    'total_count', (select count(*) from public.branches b where b.company_id = public.current_company_id()),
    'head_office', public.is_head_office(),
    'assignments', case when public.is_site_chief() then coalesce((
      select jsonb_agg(jsonb_build_object('user_id', ub.user_id, 'branch_id', ub.branch_id))
      from public.user_branches ub where ub.company_id = public.current_company_id()
    ), '[]'::jsonb) end,
    'head_office_users', case when public.is_site_chief() then coalesce((
      select jsonb_agg(g.user_id)
      from public.head_office_grants g where g.company_id = public.current_company_id()
    ), '[]'::jsonb) end
  );
$$;

-- Şube değişikliği yalnızca Merkez yetkisiyle.
create function public.guard_branch_change()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.branch_id is distinct from old.branch_id
    and public.is_tenant_request()
    and pg_trigger_depth() <= 1
    and not public.is_head_office() then
    raise exception 'Şubeyi yalnızca firma yöneticisi veya Merkez şantiye şefi değiştirebilir' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_branch_change() from public, anon, authenticated;

create trigger a1_guard_branch_change
before update of branch_id on public.personnel
for each row execute function public.guard_branch_change();

create trigger a1_guard_branch_change
before update of branch_id on public.vehicles
for each row execute function public.guard_branch_change();
