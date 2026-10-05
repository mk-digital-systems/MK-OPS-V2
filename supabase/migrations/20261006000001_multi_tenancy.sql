-- =============================================================================
-- MK OPS — çoklu şirket (multi-tenancy) altyapısı
--
-- Her iş tablosu bir şirkete (company_id) bağlanır. Kullanıcılar yalnızca
-- kendi şirketlerinin verisini görür ve değiştirir:
--   * RLS: her tabloda "yalnızca kendi şirketin" kısıtlayıcı politikası
--   * Yazma koruması: SECURITY DEFINER fonksiyonlar RLS'i atladığı için her
--     tabloda kullanıcı isteklerini şirkete bağlayan tetikleyici
--   * Bileşik foreign key'ler: (company_id, x_id) → başka şirketin kaydına
--     bağlantı kurulamaz
-- Süper adminler platform_admins tablosunda tutulur ve hiçbir şirkete bağlı
-- değildir. "İlk kayıt olan şantiye şefi olur" kuralı kaldırılmıştır; şirket
-- oluşturma ve şirkete katılma akışı ayrı migration'dadır.
-- =============================================================================

-- 0. Ön koşul -----------------------------------------------------------------
-- Bu migration boş bir veritabanı içindir; şirketsiz iş verisi taşınamaz.
do $$
declare
  v_tables text[] := '{}';
begin
  if exists (select 1 from public.vehicles) then v_tables := v_tables || 'vehicles'; end if;
  if exists (select 1 from public.projects) then v_tables := v_tables || 'projects'; end if;
  if exists (select 1 from public.inventory_materials) then v_tables := v_tables || 'inventory_materials'; end if;
  if exists (select 1 from public.shared_notes) then v_tables := v_tables || 'shared_notes'; end if;
  if exists (select 1 from public.vehicle_fuel_logs) then v_tables := v_tables || 'vehicle_fuel_logs'; end if;
  if exists (select 1 from public.company_manager_permissions) then v_tables := v_tables || 'company_manager_permissions'; end if;
  if exists (select 1 from public.attendance_audit_logs) then v_tables := v_tables || 'attendance_audit_logs'; end if;
  if exists (select 1 from public.attendance_month_notes) then v_tables := v_tables || 'attendance_month_notes'; end if;
  if exists (select 1 from public.attendance_records) then v_tables := v_tables || 'attendance_records'; end if;
  if exists (select 1 from public.daily_work_plan_absences) then v_tables := v_tables || 'daily_work_plan_absences'; end if;
  if exists (select 1 from public.daily_work_plan_drafts) then v_tables := v_tables || 'daily_work_plan_drafts'; end if;
  if exists (select 1 from public.daily_work_plan_team_members) then v_tables := v_tables || 'daily_work_plan_team_members'; end if;
  if exists (select 1 from public.daily_work_plan_teams) then v_tables := v_tables || 'daily_work_plan_teams'; end if;
  if exists (select 1 from public.daily_work_plans) then v_tables := v_tables || 'daily_work_plans'; end if;
  if exists (select 1 from public.inventory_catalog) then v_tables := v_tables || 'inventory_catalog'; end if;
  if exists (select 1 from public.inventory_custody_balances) then v_tables := v_tables || 'inventory_custody_balances'; end if;
  if exists (select 1 from public.inventory_custody_movements) then v_tables := v_tables || 'inventory_custody_movements'; end if;
  if exists (select 1 from public.inventory_movements) then v_tables := v_tables || 'inventory_movements'; end if;
  if exists (select 1 from public.inventory_receipt_items) then v_tables := v_tables || 'inventory_receipt_items'; end if;
  if exists (select 1 from public.inventory_receipts) then v_tables := v_tables || 'inventory_receipts'; end if;
  if exists (select 1 from public.inventory_request_items) then v_tables := v_tables || 'inventory_request_items'; end if;
  if exists (select 1 from public.inventory_request_receipt_items) then v_tables := v_tables || 'inventory_request_receipt_items'; end if;
  if exists (select 1 from public.inventory_requests) then v_tables := v_tables || 'inventory_requests'; end if;
  if exists (select 1 from public.inventory_shipment_items) then v_tables := v_tables || 'inventory_shipment_items'; end if;
  if exists (select 1 from public.inventory_shipments) then v_tables := v_tables || 'inventory_shipments'; end if;
  if exists (select 1 from public.personnel) then v_tables := v_tables || 'personnel'; end if;
  if exists (select 1 from public.personnel_advances) then v_tables := v_tables || 'personnel_advances'; end if;
  if exists (select 1 from public.personnel_employment_periods) then v_tables := v_tables || 'personnel_employment_periods'; end if;
  if exists (select 1 from public.private_notes) then v_tables := v_tables || 'private_notes'; end if;
  if exists (select 1 from public.production_entries) then v_tables := v_tables || 'production_entries'; end if;
  if exists (select 1 from public.production_item_definitions) then v_tables := v_tables || 'production_item_definitions'; end if;
  if exists (select 1 from public.production_items) then v_tables := v_tables || 'production_items'; end if;
  if exists (select 1 from public.production_jobs) then v_tables := v_tables || 'production_jobs'; end if;
  if exists (select 1 from public.project_cabinet_progress) then v_tables := v_tables || 'project_cabinet_progress'; end if;
  if exists (select 1 from public.project_cabinets) then v_tables := v_tables || 'project_cabinets'; end if;
  if exists (select 1 from public.project_cancellation_history) then v_tables := v_tables || 'project_cancellation_history'; end if;
  if exists (select 1 from public.project_sheet_cables) then v_tables := v_tables || 'project_sheet_cables'; end if;
  if exists (select 1 from public.project_sheet_progress) then v_tables := v_tables || 'project_sheet_progress'; end if;
  if exists (select 1 from public.project_sheets) then v_tables := v_tables || 'project_sheets'; end if;
  if cardinality(v_tables) > 0 then
    raise exception 'Şirkete atanamayan mevcut veri var: %', array_to_string(v_tables, ', ');
  end if;
end $$;

-- Global başlangıç ayarı; ayarlar artık şirket başına tutulur.
delete from public.app_settings;

-- 1. Şirketler ve platform yöneticileri ---------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  join_code text not null check (join_code ~ '^[0-9]{4}$'),
  owner_user_id uuid references auth.users (id) on delete set null,
  plan text,
  plan_ends_at timestamptz,
  trial_ends_at timestamptz not null default (now() + interval '48 hours'),
  user_limit integer check (user_limit is null or user_limit > 0),
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index companies_name_unique on public.companies (lower(trim(name)));

comment on table public.companies is 'MK OPS müşteri şirketleri';
comment on column public.companies.join_code is 'Çalışanların şirkete katılırken girdiği 4 haneli kod';
comment on column public.companies.plan is 'Süper adminin atadığı plan; null ise deneme süresindedir';
comment on column public.companies.plan_ends_at is 'Atanan planın bitiş zamanı';
comment on column public.companies.trial_ends_at is 'Deneme süresinin bitişi (kayıttan 48 saat sonra)';
comment on column public.companies.user_limit is 'Onaylı kullanıcı sayısı üst sınırı; null ise sınırsız';
comment on column public.companies.suspended_at is 'Süper admin tarafından askıya alındıysa zamanı';

create trigger companies_set_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.platform_admins is 'MK OPS süper adminleri; hiçbir şirkete bağlı değildir';

alter table public.companies enable row level security;
alter table public.platform_admins enable row level security;
revoke all on public.companies, public.platform_admins from anon;
revoke all on public.platform_admins from authenticated;

-- Süper adminler ve henüz şirkete katılmamış kullanıcılar şirketsizdir.
alter table public.profiles
  add column company_id uuid references public.companies (id) on delete cascade;
create index idx_profiles_company_id on public.profiles (company_id);

-- 2. Yardımcı fonksiyonlar -----------------------------------------------------
create function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select p.company_id from public.profiles p where p.id = auth.uid();
$$;

comment on function public.current_company_id() is 'Oturumdaki kullanıcının şirketi; şirketsiz kullanıcı ve sistem için null';

create function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (select 1 from public.platform_admins a where a.user_id = auth.uid());
$$;

-- Kullanıcı (anon/authenticated) isteği mi? Cron, SQL Editor ve service_role
-- istekleri sistem isteğidir ve şirket korumasına takılmaz.
create function public.is_tenant_request()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.role(), '') in ('anon', 'authenticated')
    and not public.is_super_admin();
$$;

create policy "companies_select_own"
  on public.companies for select
  to authenticated
  using (id = (select public.current_company_id()));

-- 3. company_id sütunları ------------------------------------------------------
alter table public.vehicles
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_vehicles_company_id on public.vehicles (company_id);

alter table public.projects
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_projects_company_id on public.projects (company_id);

alter table public.inventory_materials
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_inventory_materials_company_id on public.inventory_materials (company_id);

alter table public.shared_notes
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_shared_notes_company_id on public.shared_notes (company_id);

alter table public.vehicle_fuel_logs
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_vehicle_fuel_logs_company_id on public.vehicle_fuel_logs (company_id);

alter table public.company_manager_permissions
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_company_manager_permissions_company_id on public.company_manager_permissions (company_id);

alter table public.app_settings
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_app_settings_company_id on public.app_settings (company_id);

alter table public.attendance_audit_logs
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_attendance_audit_logs_company_id on public.attendance_audit_logs (company_id);

alter table public.attendance_month_notes
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_attendance_month_notes_company_id on public.attendance_month_notes (company_id);

alter table public.attendance_records
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_attendance_records_company_id on public.attendance_records (company_id);

alter table public.daily_work_plan_absences
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_daily_work_plan_absences_company_id on public.daily_work_plan_absences (company_id);

alter table public.daily_work_plan_drafts
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_daily_work_plan_drafts_company_id on public.daily_work_plan_drafts (company_id);

alter table public.daily_work_plan_team_members
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_daily_work_plan_team_members_company_id on public.daily_work_plan_team_members (company_id);

alter table public.daily_work_plan_teams
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_daily_work_plan_teams_company_id on public.daily_work_plan_teams (company_id);

alter table public.daily_work_plans
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_daily_work_plans_company_id on public.daily_work_plans (company_id);

alter table public.inventory_catalog
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_inventory_catalog_company_id on public.inventory_catalog (company_id);

alter table public.inventory_custody_balances
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_inventory_custody_balances_company_id on public.inventory_custody_balances (company_id);

alter table public.inventory_custody_movements
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_inventory_custody_movements_company_id on public.inventory_custody_movements (company_id);

alter table public.inventory_movements
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_inventory_movements_company_id on public.inventory_movements (company_id);

alter table public.inventory_receipt_items
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_inventory_receipt_items_company_id on public.inventory_receipt_items (company_id);

