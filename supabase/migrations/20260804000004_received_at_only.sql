-- =============================================================================
-- 00004 — Alınan tarih; tahmini bitiş / girişte tamamlanma kaldırılır
-- Bitiş tarihi (completed_at) yalnız arşive aktarımda işlenir
-- =============================================================================

alter table public.projects
  add column if not exists received_at date;

comment on column public.projects.received_at is
  'Projenin alındığı tarih — girişte girilir';
comment on column public.projects.completed_at is
  'Bitiş tarihi — yalnız arşive (Tamamlandı) aktarımında işlenir';
comment on column public.projects.estimated_end_date is
  'Kullanımdan kaldırıldı — geriye uyumluluk için kolon duruyor';
comment on column public.projects.start_date is
  'Kullanımdan kaldırıldı — geriye uyumluluk için kolon duruyor';

-- Mevcut kayıtlarda received_at boşsa waiting_at / created_at doldur
update public.projects
set received_at = coalesce(
  received_at,
  waiting_at,
  (created_at at time zone 'Europe/Istanbul')::date
)
where received_at is null;

create or replace function public.projects_set_stage_dates()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'waiting';
    new.received_at := coalesce(new.received_at, current_date);
    new.waiting_at := coalesce(new.waiting_at, new.received_at, current_date);
    new.is_archived := false;
    new.archived_at := null;
    new.estimated_end_date := null;
    new.completed_at := null;
    new.start_date := null;
  end if;

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
