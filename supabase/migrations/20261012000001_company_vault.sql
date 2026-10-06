-- =============================================================================
-- MK OPS — firma gizli alanı (şifreli ortak notlar) + küçük düzeltmeler
--
-- Gizli alan: firmanın ortak "Önemli ve Gizli Notlar"ı. Şifreyi ana yönetici
-- Ayarlar'dan belirler; şifreyi bilen her onaylı kullanıcı açar.
-- * Koruma sunucudadır: notlar tablosu doğrudan okunamaz; yalnızca doğru şifreyle
--   alınan oturum anahtarıyla (30 dk, kullanıldıkça uzar) fonksiyonlar üzerinden.
-- * Şifre bcrypt özeti olarak saklanır (pgcrypto); açık metin hiçbir yerde tutulmaz.
-- * 15 dakikada 5 hatalı denemeden sonra kullanıcı geçici olarak engellenir.
-- * Not içerikleri işlem geçmişine yazılmaz; yalnızca "kim, ne zaman, hangi başlık".
--
-- Ayrıca: veritabanı mesajlarındaki "şantiye şefi" → "ana yönetici";
-- iç proje fonksiyonlarından gereksiz çalıştırma yetkisi kaldırıldı.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- 1. Tablolar (hiçbiri doğrudan okunamaz/yazılamaz) -------------------------------------------
create table public.company_vaults (
  company_id uuid primary key references public.companies (id) on delete cascade,
  password_hash text not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.company_vault_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 150),
  content text not null default '' check (char_length(content) <= 5000),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_company_vault_notes_company on public.company_vault_notes (company_id, updated_at desc);

create table public.company_vault_sessions (
  token uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null
);
create index idx_company_vault_sessions_user on public.company_vault_sessions (user_id);

create table public.company_vault_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index idx_company_vault_attempts_user on public.company_vault_attempts (user_id, attempted_at desc);

comment on table public.company_vaults is 'Firma gizli alanının şifre özeti (bcrypt)';
comment on table public.company_vault_notes is 'Firmanın şifreyle korunan ortak notları; yalnızca fonksiyonlarla erişilir';
comment on table public.company_vault_sessions is 'Gizli alan kilit açma oturumları (30 dk)';

do $$
declare
  v_table text;
begin
  foreach v_table in array array['company_vaults', 'company_vault_notes', 'company_vault_sessions', 'company_vault_attempts'] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on public.%I from anon, authenticated', v_table);
  end loop;
end $$;

-- 2. İç yardımcılar ----------------------------------------------------------------------------
create function public.vault_can_use()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.current_company_id() is not null
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_approved and p.role in ('site_chief', 'company_manager', 'accounting')
    );
$$;