alter table public.inventory_receipts
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_inventory_receipts_company_id on public.inventory_receipts (company_id);

alter table public.inventory_request_items
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_inventory_request_items_company_id on public.inventory_request_items (company_id);

alter table public.inventory_request_receipt_items
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_inventory_request_receipt_items_company_id on public.inventory_request_receipt_items (company_id);

alter table public.inventory_requests
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_inventory_requests_company_id on public.inventory_requests (company_id);

alter table public.inventory_shipment_items
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_inventory_shipment_items_company_id on public.inventory_shipment_items (company_id);

alter table public.inventory_shipments
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_inventory_shipments_company_id on public.inventory_shipments (company_id);

alter table public.personnel
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_personnel_company_id on public.personnel (company_id);

alter table public.personnel_advances
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_personnel_advances_company_id on public.personnel_advances (company_id);

alter table public.personnel_employment_periods
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_personnel_employment_periods_company_id on public.personnel_employment_periods (company_id);

alter table public.private_notes
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_private_notes_company_id on public.private_notes (company_id);

alter table public.production_entries
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_production_entries_company_id on public.production_entries (company_id);

alter table public.production_item_definitions
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_production_item_definitions_company_id on public.production_item_definitions (company_id);

alter table public.production_items
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_production_items_company_id on public.production_items (company_id);

alter table public.production_jobs
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_production_jobs_company_id on public.production_jobs (company_id);

alter table public.project_cabinet_progress
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_project_cabinet_progress_company_id on public.project_cabinet_progress (company_id);

alter table public.project_cabinets
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_project_cabinets_company_id on public.project_cabinets (company_id);

alter table public.project_cancellation_history
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_project_cancellation_history_company_id on public.project_cancellation_history (company_id);

alter table public.project_sheet_cables
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_project_sheet_cables_company_id on public.project_sheet_cables (company_id);

alter table public.project_sheet_progress
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_project_sheet_progress_company_id on public.project_sheet_progress (company_id);

alter table public.project_sheets
  add column company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade;
create index idx_project_sheets_company_id on public.project_sheets (company_id);

-- 4. Benzersizlik kuralları şirket bazında -----------------------------------------
alter table public.app_settings drop constraint app_settings_key_key;
alter table public.app_settings add constraint app_settings_company_key_key unique (company_id, key);

alter table public.attendance_month_notes drop constraint attendance_month_notes_pkey;
alter table public.attendance_month_notes add constraint attendance_month_notes_pkey primary key (company_id, year, month);

alter table public.daily_work_plans drop constraint daily_work_plans_date_unique;
alter table public.daily_work_plans add constraint daily_work_plans_date_unique unique (company_id, plan_date);

alter table public.production_item_definitions drop constraint production_item_definitions_name_key;
alter table public.production_item_definitions add constraint production_item_definitions_name_key unique (company_id, name);

alter table public.projects drop constraint projects_project_code_key;
alter table public.projects add constraint projects_project_code_key unique (company_id, project_code);

alter table public.vehicles drop constraint vehicles_plate_unique;
alter table public.vehicles add constraint vehicles_plate_unique unique (company_id, plate);

drop index public.idx_inventory_catalog_identity;
create unique index idx_inventory_catalog_identity on public.inventory_catalog (
  company_id,
  lower(trim(material_name)),
  stock_category,
  lower(trim(coalesce(material_type, ''))),
  lower(trim(coalesce(size, '')))
);

drop index public.idx_inventory_material_code_unique;
create unique index idx_inventory_material_code_unique on public.inventory_materials (company_id, lower(trim(material_code)))
  where material_code is not null and trim(material_code) <> '';

drop index public.idx_inventory_receipts_dispatch;
create unique index idx_inventory_receipts_dispatch on public.inventory_receipts (company_id, lower(trim(dispatch_number)));

drop index public.personnel_tc_identity_number_unique;
create unique index personnel_tc_identity_number_unique on public.personnel (company_id, tc_identity_number)
  where tc_identity_number is not null;

-- 5. Şirket içi bağlantılar ---------------------------------------------------
-- Bağlanan kayıt aynı şirkete ait olmak zorundadır.

alter table public.daily_work_plan_teams add constraint daily_work_plan_teams_company_id_id_key unique (company_id, id);
alter table public.daily_work_plans add constraint daily_work_plans_company_id_id_key unique (company_id, id);
alter table public.inventory_catalog add constraint inventory_catalog_company_id_id_key unique (company_id, id);
alter table public.inventory_materials add constraint inventory_materials_company_id_id_key unique (company_id, id);
alter table public.inventory_receipts add constraint inventory_receipts_company_id_id_key unique (company_id, id);
alter table public.inventory_requests add constraint inventory_requests_company_id_id_key unique (company_id, id);
alter table public.inventory_shipments add constraint inventory_shipments_company_id_id_key unique (company_id, id);
alter table public.personnel add constraint personnel_company_id_id_key unique (company_id, id);
alter table public.production_entries add constraint production_entries_company_id_id_key unique (company_id, id);
alter table public.production_item_definitions add constraint production_item_definitions_company_id_id_key unique (company_id, id);
alter table public.production_jobs add constraint production_jobs_company_id_id_key unique (company_id, id);
alter table public.profiles add constraint profiles_company_id_id_key unique (company_id, id);
alter table public.project_cabinets add constraint project_cabinets_company_id_id_key unique (company_id, id);
alter table public.project_sheet_cables add constraint project_sheet_cables_company_id_id_key unique (company_id, id);
alter table public.project_sheets add constraint project_sheets_company_id_id_key unique (company_id, id);
alter table public.projects add constraint projects_company_id_id_key unique (company_id, id);
alter table public.vehicles add constraint vehicles_company_id_id_key unique (company_id, id);

alter table public.attendance_audit_logs drop constraint attendance_audit_logs_personnel_id_fkey;
alter table public.attendance_audit_logs add constraint attendance_audit_logs_personnel_id_fkey
  foreign key (company_id, personnel_id) references public.personnel (company_id, id) on delete cascade;
alter table public.attendance_records drop constraint attendance_records_personnel_id_fkey;
alter table public.attendance_records add constraint attendance_records_personnel_id_fkey
  foreign key (company_id, personnel_id) references public.personnel (company_id, id) on delete cascade;
alter table public.company_manager_permissions drop constraint company_manager_permissions_user_id_fkey;
alter table public.company_manager_permissions add constraint company_manager_permissions_user_id_fkey
  foreign key (company_id, user_id) references public.profiles (company_id, id) on delete cascade;
alter table public.daily_work_plan_absences drop constraint daily_work_plan_absences_personnel_id_fkey;
alter table public.daily_work_plan_absences add constraint daily_work_plan_absences_personnel_id_fkey
  foreign key (company_id, personnel_id) references public.personnel (company_id, id) on delete restrict;
alter table public.daily_work_plan_absences drop constraint daily_work_plan_absences_work_plan_id_fkey;
alter table public.daily_work_plan_absences add constraint daily_work_plan_absences_work_plan_id_fkey
  foreign key (company_id, work_plan_id) references public.daily_work_plans (company_id, id) on delete cascade;
alter table public.daily_work_plan_team_members drop constraint daily_work_plan_team_members_personnel_id_fkey;
alter table public.daily_work_plan_team_members add constraint daily_work_plan_team_members_personnel_id_fkey
  foreign key (company_id, personnel_id) references public.personnel (company_id, id) on delete set null (personnel_id);
alter table public.daily_work_plan_team_members drop constraint daily_work_plan_team_members_team_id_fkey;
alter table public.daily_work_plan_team_members add constraint daily_work_plan_team_members_team_id_fkey
  foreign key (company_id, team_id) references public.daily_work_plan_teams (company_id, id) on delete cascade;
alter table public.daily_work_plan_teams drop constraint daily_work_plan_teams_chief_personnel_id_fkey;
alter table public.daily_work_plan_teams add constraint daily_work_plan_teams_chief_personnel_id_fkey
  foreign key (company_id, chief_personnel_id) references public.personnel (company_id, id) on delete set null (chief_personnel_id);
alter table public.daily_work_plan_teams drop constraint daily_work_plan_teams_plan_id_fkey;
alter table public.daily_work_plan_teams add constraint daily_work_plan_teams_plan_id_fkey
  foreign key (company_id, plan_id) references public.daily_work_plans (company_id, id) on delete cascade;
alter table public.daily_work_plan_teams drop constraint daily_work_plan_teams_project_id_fkey;
alter table public.daily_work_plan_teams add constraint daily_work_plan_teams_project_id_fkey
  foreign key (company_id, project_id) references public.projects (company_id, id) on delete set null (project_id);
alter table public.daily_work_plan_teams drop constraint daily_work_plan_teams_vehicle_id_fkey;
alter table public.daily_work_plan_teams add constraint daily_work_plan_teams_vehicle_id_fkey
  foreign key (company_id, vehicle_id) references public.vehicles (company_id, id) on delete set null (vehicle_id);
alter table public.inventory_custody_balances drop constraint inventory_custody_balances_material_id_fkey;
alter table public.inventory_custody_balances add constraint inventory_custody_balances_material_id_fkey
  foreign key (company_id, material_id) references public.inventory_materials (company_id, id) on delete restrict;
alter table public.inventory_custody_movements drop constraint inventory_custody_movements_material_id_fkey;
alter table public.inventory_custody_movements add constraint inventory_custody_movements_material_id_fkey
  foreign key (company_id, material_id) references public.inventory_materials (company_id, id) on delete restrict;
alter table public.inventory_materials drop constraint inventory_materials_catalog_id_fkey;
alter table public.inventory_materials add constraint inventory_materials_catalog_id_fkey
  foreign key (company_id, catalog_id) references public.inventory_catalog (company_id, id) on delete cascade;
alter table public.inventory_movements drop constraint inventory_movements_material_id_fkey;
alter table public.inventory_movements add constraint inventory_movements_material_id_fkey
  foreign key (company_id, material_id) references public.inventory_materials (company_id, id) on delete restrict;
alter table public.inventory_movements drop constraint inventory_movements_receipt_id_fkey;
alter table public.inventory_movements add constraint inventory_movements_receipt_id_fkey
  foreign key (company_id, receipt_id) references public.inventory_receipts (company_id, id) on delete cascade;
alter table public.inventory_movements drop constraint inventory_movements_shipment_id_fkey;
alter table public.inventory_movements add constraint inventory_movements_shipment_id_fkey
  foreign key (company_id, shipment_id) references public.inventory_shipments (company_id, id) on delete cascade;
