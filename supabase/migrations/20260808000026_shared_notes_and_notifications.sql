-- =============================================================================
-- 00026 — Ortak notlar ve kullanıcı seçmeli uygulama içi bildirimler
-- 00025'ten sonra çalıştırılmalıdır.
-- =============================================================================

create table if not exists public.shared_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  target_at timestamptz,
  reminder_at timestamptz,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shared_notes_title_length
    check (char_length(trim(title)) between 2 and 150),
  constraint shared_notes_content_length
    check (char_length(trim(content)) between 2 and 5000),
  constraint shared_notes_reminder_before_target
    check (
      reminder_at is null
      or (target_at is not null and reminder_at < target_at)
    )
);

create table if not exists public.shared_note_recipients (
  note_id uuid not null
    references public.shared_notes (id) on delete cascade,
  user_id uuid not null
    references auth.users (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (note_id, user_id)
);

create index if not exists idx_shared_notes_created_at
  on public.shared_notes (created_at desc);
create index if not exists idx_shared_notes_reminder
  on public.shared_notes (reminder_at)
  where reminder_at is not null;
create index if not exists idx_shared_note_recipients_unread
  on public.shared_note_recipients (user_id, note_id)
  where read_at is null;

drop trigger if exists shared_notes_set_updated_at on public.shared_notes;
create trigger shared_notes_set_updated_at
before update on public.shared_notes
for each row execute function public.set_updated_at();

alter table public.shared_notes enable row level security;
alter table public.shared_note_recipients enable row level security;
grant select, insert, update, delete on public.shared_notes to authenticated;
grant select, update on public.shared_note_recipients to authenticated;
revoke insert, update on public.shared_notes from authenticated;

create policy "shared_notes_select_approved"
  on public.shared_notes for select to authenticated
  using (public.current_user_role() <> 'pending');
create policy "shared_notes_insert_approved"
  on public.shared_notes for insert to authenticated
  with check (
    public.current_user_role() <> 'pending'
    and created_by = auth.uid()
  );
create policy "shared_notes_update_own"
  on public.shared_notes for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());
create policy "shared_notes_delete_own"
  on public.shared_notes for delete to authenticated
  using (created_by = auth.uid());

create policy "shared_note_recipients_select_related"
  on public.shared_note_recipients for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.shared_notes n
      where n.id = note_id and n.created_by = auth.uid()
    )
  );
create policy "shared_note_recipients_update_own"
  on public.shared_note_recipients for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.list_note_recipient_users()
returns table (
  id uuid,
  full_name text,
  email text,
  role text
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select p.id, p.full_name, p.email, p.role
  from public.profiles p
  where p.is_approved = true
    and p.role <> 'pending'
    and public.current_user_role() <> 'pending'
  order by p.full_name nulls last, p.email;
$$;

create or replace function public.create_shared_note(
  p_title text,
  p_content text,
  p_target_at timestamptz default null,
  p_reminder_at timestamptz default null,
  p_recipient_ids uuid[] default '{}'::uuid[]
)
returns public.shared_notes
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_note public.shared_notes;
  v_recipient_count integer;
begin
  if auth.uid() is null or public.current_user_role() = 'pending' then
    raise exception 'Onaylı kullanıcı hesabı gerekli'
      using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_title, ''))) < 2 then
    raise exception 'Not başlığı zorunlu';
  end if;
  if char_length(trim(coalesce(p_content, ''))) < 2 then
    raise exception 'Not içeriği zorunlu';
  end if;
  if p_target_at is not null and p_target_at > now() then
    if p_reminder_at is null then
      raise exception 'İleri tarihli not için bildirim tarihi zorunlu';
    end if;
    if p_reminder_at >= p_target_at then
      raise exception 'Bildirim tarihi not tarihinden önce olmalıdır';
    end if;
    if coalesce(array_length(p_recipient_ids, 1), 0) = 0 then
      raise exception 'Bildirim için en az bir kullanıcı seçilmelidir';
    end if;
  end if;

  select count(*)::integer into v_recipient_count
  from public.profiles
  where id = any(coalesce(p_recipient_ids, '{}'::uuid[]))
    and is_approved = true
    and role <> 'pending';
  if v_recipient_count
    <> coalesce(array_length(p_recipient_ids, 1), 0) then
    raise exception 'Geçersiz veya onaysız bildirim kullanıcısı';
  end if;

  insert into public.shared_notes (
    title, content, target_at, reminder_at, created_by
  )
  values (
    trim(p_title), trim(p_content), p_target_at, p_reminder_at, auth.uid()
  )
  returning * into v_note;

  insert into public.shared_note_recipients (note_id, user_id)
  select v_note.id, recipient_id
  from unnest(coalesce(p_recipient_ids, '{}'::uuid[])) recipient_id
  on conflict do nothing;

  return v_note;
end;
$$;

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
          'read_at', r.read_at
        ) order by p.full_name)
        from public.shared_note_recipients r
        join public.profiles p on p.id = r.user_id
        where r.note_id = n.id
      ), '[]'::jsonb),
      'current_user_read_at', (
        select r.read_at
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
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'note_id', n.id,
      'title', n.title,
      'target_at', n.target_at,
      'reminder_at', n.reminder_at,
      'author_name', coalesce(p.full_name, p.email, 'Kullanıcı')
    )
    order by n.target_at
  ), '[]'::jsonb)
  from public.shared_note_recipients r
  join public.shared_notes n on n.id = r.note_id
  left join public.profiles p on p.id = n.created_by
  where r.user_id = auth.uid()
    and public.current_user_role() <> 'pending'
    and r.read_at is null
    and n.reminder_at is not null
    and n.reminder_at <= now();
$$;

create or replace function public.mark_note_notification_read(p_note_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.shared_note_recipients
  set read_at = now()
  where note_id = p_note_id and user_id = auth.uid();
$$;

revoke all on function public.list_note_recipient_users() from public;
revoke all on function public.create_shared_note(
  text, text, timestamptz, timestamptz, uuid[]
) from public;
revoke all on function public.get_shared_notes() from public;
revoke all on function public.get_due_note_notifications() from public;
revoke all on function public.mark_note_notification_read(uuid) from public;
grant execute on function public.list_note_recipient_users()
  to authenticated;
grant execute on function public.create_shared_note(
  text, text, timestamptz, timestamptz, uuid[]
) to authenticated;
grant execute on function public.get_shared_notes() to authenticated;
grant execute on function public.get_due_note_notifications()
  to authenticated;
grant execute on function public.mark_note_notification_read(uuid)
  to authenticated;
