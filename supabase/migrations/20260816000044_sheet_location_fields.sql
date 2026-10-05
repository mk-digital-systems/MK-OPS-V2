-- İsteğe bağlı lokasyon ve konum bilgileri pafta bazında tutulur.
alter table public.project_sheets
  add column if not exists location text null,
  add column if not exists coordinates text null;

alter table public.project_sheets
  drop constraint if exists project_sheets_location_length;
alter table public.project_sheets
  drop constraint if exists project_sheets_coordinates_length;
alter table public.project_sheets
  add constraint project_sheets_location_length check (location is null or char_length(trim(location)) <= 300),
  add constraint project_sheets_coordinates_length check (coordinates is null or char_length(trim(coordinates)) <= 300);

comment on column public.project_sheets.location is 'Paftaya ait isteğe bağlı lokasyon/adres bilgisi';
comment on column public.project_sheets.coordinates is 'Paftaya ait isteğe bağlı konum, koordinat veya harita bağlantısı';