alter table public.inventory_receipt_items drop constraint inventory_receipt_items_material_id_fkey;
alter table public.inventory_receipt_items add constraint inventory_receipt_items_material_id_fkey
  foreign key (company_id, material_id) references public.inventory_materials (company_id, id) on delete cascade;
alter table public.inventory_receipt_items drop constraint inventory_receipt_items_receipt_id_fkey;
alter table public.inventory_receipt_items add constraint inventory_receipt_items_receipt_id_fkey
  foreign key (company_id, receipt_id) references public.inventory_receipts (company_id, id) on delete cascade;
alter table public.inventory_request_items drop constraint inventory_request_items_catalog_id_fkey;
alter table public.inventory_request_items add constraint inventory_request_items_catalog_id_fkey
  foreign key (company_id, catalog_id) references public.inventory_catalog (company_id, id) on delete restrict;
alter table public.inventory_request_items drop constraint inventory_request_items_request_id_fkey;
alter table public.inventory_request_items add constraint inventory_request_items_request_id_fkey
  foreign key (company_id, request_id) references public.inventory_requests (company_id, id) on delete cascade;
alter table public.inventory_request_receipt_items drop constraint inventory_request_receipt_items_catalog_id_fkey;
alter table public.inventory_request_receipt_items add constraint inventory_request_receipt_items_catalog_id_fkey
  foreign key (company_id, catalog_id) references public.inventory_catalog (company_id, id) on delete restrict;
alter table public.inventory_request_receipt_items drop constraint inventory_request_receipt_items_request_id_fkey;
alter table public.inventory_request_receipt_items add constraint inventory_request_receipt_items_request_id_fkey
  foreign key (company_id, request_id) references public.inventory_requests (company_id, id) on delete cascade;
alter table public.inventory_requests drop constraint inventory_requests_receipt_id_fkey;
alter table public.inventory_requests add constraint inventory_requests_receipt_id_fkey
  foreign key (company_id, receipt_id) references public.inventory_receipts (company_id, id) on delete set null (receipt_id);
alter table public.inventory_shipment_items drop constraint inventory_shipment_items_material_id_fkey;
alter table public.inventory_shipment_items add constraint inventory_shipment_items_material_id_fkey
  foreign key (company_id, material_id) references public.inventory_materials (company_id, id) on delete restrict;
alter table public.inventory_shipment_items drop constraint inventory_shipment_items_shipment_id_fkey;
alter table public.inventory_shipment_items add constraint inventory_shipment_items_shipment_id_fkey
  foreign key (company_id, shipment_id) references public.inventory_shipments (company_id, id) on delete cascade;
alter table public.inventory_shipments drop constraint inventory_shipments_vehicle_id_fkey;
alter table public.inventory_shipments add constraint inventory_shipments_vehicle_id_fkey
  foreign key (company_id, vehicle_id) references public.vehicles (company_id, id) on delete set null (vehicle_id);
alter table public.personnel_advances drop constraint personnel_advances_personnel_id_fkey;
alter table public.personnel_advances add constraint personnel_advances_personnel_id_fkey
  foreign key (company_id, personnel_id) references public.personnel (company_id, id) on delete restrict;
alter table public.personnel_employment_periods drop constraint personnel_employment_periods_personnel_id_fkey;
alter table public.personnel_employment_periods add constraint personnel_employment_periods_personnel_id_fkey
  foreign key (company_id, personnel_id) references public.personnel (company_id, id) on delete cascade;
alter table public.production_entries drop constraint production_entries_source_work_plan_id_fkey;
alter table public.production_entries add constraint production_entries_source_work_plan_id_fkey
  foreign key (company_id, source_work_plan_id) references public.daily_work_plans (company_id, id) on delete set null (source_work_plan_id);
alter table public.production_entries drop constraint production_entries_team_leader_personnel_id_fkey;
alter table public.production_entries add constraint production_entries_team_leader_personnel_id_fkey
  foreign key (company_id, team_leader_personnel_id) references public.personnel (company_id, id) on delete restrict;
alter table public.production_items drop constraint production_items_production_item_definition_id_fkey;
alter table public.production_items add constraint production_items_production_item_definition_id_fkey
  foreign key (company_id, production_item_definition_id) references public.production_item_definitions (company_id, id) on delete set null (production_item_definition_id);
alter table public.production_items drop constraint production_items_production_job_id_fkey;
alter table public.production_items add constraint production_items_production_job_id_fkey
  foreign key (company_id, production_job_id) references public.production_jobs (company_id, id) on delete cascade;
alter table public.production_jobs drop constraint production_jobs_production_entry_id_fkey;
alter table public.production_jobs add constraint production_jobs_production_entry_id_fkey
  foreign key (company_id, production_entry_id) references public.production_entries (company_id, id) on delete cascade;
alter table public.production_jobs drop constraint production_jobs_project_id_fkey;
alter table public.production_jobs add constraint production_jobs_project_id_fkey
  foreign key (company_id, project_id) references public.projects (company_id, id) on delete set null (project_id);
alter table public.project_cabinet_progress drop constraint project_cabinet_progress_cabinet_id_fkey;
alter table public.project_cabinet_progress add constraint project_cabinet_progress_cabinet_id_fkey
  foreign key (company_id, cabinet_id) references public.project_cabinets (company_id, id) on delete cascade;
alter table public.project_cabinet_progress drop constraint project_cabinet_progress_team_leader_personnel_id_fkey;
alter table public.project_cabinet_progress add constraint project_cabinet_progress_team_leader_personnel_id_fkey
  foreign key (company_id, team_leader_personnel_id) references public.personnel (company_id, id) on delete set null (team_leader_personnel_id);
alter table public.project_cabinets drop constraint project_cabinets_project_id_fkey;
alter table public.project_cabinets add constraint project_cabinets_project_id_fkey
  foreign key (company_id, project_id) references public.projects (company_id, id) on delete cascade;
alter table public.project_cancellation_history drop constraint project_cancellation_history_project_id_fkey;
alter table public.project_cancellation_history add constraint project_cancellation_history_project_id_fkey
  foreign key (company_id, project_id) references public.projects (company_id, id) on delete cascade;
alter table public.project_sheet_cables drop constraint project_sheet_cables_sheet_id_fkey;
alter table public.project_sheet_cables add constraint project_sheet_cables_sheet_id_fkey
  foreign key (company_id, sheet_id) references public.project_sheets (company_id, id) on delete cascade;
alter table public.project_sheet_progress drop constraint project_sheet_progress_cable_id_fkey;
alter table public.project_sheet_progress add constraint project_sheet_progress_cable_id_fkey
  foreign key (company_id, cable_id) references public.project_sheet_cables (company_id, id) on delete cascade;
alter table public.project_sheet_progress drop constraint project_sheet_progress_sheet_id_fkey;
alter table public.project_sheet_progress add constraint project_sheet_progress_sheet_id_fkey
  foreign key (company_id, sheet_id) references public.project_sheets (company_id, id) on delete cascade;
alter table public.project_sheet_progress drop constraint project_sheet_progress_team_leader_personnel_id_fkey;
alter table public.project_sheet_progress add constraint project_sheet_progress_team_leader_personnel_id_fkey
  foreign key (company_id, team_leader_personnel_id) references public.personnel (company_id, id) on delete set null (team_leader_personnel_id);
alter table public.project_sheets drop constraint project_sheets_completed_by_personnel_id_fkey;
alter table public.project_sheets add constraint project_sheets_completed_by_personnel_id_fkey
  foreign key (company_id, completed_by_personnel_id) references public.personnel (company_id, id) on delete set null (completed_by_personnel_id);
alter table public.project_sheets drop constraint project_sheets_current_team_leader_personnel_id_fkey;
alter table public.project_sheets add constraint project_sheets_current_team_leader_personnel_id_fkey
  foreign key (company_id, current_team_leader_personnel_id) references public.personnel (company_id, id) on delete set null (current_team_leader_personnel_id);
alter table public.project_sheets drop constraint project_sheets_project_id_fkey;
alter table public.project_sheets add constraint project_sheets_project_id_fkey
  foreign key (company_id, project_id) references public.projects (company_id, id) on delete cascade;
alter table public.projects drop constraint projects_completed_by_personnel_id_fkey;
alter table public.projects add constraint projects_completed_by_personnel_id_fkey
  foreign key (company_id, completed_by_personnel_id) references public.personnel (company_id, id) on delete set null (completed_by_personnel_id);
alter table public.projects drop constraint projects_current_team_leader_personnel_id_fkey;
alter table public.projects add constraint projects_current_team_leader_personnel_id_fkey
  foreign key (company_id, current_team_leader_personnel_id) references public.personnel (company_id, id) on delete set null (current_team_leader_personnel_id);
alter table public.vehicle_fuel_logs drop constraint vehicle_fuel_logs_vehicle_id_fkey;
alter table public.vehicle_fuel_logs add constraint vehicle_fuel_logs_vehicle_id_fkey
  foreign key (company_id, vehicle_id) references public.vehicles (company_id, id) on delete cascade;
alter table public.vehicles drop constraint vehicles_assigned_personnel_id_fkey;
alter table public.vehicles add constraint vehicles_assigned_personnel_id_fkey
  foreign key (company_id, assigned_personnel_id) references public.personnel (company_id, id) on delete set null (assigned_personnel_id);

-- 6. Şirket ayrımı (RLS) -------------------------------------------------------
-- Kısıtlayıcı (restrictive) politika mevcut politikalarla AND'lenir.

create policy "company_isolation" on public.vehicles
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.projects
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.inventory_materials
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.shared_notes
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.vehicle_fuel_logs
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.company_manager_permissions
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.app_settings
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.attendance_audit_logs
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.attendance_month_notes
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.attendance_records
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.daily_work_plan_absences
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.daily_work_plan_drafts
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.daily_work_plan_team_members
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.daily_work_plan_teams
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.daily_work_plans
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.inventory_catalog
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.inventory_custody_balances
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.inventory_custody_movements
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.inventory_movements
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.inventory_receipt_items
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.inventory_receipts
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.inventory_request_items
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.inventory_request_receipt_items
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.inventory_requests
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.inventory_shipment_items
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.inventory_shipments
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.personnel
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.personnel_advances
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.personnel_employment_periods
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.private_notes
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.production_entries
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.production_item_definitions
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.production_items
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.production_jobs
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.project_cabinet_progress
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.project_cabinets
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.project_cancellation_history
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.project_sheet_cables
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.project_sheet_progress
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.project_sheets
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "company_isolation" on public.profiles
  as restrictive for all to authenticated
  using (id = (select auth.uid()) or company_id = (select public.current_company_id()))
  with check (id = (select auth.uid()) or company_id = (select public.current_company_id()));

