-- Optional personnel duty/title and immutable work-plan snapshot value.
alter table public.personnel add column job_title text null;
alter table public.personnel add constraint personnel_job_title_length
  check (job_title is null or char_length(trim(job_title)) between 1 and 120);

alter table public.daily_work_plan_team_members add column job_title text null;
alter table public.daily_work_plan_team_members add constraint daily_work_plan_team_members_job_title_length
  check (job_title is null or char_length(trim(job_title)) between 1 and 120);

comment on column public.personnel.job_title is 'Opsiyonel serbest metin görev bilgisi';
comment on column public.daily_work_plan_team_members.job_title is
  'Plan oluşturulduğu andaki opsiyonel görev bilgisi snapshot değeri';
