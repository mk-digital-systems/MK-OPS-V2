-- Kazı süreci proje altındaki paftalarda takip edilir.
alter table public.project_sheets
  add column if not exists tracks_excavation boolean not null default false;

update public.project_sheets s
set tracks_excavation = p.tracks_excavation
from public.projects p
where p.id = s.project_id and p.tracks_excavation = true;

alter table public.project_sheet_progress
  drop constraint if exists project_sheet_progress_stage_check;
alter table public.project_sheet_progress
  drop constraint if exists project_sheet_progress_stage_check_v2;
alter table public.project_sheet_progress
  add constraint project_sheet_progress_stage_check_v2 check (stage in (
    'cable', 'joint', 'obk', 'excavation_permit_waiting',
    'excavation_waiting', 'excavation_done', 'completed'
  ));

comment on column public.project_sheets.tracks_excavation is
  'Bu paftada kazı süreci takip edilecek mi';