/** Oturum anahtarını doğrular ve süresini uzatır; geçersizse hata verir. */
create function public.vault_require_session(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company_id uuid;
begin
  update public.company_vault_sessions
  set expires_at = now() + interval '30 minutes'
  where token = p_token
    and user_id = auth.uid()
    and company_id = public.current_company_id()
    and expires_at > now()
  returning company_id into v_company_id;
  if v_company_id is null or not public.vault_can_use() then
    raise exception 'Gizli alan kilitli; şifreyi yeniden girin' using errcode = '42501';
  end if;
  return v_company_id;
end;
$$;

create function public.vault_audit(p_action text, p_entity_type text, p_entity_id text, p_label text)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_name text;
  v_role text;
begin
  select coalesce(nullif(full_name, ''), email), role into v_name, v_role from public.profiles where id = auth.uid();
  insert into public.audit_logs (company_id, actor_user_id, actor_name, actor_role, module, entity_type, entity_id, entity_label, action, changes)
  values (public.current_company_id(), auth.uid(), v_name, v_role, 'settings', p_entity_type, p_entity_id, left(p_label, 300), p_action, '{}'::jsonb);
end;
$$;

-- 3. Şifre yönetimi ----------------------------------------------------------------------------
create function public.get_company_vault_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.vault_can_use() then
    return jsonb_build_object('configured', false, 'can_use', false, 'can_manage', false);
  end if;
  return jsonb_build_object(
    'configured', exists (select 1 from public.company_vaults where company_id = public.current_company_id()),
    'can_use', true,
    'can_manage', public.is_site_chief()
  );
end;
$$;

/** Yalnızca ana yönetici. Şifre değişince açık oturumlar kapanır. */
create function public.set_company_vault_password(p_password text)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_existed boolean;
begin
  if v_company_id is null or not public.is_site_chief() then
    raise exception 'Gizli alan şifresini yalnızca ana yönetici belirleyebilir' using errcode = '42501';
  end if;
  if char_length(coalesce(p_password, '')) < 6 or char_length(p_password) > 72 then
    raise exception 'Şifre 6 ile 72 karakter arasında olmalı';
  end if;
  v_existed := exists (select 1 from public.company_vaults where company_id = v_company_id);
  insert into public.company_vaults (company_id, password_hash, updated_by, updated_at)
  values (v_company_id, extensions.crypt(p_password, extensions.gen_salt('bf', 10)), auth.uid(), now())
  on conflict (company_id) do update
    set password_hash = excluded.password_hash, updated_by = excluded.updated_by, updated_at = now();
  delete from public.company_vault_sessions where company_id = v_company_id;
  perform public.vault_audit(case when v_existed then 'update' else 'insert' end, 'company_vaults', v_company_id::text, 'Gizli alan şifresi');
end;
$$;

-- 4. Kilit açma / kapama ---------------------------------------------------------------------------
-- Hatalı deneme kaydı geri alınmasın diye hata fırlatmak yerine sonuç döndürür.
create function public.unlock_company_vault(p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_hash text;
  v_token uuid;
  v_expires timestamptz := now() + interval '30 minutes';
begin
  if not public.vault_can_use() then
    return jsonb_build_object('ok', false, 'error', 'Gizli alanı kullanma yetkiniz yok');
  end if;
  select password_hash into v_hash from public.company_vaults where company_id = v_company_id;
  if v_hash is null then
    return jsonb_build_object('ok', false, 'error', 'Gizli alan için henüz şifre belirlenmemiş. Ana yönetici Ayarlar''dan belirleyebilir.');
  end if;
  if (select count(*) from public.company_vault_attempts
      where user_id = auth.uid() and attempted_at > now() - interval '15 minutes') >= 5 then
    return jsonb_build_object('ok', false, 'error', 'Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin.');
  end if;
  if extensions.crypt(coalesce(p_password, ''), v_hash) <> v_hash then
    insert into public.company_vault_attempts (user_id) values (auth.uid());
    return jsonb_build_object('ok', false, 'error', 'Şifre hatalı');
  end if;

  delete from public.company_vault_attempts where user_id = auth.uid();
  delete from public.company_vault_sessions where user_id = auth.uid() and expires_at <= now();
  insert into public.company_vault_sessions (company_id, user_id, expires_at)
  values (v_company_id, auth.uid(), v_expires)
  returning token into v_token;
  return jsonb_build_object('ok', true, 'token', v_token, 'expires_at', v_expires);
end;
$$;

create function public.lock_company_vault(p_token uuid)
returns void
language sql
security definer
set search_path = public
set row_security = off
as $$
  delete from public.company_vault_sessions where token = p_token and user_id = auth.uid();
$$;

-- 5. Notlar ----------------------------------------------------------------------------------------
create function public.list_company_vault_notes(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company_id uuid := public.vault_require_session(p_token);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', n.id, 'title', n.title, 'content', n.content, 'updated_at', n.updated_at,
      'updated_by_name', coalesce(nullif(p.full_name, ''), p.email)
    ) order by n.updated_at desc)
    from public.company_vault_notes n
    left join public.profiles p on p.id = n.updated_by
    where n.company_id = v_company_id
  ), '[]'::jsonb);
end;
$$;

create function public.save_company_vault_note(p_token uuid, p_id uuid, p_title text, p_content text)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company_id uuid := public.vault_require_session(p_token);
  v_id uuid;
  v_title text := trim(coalesce(p_title, ''));
