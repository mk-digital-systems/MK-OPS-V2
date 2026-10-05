alter table public.project_cabinets
  add column if not exists sd_code text null;

alter table public.project_cabinets
  drop constraint if exists project_cabinets_sd_code_format;
alter table public.project_cabinets
  add constraint project_cabinets_sd_code_format
    check (sd_code is null or sd_code ~ '^[0-9]{3}$');

create unique index if not exists project_cabinets_project_sd_unique
  on public.project_cabinets(project_id, sd_code)
  where sd_code is not null;

comment on column public.project_cabinets.sd_code is 'BGFD dolabının zorunlu üç haneli SD numarası';
