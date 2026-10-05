-- =============================================================================
-- 00027 — Notlar için hatırlatma ve not tarihinde iki ayrı bildirim
-- 00026'dan sonra çalıştırılmalıdır.
-- =============================================================================

alter table public.shared_note_recipients
  add column if not exists reminder_read_at timestamptz,
  add column if not exists target_read_at timestamptz;

-- Önceki tek bildirim okuma kaydını hatırlatma bildirimi olarak koru.
update public.shared_note_recipients
set reminder_read_at = read_at
where reminder_read_at is null and read_at is not null;

drop index if exists public.idx_shared_note_recipients_unread;
create index if not exists idx_shared_note_recipients_reminder_unread
  on public.shared_note_recipients (user_id, note_id)
  where reminder_read_at is null;
create index if not exists idx_shared_note_recipients_target_unread
  on public.shared_note_recipients (user_id, note_id)
  where target_read_at is null;

create or replace function public.get_shared_notes()
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', n.id,
      'title', n.title,
      'content', n.content,
      'target_at', n.target_at,
      'reminder_at', n.reminder_at,
      'created_by', n.created_by,
      'created_at', n.created_at,
      'updated_at', n.updated_at,
      'author_name', coalesce(author.full_name, author.email, 'Kullanıcı'),
      'recipients', coalesce((
        select jsonb_agg(jsonb_build_object(
          'user_id', r.user_id,
          'full_name', coalesce(p.full_name, p.email, 'Kullanıcı'),
          'reminder_read_at', r.reminder_read_at,
          'target_read_at', r.target_read_at
        ) order by p.full_name)
        from public.shared_note_recipients r
        join public.profiles p on p.id = r.user_id
        where r.note_id = n.id
      ), '[]'::jsonb),
      'current_user_reminder_read_at', (
        select r.reminder_read_at
        from public.shared_note_recipients r
        where r.note_id = n.id and r.user_id = auth.uid()
      ),
      'current_user_target_read_at', (
        select r.target_read_at
        from public.shared_note_recipients r
        where r.note_id = n.id and r.user_id = auth.uid()
      )
    )
    order by coalesce(n.target_at, n.created_at) desc
  ), '[]'::jsonb)
  from public.shared_notes n
  left join public.profiles author on author.id = n.created_by
  where public.current_user_role() <> 'pending';
$$;

create or replace function public.get_due_note_notifications()
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  with due_events as (
    select
      n.id as note_id,
      n.title,
      n.target_at,
      n.reminder_at,
      coalesce(p.full_name, p.email, 'Kullanıcı') as author_name,
      'reminder'::text as event_type,
      n.reminder_at as due_at
    from public.shared_note_recipients r
    join public.shared_notes n on n.id = r.note_id
    left join public.profiles p on p.id = n.created_by
    where r.user_id = auth.uid()
      and public.current_user_role() <> 'pending'
      and r.reminder_read_at is null
      and n.reminder_at is not null
      and n.reminder_at <= now()

    union all

    select
      n.id as note_id,
      n.title,
      n.target_at,
      n.reminder_at,
      coalesce(p.full_name, p.email, 'Kullanıcı') as author_name,
      'target'::text as event_type,
      n.target_at as due_at
    from public.shared_note_recipients r
    join public.shared_notes n on n.id = r.note_id
    left join public.profiles p on p.id = n.created_by
    where r.user_id = auth.uid()
      and public.current_user_role() <> 'pending'
      and r.target_read_at is null
      and n.target_at is not null
      and n.target_at <= now()
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'note_id', note_id,
      'title', title,
      'target_at', target_at,
      'reminder_at', reminder_at,
      'author_name', author_name,
      'event_type', event_type,
      'due_at', due_at
    )
    order by due_at, event_type
  ), '[]'::jsonb)
  from due_events;
$$;

revoke all on function public.mark_note_notification_read(uuid) from public;
drop function if exists public.mark_note_notification_read(uuid);

create or replace function public.mark_note_notification_read(
  p_note_id uuid,
  p_event_type text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_event_type = 'reminder' then
    update public.shared_note_recipients
    set reminder_read_at = now()
    where note_id = p_note_id and user_id = auth.uid();
  elsif p_event_type = 'target' then
    update public.shared_note_recipients
    set target_read_at = now()
    where note_id = p_note_id and user_id = auth.uid();
  else
    raise exception 'Geçersiz bildirim türü';
  end if;
end;
$$;

revoke all on function public.mark_note_notification_read(uuid, text)
  from public;
grant execute on function public.mark_note_notification_read(uuid, text)
  to authenticated;

comment on function public.mark_note_notification_read(uuid, text) is
  'Hatırlatma ve not tarihi bildirimlerini birbirinden bağımsız okundu işaretler.';
