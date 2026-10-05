-- =============================================================================
-- 00003 — Proje ID firma tarafından manuel girilir (otomatik üretim kaldırılır)
-- =============================================================================

drop trigger if exists projects_generate_code on public.projects;
drop function if exists public.generate_project_code();
drop sequence if exists public.project_code_seq;

alter table public.projects
  alter column project_code drop default;

alter table public.projects
  drop constraint if exists projects_code_not_empty;

alter table public.projects
  add constraint projects_code_not_empty
  check (char_length(trim(project_code)) >= 1);

comment on column public.projects.project_code is
  'Firma tarafından verilen proje ID — manuel girilir';