-- 7. Yazma koruması ------------------------------------------------------------
-- SECURITY DEFINER fonksiyonlar RLS'i atlar; bu tetikleyici kullanıcı
-- isteklerinde her yazmanın kullanıcının kendi şirketine yapılmasını sağlar.
create function public.enforce_company_scope()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company_id uuid;
begin
  if not public.is_tenant_request() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  v_company_id := public.current_company_id();

  if tg_op in ('UPDATE', 'DELETE')
    and (v_company_id is null or old.company_id is distinct from v_company_id) then
    raise exception 'Bu kayıt şirketinize ait değil' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.company_id is null then
    new.company_id := v_company_id;
  end if;

  if v_company_id is null or new.company_id is distinct from v_company_id then
    raise exception 'Kayıt yalnızca kendi şirketinize yazılabilir' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger a0_enforce_company_scope
before insert or update or delete on public.vehicles
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.projects
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.inventory_materials
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.shared_notes
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.vehicle_fuel_logs
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.company_manager_permissions
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.app_settings
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.attendance_audit_logs
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.attendance_month_notes
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.attendance_records
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.daily_work_plan_absences
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.daily_work_plan_drafts
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.daily_work_plan_team_members
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.daily_work_plan_teams
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.daily_work_plans
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.inventory_catalog
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.inventory_custody_balances
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.inventory_custody_movements
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.inventory_movements
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.inventory_receipt_items
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.inventory_receipts
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.inventory_request_items
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.inventory_request_receipt_items
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.inventory_requests
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.inventory_shipment_items
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.inventory_shipments
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.personnel
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.personnel_advances
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.personnel_employment_periods
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.private_notes
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.production_entries
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.production_item_definitions
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.production_items
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.production_jobs
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.project_cabinet_progress
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.project_cabinets
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.project_cancellation_history
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.project_sheet_cables
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.project_sheet_progress
for each row execute function public.enforce_company_scope();
create trigger a0_enforce_company_scope
before insert or update or delete on public.project_sheets
for each row execute function public.enforce_company_scope();

-- Profiller: kullanıcı şirketini kendisi değiştiremez. Şirket oluşturma/katılma
-- fonksiyonları mk_ops.allow_company_assignment ayarıyla bu adımı açar.
create function public.enforce_profile_company_scope()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company_id uuid;
begin
  if not public.is_tenant_request()
    or current_setting('mk_ops.allow_company_assignment', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Profil doğrudan oluşturulamaz' using errcode = '42501';
  end if;

  v_company_id := public.current_company_id();

  if old.id <> auth.uid()
    and (v_company_id is null or old.company_id is distinct from v_company_id) then
    raise exception 'Bu kullanıcı şirketinize ait değil' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.company_id is distinct from old.company_id or new.id <> old.id then
    raise exception 'Kullanıcının şirketi değiştirilemez' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger a0_enforce_company_scope
before insert or update or delete on public.profiles
for each row execute function public.enforce_profile_company_scope();

-- 8. Roller şirket bazında ------------------------------------------------------

-- Yeni kullanıcı şirketsiz ve onaysız başlar; şirket oluşturma/katılma
-- ayrı fonksiyonlarla yapılır.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  insert into public.profiles (id, full_name, email, role, is_approved)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      split_part(new.email, '@', 1)
    ),
    new.email,
    'pending',
    false
  );
  return new;
end;
$$;

-- Her şirketin tek bir ana şantiye şefi vardır: şirketi kuran kullanıcı.
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
    -- Şirket silinirken (cascade) şef profili de silinebilir.
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

comment on function public.protect_primary_site_chief() is
  'Şirketin ana şantiye şefinin silinmesini, rol/onay değişimini ve ikinci şef atanmasını engeller.';

CREATE OR REPLACE FUNCTION public.enforce_role_user_limits() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare
  v_role_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('mk-ops-role-assignment:' || coalesce(new.company_id::text, '')));

  if new.is_approved = true and new.role = 'company_manager' then
    select count(*)::integer
    into v_role_count
    from public.profiles
    where role = 'company_manager'
      and is_approved = true
      and company_id = new.company_id
      and id <> new.id;

    if v_role_count >= 3 then
      raise exception 'En fazla 3 şirket yöneticisi atanabilir';
    end if;
  end if;

  if new.is_approved = true and new.role = 'accounting' then
    select count(*)::integer
    into v_role_count
    from public.profiles
    where role = 'accounting'
      and is_approved = true
      and company_id = new.company_id
      and id <> new.id;

    if v_role_count >= 2 then
      raise exception 'En fazla 2 muhasebe kullanıcısı atanabilir';
    end if;
  end if;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.assign_user_role(p_user_id uuid, p_role text) RETURNS public.profiles
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare
  v_profile public.profiles;
  v_manager_count integer;
  v_accounting_count integer;
begin
  if not public.is_site_chief() then
    raise exception 'Bu işlem için şantiye şefi yetkisi gerekli'
      using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('mk-ops-role-assignment:' || public.current_company_id()::text));
  if p_user_id = auth.uid() then
    raise exception 'Şantiye şefi kendi yetkisini değiştiremez';
  end if;
  if p_role not in ('company_manager', 'accounting', 'pending') then
    raise exception 'Geçersiz kullanıcı rolü';
  end if;

  if p_role = 'company_manager' then
    select count(*)::integer into v_manager_count
    from public.profiles
    where role = 'company_manager'
      and is_approved = true
      and company_id = public.current_company_id()
      and id <> p_user_id;
    if v_manager_count >= 3 then
      raise exception 'En fazla 3 şirket yöneticisi atanabilir';
    end if;
  end if;

  if p_role = 'accounting' then
    select count(*)::integer into v_accounting_count
    from public.profiles
    where role = 'accounting'
      and is_approved = true
      and company_id = public.current_company_id()
      and id <> p_user_id;
    if v_accounting_count >= 2 then
      raise exception 'En fazla 2 muhasebe kullanıcısı atanabilir';
    end if;
  end if;

  update public.profiles
  set
    role = p_role,
    is_approved = p_role <> 'pending',
    approved_at = case when p_role <> 'pending' then now() else null end,
    approved_by = case when p_role <> 'pending' then auth.uid() else null end
  where id = p_user_id
    and company_id = public.current_company_id()
    and role <> 'site_chief'
  returning * into v_profile;
  if not found then
    raise exception 'Kullanıcı bulunamadı veya rolü değiştirilemez';
  end if;

  if p_role = 'company_manager' then
    insert into public.company_manager_permissions (user_id, updated_by)
    values (p_user_id, auth.uid())
    on conflict (user_id) do nothing;
  else
    delete from public.company_manager_permissions where user_id = p_user_id;
  end if;

  return v_profile;
end;
$$;

-- 9. Fonksiyonlarda şirket filtresi ---------------------------------------------

CREATE OR REPLACE FUNCTION public.get_shared_notes() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare
  v_notes jsonb;
begin
  delete from public.shared_notes
  where note_date < current_date
    and company_id = public.current_company_id();

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', n.id,
      'title', n.title,
      'note_date', n.note_date,
      'created_by', n.created_by,
      'created_at', n.created_at
    )
    order by n.note_date asc, n.created_at desc
  ), '[]'::jsonb)
  into v_notes
  from public.shared_notes n
  where n.company_id = public.current_company_id()
    and public.current_user_role() <> 'pending';

  return v_notes;
end;
$$;

CREATE OR REPLACE FUNCTION public.ensure_sunday_attendance_for_month(p_year integer, p_month integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
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
    where extract(isodow from generated_date)=7
  ) d
  where (auth.uid() is null or p.company_id = public.current_company_id())
    and coalesce(p.employment_start_date,(p.created_at at time zone 'Europe/Istanbul')::date)<=d.attendance_date
    and (p.employment_end_date is null or p.employment_end_date>=d.attendance_date)
  on conflict(personnel_id,attendance_date) do nothing;
  get diagnostics v_inserted=row_count;
  return v_inserted;
end;
$$;

