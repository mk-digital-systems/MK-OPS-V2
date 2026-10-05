-- Notlar artık bildirim üretmeyen, tarihli ortak hızlı notlar olarak kullanılır.
alter table public.shared_notes
  add column if not exists note_date date;

update public.shared_notes
set note_date = coalesce(note_date, target_at::date, created_at::date)
where note_date is null;

alter table public.shared_notes
  alter column note_date set default current_date,
  alter column note_date set not null;

create index if not exists idx_shared_notes_note_date
  on public.shared_notes (note_date asc, created_at desc);

drop function if exists public.mark_note_notification_read(uuid, text);
drop function if exists public.mark_note_notification_read(uuid);
drop function if exists public.get_due_note_notifications();
drop function if exists public.get_shared_notes();
drop function if exists public.create_shared_note(text, text, timestamptz, timestamptz, uuid[]);
drop function if exists public.list_note_recipient_users();

drop table if exists public.shared_note_recipients;

alter table public.shared_notes
  drop constraint if exists shared_notes_reminder_before_target,
  drop column if exists reminder_at,
  drop column if exists target_at;

create or replace function public.create_shared_note(
  p_title text,
  p_note_date date
)
returns public.shared_notes
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_note public.shared_notes;
begin
  if auth.uid() is null or public.current_user_role() = 'pending' then
    raise exception 'Onaylı kullanıcı hesabı gerekli' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_title, ''))) < 2 then
    raise exception 'Not en az 2 karakter olmalıdır';
  end if;
  if p_note_date is null then
    raise exception 'Not tarihi zorunludur';
  end if;

  insert into public.shared_notes (title, content, note_date, created_by)
  values (trim(p_title), trim(p_title), p_note_date, auth.uid())
  returning * into v_note;

  return v_note;
end;
$$;

create or replace function public.update_shared_note(
  p_note_id uuid,
  p_title text,
  p_note_date date
)
returns public.shared_notes
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_note public.shared_notes;
begin
  if char_length(trim(coalesce(p_title, ''))) < 2 then
    raise exception 'Not en az 2 karakter olmalıdır';
  end if;
  if p_note_date is null then
    raise exception 'Not tarihi zorunludur';
  end if;

  update public.shared_notes
  set title = trim(p_title), content = trim(p_title), note_date = p_note_date
  where id = p_note_id and created_by = auth.uid()
  returning * into v_note;

  if v_note.id is null then
    raise exception 'Not bulunamadı veya düzenleme yetkiniz yok' using errcode = '42501';
  end if;
  return v_note;
end;
$$;

create or replace function public.get_shared_notes()
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_notes jsonb;
begin
  delete from public.shared_notes where note_date < current_date;

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
  where public.current_user_role() <> 'pending';

  return v_notes;
end;
$$;

revoke all on function public.create_shared_note(text, date) from public;
revoke all on function public.update_shared_note(uuid, text, date) from public;
revoke all on function public.get_shared_notes() from public;
grant execute on function public.create_shared_note(text, date) to authenticated;
grant execute on function public.update_shared_note(uuid, text, date) to authenticated;
grant execute on function public.get_shared_notes() to authenticated;

comment on function public.get_shared_notes() is
  'Tarihi geçen notları siler ve kalan notları en yakın tarih önce listeler.';
