-- =============================================================================
-- 00016 — Şirket araçları
-- 00015'ten sonra çalıştırılmalıdır.
-- =============================================================================

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  plate text not null,
  brand text not null,
  model text not null,
  current_km bigint not null default 0,
  notes text,
  inspection_date date,
  insurance_date date,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicles_plate_unique unique (plate),
  constraint vehicles_plate_length check (char_length(trim(plate)) >= 5),
  constraint vehicles_brand_length check (char_length(trim(brand)) >= 2),
  constraint vehicles_model_length check (char_length(trim(model)) >= 1),
  constraint vehicles_km_nonnegative check (current_km >= 0)
);

comment on table public.vehicles is
  'İş planında seçilecek şirket araçları';
comment on column public.vehicles.current_km is
  'Aracın güncel kilometre bilgisi';

create index if not exists idx_vehicles_plate on public.vehicles (plate);
create index if not exists idx_vehicles_inspection_date
  on public.vehicles (inspection_date);
create index if not exists idx_vehicles_insurance_date
  on public.vehicles (insurance_date);

drop trigger if exists vehicles_set_updated_at on public.vehicles;
create trigger vehicles_set_updated_at
before update on public.vehicles
for each row execute function public.set_updated_at();

alter table public.vehicles enable row level security;
grant select, insert, update on public.vehicles to authenticated;

drop policy if exists "vehicles_select_authenticated" on public.vehicles;
create policy "vehicles_select_authenticated"
  on public.vehicles for select
  to authenticated using (true);

drop policy if exists "vehicles_insert_authenticated" on public.vehicles;
create policy "vehicles_insert_authenticated"
  on public.vehicles for insert
  to authenticated with check (auth.uid() is not null);

drop policy if exists "vehicles_update_authenticated" on public.vehicles;
create policy "vehicles_update_authenticated"
  on public.vehicles for update
  to authenticated using (true) with check (true);
