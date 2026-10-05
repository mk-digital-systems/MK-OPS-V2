-- =============================================================================
-- 00002 — Ekip alanı opsiyonel; aşama tarihleri; devam eden iş adımları
-- =============================================================================

-- Ekip: projeye girişte yok (çoklu ekip ileride eklenecek)
alter table public.projects
  alter column team_name drop not null;

alter table public.projects
  drop constraint if exists projects_team_length;

comment on column public.projects.team_name is
  'Geçici alan — çoklu ekip modülü gelene kadar kullanılmıyor';

-- Her aşama için tarih
alter table public.projects
  add column if not exists waiting_at date,
  add column if not exists in_progress_at date,
  add column if not exists excavation_permit_waiting_at date,
  add column if not exists delayed_at date;

comment on column public.projects.waiting_at is 'Bekliyor aşamasına geçiş tarihi';
comment on column public.projects.in_progress_at is 'Devam Ediyor aşamasına geçiş tarihi';
comment on column public.projects.excavation_permit_waiting_at is 'Kazı İzni Bekliyor aşamasına geçiş tarihi';
comment on column public.projects.delayed_at is 'Gecikmiş aşamasına geçiş tarihi';
comment on column public.projects.completed_at is 'Tamamlandı aşaması / tamamlanma tarihi';

-- Devam eden projeler: kablo / ek / açıklama
alter table public.projects
  add column if not exists cable_pulled boolean,
  add column if not exists joint_done boolean,
  add column if not exists progress_notes text;

comment on column public.projects.cable_pulled is 'true=çekildi, false=çekilmedi, null=belirtilmedi';
comment on column public.projects.joint_done is 'true=ek yapıldı, false=yapılmadı, null=belirtilmedi';
comment on column public.projects.progress_notes is 'Devam eden iş adımları açıklaması';

-- İlk kayıt ve durum değişiminde aşama tarihini otomatik doldur
create or replace function public.projects_set_stage_dates()
returns trigger
language plpgsql
as $$
begin
  -- İlk kayıt her zaman bekliyor
  if tg_op = 'INSERT' then
    new.status := 'waiting';
    new.waiting_at := coalesce(new.waiting_at, current_date);
    new.is_archived := false;
    new.archived_at := null;
  end if;

  -- Durum değişince ilgili tarih boşsa bugün yaz
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    case new.status
      when 'waiting' then
        new.waiting_at := coalesce(new.waiting_at, current_date);
      when 'in_progress' then
        new.in_progress_at := coalesce(new.in_progress_at, current_date);
      when 'excavation_permit_waiting' then
        new.excavation_permit_waiting_at :=
          coalesce(new.excavation_permit_waiting_at, current_date);
      when 'delayed' then
        new.delayed_at := coalesce(new.delayed_at, current_date);
      when 'completed' then
        new.completed_at := coalesce(new.completed_at, current_date);
      else
        null;
    end case;
  end if;

  return new;
end;
$$;

drop trigger if exists projects_set_stage_dates on public.projects;
drop trigger if exists projects_apply_stage_dates on public.projects;

create trigger projects_apply_stage_dates
before insert or update of status,
  waiting_at, in_progress_at, excavation_permit_waiting_at, delayed_at, completed_at
on public.projects
for each row execute function public.projects_set_stage_dates();

-- Mevcut kayıtlar: waiting_at boşsa created_at tarihini yaz
update public.projects
set waiting_at = coalesce(waiting_at, (created_at at time zone 'Europe/Istanbul')::date)
where waiting_at is null;