CREATE OR REPLACE FUNCTION public.log_attendance_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
begin
  if tg_op = 'INSERT' then
    if new.is_auto_generated then
      return new;
    end if;
    insert into public.attendance_audit_logs (
      company_id, attendance_record_id, personnel_id, attendance_date, action,
      new_status, new_leave_type, changed_by
    ) values (
      new.company_id, new.id, new.personnel_id, new.attendance_date, 'insert',
      new.status, new.leave_type, auth.uid()
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status is not distinct from new.status
      and old.leave_type is not distinct from new.leave_type then
      return new;
    end if;
    insert into public.attendance_audit_logs (
      company_id, attendance_record_id, personnel_id, attendance_date, action,
      old_status, new_status, old_leave_type, new_leave_type, changed_by
    ) values (
      new.company_id, new.id, new.personnel_id, new.attendance_date, 'update',
      old.status, new.status, old.leave_type, new.leave_type, auth.uid()
    );
    return new;
  end if;

  -- Şirket silinirken (cascade) denetim kaydı tutulmaz.
  if not exists (select 1 from public.companies where id = old.company_id) then
    return old;
  end if;

  insert into public.attendance_audit_logs (
    company_id, attendance_record_id, personnel_id, attendance_date, action,
    old_status, old_leave_type, changed_by
  ) values (
    old.company_id, old.id, old.personnel_id, old.attendance_date, 'delete',
    old.status, old.leave_type, auth.uid()
  );
  return old;
end;
$$;

CREATE OR REPLACE FUNCTION public.delete_inventory_catalog_with_history(p_catalog_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_material record;
begin
 if not public.has_module_write_permission('inventory') then raise exception 'Malzeme silme yetkisi gerekli' using errcode='42501'; end if;
 if not exists(select 1 from public.inventory_catalog where id=p_catalog_id) then raise exception 'Katalog malzemesi bulunamadı'; end if;
 for v_material in select id from public.inventory_materials where catalog_id=p_catalog_id loop
  delete from public.inventory_movements where material_id=v_material.id;
  delete from public.inventory_shipment_items where material_id=v_material.id;
  delete from public.inventory_receipt_items where material_id=v_material.id;
 end loop;
 delete from public.inventory_shipments s where s.company_id=public.current_company_id() and not exists(select 1 from public.inventory_shipment_items i where i.shipment_id=s.id);
 delete from public.inventory_receipts r where r.company_id=public.current_company_id() and not exists(select 1 from public.inventory_receipt_items i where i.receipt_id=r.id);
 delete from public.inventory_catalog where id=p_catalog_id;
end $$;

CREATE OR REPLACE FUNCTION public.delete_inventory_material_with_history(p_material_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
begin
 if not public.has_module_write_permission('inventory') then raise exception 'Malzeme silme yetkisi gerekli' using errcode='42501'; end if;
 if not exists(select 1 from public.inventory_materials where id=p_material_id and material_category='stock') then raise exception 'Malzeme bulunamadı'; end if;
 delete from public.inventory_movements where material_id=p_material_id;
 delete from public.inventory_shipment_items where material_id=p_material_id;
 delete from public.inventory_receipt_items where material_id=p_material_id;
 delete from public.inventory_shipments s where s.company_id=public.current_company_id() and not exists(select 1 from public.inventory_shipment_items i where i.shipment_id=s.id);
 delete from public.inventory_receipts r where r.company_id=public.current_company_id() and not exists(select 1 from public.inventory_receipt_items i where i.receipt_id=r.id);
 delete from public.inventory_materials where id=p_material_id;
end $$;

CREATE OR REPLACE FUNCTION public.approve_inventory_request_receipt(p_request_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_request public.inventory_requests; v_item record; v_catalog public.inventory_catalog; v_receipt_id uuid; v_material public.inventory_materials; v_code text;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Stok kabul onay yetkisi gerekli' using errcode='42501'; end if;
  select * into v_request from public.inventory_requests where company_id=public.current_company_id() and id=p_request_id for update;
  if not found or v_request.status<>'receipt_review' then raise exception 'Yalnızca stok onayı bekleyen irsaliye onaylanabilir'; end if;
  insert into public.inventory_receipts(receipt_date,received_by,dispatch_number,notes,created_by)
  values(v_request.pending_receipt_date,v_request.pending_received_by,v_request.pending_dispatch_number,v_request.pending_receipt_notes,auth.uid()) returning id into v_receipt_id;
  for v_item in select * from public.inventory_request_receipt_items where company_id=public.current_company_id() and request_id=p_request_id loop
    select * into v_catalog from public.inventory_catalog where company_id=public.current_company_id() and id=v_item.catalog_id;
    v_code:=v_item.material_code;
    select * into v_material from public.inventory_materials where company_id=public.current_company_id() and catalog_id=v_catalog.id and unit=v_catalog.unit and coalesce(material_code,'')=coalesce(v_code,'') for update;
    if not found then
      insert into public.inventory_materials(catalog_id,material_code,material_name,stock_category,material_type,size,unit,stock_quantity,biga_stock_quantity,notes,created_by,updated_by)
      values(v_catalog.id,v_code,v_catalog.material_name,v_catalog.stock_category,v_catalog.material_type,v_catalog.size,v_catalog.unit,0,0,v_catalog.notes,auth.uid(),auth.uid()) returning * into v_material;
    end if;
    update public.inventory_materials set stock_quantity=stock_quantity+v_item.quantity,updated_by=auth.uid() where id=v_material.id returning * into v_material;
    insert into public.inventory_receipt_items(receipt_id,material_id,quantity) values(v_receipt_id,v_material.id,v_item.quantity);
    insert into public.inventory_movements(material_id,movement_type,quantity,description,balance_after,created_by,action_type,target_location,receipt_date,received_by,dispatch_number,receipt_id)
    values(v_material.id,'in',v_item.quantity,'Malzeme talebinden irsaliye ile stok girişi',v_material.stock_quantity,auth.uid(),'in','center',v_request.pending_receipt_date,v_request.pending_received_by,v_request.pending_dispatch_number,v_receipt_id);
  end loop;
  update public.inventory_requests set status='received',received_at=now(),receipt_id=v_receipt_id where id=p_request_id;
  return v_receipt_id;
end $$;

CREATE OR REPLACE FUNCTION public.assign_vehicle_personnel(p_vehicle_id uuid, p_personnel_id uuid DEFAULT NULL::uuid) RETURNS public.vehicles
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_vehicle public.vehicles;
begin
  if not public.has_module_write_permission('vehicles') then
    raise exception 'Araç işlem yetkisi gerekli' using errcode = '42501';
  end if;
  if p_personnel_id is not null and not exists (
    select 1 from public.personnel where company_id=public.current_company_id() and id = p_personnel_id and is_active = true
  ) then raise exception 'Aktif personel bulunamadı'; end if;
  update public.vehicles set assigned_personnel_id = p_personnel_id,
    updated_by = auth.uid() where id = p_vehicle_id returning * into v_vehicle;
  if not found then raise exception 'Araç bulunamadı'; end if;
  return v_vehicle;
exception when unique_violation then
  raise exception 'Bu personelin üzerinde zaten başka bir araç var';
end;
$$;

CREATE OR REPLACE FUNCTION public.cancel_project(p_project_id uuid, p_reason text) RETURNS public.projects
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_project public.projects;
begin
  if not public.has_module_write_permission('projects') then raise exception 'Proje iptal yetkiniz yok' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 3 then raise exception 'İptal sebebi en az 3 karakter olmalıdır'; end if;
  select * into v_project from public.projects where company_id=public.current_company_id() and id=p_project_id for update;
  if not found then raise exception 'Proje bulunamadı'; end if;
  if v_project.is_cancelled then raise exception 'Proje zaten iptal edilmiş'; end if;
  if v_project.is_archived or v_project.status='completed' then raise exception 'Biten veya arşivlenmiş proje iptal edilemez'; end if;
  if v_project.status not in ('waiting','in_progress') then raise exception 'Yalnızca Başlamadı veya Devam Ediyor durumundaki proje iptal edilebilir'; end if;

  insert into public.project_cancellation_history(project_id,reason,cancelled_by)
  values(p_project_id,trim(p_reason),auth.uid());
  update public.projects set is_cancelled=true,cancellation_reason=trim(p_reason),cancelled_at=now(),cancelled_by=auth.uid(),is_archived=false,archived_at=null,updated_by=auth.uid()
  where id=p_project_id returning * into v_project;
  return v_project;
end $$;

CREATE OR REPLACE FUNCTION public.create_biga_inventory_shipment(p_shipment_date date, p_delivered_by text, p_received_by text, p_vehicle_plate text, p_notes text, p_items jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_shipment_id uuid; v_item jsonb; v_material public.inventory_materials; v_material_id uuid; v_quantity numeric;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode='42501'; end if;
  if p_shipment_date is null then raise exception 'Sevkiyat tarihi zorunlu'; end if;
  if char_length(trim(coalesce(p_delivered_by,'')))<2 then raise exception 'Teslim eden zorunlu'; end if;
  if char_length(trim(coalesce(p_received_by,'')))<2 then raise exception 'Teslim alan zorunlu'; end if;
  if char_length(trim(coalesce(p_vehicle_plate,'')))<2 then raise exception 'Araç bilgisi zorunlu'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'En az bir malzeme eklenmelidir'; end if;
  if (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct value->>'material_id') from jsonb_array_elements(p_items)) then raise exception 'Aynı malzeme sevkiyat listesine iki kez eklenemez'; end if;
  insert into public.inventory_shipments(shipment_date,delivered_by,received_by,vehicle_id,vehicle_plate,notes,created_by)
  values(p_shipment_date,trim(p_delivered_by),trim(p_received_by),null,upper(trim(p_vehicle_plate)),nullif(trim(p_notes),''),auth.uid()) returning id into v_shipment_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_material_id := (v_item->>'material_id')::uuid; v_quantity := (v_item->>'quantity')::numeric;
    if v_quantity is null or v_quantity<=0 then raise exception 'Sevk miktarı sıfırdan büyük olmalıdır'; end if;
    select * into v_material from public.inventory_materials where company_id=public.current_company_id() and id=v_material_id and material_category='stock' for update;
    if not found then raise exception 'Sevk edilecek malzeme bulunamadı'; end if;
    if v_material.unit='piece' and v_quantity<>trunc(v_quantity) then raise exception '% için adet miktarı tam sayı olmalıdır',v_material.material_name; end if;
    if v_material.stock_quantity<v_quantity then raise exception '% için Merkez Şantiye stoku yetersiz. Mevcut: %',v_material.material_name,v_material.stock_quantity; end if;
    update public.inventory_materials set stock_quantity=stock_quantity-v_quantity,biga_stock_quantity=biga_stock_quantity+v_quantity,updated_by=auth.uid() where id=v_material_id returning * into v_material;
    insert into public.inventory_shipment_items(shipment_id,material_id,quantity) values(v_shipment_id,v_material_id,v_quantity);
    insert into public.inventory_movements(material_id,movement_type,quantity,usage_location,description,balance_after,created_by,action_type,source_location,target_location,shipment_id)
    values(v_material_id,'out',v_quantity,'AZG BİGA ŞUBE',nullif(trim(p_notes),''),v_material.stock_quantity,auth.uid(),'transfer','center','biga',v_shipment_id);
  end loop;
  return v_shipment_id;
end;
$$;

CREATE OR REPLACE FUNCTION public.create_custody_material(p_material_name text, p_material_code text, p_unit public.inventory_unit, p_initial_quantity numeric, p_vehicle_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_id uuid; v_plate text;
begin
  if not public.has_module_write_permission('custody') then
    raise exception 'Araç ekipmanı işlem yetkisi gerekli' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_material_name,''))) < 2 then raise exception 'Malzeme adı zorunlu'; end if;
  if p_initial_quantity is null or p_initial_quantity <= 0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
  if p_unit = 'piece' and p_initial_quantity <> trunc(p_initial_quantity) then raise exception 'Adet tam sayı olmalıdır'; end if;
  insert into public.inventory_materials
    (material_code, material_name, unit, stock_quantity, notes, material_category, created_by, updated_by)
  values (nullif(trim(p_material_code),''), trim(p_material_name), p_unit,
    case when p_vehicle_id is null then p_initial_quantity else 0 end,
    nullif(trim(p_notes),''), 'equipment', auth.uid(), auth.uid()) returning id into v_id;
  insert into public.inventory_movements
    (material_id, movement_type, quantity, description, balance_after, created_by)
  values (v_id, 'in', p_initial_quantity, 'İlk araç ekipmanı girişi',
    case when p_vehicle_id is null then p_initial_quantity else 0 end, auth.uid());
  if p_vehicle_id is not null then
    select plate into v_plate from public.vehicles where company_id=public.current_company_id() and id = p_vehicle_id;
    if v_plate is null then raise exception 'Araç bulunamadı'; end if;
    insert into public.inventory_custody_balances
      (material_id, holder_type, holder_id, holder_name, quantity, updated_by)
    values (v_id, 'vehicle', p_vehicle_id, v_plate, p_initial_quantity, auth.uid());
    insert into public.inventory_custody_movements
      (material_id, from_type, from_id, from_name, to_type, to_id, to_name, quantity, notes, created_by)
    values (v_id, 'warehouse', null, 'Yeni Malzeme Girişi', 'vehicle', p_vehicle_id,
      v_plate, p_initial_quantity, 'İlk girişte araca zimmetlendi', auth.uid());
  end if;
  return v_id;
end;
$$;

CREATE OR REPLACE FUNCTION public.create_inventory_receipt(p_receipt_date date, p_received_by text, p_dispatch_number text, p_notes text, p_items jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_id uuid; v_item jsonb; v_catalog public.inventory_catalog; v_material public.inventory_materials; v_mid uuid; v_qty numeric; v_code text;
begin
 if not public.has_module_write_permission('inventory') then raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode='42501'; end if;
 if p_receipt_date is null or char_length(trim(coalesce(p_received_by,'')))<2 or char_length(trim(coalesce(p_dispatch_number,'')))<1 then raise exception 'Tarih, teslim alan ve irsaliye numarası zorunlu'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'En az bir malzeme eklenmelidir'; end if;
 insert into public.inventory_receipts(receipt_date,received_by,dispatch_number,notes,created_by) values(p_receipt_date,trim(p_received_by),trim(p_dispatch_number),nullif(trim(p_notes),''),auth.uid()) returning id into v_id;
 for v_item in select value from jsonb_array_elements(p_items) loop
  select * into v_catalog from public.inventory_catalog where company_id=public.current_company_id() and id=(v_item->>'catalog_id')::uuid;
  if not found then raise exception 'Katalog malzemesi bulunamadı'; end if;
  v_qty:=(v_item->>'quantity')::numeric; v_code:=nullif(trim(v_item->>'material_code'),'');
  if v_qty is null or v_qty<=0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
  if v_catalog.unit='piece' and v_qty<>trunc(v_qty) then raise exception 'Adet miktarı tam sayı olmalıdır'; end if;
  if v_catalog.has_id and v_code is null then raise exception '% için malzeme ID zorunlu',v_catalog.material_name; end if;
  if not v_catalog.has_id then v_code:=null; end if;
  if v_code is not null and exists(select 1 from public.inventory_materials where company_id=public.current_company_id() and lower(trim(material_code))=lower(v_code)) then
   raise exception 'Bu malzeme ID daha önce kullanılmış: %',v_code;
  end if;
  select * into v_material from public.inventory_materials where company_id=public.current_company_id() and catalog_id=v_catalog.id and unit=v_catalog.unit and coalesce(material_code,'')=coalesce(v_code,'') for update;
  if not found then
   insert into public.inventory_materials(catalog_id,material_code,material_name,stock_category,material_type,size,unit,stock_quantity,biga_stock_quantity,notes,created_by,updated_by)
   values(v_catalog.id,v_code,v_catalog.material_name,v_catalog.stock_category,v_catalog.material_type,v_catalog.size,v_catalog.unit,0,0,v_catalog.notes,auth.uid(),auth.uid()) returning * into v_material;
  end if;
  update public.inventory_materials set stock_quantity=stock_quantity+v_qty,updated_by=auth.uid() where id=v_material.id returning * into v_material;
  insert into public.inventory_receipt_items(receipt_id,material_id,quantity) values(v_id,v_material.id,v_qty);
  insert into public.inventory_movements(material_id,movement_type,quantity,description,balance_after,created_by,action_type,target_location,receipt_date,received_by,dispatch_number,receipt_id)
  values(v_material.id,'in',v_qty,'İrsaliye ile stok girişi',v_material.stock_quantity,auth.uid(),'in','center',p_receipt_date,trim(p_received_by),trim(p_dispatch_number),v_id);
 end loop; return v_id;
end $$;

CREATE OR REPLACE FUNCTION public.create_inventory_request(p_request_date date, p_requested_by text, p_notes text, p_items jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_request_id uuid; v_item jsonb; v_new jsonb; v_catalog_id uuid; v_qty numeric; v_unit public.inventory_unit;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Malzeme talep yetkisi gerekli' using errcode='42501'; end if;
  if p_request_date is null or char_length(trim(coalesce(p_requested_by,''))) < 2 then raise exception 'Talep tarihi ve talep eden zorunlu'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'En az bir talep kalemi eklenmelidir'; end if;
  insert into public.inventory_requests(request_date,requested_by,notes,created_by)
  values(p_request_date,trim(p_requested_by),nullif(trim(p_notes),''),auth.uid()) returning id into v_request_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
    if nullif(v_item->>'catalog_id','') is not null then
      v_catalog_id := (v_item->>'catalog_id')::uuid;
      select unit into v_unit from public.inventory_catalog where company_id=public.current_company_id() and id=v_catalog_id;
      if not found then raise exception 'Katalog malzemesi bulunamadı'; end if;
    else
      v_new := v_item->'new_catalog';
      if v_new is null or char_length(trim(coalesce(v_new->>'material_name',''))) < 2 then raise exception 'Yeni malzeme adı zorunlu'; end if;
      if v_new->>'stock_category' not in ('fiber_cable','copper_network','underground','fiber_accessory') then raise exception 'Yeni malzeme kategorisi zorunlu'; end if;
      v_unit := (v_new->>'unit')::public.inventory_unit;
      insert into public.inventory_catalog(material_name,stock_category,material_type,size,unit,has_id,notes,created_by)
      values(trim(v_new->>'material_name'),v_new->>'stock_category',nullif(trim(v_new->>'material_type'),''),nullif(trim(v_new->>'size'),''),v_unit,coalesce((v_new->>'has_id')::boolean,false),nullif(trim(v_new->>'notes'),''),auth.uid())
      returning id into v_catalog_id;
    end if;
    if v_unit='piece' and v_qty<>trunc(v_qty) then raise exception 'Adet miktarı tam sayı olmalıdır'; end if;
    insert into public.inventory_request_items(request_id,catalog_id,quantity) values(v_request_id,v_catalog_id,v_qty);
  end loop;
  return v_request_id;
end $$;

CREATE OR REPLACE FUNCTION public.delete_biga_inventory_shipment(p_shipment_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_item record; v_material public.inventory_materials;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Sevkiyat silme yetkisi gerekli' using errcode='42501'; end if;
  if not exists(select 1 from public.inventory_shipments where company_id=public.current_company_id() and id=p_shipment_id) then raise exception 'Sevkiyat bulunamadı'; end if;
  for v_item in select * from public.inventory_shipment_items where company_id=public.current_company_id() and shipment_id=p_shipment_id loop
    select * into v_material from public.inventory_materials where company_id=public.current_company_id() and id=v_item.material_id for update;
    if v_material.biga_stock_quantity<v_item.quantity then raise exception '% sevkiyatı silinemez; Biga stokunun bir kısmı kullanılmış',v_material.material_name; end if;
    update public.inventory_materials set stock_quantity=stock_quantity+v_item.quantity,biga_stock_quantity=biga_stock_quantity-v_item.quantity,updated_by=auth.uid() where id=v_item.material_id;
  end loop;
  delete from public.inventory_shipments where company_id=public.current_company_id() and id=p_shipment_id;
end;
$$;

CREATE OR REPLACE FUNCTION public.delete_inactive_personnel_without_earned_days(p_personnel_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare
  v_is_active boolean;
begin
  if auth.uid() is null
    or not public.has_module_write_permission('personnel') then
    raise exception 'Personel silme yetkiniz yok' using errcode = '42501';
  end if;

  select is_active into v_is_active
  from public.personnel
  where company_id=public.current_company_id() and id = p_personnel_id;

  if not found then
    raise exception 'Personel bulunamadı';
  end if;
  if v_is_active then
    raise exception 'Aktif personel silinemez';
  end if;
  if exists (
    select 1
    from public.attendance_records
    where company_id=public.current_company_id() and personnel_id = p_personnel_id
      and status::text in ('worked', 'weekly_rest')
  ) then
    raise exception 'Hak edilmiş günü bulunan personel silinemez';
  end if;

  delete from public.personnel_advances where company_id=public.current_company_id() and personnel_id = p_personnel_id;
  delete from public.personnel where company_id=public.current_company_id() and id = p_personnel_id;
  return true;
end;
$$;

CREATE OR REPLACE FUNCTION public.delete_inventory_movement(p_movement_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_move public.inventory_movements; v_material public.inventory_materials;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Stok hareketi silme yetkisi gerekli' using errcode='42501'; end if;
  select * into v_move from public.inventory_movements where company_id=public.current_company_id() and id=p_movement_id for update;
  if not found then raise exception 'Stok hareketi bulunamadı'; end if;
  if v_move.shipment_id is not null then raise exception 'Bu hareket sevkiyat kaydına bağlıdır; sevkiyat listesinden silinmelidir'; end if;
  select * into v_material from public.inventory_materials where company_id=public.current_company_id() and id=v_move.material_id for update;
  if v_move.action_type='transfer' then
    if v_material.biga_stock_quantity<v_move.quantity then raise exception 'Bu sevkiyat silinemez; Biga stokunun bir kısmı kullanılmış'; end if;
    update public.inventory_materials set stock_quantity=stock_quantity+v_move.quantity,biga_stock_quantity=biga_stock_quantity-v_move.quantity,updated_by=auth.uid() where id=v_move.material_id;
  elsif v_move.action_type='usage' then
    if coalesce(v_move.source_location,'center')='biga' then update public.inventory_materials set biga_stock_quantity=biga_stock_quantity+v_move.quantity,updated_by=auth.uid() where id=v_move.material_id;
    else update public.inventory_materials set stock_quantity=stock_quantity+v_move.quantity,updated_by=auth.uid() where id=v_move.material_id; end if;
  else
    if coalesce(v_move.target_location,'center')='biga' then
      if v_material.biga_stock_quantity<v_move.quantity then raise exception 'Bu giriş silinemez; stokun bir kısmı kullanılmış'; end if;
      update public.inventory_materials set biga_stock_quantity=biga_stock_quantity-v_move.quantity,updated_by=auth.uid() where id=v_move.material_id;
    else
      if v_material.stock_quantity<v_move.quantity then raise exception 'Bu giriş silinemez; stokun bir kısmı kullanılmış veya sevk edilmiş'; end if;
      update public.inventory_materials set stock_quantity=stock_quantity-v_move.quantity,updated_by=auth.uid() where id=v_move.material_id;
    end if;
  end if;
  delete from public.inventory_movements where company_id=public.current_company_id() and id=p_movement_id;
end;
$$;

CREATE OR REPLACE FUNCTION public.delete_production_entry(p_entry_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$ begin
  if not public.has_module_write_permission('productions') then raise exception 'İmalat silme yetkisi gerekli' using errcode='42501'; end if;
  delete from public.production_entries where company_id=public.current_company_id() and id=p_entry_id;
end; $$;

CREATE OR REPLACE FUNCTION public.reactivate_cancelled_project(p_project_id uuid) RETURNS public.projects
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_project public.projects;
begin
  if not public.has_module_write_permission('projects') then raise exception 'Proje aktifleştirme yetkiniz yok' using errcode='42501'; end if;
  select * into v_project from public.projects where company_id=public.current_company_id() and id=p_project_id for update;
  if not found then raise exception 'Proje bulunamadı'; end if;
  if v_project.is_archived or v_project.status='completed' then raise exception 'Biten veya arşivlenmiş proje yeniden aktif edilemez'; end if;
  if not v_project.is_cancelled then raise exception 'Yalnızca iptal edilmiş proje yeniden aktif edilebilir'; end if;

  update public.project_cancellation_history set reactivated_at=now(),reactivated_by=auth.uid()
  where id=(select id from public.project_cancellation_history where company_id=public.current_company_id() and project_id=p_project_id and reactivated_at is null order by cancelled_at desc limit 1);
  update public.projects set is_cancelled=false,cancellation_reason=null,cancelled_at=null,cancelled_by=null,updated_by=auth.uid()
  where id=p_project_id returning * into v_project;
  return v_project;
end $$;

CREATE OR REPLACE FUNCTION public.record_inventory_movement(p_material_id uuid, p_movement_type public.inventory_movement_type, p_quantity numeric, p_source_location text DEFAULT 'center'::text, p_project_name text DEFAULT NULL::text, p_project_code text DEFAULT NULL::text, p_team_personnel_ids uuid[] DEFAULT '{}'::uuid[], p_description text DEFAULT NULL::text) RETURNS public.inventory_materials
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare
  v_material public.inventory_materials;
  v_balance numeric(14,3);
  v_names text[];
begin
  if not public.has_module_write_permission('inventory') then
    raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
  if p_source_location not in ('center', 'biga') then raise exception 'Geçersiz stok konumu'; end if;
  if p_movement_type = 'out' and char_length(trim(coalesce(p_project_name, ''))) < 2 then
    raise exception 'Proje adı zorunlu';
  end if;

  select * into v_material from public.inventory_materials where company_id=public.current_company_id() and id = p_material_id for update;
  if not found then raise exception 'Malzeme bulunamadı'; end if;
  if v_material.unit = 'piece' and p_quantity <> trunc(p_quantity) then raise exception 'Adet miktarı tam sayı olmalıdır'; end if;

  if p_movement_type = 'in' then
    update public.inventory_materials set stock_quantity = stock_quantity + p_quantity, updated_by = auth.uid()
    where id = p_material_id returning * into v_material;
    v_balance := v_material.stock_quantity;
  elsif p_source_location = 'center' then
    if v_material.stock_quantity < p_quantity then raise exception 'Merkez Şantiye stoku yetersiz. Mevcut: %', v_material.stock_quantity; end if;
    update public.inventory_materials set stock_quantity = stock_quantity - p_quantity, updated_by = auth.uid()
    where id = p_material_id returning * into v_material;
    v_balance := v_material.stock_quantity;
  else
    if v_material.biga_stock_quantity < p_quantity then raise exception 'AZG BİGA ŞUBE stoku yetersiz. Mevcut: %', v_material.biga_stock_quantity; end if;
    update public.inventory_materials set biga_stock_quantity = biga_stock_quantity - p_quantity, updated_by = auth.uid()
    where id = p_material_id returning * into v_material;
    v_balance := v_material.biga_stock_quantity;
  end if;

  select coalesce(array_agg(full_name order by full_name), '{}') into v_names
  from public.personnel where company_id=public.current_company_id() and id = any(coalesce(p_team_personnel_ids, '{}'));

  insert into public.inventory_movements
    (material_id, movement_type, quantity, usage_location, description, balance_after, created_by,
     action_type, source_location, target_location, project_name, project_code, team_personnel_ids, team_personnel_names)
  values
    (p_material_id, p_movement_type, p_quantity,
     case when p_movement_type = 'out' then trim(p_project_name) else null end,
     nullif(trim(p_description), ''), v_balance, auth.uid(),
     case when p_movement_type = 'in' then 'in' else 'usage' end,
     case when p_movement_type = 'out' then p_source_location else null end,
     case when p_movement_type = 'in' then 'center' else null end,
     case when p_movement_type = 'out' then trim(p_project_name) else null end,
     case when p_movement_type = 'out' then nullif(trim(p_project_code), '') else null end,
     coalesce(p_team_personnel_ids, '{}'), v_names);
  return v_material;
end;
$$;

CREATE OR REPLACE FUNCTION public.record_vehicle_fuel_purchase(p_vehicle_id uuid, p_fuel_date date, p_odometer_km bigint, p_liters numeric, p_notes text DEFAULT NULL::text) RETURNS public.vehicle_fuel_logs
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare
  v_vehicle public.vehicles;
  v_latest_km bigint;
  v_log public.vehicle_fuel_logs;
begin
  if not public.has_module_write_permission('vehicles') then
    raise exception 'Araç işlem yetkisi gerekli' using errcode = '42501';
  end if;
  if p_fuel_date is null or p_fuel_date > current_date then
    raise exception 'Yakıt tarihi geçersiz';
  end if;
  if p_liters is null or p_liters <= 0 then raise exception 'Litre sıfırdan büyük olmalıdır'; end if;

  select * into v_vehicle from public.vehicles where company_id=public.current_company_id() and id = p_vehicle_id for update;
  if not found then raise exception 'Araç bulunamadı'; end if;
  select max(odometer_km) into v_latest_km from public.vehicle_fuel_logs where company_id=public.current_company_id() and vehicle_id = p_vehicle_id;
  v_latest_km := greatest(v_vehicle.current_km, coalesce(v_latest_km, 0));
  if p_odometer_km < v_latest_km then
    raise exception 'Yeni kilometre mevcut kilometreden düşük olamaz. Mevcut: % km', v_latest_km;
  end if;

  insert into public.vehicle_fuel_logs(vehicle_id, fuel_date, odometer_km, liters, notes, created_by)
  values (p_vehicle_id, p_fuel_date, p_odometer_km, p_liters, nullif(trim(p_notes),''), auth.uid())
  returning * into v_log;
  update public.vehicles set current_km = greatest(current_km, p_odometer_km), updated_by = auth.uid()
  where id = p_vehicle_id;
  return v_log;
end;
$$;

CREATE OR REPLACE FUNCTION public.save_production_entry(p_entry_id uuid, p_work_date date, p_team_leader_personnel_id uuid, p_team_leader_name text, p_source_work_plan_id uuid, p_jobs jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare
  v_entry_id uuid;
  v_job jsonb;
  v_item jsonb;
  v_job_id uuid;
  v_item_name text;
  v_unit text;
begin
  if not public.has_module_write_permission('productions') then
    raise exception 'İmalat yazma yetkisi gerekli' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.personnel
    where company_id=public.current_company_id() and id = p_team_leader_personnel_id and is_active = true
  ) then
    raise exception 'Aktif ekip personeli bulunamadı';
  end if;
  if jsonb_array_length(coalesce(p_jobs, '[]'::jsonb)) = 0 then
    raise exception 'En az bir proje gerekli';
  end if;

  if p_entry_id is not null and exists (select 1 from public.production_entries where company_id=public.current_company_id() and id = p_entry_id) then
    update public.production_entries set
      work_date = p_work_date,
      team_leader_personnel_id = p_team_leader_personnel_id,
      team_leader_name_snapshot = trim(p_team_leader_name),
      source_work_plan_id = null,
      updated_by = auth.uid()
    where id = p_entry_id
    returning id into v_entry_id;
  else
    insert into public.production_entries(
      work_date, team_leader_personnel_id, team_leader_name_snapshot,
      source_work_plan_id, created_by, updated_by
    ) values (
      p_work_date, p_team_leader_personnel_id, trim(p_team_leader_name),
      null, auth.uid(), auth.uid()
    )
    on conflict(work_date, team_leader_personnel_id) do update set
      team_leader_name_snapshot = excluded.team_leader_name_snapshot,
      source_work_plan_id = null,
      updated_by = auth.uid()
    returning id into v_entry_id;
  end if;

  delete from public.production_jobs where company_id=public.current_company_id() and production_entry_id = v_entry_id;
  for v_job in select * from jsonb_array_elements(p_jobs) loop
    if char_length(trim(coalesce(v_job->>'project_name', ''))) < 2 then
      raise exception 'Proje adı zorunlu';
    end if;
    insert into public.production_jobs(
      production_entry_id, project_id, project_name_snapshot,
      project_code_snapshot, source, sort_order
    ) values (
      v_entry_id, null, trim(v_job->>'project_name'),
      nullif(trim(v_job->>'project_code'), ''), 'manual',
      coalesce((v_job->>'sort_order')::int, 0)
    ) returning id into v_job_id;

    if jsonb_array_length(coalesce(v_job->'items', '[]'::jsonb)) = 0 then
      raise exception 'Her projede en az bir imalat gerekli';
    end if;
    for v_item in select * from jsonb_array_elements(coalesce(v_job->'items', '[]'::jsonb)) loop
      v_item_name := trim(coalesce(v_item->>'item_name', ''));
      v_unit := upper(trim(coalesce(v_item->>'unit', '')));
      if char_length(v_item_name) < 2 or char_length(v_unit) < 1 then
        raise exception 'İmalat adı ve birim zorunlu';
      end if;
      insert into public.production_items(
        production_job_id, production_item_definition_id, item_name_snapshot,
        quantity, unit_snapshot, sort_order
      ) values (
        v_job_id, null, v_item_name, (v_item->>'quantity')::numeric,
        v_unit, coalesce((v_item->>'sort_order')::int, 0)
      );
    end loop;
  end loop;
  return v_entry_id;
end;
$$;

CREATE OR REPLACE FUNCTION public.set_company_manager_permission(p_user_id uuid, p_module text, p_enabled boolean) RETURNS public.company_manager_permissions
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_permissions public.company_manager_permissions; v_role text;
begin
  if not public.is_site_chief() then raise exception 'Bu işlem için şantiye şefi yetkisi gerekli' using errcode='42501'; end if;
  select role into v_role from public.profiles where company_id=public.current_company_id() and id=p_user_id and is_approved=true;
  if v_role not in ('company_manager','accounting') then raise exception 'Kullanıcı yetkilendirilebilir bir rolde değil'; end if;
  if p_module not in ('projects','work_plans','personnel','attendance','vehicles','inventory','custody','productions') then raise exception 'Geçersiz yetki alanı'; end if;
  insert into public.company_manager_permissions(user_id,updated_by) values(p_user_id,auth.uid()) on conflict(user_id) do nothing;
  update public.company_manager_permissions set
    projects_write=case when p_module='projects' then p_enabled else projects_write end,
    work_plans_write=case when p_module='work_plans' then p_enabled else work_plans_write end,
    personnel_write=case when p_module='personnel' then p_enabled else personnel_write end,
    attendance_write=case when p_module='attendance' then p_enabled else attendance_write end,
    vehicles_write=case when p_module='vehicles' then p_enabled else vehicles_write end,
    inventory_write=case when p_module='inventory' then p_enabled else inventory_write end,
    custody_write=case when p_module='custody' then p_enabled else custody_write end,
    productions_write=case when p_module='productions' then p_enabled else productions_write end,
    updated_by=auth.uid()
  where user_id=p_user_id returning * into v_permissions;
  return v_permissions;
end; $$;

CREATE OR REPLACE FUNCTION public.submit_inventory_request_receipt(p_request_id uuid, p_receipt_date date, p_received_by text, p_dispatch_number text, p_notes text DEFAULT NULL::text, p_items jsonb DEFAULT '[]'::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_request public.inventory_requests; v_item jsonb; v_catalog public.inventory_catalog; v_qty numeric; v_code text;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Stok kabul yetkisi gerekli' using errcode='42501'; end if;
  if p_receipt_date is null or char_length(trim(coalesce(p_received_by,'')))<2 or char_length(trim(coalesce(p_dispatch_number,'')))<1 then raise exception 'Tarih, teslim alan ve irsaliye numarası zorunlu'; end if;
  select * into v_request from public.inventory_requests where company_id=public.current_company_id() and id=p_request_id for update;
  if not found or v_request.status<>'approved' then raise exception 'Yalnızca onaylanmış talep stoğa alınabilir'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'İrsaliyede en az bir malzeme olmalıdır'; end if;
  delete from public.inventory_request_receipt_items where company_id=public.current_company_id() and request_id=p_request_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_catalog from public.inventory_catalog where company_id=public.current_company_id() and id=(v_item->>'catalog_id')::uuid;
    if not found then raise exception 'Katalog malzemesi bulunamadı'; end if;
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty<=0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
    if v_catalog.unit='piece' and v_qty<>trunc(v_qty) then raise exception 'Adet miktarı tam sayı olmalıdır'; end if;
    v_code := nullif(trim(v_item->>'material_code'),'');
    if v_catalog.has_id and v_code is null then raise exception '% için malzeme ID zorunlu',v_catalog.material_name; end if;
    if not v_catalog.has_id then v_code:=null; end if;
    if v_code is not null and exists(select 1 from public.inventory_materials where company_id=public.current_company_id() and lower(trim(material_code))=lower(v_code)) then raise exception 'Bu malzeme ID daha önce kullanılmış: %',v_code; end if;
    insert into public.inventory_request_receipt_items(request_id,catalog_id,quantity,material_code) values(p_request_id,v_catalog.id,v_qty,v_code);
  end loop;
  update public.inventory_requests set status='receipt_review',pending_receipt_date=p_receipt_date,pending_received_by=trim(p_received_by),pending_dispatch_number=trim(p_dispatch_number),pending_receipt_notes=nullif(trim(p_notes),'') where id=p_request_id;
end $$;

CREATE OR REPLACE FUNCTION public.transfer_inventory_custody(p_material_id uuid, p_quantity numeric, p_from_type text, p_from_id uuid, p_to_type text, p_to_id uuid, p_notes text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare
  v_material public.inventory_materials;
  v_source public.inventory_custody_balances;
  v_from_name text;
  v_to_name text;
  v_source_remaining numeric(14,3);
  v_destination_quantity numeric(14,3);
begin
  if not public.has_module_write_permission('custody') then
    raise exception 'Araç ekipmanı işlem yetkisi gerekli' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
  if p_from_type not in ('warehouse','personnel','team','vehicle')
    or p_to_type not in ('warehouse','personnel','team','vehicle') then
    raise exception 'Geçersiz transfer konumu';
  end if;
  if (p_from_type = 'warehouse' and p_from_id is not null)
    or (p_from_type <> 'warehouse' and p_from_id is null)
    or (p_to_type = 'warehouse' and p_to_id is not null)
    or (p_to_type <> 'warehouse' and p_to_id is null) then
    raise exception 'Transfer konumu bilgisi geçersiz';
  end if;
  if p_from_type = p_to_type and p_from_id is not distinct from p_to_id then
    raise exception 'Kaynak ve hedef aynı olamaz';
  end if;

  select * into v_material from public.inventory_materials
  where company_id=public.current_company_id() and id = p_material_id for update;
  if not found then raise exception 'Malzeme bulunamadı'; end if;
  if v_material.unit = 'piece' and p_quantity <> trunc(p_quantity) then
    raise exception 'Adet biriminde miktar tam sayı olmalıdır';
  end if;

  if p_from_type = 'warehouse' then
    if v_material.stock_quantity < p_quantity then
      raise exception 'Şantiye deposunda yetersiz miktar. Mevcut: %', v_material.stock_quantity;
    end if;
    v_from_name := 'Şantiye Deposu';
    update public.inventory_materials set stock_quantity = stock_quantity - p_quantity,
      updated_by = auth.uid() where id = p_material_id;
    v_source_remaining := v_material.stock_quantity - p_quantity;
  else
    select * into v_source from public.inventory_custody_balances
    where company_id=public.current_company_id() and material_id = p_material_id and holder_type = p_from_type
      and holder_id = p_from_id for update;
    if not found or v_source.quantity < p_quantity then raise exception 'Kaynakta yetersiz malzeme'; end if;
    v_from_name := v_source.holder_name;
    v_source_remaining := v_source.quantity - p_quantity;
    if v_source_remaining = 0 then
      delete from public.inventory_custody_balances where company_id=public.current_company_id() and id = v_source.id;
    else
      update public.inventory_custody_balances set quantity = v_source_remaining,
        updated_by = auth.uid() where id = v_source.id;
    end if;
  end if;

  if p_to_type = 'warehouse' then
    v_to_name := 'Şantiye Deposu';
    update public.inventory_materials set stock_quantity = stock_quantity + p_quantity,
      updated_by = auth.uid() where id = p_material_id returning stock_quantity into v_destination_quantity;
  else
    if p_to_type = 'vehicle' then
      select plate into v_to_name from public.vehicles where company_id=public.current_company_id() and id = p_to_id;
    elsif p_to_type = 'personnel' then
      select full_name into v_to_name from public.personnel where company_id=public.current_company_id() and id = p_to_id;
    else
      select concat('Ekip · ', team_type, ' · ', project_name) into v_to_name
      from public.daily_work_plan_teams where company_id=public.current_company_id() and id = p_to_id;
    end if;
    if v_to_name is null then raise exception 'Hedef bulunamadı'; end if;
    insert into public.inventory_custody_balances
      (material_id, holder_type, holder_id, holder_name, quantity, updated_by)
    values (p_material_id, p_to_type, p_to_id, v_to_name, p_quantity, auth.uid())
    on conflict (material_id, holder_type, holder_id) do update set
      quantity = public.inventory_custody_balances.quantity + excluded.quantity,
      holder_name = excluded.holder_name, updated_by = auth.uid()
    returning quantity into v_destination_quantity;
  end if;

  insert into public.inventory_custody_movements
    (material_id, from_type, from_id, from_name, to_type, to_id, to_name, quantity, notes, created_by)
  values (p_material_id, p_from_type, p_from_id, v_from_name,
    p_to_type, p_to_id, v_to_name, p_quantity, nullif(trim(p_notes),''), auth.uid());
  return jsonb_build_object('material_id',p_material_id,'source_remaining',v_source_remaining,
    'destination_quantity',v_destination_quantity);
end;
$$;

CREATE OR REPLACE FUNCTION public.transfer_inventory_to_biga(p_material_id uuid, p_quantity numeric, p_description text DEFAULT NULL::text) RETURNS public.inventory_materials
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_material public.inventory_materials;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode='42501'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
  select * into v_material from public.inventory_materials where company_id=public.current_company_id() and id=p_material_id for update;
  if not found then raise exception 'Malzeme bulunamadı'; end if;
  if v_material.unit='piece' and p_quantity<>trunc(p_quantity) then raise exception 'Adet miktarı tam sayı olmalıdır'; end if;
  if v_material.stock_quantity < p_quantity then raise exception 'Merkez Şantiye stoku yetersiz. Mevcut: %', v_material.stock_quantity; end if;
  update public.inventory_materials
  set stock_quantity=stock_quantity-p_quantity, biga_stock_quantity=biga_stock_quantity+p_quantity, updated_by=auth.uid()
  where id=p_material_id returning * into v_material;
  insert into public.inventory_movements
    (material_id,movement_type,quantity,usage_location,description,balance_after,created_by,action_type,source_location,target_location)
  values (p_material_id,'out',p_quantity,'AZG BİGA ŞUBE',nullif(trim(p_description),''),v_material.stock_quantity,auth.uid(),'transfer','center','biga');
  return v_material;
end;
$$;

-- 10. Profil fotoğrafları: yalnızca aynı şirketin kullanıcıları görebilir ----------
drop policy if exists "profile_avatars_select_approved" on storage.objects;
create policy "profile_avatars_select_approved"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and public.current_user_role() <> 'pending'
    and exists (
      select 1
      from public.profiles p
      where p.id::text = (storage.foldername(name))[1]
        and p.company_id = public.current_company_id()
    )
  );

-- 11. Oturum açmamış kullanıcılar veritabanı fonksiyonu çağıramaz ----------------
-- Fonksiyonların çoğunda çalıştırma yetkisi PUBLIC'e açıktır ve anon bunu
-- PUBLIC üzerinden alır. Giriş yapmış kullanıcıların mevcut erişimi açıkça
-- korunarak PUBLIC ve anon yetkisi kaldırılır.
do $$
declare
  v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    if has_function_privilege('authenticated', v_function, 'execute') then
      execute format('grant execute on function %s to authenticated', v_function);
    end if;
    if has_function_privilege('service_role', v_function, 'execute') then
      execute format('grant execute on function %s to service_role', v_function);
    end if;
    execute format('revoke execute on function %s from public, anon', v_function);
  end loop;
end $$;
alter default privileges in schema public revoke execute on functions from public, anon;

-- 12. Mevcut profiller -----------------------------------------------------------
-- Başlangıç şemasıyla oluşmuş profiller şirketsiz ve onaysız kalır.
alter table public.profiles disable trigger profiles_protect_primary_site_chief;
update public.profiles
set role = 'pending', is_approved = false, approved_at = null, approved_by = null
where company_id is null and (role <> 'pending' or is_approved);
alter table public.profiles enable trigger profiles_protect_primary_site_chief;

-- Şirketsiz profil yalnızca 'pending' olabilir (süper adminler dahil).
alter table public.profiles
  add constraint profiles_company_required_for_role
  check (company_id is not null or (role = 'pending' and is_approved = false));
