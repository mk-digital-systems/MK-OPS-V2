-- =============================================================================
-- 00020 — Kullanıcı profili ve profil fotoğrafı
-- 00019'dan sonra çalıştırılmalıdır.
-- =============================================================================

alter table public.profiles
  add column if not exists job_title text,
  add column if not exists avatar_path text;

comment on column public.profiles.job_title is
  'Kullanıcının profilinde belirttiği görev/unvan';
comment on column public.profiles.avatar_path is
  'Private profile-avatars bucket içindeki dosya yolu';

create or replace function public.update_own_profile(
  p_full_name text,
  p_job_title text default null,
  p_avatar_path text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_profile public.profiles;
  v_avatar_path text;
begin
  if auth.uid() is null then
    raise exception 'Oturum gerekli' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_full_name, ''))) < 3 then
    raise exception 'Ad soyad en az 3 karakter olmalıdır';
  end if;
  if char_length(trim(coalesce(p_job_title, ''))) > 120 then
    raise exception 'Görev en fazla 120 karakter olabilir';
  end if;

  v_avatar_path := nullif(trim(p_avatar_path), '');
  if v_avatar_path is not null
    and split_part(v_avatar_path, '/', 1) <> auth.uid()::text then
    raise exception 'Geçersiz profil fotoğrafı yolu'
      using errcode = '42501';
  end if;

  update public.profiles
  set
    full_name = trim(p_full_name),
    job_title = nullif(trim(p_job_title), ''),
    avatar_path = v_avatar_path
  where id = auth.uid()
  returning * into v_profile;

  if not found then
    raise exception 'Profil bulunamadı';
  end if;
  return v_profile;
end;
$$;

revoke all on function public.update_own_profile(text, text, text)
  from public;
grant execute on function public.update_own_profile(text, text, text)
  to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  false,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile_avatars_select_approved"
  on storage.objects;
create policy "profile_avatars_select_approved"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and public.current_user_role() <> 'pending'
  );

drop policy if exists "profile_avatars_insert_own"
  on storage.objects;
create policy "profile_avatars_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_user_role() <> 'pending'
  );

drop policy if exists "profile_avatars_update_own"
  on storage.objects;
create policy "profile_avatars_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and owner_id = auth.uid()::text
  )
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "profile_avatars_delete_own"
  on storage.objects;
create policy "profile_avatars_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and owner_id = auth.uid()::text
  );