begin
  if char_length(v_title) < 2 or char_length(v_title) > 150 then raise exception 'Başlık 2 ile 150 karakter arasında olmalı'; end if;
  if char_length(coalesce(p_content, '')) > 5000 then raise exception 'Not en fazla 5000 karakter olabilir'; end if;
  if p_id is null then
    insert into public.company_vault_notes (company_id, title, content, created_by, updated_by)
    values (v_company_id, v_title, coalesce(p_content, ''), auth.uid(), auth.uid())
    returning id into v_id;
    perform public.vault_audit('insert', 'company_vault_notes', v_id::text, v_title);
  else
    update public.company_vault_notes
    set title = v_title, content = coalesce(p_content, ''), updated_by = auth.uid(), updated_at = now()
    where id = p_id and company_id = v_company_id
    returning id into v_id;
    if v_id is null then raise exception 'Not bulunamadı'; end if;
    perform public.vault_audit('update', 'company_vault_notes', v_id::text, v_title);
  end if;
  return v_id;
end;
$$;

create function public.delete_company_vault_note(p_token uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company_id uuid := public.vault_require_session(p_token);
  v_title text;
begin
  delete from public.company_vault_notes where id = p_id and company_id = v_company_id returning title into v_title;
  if v_title is null then raise exception 'Not bulunamadı'; end if;
  perform public.vault_audit('delete', 'company_vault_notes', p_id::text, v_title);
end;
$$;

/** Eski kişisel gizli notu (private_notes) firmanın ortak gizli alanına taşır. */
create function public.move_private_note_to_vault(p_token uuid, p_note_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company_id uuid := public.vault_require_session(p_token);
  v_note public.private_notes;
  v_id uuid;
begin
  delete from public.private_notes
  where id = p_note_id and user_id = auth.uid() and company_id = v_company_id
  returning * into v_note;
  if v_note.id is null then raise exception 'Not bulunamadı'; end if;
  insert into public.company_vault_notes (company_id, title, content, created_by, updated_by, created_at)
  values (v_company_id, left(v_note.title, 150), left(coalesce(v_note.content, ''), 5000), auth.uid(), auth.uid(), v_note.created_at)
  returning id into v_id;
  perform public.vault_audit('insert', 'company_vault_notes', v_id::text, v_note.title);
  return v_id;
end;
$$;

-- 6. Küçük düzeltmeler ------------------------------------------------------------------------------
-- 6a. "şantiye şefi" → "ana yönetici" (fonksiyon gövdelerindeki hata mesajları)
do $$
declare
  v_function record;
  v_definition text;
begin
  for v_function in
    select p.oid from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.prosrc ~* 'şantiye şef'
  loop
    v_definition := pg_get_functiondef(v_function.oid);
    v_definition := replace(v_definition, 'Ana şantiye şefinin', 'Ana yöneticinin');
    v_definition := replace(v_definition, 'Ana şantiye şefi', 'Ana yönetici');
    v_definition := replace(v_definition, 'Şantiye şefi', 'Ana yönetici');
    v_definition := replace(v_definition, 'şantiye şefi', 'ana yönetici');
    execute v_definition;
  end loop;
end $$;

-- 6b. İç proje fonksiyonları yalnızca diğer SECURITY DEFINER fonksiyonlardan çağrılır.
revoke execute on function public.sync_project_stage_rows(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_project_rollup(uuid) from public, anon, authenticated;

-- 7. Yetkiler -----------------------------------------------------------------------------------------
do $$
declare
  v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        'vault_can_use', 'vault_require_session', 'vault_audit', 'get_company_vault_status',
        'set_company_vault_password', 'unlock_company_vault', 'lock_company_vault', 'list_company_vault_notes',
        'save_company_vault_note', 'delete_company_vault_note', 'move_private_note_to_vault'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', v_function);
  end loop;
end $$;

grant execute on function public.get_company_vault_status() to authenticated;
grant execute on function public.set_company_vault_password(text) to authenticated;
grant execute on function public.unlock_company_vault(text) to authenticated;
grant execute on function public.lock_company_vault(uuid) to authenticated;
grant execute on function public.list_company_vault_notes(uuid) to authenticated;
grant execute on function public.save_company_vault_note(uuid, uuid, text, text) to authenticated;
grant execute on function public.delete_company_vault_note(uuid, uuid) to authenticated;
grant execute on function public.move_private_note_to_vault(uuid, uuid) to authenticated;
