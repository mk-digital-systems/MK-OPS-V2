-- =============================================================================
-- MK OPS — başlangıç şeması (baseline)
--
-- Boş bir Supabase projesine tek seferde kurulur (SQL Editor → Run).
-- Mavi Kadraj'ın 20260804000001 … 20261005000082 migration'larının son halidir;
-- Eski kuruluma özgü sabit kullanıcı kimliği ve adlar çıkarılmıştır.
--
-- Bölümler:
--   1. Eklentiler
--   2. public şeması (pg_dump çıktısı: tipler, tablolar, fonksiyonlar,
--      indeksler, tetikleyiciler, RLS politikaları, yetkiler)
--   3. Başlangıç verisi
--   4. Supabase platform nesneleri (auth tetikleyicisi, storage, pg_cron)
-- =============================================================================

-- 1. Eklentiler ---------------------------------------------------------------
create extension if not exists pg_trgm with schema extensions;

-- 2. public şeması --------------------------------------------------------------
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: attendance_leave_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.attendance_leave_type AS ENUM (
    'annual',
    'unpaid',
    'excuse',
    'other'
);


--
-- Name: attendance_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.attendance_status AS ENUM (
    'worked',
    'absent',
    'leave',
    'medical_report',
    'weekly_rest',
    'unexcused_absence'
);


--
-- Name: inventory_movement_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.inventory_movement_type AS ENUM (
    'in',
    'out'
);


--
-- Name: inventory_unit; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.inventory_unit AS ENUM (
    'piece',
    'meter',
    'kilogram'
);


--
-- Name: project_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.project_status AS ENUM (
    'waiting',
    'in_progress',
    'excavation_permit_waiting',
    'delayed',
    'completed'
);


--
-- Name: work_plan_absence_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.work_plan_absence_status AS ENUM (
    'leave',
    'sick_report'
);


--
-- Name: approve_inventory_request(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_inventory_request(p_request_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Malzeme talep onay yetkisi gerekli' using errcode='42501'; end if;
  update public.inventory_requests set status='approved',approved_at=now(),approved_by=auth.uid() where id=p_request_id and status='requested';
  if not found then raise exception 'Yalnızca talep edilmiş kayıt onaylanabilir'; end if;
end $$;


--
-- Name: approve_inventory_request_receipt(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_inventory_request_receipt(p_request_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_request public.inventory_requests; v_item record; v_catalog public.inventory_catalog; v_receipt_id uuid; v_material public.inventory_materials; v_code text;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Stok kabul onay yetkisi gerekli' using errcode='42501'; end if;
  select * into v_request from public.inventory_requests where id=p_request_id for update;
  if not found or v_request.status<>'receipt_review' then raise exception 'Yalnızca stok onayı bekleyen irsaliye onaylanabilir'; end if;
  insert into public.inventory_receipts(receipt_date,received_by,dispatch_number,notes,created_by)
  values(v_request.pending_receipt_date,v_request.pending_received_by,v_request.pending_dispatch_number,v_request.pending_receipt_notes,auth.uid()) returning id into v_receipt_id;
  for v_item in select * from public.inventory_request_receipt_items where request_id=p_request_id loop
    select * into v_catalog from public.inventory_catalog where id=v_item.catalog_id;
    v_code:=v_item.material_code;
    select * into v_material from public.inventory_materials where catalog_id=v_catalog.id and unit=v_catalog.unit and coalesce(material_code,'')=coalesce(v_code,'') for update;
    if not found then
      insert into public.inventory_materials(catalog_id,material_code,material_name,stock_category,material_type,size,unit,stock_quantity,biga_stock_quantity,notes,created_by,updated_by)
      values(v_catalog.id,v_code,v_catalog.material_name,v_catalog.stock_category,v_catalog.material_type,v_catalog.size,v_catalog.unit,0,0,v_catalog.notes,auth.uid(),auth.uid()) returning * into v_material;
    end if;
    update public.inventory_materials set stock_quantity=stock_quantity+v_item.quantity,updated_by=auth.uid() where id=v_material.id returning * into v_material;
    insert into public.inventory_receipt_items(receipt_id,material_id,quantity) values(v_receipt_id,v_material.id,v_item.quantity);
    insert into public.inventory_movements(material_id,movement_type,quantity,description,balance_after,created_by,action_type,target_location,receipt_date,received_by,dispatch_number,receipt_id)
    values(v_material.id,'in',v_item.quantity,'Malzeme talebinden irsaliye ile stok girişi',v_material.stock_quantity,auth.uid(),'in','center',v_request.pending_receipt_date,v_request.pending_received_by,v_request.pending_dispatch_number,v_receipt_id);
  end loop;
  update public.inventory_requests set status='received',received_at=now(),receipt_id=v_receipt_id where id=p_request_id;
  return v_receipt_id;
end $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text,
    email text,
    role text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_approved boolean DEFAULT false NOT NULL,
    approved_at timestamp with time zone,
    approved_by uuid,
    job_title text,
    avatar_path text,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['pending'::text, 'site_chief'::text, 'company_manager'::text, 'accounting'::text])))
);


--
-- Name: TABLE profiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.profiles IS 'Uygulama kullanıcı profilleri';


--
-- Name: COLUMN profiles.job_title; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.job_title IS 'Kullanıcının profilinde belirttiği görev/unvan';


--
-- Name: COLUMN profiles.avatar_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.avatar_path IS 'Private profile-avatars bucket içindeki dosya yolu';


--
-- Name: assign_user_role(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_user_role(p_user_id uuid, p_role text) RETURNS public.profiles
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare
  v_profile public.profiles;
  v_manager_count integer;
  v_accounting_count integer;
begin
  if not public.is_site_chief() then
    raise exception 'Bu işlem için şantiye şefi yetkisi gerekli'
      using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('mk-ops-role-assignment'));
  if p_user_id = auth.uid() then
    raise exception 'Şantiye şefi kendi yetkisini değiştiremez';
  end if;
  if p_role not in ('company_manager', 'accounting', 'pending') then
    raise exception 'Geçersiz kullanıcı rolü';
  end if;

  if p_role = 'company_manager' then
    select count(*)::integer into v_manager_count
    from public.profiles
    where role = 'company_manager'
      and is_approved = true
      and id <> p_user_id;
    if v_manager_count >= 3 then
      raise exception 'En fazla 3 şirket yöneticisi atanabilir';
    end if;
  end if;

  if p_role = 'accounting' then
    select count(*)::integer into v_accounting_count
    from public.profiles
    where role = 'accounting'
      and is_approved = true
      and id <> p_user_id;
    if v_accounting_count >= 2 then
      raise exception 'En fazla 2 muhasebe kullanıcısı atanabilir';
    end if;
  end if;

  update public.profiles
  set
    role = p_role,
    is_approved = p_role <> 'pending',
    approved_at = case when p_role <> 'pending' then now() else null end,
    approved_by = case when p_role <> 'pending' then auth.uid() else null end
  where id = p_user_id and role <> 'site_chief'
  returning * into v_profile;
  if not found then
    raise exception 'Kullanıcı bulunamadı veya rolü değiştirilemez';
  end if;

  if p_role = 'company_manager' then
    insert into public.company_manager_permissions (user_id, updated_by)
    values (p_user_id, auth.uid())
    on conflict (user_id) do nothing;
  else
    delete from public.company_manager_permissions where user_id = p_user_id;
  end if;

  return v_profile;
end;
$$;


--
-- Name: vehicles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plate text NOT NULL,
    brand text NOT NULL,
    model text NOT NULL,
    current_km bigint DEFAULT 0 NOT NULL,
    notes text,
    inspection_date date,
    insurance_date date,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_personnel_id uuid,
    CONSTRAINT vehicles_brand_length CHECK ((char_length(TRIM(BOTH FROM brand)) >= 2)),
    CONSTRAINT vehicles_km_nonnegative CHECK ((current_km >= 0)),
    CONSTRAINT vehicles_model_length CHECK ((char_length(TRIM(BOTH FROM model)) >= 1)),
    CONSTRAINT vehicles_plate_length CHECK ((char_length(TRIM(BOTH FROM plate)) >= 5))
);


--
-- Name: TABLE vehicles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.vehicles IS 'İş planında seçilecek şirket araçları';


--
-- Name: COLUMN vehicles.current_km; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vehicles.current_km IS 'Aracın güncel kilometre bilgisi';


--
-- Name: assign_vehicle_personnel(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_vehicle_personnel(p_vehicle_id uuid, p_personnel_id uuid DEFAULT NULL::uuid) RETURNS public.vehicles
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_vehicle public.vehicles;
begin
  if not public.has_module_write_permission('vehicles') then
    raise exception 'Araç işlem yetkisi gerekli' using errcode = '42501';
  end if;
  if p_personnel_id is not null and not exists (
    select 1 from public.personnel where id = p_personnel_id and is_active = true
  ) then raise exception 'Aktif personel bulunamadı'; end if;
  update public.vehicles set assigned_personnel_id = p_personnel_id,
    updated_by = auth.uid() where id = p_vehicle_id returning * into v_vehicle;
  if not found then raise exception 'Araç bulunamadı'; end if;
  return v_vehicle;
exception when unique_violation then
  raise exception 'Bu personelin üzerinde zaten başka bir araç var';
end;
$$;


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_code text NOT NULL,
    name text NOT NULL,
    project_type text NOT NULL,
    location text NOT NULL,
    team_name text,
    description text,
    status public.project_status DEFAULT 'waiting'::public.project_status NOT NULL,
    received_at date,
    start_date date,
    estimated_end_date date,
    waiting_at date,
    in_progress_at date,
    excavation_permit_waiting_at date,
    delayed_at date,
    completed_at date,
    cable_pulled boolean,
    joint_done boolean,
    progress_notes text,
    is_archived boolean DEFAULT false NOT NULL,
    archived_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tracks_obk boolean DEFAULT false NOT NULL,
    obk_pulled boolean,
    tracks_joint boolean DEFAULT true NOT NULL,
    tracks_cable boolean DEFAULT true NOT NULL,
    tracks_excavation boolean DEFAULT false NOT NULL,
    excavation_done boolean,
    sheet_count integer,
    hp_count integer,
    is_single_sheet boolean DEFAULT false NOT NULL,
    progress_percent integer DEFAULT 0 NOT NULL,
    project_date date,
    priority_order integer,
    completed_by_personnel_id uuid,
    completed_by_name text,
    current_team_leader_personnel_id uuid,
    current_team_leader_name text,
    status_sort_order integer GENERATED ALWAYS AS (
CASE status
    WHEN 'in_progress'::public.project_status THEN 1
    WHEN 'excavation_permit_waiting'::public.project_status THEN 2
    WHEN 'waiting'::public.project_status THEN 3
    WHEN 'completed'::public.project_status THEN 4
    ELSE 3
END) STORED,
    default_status_sort_order integer GENERATED ALWAYS AS (
CASE
    WHEN (project_type <> 'KURUMSAL_TTVPN'::text) THEN 0
    WHEN (status = 'in_progress'::public.project_status) THEN 1
    WHEN (status = 'excavation_permit_waiting'::public.project_status) THEN 2
    WHEN (status = 'waiting'::public.project_status) THEN 3
    WHEN (status = 'completed'::public.project_status) THEN 4
    ELSE 3
END) STORED,
    project_type_sort_order integer GENERATED ALWAYS AS (
CASE project_type
    WHEN 'KURUMSAL_TTVPN'::text THEN 1
    WHEN 'HP_ODAKLI'::text THEN 2
    WHEN 'ERISIM_ZORUNLULUK'::text THEN 3
    WHEN 'BGFD'::text THEN 999
    ELSE 4
END) STORED,
    is_cancelled boolean DEFAULT false NOT NULL,
    cancellation_reason text,
    cancelled_at timestamp with time zone,
    cancelled_by uuid,
    image_url text,
    CONSTRAINT projects_cancellation_fields_check CHECK ((((is_cancelled = false) AND (cancellation_reason IS NULL) AND (cancelled_at IS NULL)) OR ((is_cancelled = true) AND (char_length(TRIM(BOTH FROM cancellation_reason)) >= 3) AND (cancelled_at IS NOT NULL) AND (is_archived = false)))),
    CONSTRAINT projects_code_not_empty CHECK ((char_length(TRIM(BOTH FROM project_code)) >= 1)),
    CONSTRAINT projects_hp_count_check CHECK (((hp_count IS NULL) OR (hp_count >= 0))),
    CONSTRAINT projects_location_length CHECK ((char_length(TRIM(BOTH FROM location)) >= 2)),
    CONSTRAINT projects_name_length CHECK ((char_length(TRIM(BOTH FROM name)) >= 2)),
    CONSTRAINT projects_priority_order_check CHECK (((priority_order IS NULL) OR (priority_order > 0))),
    CONSTRAINT projects_progress_percent_check CHECK (((progress_percent >= 0) AND (progress_percent <= 100))),
    CONSTRAINT projects_sheet_count_check CHECK (((sheet_count IS NULL) OR (sheet_count > 0))),
    CONSTRAINT projects_type_not_empty CHECK ((char_length(TRIM(BOTH FROM project_type)) >= 1))
);


--
-- Name: TABLE projects; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.projects IS 'Şantiye projeleri — aşama takip';


--
-- Name: COLUMN projects.project_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.project_code IS 'Firma tarafından verilen proje ID — manuel girilir';


--
-- Name: COLUMN projects.location; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.location IS 'Manuel mevki alanı — sistem yorumlamaz';


--
-- Name: COLUMN projects.team_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.team_name IS 'Geçici alan — çoklu ekip modülü gelene kadar kullanılmıyor';


--
-- Name: COLUMN projects.received_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.received_at IS 'Projenin alındığı tarih — girişte girilir';


--
-- Name: COLUMN projects.start_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.start_date IS 'Kullanımdan kaldırıldı — geriye uyumluluk için kolon duruyor';


--
-- Name: COLUMN projects.estimated_end_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.estimated_end_date IS 'Kullanımdan kaldırıldı — geriye uyumluluk için kolon duruyor';


--
-- Name: COLUMN projects.waiting_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.waiting_at IS 'Bekliyor aşamasına geçiş tarihi';


--
-- Name: COLUMN projects.in_progress_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.in_progress_at IS 'Devam Ediyor aşamasına geçiş tarihi';


--
-- Name: COLUMN projects.excavation_permit_waiting_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.excavation_permit_waiting_at IS 'Kazı İzni Bekliyor aşamasına geçiş tarihi';


--
-- Name: COLUMN projects.delayed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.delayed_at IS 'Gecikmiş aşamasına geçiş tarihi';


--
-- Name: COLUMN projects.completed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.completed_at IS 'Bitiş tarihi — yalnız arşive (Tamamlandı) aktarımında işlenir';


--
-- Name: COLUMN projects.cable_pulled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.cable_pulled IS 'true=çekildi, false=çekilmedi, null=belirtilmedi';


--
-- Name: COLUMN projects.joint_done; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.joint_done IS 'true=ek yapıldı, false=yapılmadı, null=belirtilmedi';


--
-- Name: COLUMN projects.progress_notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.progress_notes IS 'Devam eden iş adımları açıklaması';


--
-- Name: COLUMN projects.is_archived; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.is_archived IS 'Tamamlanan projeler arşive alınır, silinmez';


--
-- Name: COLUMN projects.tracks_obk; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.tracks_obk IS 'Proje için OBK takibi yapılıp yapılmayacağını belirler';


--
-- Name: COLUMN projects.obk_pulled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.obk_pulled IS 'Yalnız BF/GF projeleri: true=OBK çekildi, false=OBK çekilmedi, null=belirtilmedi';


--
-- Name: COLUMN projects.tracks_joint; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.tracks_joint IS 'Tüm projelerde ek takibi vardır; arayüzde var/yok seçimi gösterilmez.';


--
-- Name: COLUMN projects.tracks_cable; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.tracks_cable IS 'Tüm projelerde kablo takibi vardır; arayüzde var/yok seçimi gösterilmez.';


--
-- Name: COLUMN projects.tracks_excavation; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.tracks_excavation IS 'Projede kazı işlemi takibi var/yok';


--
-- Name: COLUMN projects.excavation_done; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.excavation_done IS 'Kazı takibi varsa true=yapıldı, false=yapılmadı, null=belirtilmedi';


--
-- Name: COLUMN projects.sheet_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.sheet_count IS 'GF/BF için beklenen toplam pafta sayısı';


--
-- Name: COLUMN projects.hp_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.hp_count IS 'GF/BF proje geneli HP bilgisi';


--
-- Name: COLUMN projects.is_single_sheet; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.is_single_sheet IS 'Pafta alanları proje içinde tek pafta olarak gösterilir';


--
-- Name: bulk_update_project_tracking(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bulk_update_project_tracking(p_updates jsonb) RETURNS SETOF public.projects
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'Oturum gerekli' using errcode = '42501';
  end if;

  if jsonb_typeof(p_updates) <> 'array' then
    raise exception 'Güncellemeler JSON dizisi olmalıdır';
  end if;

  if jsonb_array_length(p_updates) > 250 then
    raise exception 'Tek işlemde en fazla 250 proje güncellenebilir';
  end if;

  return query
  update public.projects as p
  set
    tracks_obk = u.tracks_obk,
    obk_pulled = case when u.tracks_obk then u.obk_pulled else null end,
    tracks_joint = true,
    joint_done = u.joint_done,
    tracks_cable = true,
    cable_pulled = u.cable_pulled,
    tracks_excavation = u.tracks_excavation,
    excavation_done =
      case when u.tracks_excavation then u.excavation_done else null end,
    updated_by = auth.uid()
  from jsonb_to_recordset(p_updates) as u(
    id uuid,
    tracks_obk boolean,
    obk_pulled boolean,
    joint_done boolean,
    cable_pulled boolean,
    tracks_excavation boolean,
    excavation_done boolean
  )
  where p.id = u.id
  returning p.*;
end;
$$;


--
-- Name: FUNCTION bulk_update_project_tracking(p_updates jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.bulk_update_project_tracking(p_updates jsonb) IS 'Projeler ekranında yalnız değişen satırların takip alanlarını tek sorguda günceller.';


--
-- Name: can_view_all(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_view_all() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
  select coalesce(
    public.current_user_role() in ('site_chief', 'company_manager'),
    false
  );
$$;


--
-- Name: can_view_personnel_attendance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_view_personnel_attendance() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
  select coalesce(
    public.current_user_role()
      in ('site_chief', 'company_manager', 'accounting'),
    false
  );
$$;


--
-- Name: cancel_project(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_project(p_project_id uuid, p_reason text) RETURNS public.projects
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_project public.projects;
begin
  if not public.has_module_write_permission('projects') then raise exception 'Proje iptal yetkiniz yok' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 3 then raise exception 'İptal sebebi en az 3 karakter olmalıdır'; end if;
  select * into v_project from public.projects where id=p_project_id for update;
  if not found then raise exception 'Proje bulunamadı'; end if;
  if v_project.is_cancelled then raise exception 'Proje zaten iptal edilmiş'; end if;
  if v_project.is_archived or v_project.status='completed' then raise exception 'Biten veya arşivlenmiş proje iptal edilemez'; end if;
  if v_project.status not in ('waiting','in_progress') then raise exception 'Yalnızca Başlamadı veya Devam Ediyor durumundaki proje iptal edilebilir'; end if;

  insert into public.project_cancellation_history(project_id,reason,cancelled_by)
  values(p_project_id,trim(p_reason),auth.uid());
  update public.projects set is_cancelled=true,cancellation_reason=trim(p_reason),cancelled_at=now(),cancelled_by=auth.uid(),is_archived=false,archived_at=null,updated_by=auth.uid()
  where id=p_project_id returning * into v_project;
  return v_project;
end $$;


--
-- Name: create_biga_inventory_shipment(date, text, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_biga_inventory_shipment(p_shipment_date date, p_delivered_by text, p_received_by text, p_vehicle_plate text, p_notes text, p_items jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_shipment_id uuid; v_item jsonb; v_material public.inventory_materials; v_material_id uuid; v_quantity numeric;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode='42501'; end if;
  if p_shipment_date is null then raise exception 'Sevkiyat tarihi zorunlu'; end if;
  if char_length(trim(coalesce(p_delivered_by,'')))<2 then raise exception 'Teslim eden zorunlu'; end if;
  if char_length(trim(coalesce(p_received_by,'')))<2 then raise exception 'Teslim alan zorunlu'; end if;
  if char_length(trim(coalesce(p_vehicle_plate,'')))<2 then raise exception 'Araç bilgisi zorunlu'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'En az bir malzeme eklenmelidir'; end if;
  if (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct value->>'material_id') from jsonb_array_elements(p_items)) then raise exception 'Aynı malzeme sevkiyat listesine iki kez eklenemez'; end if;
  insert into public.inventory_shipments(shipment_date,delivered_by,received_by,vehicle_id,vehicle_plate,notes,created_by)
  values(p_shipment_date,trim(p_delivered_by),trim(p_received_by),null,upper(trim(p_vehicle_plate)),nullif(trim(p_notes),''),auth.uid()) returning id into v_shipment_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_material_id := (v_item->>'material_id')::uuid; v_quantity := (v_item->>'quantity')::numeric;
    if v_quantity is null or v_quantity<=0 then raise exception 'Sevk miktarı sıfırdan büyük olmalıdır'; end if;
    select * into v_material from public.inventory_materials where id=v_material_id and material_category='stock' for update;
    if not found then raise exception 'Sevk edilecek malzeme bulunamadı'; end if;
    if v_material.unit='piece' and v_quantity<>trunc(v_quantity) then raise exception '% için adet miktarı tam sayı olmalıdır',v_material.material_name; end if;
    if v_material.stock_quantity<v_quantity then raise exception '% için Merkez Şantiye stoku yetersiz. Mevcut: %',v_material.material_name,v_material.stock_quantity; end if;
    update public.inventory_materials set stock_quantity=stock_quantity-v_quantity,biga_stock_quantity=biga_stock_quantity+v_quantity,updated_by=auth.uid() where id=v_material_id returning * into v_material;
    insert into public.inventory_shipment_items(shipment_id,material_id,quantity) values(v_shipment_id,v_material_id,v_quantity);
    insert into public.inventory_movements(material_id,movement_type,quantity,usage_location,description,balance_after,created_by,action_type,source_location,target_location,shipment_id)
    values(v_material_id,'out',v_quantity,'AZG BİGA ŞUBE',nullif(trim(p_notes),''),v_material.stock_quantity,auth.uid(),'transfer','center','biga',v_shipment_id);
  end loop;
  return v_shipment_id;
end;
$$;


--
-- Name: create_custody_material(text, text, public.inventory_unit, numeric, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_custody_material(p_material_name text, p_material_code text, p_unit public.inventory_unit, p_initial_quantity numeric, p_vehicle_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_id uuid; v_plate text;
begin
  if not public.has_module_write_permission('custody') then
    raise exception 'Araç ekipmanı işlem yetkisi gerekli' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_material_name,''))) < 2 then raise exception 'Malzeme adı zorunlu'; end if;
  if p_initial_quantity is null or p_initial_quantity <= 0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
  if p_unit = 'piece' and p_initial_quantity <> trunc(p_initial_quantity) then raise exception 'Adet tam sayı olmalıdır'; end if;
  insert into public.inventory_materials
    (material_code, material_name, unit, stock_quantity, notes, material_category, created_by, updated_by)
  values (nullif(trim(p_material_code),''), trim(p_material_name), p_unit,
    case when p_vehicle_id is null then p_initial_quantity else 0 end,
    nullif(trim(p_notes),''), 'equipment', auth.uid(), auth.uid()) returning id into v_id;
  insert into public.inventory_movements
    (material_id, movement_type, quantity, description, balance_after, created_by)
  values (v_id, 'in', p_initial_quantity, 'İlk araç ekipmanı girişi',
    case when p_vehicle_id is null then p_initial_quantity else 0 end, auth.uid());
  if p_vehicle_id is not null then
    select plate into v_plate from public.vehicles where id = p_vehicle_id;
    if v_plate is null then raise exception 'Araç bulunamadı'; end if;
    insert into public.inventory_custody_balances
      (material_id, holder_type, holder_id, holder_name, quantity, updated_by)
    values (v_id, 'vehicle', p_vehicle_id, v_plate, p_initial_quantity, auth.uid());
    insert into public.inventory_custody_movements
      (material_id, from_type, from_id, from_name, to_type, to_id, to_name, quantity, notes, created_by)
    values (v_id, 'warehouse', null, 'Yeni Malzeme Girişi', 'vehicle', p_vehicle_id,
      v_plate, p_initial_quantity, 'İlk girişte araca zimmetlendi', auth.uid());
  end if;
  return v_id;
end;
$$;


--
-- Name: create_hp_project_with_sheets(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_hp_project_with_sheets(p_project jsonb, p_sheets jsonb) RETURNS SETOF public.projects
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare created public.projects; sheet_count integer; unique_count integer;
begin
  select jsonb_array_length(p_sheets) into sheet_count;
  if sheet_count<1 then raise exception 'En az bir pafta girilmelidir.' using errcode='P0001'; end if;
  select count(distinct lower(trim(x.sheet_no))) into unique_count from jsonb_to_recordset(p_sheets) as x(sheet_no text,address text,hp_count integer,notes text);
  if unique_count<>sheet_count then raise exception 'Aynı pafta numarası bir projede birden fazla kullanılamaz.' using errcode='P0001'; end if;
  if exists(select 1 from jsonb_to_recordset(p_sheets) as x(sheet_no text,address text,hp_count integer,notes text) where trim(coalesce(x.sheet_no,''))='') then raise exception 'Her pafta için pafta numarası girilmelidir.' using errcode='P0001'; end if;
  select * into created from public.projects where project_code=trim(p_project->>'project_code') for update;
  if found then
    if created.project_type<>'HP_ODAKLI' or exists(select 1 from public.project_sheets where project_id=created.id) then raise unique_violation using message='Bu Proje ID zaten kayıtlı.'; end if;
    update public.projects set name=trim(p_project->>'name'),location=coalesce(nullif(trim(p_project->>'location'),''),'Adres belirtilmedi'),description=nullif(trim(p_project->>'description'),''),sheet_count=sheet_count,updated_by=(p_project->>'updated_by')::uuid where id=created.id returning * into created;
  else
    insert into public.projects(project_code,name,project_type,location,description,status,received_at,waiting_at,tracks_obk,tracks_excavation,tracks_cable,tracks_joint,sheet_count,hp_count,is_single_sheet,created_by,updated_by)
    values(trim(p_project->>'project_code'),trim(p_project->>'name'),'HP_ODAKLI',coalesce(nullif(trim(p_project->>'location'),''),'Adres belirtilmedi'),nullif(trim(p_project->>'description'),''),'waiting',coalesce((p_project->>'received_at')::date,current_date),coalesce((p_project->>'received_at')::date,current_date),false,false,false,false,sheet_count,null,false,(p_project->>'created_by')::uuid,(p_project->>'updated_by')::uuid) returning * into created;
  end if;
  insert into public.project_sheets(project_id,name,sheet_no,address,hp_count,notes,manual_status,tracks_cable,tracks_joint,tracks_obk,tracks_excavation,created_by)
  select created.id,trim(x.sheet_no),trim(x.sheet_no),nullif(trim(x.address),''),coalesce(x.hp_count,0),nullif(trim(x.notes),''),'not_started',false,false,false,false,(p_project->>'created_by')::uuid
  from jsonb_to_recordset(p_sheets) as x(sheet_no text,address text,hp_count integer,notes text);
  return next created;
end; $$;


--
-- Name: create_inventory_catalog_material(text, text, text, text, public.inventory_unit, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_inventory_catalog_material(p_material_name text, p_stock_category text, p_material_type text, p_size text, p_unit public.inventory_unit, p_has_id boolean, p_notes text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_id uuid; begin
 if not public.has_module_write_permission('inventory') then raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode='42501'; end if;
 if char_length(trim(coalesce(p_material_name,'')))<2 then raise exception 'Malzeme adı zorunlu'; end if;
 if p_stock_category not in('fiber_cable','copper_network','underground','fiber_accessory') then raise exception 'Kategori zorunlu'; end if;
 insert into public.inventory_catalog(material_name,stock_category,material_type,size,unit,has_id,notes,created_by)
 values(trim(p_material_name),p_stock_category,nullif(trim(p_material_type),''),nullif(trim(p_size),''),p_unit,coalesce(p_has_id,false),nullif(trim(p_notes),''),auth.uid()) returning id into v_id; return v_id;
end $$;


--
-- Name: inventory_materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    material_code text,
    material_name text NOT NULL,
    unit public.inventory_unit NOT NULL,
    stock_quantity numeric(14,3) DEFAULT 0 NOT NULL,
    notes text,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    material_category text DEFAULT 'stock'::text NOT NULL,
    biga_stock_quantity numeric(14,3) DEFAULT 0 NOT NULL,
    stock_category text,
    material_type text,
    size text,
    catalog_id uuid,
    CONSTRAINT inventory_biga_stock_nonnegative CHECK ((biga_stock_quantity >= (0)::numeric)),
    CONSTRAINT inventory_material_name_length CHECK ((char_length(TRIM(BOTH FROM material_name)) >= 2)),
    CONSTRAINT inventory_material_stock_nonnegative CHECK ((stock_quantity >= (0)::numeric)),
    CONSTRAINT inventory_materials_material_category_check CHECK ((material_category = ANY (ARRAY['stock'::text, 'equipment'::text]))),
    CONSTRAINT inventory_piece_stock_integer CHECK (((unit <> 'piece'::public.inventory_unit) OR (stock_quantity = trunc(stock_quantity)))),
    CONSTRAINT inventory_stock_category_check CHECK ((((material_category = 'stock'::text) AND (stock_category = ANY (ARRAY['fiber_accessory'::text, 'fiber_cable'::text, 'copper_network'::text, 'underground'::text]))) OR ((material_category = 'equipment'::text) AND (stock_category IS NULL))))
);


--
-- Name: TABLE inventory_materials; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.inventory_materials IS 'Güncel malzeme stok bakiyeleri';


--
-- Name: COLUMN inventory_materials.material_category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.inventory_materials.material_category IS 'stock: kablo, direk, beton kaide, kutu gibi saha sarfları; equipment: araç/depo el aleti ve ekipmanları';


--
-- Name: create_inventory_material(text, text, public.inventory_unit, numeric, text, date, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_inventory_material(p_material_name text, p_material_code text, p_unit public.inventory_unit, p_initial_quantity numeric, p_stock_category text, p_receipt_date date, p_received_by text, p_dispatch_number text, p_notes text DEFAULT NULL::text) RETURNS public.inventory_materials
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_material public.inventory_materials;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_material_name,'')))<2 then raise exception 'Malzeme cinsi zorunlu'; end if;
  if p_stock_category not in ('fiber_accessory','fiber_cable','copper_network','underground') then raise exception 'Malzeme kategorisi zorunlu'; end if;
  if p_initial_quantity is null or p_initial_quantity<=0 then raise exception 'Başlangıç miktarı sıfırdan büyük olmalıdır'; end if;
  if p_unit='piece' and p_initial_quantity<>trunc(p_initial_quantity) then raise exception 'Adet miktarı tam sayı olmalıdır'; end if;
  if p_receipt_date is null then raise exception 'Giriş tarihi zorunlu'; end if;
  if char_length(trim(coalesce(p_received_by,'')))<2 then raise exception 'Teslim alan zorunlu'; end if;
  if char_length(trim(coalesce(p_dispatch_number,'')))<1 then raise exception 'İrsaliye numarası zorunlu'; end if;

  insert into public.inventory_materials(material_code,material_name,unit,stock_quantity,stock_category,notes,created_by,updated_by)
  values(nullif(trim(p_material_code),''),trim(p_material_name),p_unit,p_initial_quantity,p_stock_category,nullif(trim(p_notes),''),auth.uid(),auth.uid()) returning * into v_material;
  insert into public.inventory_movements(material_id,movement_type,quantity,description,balance_after,created_by,action_type,target_location,receipt_date,received_by,dispatch_number)
  values(v_material.id,'in',p_initial_quantity,'İlk stok girişi',p_initial_quantity,auth.uid(),'in','center',p_receipt_date,trim(p_received_by),trim(p_dispatch_number));
  return v_material;
end;
$$;


--
-- Name: create_inventory_receipt(date, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_inventory_receipt(p_receipt_date date, p_received_by text, p_dispatch_number text, p_notes text, p_items jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_id uuid; v_item jsonb; v_catalog public.inventory_catalog; v_material public.inventory_materials; v_mid uuid; v_qty numeric; v_code text;
begin
 if not public.has_module_write_permission('inventory') then raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode='42501'; end if;
 if p_receipt_date is null or char_length(trim(coalesce(p_received_by,'')))<2 or char_length(trim(coalesce(p_dispatch_number,'')))<1 then raise exception 'Tarih, teslim alan ve irsaliye numarası zorunlu'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'En az bir malzeme eklenmelidir'; end if;
 insert into public.inventory_receipts(receipt_date,received_by,dispatch_number,notes,created_by) values(p_receipt_date,trim(p_received_by),trim(p_dispatch_number),nullif(trim(p_notes),''),auth.uid()) returning id into v_id;
 for v_item in select value from jsonb_array_elements(p_items) loop
  select * into v_catalog from public.inventory_catalog where id=(v_item->>'catalog_id')::uuid;
  if not found then raise exception 'Katalog malzemesi bulunamadı'; end if;
  v_qty:=(v_item->>'quantity')::numeric; v_code:=nullif(trim(v_item->>'material_code'),'');
  if v_qty is null or v_qty<=0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
  if v_catalog.unit='piece' and v_qty<>trunc(v_qty) then raise exception 'Adet miktarı tam sayı olmalıdır'; end if;
  if v_catalog.has_id and v_code is null then raise exception '% için malzeme ID zorunlu',v_catalog.material_name; end if;
  if not v_catalog.has_id then v_code:=null; end if;
  if v_code is not null and exists(select 1 from public.inventory_materials where lower(trim(material_code))=lower(v_code)) then
   raise exception 'Bu malzeme ID daha önce kullanılmış: %',v_code;
  end if;
  select * into v_material from public.inventory_materials where catalog_id=v_catalog.id and unit=v_catalog.unit and coalesce(material_code,'')=coalesce(v_code,'') for update;
  if not found then
   insert into public.inventory_materials(catalog_id,material_code,material_name,stock_category,material_type,size,unit,stock_quantity,biga_stock_quantity,notes,created_by,updated_by)
   values(v_catalog.id,v_code,v_catalog.material_name,v_catalog.stock_category,v_catalog.material_type,v_catalog.size,v_catalog.unit,0,0,v_catalog.notes,auth.uid(),auth.uid()) returning * into v_material;
  end if;
  update public.inventory_materials set stock_quantity=stock_quantity+v_qty,updated_by=auth.uid() where id=v_material.id returning * into v_material;
  insert into public.inventory_receipt_items(receipt_id,material_id,quantity) values(v_id,v_material.id,v_qty);
  insert into public.inventory_movements(material_id,movement_type,quantity,description,balance_after,created_by,action_type,target_location,receipt_date,received_by,dispatch_number,receipt_id)
  values(v_material.id,'in',v_qty,'İrsaliye ile stok girişi',v_material.stock_quantity,auth.uid(),'in','center',p_receipt_date,trim(p_received_by),trim(p_dispatch_number),v_id);
 end loop; return v_id;
end $$;


--
-- Name: create_inventory_request(date, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_inventory_request(p_request_date date, p_requested_by text, p_notes text, p_items jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_request_id uuid; v_item jsonb; v_new jsonb; v_catalog_id uuid; v_qty numeric; v_unit public.inventory_unit;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Malzeme talep yetkisi gerekli' using errcode='42501'; end if;
  if p_request_date is null or char_length(trim(coalesce(p_requested_by,''))) < 2 then raise exception 'Talep tarihi ve talep eden zorunlu'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'En az bir talep kalemi eklenmelidir'; end if;
  insert into public.inventory_requests(request_date,requested_by,notes,created_by)
  values(p_request_date,trim(p_requested_by),nullif(trim(p_notes),''),auth.uid()) returning id into v_request_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
    if nullif(v_item->>'catalog_id','') is not null then
      v_catalog_id := (v_item->>'catalog_id')::uuid;
      select unit into v_unit from public.inventory_catalog where id=v_catalog_id;
      if not found then raise exception 'Katalog malzemesi bulunamadı'; end if;
    else
      v_new := v_item->'new_catalog';
      if v_new is null or char_length(trim(coalesce(v_new->>'material_name',''))) < 2 then raise exception 'Yeni malzeme adı zorunlu'; end if;
      if v_new->>'stock_category' not in ('fiber_cable','copper_network','underground','fiber_accessory') then raise exception 'Yeni malzeme kategorisi zorunlu'; end if;
      v_unit := (v_new->>'unit')::public.inventory_unit;
      insert into public.inventory_catalog(material_name,stock_category,material_type,size,unit,has_id,notes,created_by)
      values(trim(v_new->>'material_name'),v_new->>'stock_category',nullif(trim(v_new->>'material_type'),''),nullif(trim(v_new->>'size'),''),v_unit,coalesce((v_new->>'has_id')::boolean,false),nullif(trim(v_new->>'notes'),''),auth.uid())
      returning id into v_catalog_id;
    end if;
    if v_unit='piece' and v_qty<>trunc(v_qty) then raise exception 'Adet miktarı tam sayı olmalıdır'; end if;
    insert into public.inventory_request_items(request_id,catalog_id,quantity) values(v_request_id,v_catalog_id,v_qty);
  end loop;
  return v_request_id;
end $$;


--
-- Name: shared_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shared_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    note_date date DEFAULT CURRENT_DATE NOT NULL,
    CONSTRAINT shared_notes_content_length CHECK (((char_length(TRIM(BOTH FROM content)) >= 2) AND (char_length(TRIM(BOTH FROM content)) <= 5000))),
    CONSTRAINT shared_notes_title_length CHECK (((char_length(TRIM(BOTH FROM title)) >= 2) AND (char_length(TRIM(BOTH FROM title)) <= 150)))
);


--
-- Name: COLUMN shared_notes.created_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shared_notes.created_by IS 'Notu oluşturan kullanıcı; hesap silinirse not geçmişi korunur.';


--
-- Name: create_shared_note(text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_shared_note(p_title text, p_note_date date) RETURNS public.shared_notes
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
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


--
-- Name: current_user_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_user_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
  select case
    when p.is_approved then p.role
    else 'pending'
  end
  from public.profiles p
  where p.id = auth.uid();
$$;


--
-- Name: delete_biga_inventory_shipment(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_biga_inventory_shipment(p_shipment_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_item record; v_material public.inventory_materials;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Sevkiyat silme yetkisi gerekli' using errcode='42501'; end if;
  if not exists(select 1 from public.inventory_shipments where id=p_shipment_id) then raise exception 'Sevkiyat bulunamadı'; end if;
  for v_item in select * from public.inventory_shipment_items where shipment_id=p_shipment_id loop
    select * into v_material from public.inventory_materials where id=v_item.material_id for update;
    if v_material.biga_stock_quantity<v_item.quantity then raise exception '% sevkiyatı silinemez; Biga stokunun bir kısmı kullanılmış',v_material.material_name; end if;
    update public.inventory_materials set stock_quantity=stock_quantity+v_item.quantity,biga_stock_quantity=biga_stock_quantity-v_item.quantity,updated_by=auth.uid() where id=v_item.material_id;
  end loop;
  delete from public.inventory_shipments where id=p_shipment_id;
end;
$$;


--
-- Name: delete_inactive_personnel_without_earned_days(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_inactive_personnel_without_earned_days(p_personnel_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare
  v_is_active boolean;
begin
  if auth.uid() is null
    or not public.has_module_write_permission('personnel') then
    raise exception 'Personel silme yetkiniz yok' using errcode = '42501';
  end if;

  select is_active into v_is_active
  from public.personnel
  where id = p_personnel_id;

  if not found then
    raise exception 'Personel bulunamadı';
  end if;
  if v_is_active then
    raise exception 'Aktif personel silinemez';
  end if;
  if exists (
    select 1
    from public.attendance_records
    where personnel_id = p_personnel_id
      and status::text in ('worked', 'weekly_rest')
  ) then
    raise exception 'Hak edilmiş günü bulunan personel silinemez';
  end if;

  delete from public.personnel_advances where personnel_id = p_personnel_id;
  delete from public.personnel where id = p_personnel_id;
  return true;
end;
$$;


--
-- Name: delete_inventory_catalog_with_history(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_inventory_catalog_with_history(p_catalog_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_material record;
begin
 if not public.has_module_write_permission('inventory') then raise exception 'Malzeme silme yetkisi gerekli' using errcode='42501'; end if;
 if not exists(select 1 from public.inventory_catalog where id=p_catalog_id) then raise exception 'Katalog malzemesi bulunamadı'; end if;
 for v_material in select id from public.inventory_materials where catalog_id=p_catalog_id loop
  delete from public.inventory_movements where material_id=v_material.id;
  delete from public.inventory_shipment_items where material_id=v_material.id;
  delete from public.inventory_receipt_items where material_id=v_material.id;
 end loop;
 delete from public.inventory_shipments s where not exists(select 1 from public.inventory_shipment_items i where i.shipment_id=s.id);
 delete from public.inventory_receipts r where not exists(select 1 from public.inventory_receipt_items i where i.receipt_id=r.id);
 delete from public.inventory_catalog where id=p_catalog_id;
end $$;


--
-- Name: delete_inventory_material_with_history(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_inventory_material_with_history(p_material_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
begin
 if not public.has_module_write_permission('inventory') then raise exception 'Malzeme silme yetkisi gerekli' using errcode='42501'; end if;
 if not exists(select 1 from public.inventory_materials where id=p_material_id and material_category='stock') then raise exception 'Malzeme bulunamadı'; end if;
 delete from public.inventory_movements where material_id=p_material_id;
 delete from public.inventory_shipment_items where material_id=p_material_id;
 delete from public.inventory_receipt_items where material_id=p_material_id;
 delete from public.inventory_shipments s where not exists(select 1 from public.inventory_shipment_items i where i.shipment_id=s.id);
 delete from public.inventory_receipts r where not exists(select 1 from public.inventory_receipt_items i where i.receipt_id=r.id);
 delete from public.inventory_materials where id=p_material_id;
end $$;


--
-- Name: delete_inventory_movement(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_inventory_movement(p_movement_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_move public.inventory_movements; v_material public.inventory_materials;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Stok hareketi silme yetkisi gerekli' using errcode='42501'; end if;
  select * into v_move from public.inventory_movements where id=p_movement_id for update;
  if not found then raise exception 'Stok hareketi bulunamadı'; end if;
  if v_move.shipment_id is not null then raise exception 'Bu hareket sevkiyat kaydına bağlıdır; sevkiyat listesinden silinmelidir'; end if;
  select * into v_material from public.inventory_materials where id=v_move.material_id for update;
  if v_move.action_type='transfer' then
    if v_material.biga_stock_quantity<v_move.quantity then raise exception 'Bu sevkiyat silinemez; Biga stokunun bir kısmı kullanılmış'; end if;
    update public.inventory_materials set stock_quantity=stock_quantity+v_move.quantity,biga_stock_quantity=biga_stock_quantity-v_move.quantity,updated_by=auth.uid() where id=v_move.material_id;
  elsif v_move.action_type='usage' then
    if coalesce(v_move.source_location,'center')='biga' then update public.inventory_materials set biga_stock_quantity=biga_stock_quantity+v_move.quantity,updated_by=auth.uid() where id=v_move.material_id;
    else update public.inventory_materials set stock_quantity=stock_quantity+v_move.quantity,updated_by=auth.uid() where id=v_move.material_id; end if;
  else
    if coalesce(v_move.target_location,'center')='biga' then
      if v_material.biga_stock_quantity<v_move.quantity then raise exception 'Bu giriş silinemez; stokun bir kısmı kullanılmış'; end if;
      update public.inventory_materials set biga_stock_quantity=biga_stock_quantity-v_move.quantity,updated_by=auth.uid() where id=v_move.material_id;
    else
      if v_material.stock_quantity<v_move.quantity then raise exception 'Bu giriş silinemez; stokun bir kısmı kullanılmış veya sevk edilmiş'; end if;
      update public.inventory_materials set stock_quantity=stock_quantity-v_move.quantity,updated_by=auth.uid() where id=v_move.material_id;
    end if;
  end if;
  delete from public.inventory_movements where id=p_movement_id;
end;
$$;


--
-- Name: delete_production_entry(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_production_entry(p_entry_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$ begin
  if not public.has_module_write_permission('productions') then raise exception 'İmalat silme yetkisi gerekli' using errcode='42501'; end if;
  delete from public.production_entries where id=p_entry_id;
end; $$;


--
-- Name: enforce_role_user_limits(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_role_user_limits() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare
  v_role_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('mk-ops-role-assignment'));

  if new.is_approved = true and new.role = 'company_manager' then
    select count(*)::integer
    into v_role_count
    from public.profiles
    where role = 'company_manager'
      and is_approved = true
      and id <> new.id;

    if v_role_count >= 3 then
      raise exception 'En fazla 3 şirket yöneticisi atanabilir';
    end if;
  end if;

  if new.is_approved = true and new.role = 'accounting' then
    select count(*)::integer
    into v_role_count
    from public.profiles
    where role = 'accounting'
      and is_approved = true
      and id <> new.id;

    if v_role_count >= 2 then
      raise exception 'En fazla 2 muhasebe kullanıcısı atanabilir';
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: FUNCTION enforce_role_user_limits(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.enforce_role_user_limits() IS 'En fazla 3 şirket yöneticisi ve 2 muhasebe kullanıcısı atanmasını sağlar.';


--
-- Name: ensure_current_sunday_attendance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_current_sunday_attendance() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
begin
  if extract(isodow from current_date) <> 7 then
    return 0;
  end if;

  return public.ensure_sunday_attendance_for_month(
    extract(year from current_date)::integer,
    extract(month from current_date)::integer
  );
end;
$$;


--
-- Name: ensure_sunday_attendance_for_month(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_sunday_attendance_for_month(p_year integer, p_month integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare
  v_month_start date;
  v_month_end date;
  v_today date := timezone('Europe/Istanbul', now())::date;
  v_now_time time := timezone('Europe/Istanbul', now())::time;
  v_last_date date;
  v_inserted integer;
begin
  if auth.uid() is not null and not public.has_module_write_permission('attendance') then return 0; end if;
  if p_year < 2000 or p_year > 2100 or p_month < 1 or p_month > 12 then raise exception 'Geçersiz ay veya yıl'; end if;
  v_month_start := make_date(p_year,p_month,1);
  v_month_end := (v_month_start + interval '1 month - 1 day')::date;
  v_last_date := least(v_month_end,case when v_now_time >= time '09:00' then v_today else v_today-1 end);
  if v_last_date < v_month_start then return 0; end if;
  insert into public.attendance_records(personnel_id,attendance_date,status,is_auto_generated)
  select p.id,d.attendance_date,'weekly_rest'::public.attendance_status,true
  from public.personnel p
  cross join lateral (
    select generated_date::date attendance_date
    from generate_series(v_month_start::timestamp,v_last_date::timestamp,interval '1 day') generated_date
    where extract(isodow from generated_date)=7
  ) d
  where coalesce(p.employment_start_date,(p.created_at at time zone 'Europe/Istanbul')::date)<=d.attendance_date
    and (p.employment_end_date is null or p.employment_end_date>=d.attendance_date)
  on conflict(personnel_id,attendance_date) do nothing;
  get diagnostics v_inserted=row_count;
  return v_inserted;
end;
$$;


--
-- Name: get_attendance_month_archives(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_attendance_month_archives() RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with months as (
    select
      date_trunc('month', a.attendance_date)::date as month_start,
      count(*) filter (where a.status = 'worked')::integer as worked,
      count(*) filter (where a.status = 'absent')::integer as absent,
      count(*) filter (where a.status = 'leave')::integer as leave,
      count(*) filter (where a.status = 'medical_report')::integer as medical_report,
      count(*) filter (where a.status = 'weekly_rest')::integer as weekly_rest,
      count(distinct a.attendance_date) filter (
        where a.status = 'worked'
          and extract(isodow from a.attendance_date) = 7
      )::integer as sunday_worked
    from public.attendance_records a
    where a.attendance_date <= (now() at time zone 'Europe/Istanbul')::date
    group by date_trunc('month', a.attendance_date)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'year', extract(year from m.month_start)::integer,
        'month', extract(month from m.month_start)::integer,
        'active_personnel', (
          select count(*)::integer
          from public.personnel p
          where coalesce(
            p.employment_start_date,
            (p.created_at at time zone 'Europe/Istanbul')::date
          ) <= (m.month_start + interval '1 month - 1 day')::date
          and (
            p.employment_end_date is null
            or p.employment_end_date >= m.month_start
          )
        ),
        'worked', m.worked,
        'absent', m.absent,
        'leave', m.leave,
        'medical_report', m.medical_report,
        'weekly_rest', m.weekly_rest,
        'sunday_worked', m.sunday_worked
      ) order by m.month_start desc
    ),
    '[]'::jsonb
  )
  from months m;
$$;


--
-- Name: get_dashboard_overview(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_dashboard_overview() RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare v_result jsonb;
begin
  with hp_units as (
    select 'HP_ODAKLI'::text category,ps.id unit_id,
      case ps.manual_status when 'completed' then 'completed' when 'excavation_permit_waiting' then 'excavation_waiting'
        when 'in_progress' then 'in_progress' else 'not_started' end stage
    from public.project_sheets ps join public.projects p on p.id=ps.project_id where p.project_type='HP_ODAKLI'
  ), corporate_units as (
    select 'KURUMSAL_TTVPN'::text category,p.id unit_id,
      case p.status when 'completed' then 'completed' when 'excavation_permit_waiting' then 'excavation_waiting'
        when 'waiting' then 'not_started' else 'in_progress' end stage
    from public.projects p where p.project_type='KURUMSAL_TTVPN'
  ), bgfd_units as (
    select 'BGFD'::text category,p.id unit_id,
      case p.status when 'completed' then 'completed' when 'excavation_permit_waiting' then 'excavation_waiting'
        when 'waiting' then 'not_started' else 'in_progress' end stage
    from public.projects p where p.project_type='BGFD'
  ), units as (
    select * from hp_units union all select * from corporate_units union all select * from bgfd_units
  ), requested(category,label,unit_label,sort_order) as (
    values ('HP_ODAKLI'::text,'HP Odaklı'::text,'Pafta'::text,1),
      ('KURUMSAL_TTVPN','Kurumsal TTVPN','Proje',2),('BGFD','BGFD','Proje',3)
  ), category_analysis as (
    select r.category,r.label,r.unit_label,r.sort_order,count(u.unit_id)::int total,
      count(u.unit_id) filter(where u.stage='not_started')::int not_started,
      count(u.unit_id) filter(where u.stage='in_progress')::int in_progress,
      count(u.unit_id) filter(where u.stage='excavation_waiting')::int excavation_waiting,
      count(u.unit_id) filter(where u.stage='completed')::int completed
    from requested r left join units u on u.category=r.category group by r.category,r.label,r.unit_label,r.sort_order
  ), bgfd_subcategories as (
    select cabinet_type::text label,count(*)::int count from public.project_cabinets c
    join public.projects p on p.id=c.project_id where p.project_type='BGFD' group by cabinet_type
  )
  select jsonb_build_object(
    'stats',jsonb_build_object(
      'total',(select count(*)::int from public.projects where not is_archived),
      'waiting',(select count(*)::int from public.projects where not is_archived and status='waiting'),
      'in_progress',(select count(*)::int from public.projects where not is_archived and status='in_progress'),
      'excavation_permit_waiting',(select count(*)::int from public.projects where not is_archived and status='excavation_permit_waiting'),
      'delayed',(select count(*)::int from public.projects where not is_archived and status='delayed'),
      'completed',(select count(*)::int from public.projects where status='completed'),
      'archived',(select count(*)::int from public.projects where is_archived)),
    'categories',(select coalesce(jsonb_agg(jsonb_build_object(
      'category',category,'label',label,'unit_label',unit_label,'total',total,
      'not_started',not_started,'in_progress',in_progress,'excavation_waiting',excavation_waiting,
      'completed',completed,'obk_waiting',0,'cable_waiting',0,'delayed',0,
      'subcategories',case when category='BGFD' then (select coalesce(jsonb_agg(jsonb_build_object('label',b.label,'count',b.count)
        order by case b.label when 'T7' then 1 when 'T9' then 2 when 'T11' then 3 when 'T21' then 4 when 'T23' then 5 else 99 end),'[]'::jsonb) from bgfd_subcategories b) else '[]'::jsonb end
    ) order by sort_order),'[]'::jsonb) from category_analysis),
    'critical',jsonb_build_object(
      'delayed',(select count(*)::int from public.projects where not is_archived and status='delayed'),
      'excavation_waiting',(select count(*)::int from public.projects where not is_archived and status='excavation_permit_waiting'),
      'obk_waiting',0,'cable_waiting',0),
    'recently_updated',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select * from public.projects where not is_archived order by updated_at desc limit 8)x),
    'recently_created',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select * from public.projects where not is_archived order by created_at desc limit 8)x)
  ) into v_result;
  return v_result;
end; $$;


--
-- Name: FUNCTION get_dashboard_overview(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_dashboard_overview() IS 'Dashboard kartları, kategori grafikleri, kritik durumlar ve son projeler için tek sorguluk özet.';


--
-- Name: get_dashboard_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_dashboard_stats() RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'total',
      (select count(*)::int from public.projects where is_archived = false),
    'waiting',
      (select count(*)::int from public.projects where is_archived = false and status = 'waiting'),
    'in_progress',
      (select count(*)::int from public.projects
       where is_archived = false
       and status in ('in_progress', 'excavation_permit_waiting', 'delayed')),
    'excavation_permit_waiting',
      (select count(*)::int from public.projects where is_archived = false and status = 'excavation_permit_waiting'),
    'delayed',
      (select count(*)::int from public.projects where is_archived = false and status = 'delayed'),
    'completed',
      (select count(*)::int from public.projects where status = 'completed'),
    'archived',
      (select count(*)::int from public.projects where is_archived = true)
  );
$$;


--
-- Name: get_location_suggestions(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_location_suggestions(p_query text DEFAULT ''::text, p_limit integer DEFAULT 20) RETURNS TABLE(value text)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select distinct p.location as value
  from public.projects p
  where p_query = '' or p.location ilike '%' || p_query || '%'
  order by p.location
  limit greatest(1, least(p_limit, 50));
$$;


--
-- Name: get_monthly_attendance(integer, integer, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_monthly_attendance(p_year integer, p_month integer, p_active_filter text DEFAULT 'active'::text, p_search text DEFAULT ''::text, p_status_filter text DEFAULT 'all'::text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_month_start date;
  v_month_end date;
  v_result jsonb;
begin
  if p_year < 2000 or p_year > 2100 or p_month < 1 or p_month > 12 then
    raise exception 'Geçersiz ay veya yıl';
  end if;
  if p_active_filter not in ('active', 'passive', 'all') then
    raise exception 'Geçersiz personel filtresi';
  end if;
  if p_status_filter not in (
    'all', 'worked', 'absent', 'unexcused_absence', 'leave',
    'medical_report', 'weekly_rest'
  ) then
    raise exception 'Geçersiz puantaj durum filtresi';
  end if;

  perform public.ensure_sunday_attendance_for_month(p_year, p_month);
  v_month_start := make_date(p_year, p_month, 1);
  v_month_end := (v_month_start + interval '1 month - 1 day')::date;

  with monthly_records as (
    select a.*
    from public.attendance_records a
    where a.attendance_date between v_month_start and v_month_end
      and a.attendance_date <= (now() at time zone 'Europe/Istanbul')::date
  ),
  filtered_personnel as (
    select p.*
    from public.personnel p
    where (
      p_active_filter = 'all'
      or (
        p_active_filter = 'active'
        and (
          p.is_active = true
          or exists (
            select 1
            from monthly_records earned_record
            where earned_record.personnel_id = p.id
              and earned_record.status::text in ('worked', 'weekly_rest')
          )
        )
      )
      or (p_active_filter = 'passive' and p.is_active = false)
    )
    and (
      trim(p_search) = ''
      or p.full_name ilike '%' || trim(p_search) || '%'
      or coalesce(p.phone, '') ilike '%' || trim(p_search) || '%'
    )
    and (
      p_status_filter = 'all'
      or exists (
        select 1 from monthly_records filtered_record
        where filtered_record.personnel_id = p.id
          and filtered_record.status::text = p_status_filter
      )
    )
  ),
  personnel_month as (
    select
      p.id, p.full_name, p.phone, p.tc_identity_number, p.is_active,
      p.employment_start_date, p.employment_end_date,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'date', to_char(a.attendance_date, 'YYYY-MM-DD'),
            'status', a.status,
            'is_auto_generated', a.is_auto_generated,
            'leave_type', a.leave_type
          ) order by a.attendance_date
        ) filter (where a.id is not null),
        '[]'::jsonb
      ) as records,
      count(a.id) filter (where a.status::text = 'worked')::integer as worked,
      count(a.id) filter (where a.status::text = 'absent')::integer as absent,
      count(a.id) filter (where a.status::text = 'unexcused_absence')::integer as unexcused_absence,
      count(a.id) filter (where a.status::text = 'leave')::integer as leave,
      count(a.id) filter (where a.status::text = 'medical_report')::integer as medical_report,
      count(a.id) filter (where a.status::text = 'weekly_rest')::integer as weekly_rest
    from filtered_personnel p
    left join monthly_records a on a.personnel_id = p.id
    group by p.id, p.full_name, p.phone, p.tc_identity_number, p.is_active,
      p.employment_start_date, p.employment_end_date
  )
  select jsonb_build_object(
    'year', p_year,
    'month', p_month,
    'active_personnel_ids', (
      select coalesce(jsonb_agg(p.id order by p.full_name), '[]'::jsonb)
      from public.personnel p where p.is_active = true
    ),
    'personnel', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'full_name', full_name,
          'phone', phone,
          'tc_identity_number', tc_identity_number,
          'is_active', is_active,
          'employment_start_date', employment_start_date,
          'employment_end_date', employment_end_date,
          'records', records,
          'totals', jsonb_build_object(
            'worked', worked,
            'absent', absent,
            'unexcused_absence', unexcused_absence,
            'leave', leave,
            'medical_report', medical_report,
            'weekly_rest', weekly_rest
          )
        ) order by full_name
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from personnel_month;

  return v_result;
end;
$$;


--
-- Name: get_monthly_payroll(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_monthly_payroll(p_year integer, p_month integer) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
declare
  v_start date;
  v_end date;
  v_effective_end date;
  v_today date := timezone('Europe/Istanbul',now())::date;
  v_now_time time := timezone('Europe/Istanbul',now())::time;
  v_result jsonb;
begin
  if p_year<2000 or p_year>2100 or p_month<1 or p_month>12 then raise exception 'Geçersiz ay veya yıl'; end if;
  v_start:=make_date(p_year,p_month,1);
  v_end:=(v_start+interval '1 month - 1 day')::date;
  v_effective_end:=least(v_end,case when v_now_time>=time '09:00' then v_today else v_today-1 end);
  select coalesce(jsonb_agg(jsonb_build_object(
    'personnel_id',p.id,'full_name',p.full_name,'monthly_salary',p.monthly_salary,
    'worked_days',coalesce(a.worked_days,0),'weekly_rest_days',coalesce(a.weekly_rest_days,0),
    'payable_days',coalesce(a.worked_days,0)+coalesce(a.weekly_rest_days,0)+coalesce(a.overtime_days,0),
    'absence_days',coalesce(a.absence_days,0),'report_days',coalesce(a.report_days,0),
    'overtime_days',coalesce(a.overtime_days,0),'advance_total',coalesce(v.advance_total,0),'absence_deduction',0,
    'overtime_payment',round((p.monthly_salary/30)*coalesce(a.overtime_days,0),2),
    'gross_accrued',round((p.monthly_salary/30)*(coalesce(a.worked_days,0)+coalesce(a.weekly_rest_days,0)),2),
    'net_receivable',greatest(0,round((p.monthly_salary/30)*(coalesce(a.worked_days,0)+coalesce(a.weekly_rest_days,0)+coalesce(a.overtime_days,0))-coalesce(v.advance_total,0),2))
  ) order by p.full_name),'[]'::jsonb) into v_result
  from public.personnel p
  left join lateral (
    select
      count(*) filter(where ar.status='worked' and extract(isodow from ar.attendance_date)<>7)::integer worked_days,
      count(*) filter(where extract(isodow from ar.attendance_date)=7 and ar.status in ('weekly_rest','worked'))::integer weekly_rest_days,
      count(*) filter(where ar.status::text in('absent','unexcused_absence'))::integer absence_days,
      count(*) filter(where ar.status='medical_report')::integer report_days,
      count(*) filter(where ar.status='worked' and extract(isodow from ar.attendance_date)=7)::integer overtime_days
    from public.attendance_records ar
    where ar.personnel_id=p.id and ar.attendance_date between v_start and v_effective_end
  ) a on true
  left join lateral (
    select coalesce(sum(pa.amount),0) advance_total from public.personnel_advances pa
    where pa.personnel_id=p.id and pa.advance_date between v_start and least(v_end,v_today)
  ) v on true;
  return v_result;
end;
$$;


--
-- Name: get_personnel_attendance_detail(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_personnel_attendance_detail(p_personnel_id uuid, p_year integer, p_month integer) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with limits as (
    select
      make_date(p_year, p_month, 1) as month_start,
      (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date as month_end,
      make_date(p_year, 1, 1) as year_start,
      make_date(p_year, 12, 31) as year_end,
      (now() at time zone 'Europe/Istanbul')::date as today
  ),
  person_records as (
    select a.*
    from public.attendance_records a
    cross join limits l
    where a.personnel_id = p_personnel_id
      and a.attendance_date <= l.today
  ),
  month_totals as (
    select
      count(*) filter (where status = 'worked')::integer as worked,
      count(*) filter (where status = 'absent')::integer as absent,
      count(*) filter (where status = 'leave')::integer as leave,
      count(*) filter (where status = 'medical_report')::integer as medical_report,
      count(*) filter (where status = 'weekly_rest')::integer as weekly_rest,
      count(*) filter (
        where status = 'worked' and extract(isodow from attendance_date) = 7
      )::integer as sunday_worked
    from person_records r cross join limits l
    where r.attendance_date between l.month_start and least(l.month_end, l.today)
  ),
  year_totals as (
    select
      count(*) filter (where status = 'worked')::integer as worked,
      count(*) filter (where status = 'absent')::integer as absent,
      count(*) filter (where status = 'leave')::integer as leave,
      count(*) filter (where status = 'medical_report')::integer as medical_report,
      count(*) filter (where status = 'weekly_rest')::integer as weekly_rest,
      count(*) filter (
        where status = 'worked' and extract(isodow from attendance_date) = 7
      )::integer as sunday_worked,
      count(*)::integer as total
    from person_records r cross join limits l
    where r.attendance_date between l.year_start and least(l.year_end, l.today)
  ),
  month_distribution as (
    select
      month_number,
      count(r.id) filter (where r.status = 'worked')::integer as worked,
      count(r.id) filter (where r.status = 'leave')::integer as leave,
      count(r.id) filter (where r.status = 'medical_report')::integer as medical_report,
      count(r.id)::integer as total
    from generate_series(1, 12) month_number
    cross join limits l
    left join person_records r
      on extract(month from r.attendance_date) = month_number
      and extract(year from r.attendance_date) = p_year
      and r.attendance_date <= l.today
    group by month_number
  ),
  leave_history as (
    select
      extract(year from attendance_date)::integer as year,
      count(*)::integer as days
    from person_records
    where status = 'leave'
    group by extract(year from attendance_date)
    order by year desc
  )
  select jsonb_build_object(
    'personnel_id', p_personnel_id,
    'year', p_year,
    'month', p_month,
    'month_records', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'date', to_char(r.attendance_date, 'YYYY-MM-DD'),
            'status', r.status,
            'leave_type', r.leave_type
          ) order by r.attendance_date
        ),
        '[]'::jsonb
      )
      from person_records r cross join limits l
      where r.attendance_date between l.month_start and least(l.month_end, l.today)
    ),
    'month_totals', (select to_jsonb(mt) from month_totals mt),
    'year_totals', (select to_jsonb(yt) from year_totals yt),
    'month_distribution', (
      select jsonb_agg(to_jsonb(md) order by md.month_number)
      from month_distribution md
    ),
    'leave_history', (
      select coalesce(jsonb_agg(to_jsonb(lh) order by lh.year desc), '[]'::jsonb)
      from leave_history lh
    )
  );
$$;


--
-- Name: get_personnel_attendance_summary(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_personnel_attendance_summary(p_personnel_id uuid, p_year integer, p_month integer) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with month_range as (
    select
      make_date(p_year, p_month, 1) as month_start,
      (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date
        as month_end
  )
  select jsonb_build_object(
    'personnel_id', p.id,
    'full_name', p.full_name,
    'year', p_year,
    'month', p_month,
    'worked', count(a.id) filter (where a.status = 'worked')::integer,
    'absent', count(a.id) filter (where a.status = 'absent')::integer,
    'leave', count(a.id) filter (where a.status = 'leave')::integer,
    'medical_report',
      count(a.id) filter (where a.status = 'medical_report')::integer,
    'weekly_rest',
      count(a.id) filter (where a.status = 'weekly_rest')::integer
  )
  from public.personnel p
  cross join month_range mr
  left join public.attendance_records a
    on a.personnel_id = p.id
    and a.attendance_date between mr.month_start and mr.month_end
  where p.id = p_personnel_id
  group by p.id, p.full_name;
$$;


--
-- Name: get_personnel_list_summaries(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_personnel_list_summaries(p_year integer, p_month integer) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with limits as (
    select
      make_date(p_year, p_month, 1) as month_start,
      (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date as month_end,
      make_date(p_year, 1, 1) as year_start,
      make_date(p_year, 12, 31) as year_end,
      (now() at time zone 'Europe/Istanbul')::date as today
  ),
  personnel_summary as (
    select
      p.id as personnel_id,
      p.full_name,
      count(a.id) filter (
        where a.status = 'worked'
          and a.attendance_date between l.month_start and least(l.month_end, l.today)
      )::integer as month_worked,
      count(a.id) filter (
        where a.status = 'absent'
          and a.attendance_date between l.month_start and least(l.month_end, l.today)
      )::integer as month_absent,
      count(a.id) filter (
        where a.status = 'leave'
          and a.attendance_date between l.month_start and least(l.month_end, l.today)
      )::integer as month_leave,
      count(a.id) filter (
        where a.status = 'medical_report'
          and a.attendance_date between l.month_start and least(l.month_end, l.today)
      )::integer as month_medical_report,
      count(a.id) filter (
        where a.status = 'weekly_rest'
          and a.attendance_date between l.month_start and least(l.month_end, l.today)
      )::integer as month_weekly_rest,
      count(a.id) filter (
        where a.status = 'worked'
          and a.attendance_date between l.year_start and least(l.year_end, l.today)
      )::integer as year_worked,
      count(a.id) filter (
        where a.status = 'leave'
          and a.attendance_date between l.year_start and least(l.year_end, l.today)
      )::integer as year_leave,
      count(a.id) filter (
        where a.status = 'medical_report'
          and a.attendance_date between l.year_start and least(l.year_end, l.today)
      )::integer as year_medical_report
    from public.personnel p
    cross join limits l
    left join public.attendance_records a
      on a.personnel_id = p.id
      and a.attendance_date between l.year_start and least(l.year_end, l.today)
    group by p.id, p.full_name
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'personnel_id', ps.personnel_id,
        'month_worked', ps.month_worked,
        'month_absent', ps.month_absent,
        'month_leave', ps.month_leave,
        'month_medical_report', ps.month_medical_report,
        'month_weekly_rest', ps.month_weekly_rest,
        'year_worked', ps.year_worked,
        'year_leave', ps.year_leave,
        'year_medical_report', ps.year_medical_report
      ) order by ps.full_name
    ),
    '[]'::jsonb
  )
  from personnel_summary ps;
$$;


--
-- Name: get_shared_notes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_shared_notes() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
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


--
-- Name: FUNCTION get_shared_notes(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_shared_notes() IS 'Tarihi geçen notları siler ve kalan notları en yakın tarih önce listeler.';


--
-- Name: get_team_suggestions(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_team_suggestions(p_query text DEFAULT ''::text, p_limit integer DEFAULT 20) RETURNS TABLE(value text)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select distinct p.team_name as value
  from public.projects p
  where p_query = '' or p.team_name ilike '%' || p_query || '%'
  order by p.team_name
  limit greatest(1, least(p_limit, 50));
$$;


--
-- Name: get_team_type_suggestions(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_team_type_suggestions(p_query text DEFAULT ''::text, p_limit integer DEFAULT 20) RETURNS TABLE(value text)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select distinct t.team_type as value
  from public.daily_work_plan_teams t
  where p_query = '' or t.team_type ilike '%' || p_query || '%'
  order by t.team_type
  limit greatest(1, least(p_limit, 50));
$$;


--
-- Name: get_vehicle_plate_suggestions(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_vehicle_plate_suggestions(p_query text DEFAULT ''::text, p_limit integer DEFAULT 20) RETURNS TABLE(value text)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select distinct t.vehicle_plate as value
  from public.daily_work_plan_teams t
  where p_query = '' or t.vehicle_plate ilike '%' || p_query || '%'
  order by t.vehicle_plate
  limit greatest(1, least(p_limit, 50));
$$;


--
-- Name: guard_attendance_employment_period(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_attendance_employment_period() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_personnel_id uuid := case when tg_op = 'DELETE' then old.personnel_id else new.personnel_id end;
  v_attendance_date date := case when tg_op = 'DELETE' then old.attendance_date else new.attendance_date end;
begin
  if not exists (
    select 1
    from public.personnel p
    where p.id = v_personnel_id
      and (
        (
          v_attendance_date >= coalesce(p.employment_start_date, v_attendance_date)
          and (p.employment_end_date is null or v_attendance_date <= p.employment_end_date)
        )
        or exists (
          select 1
          from public.personnel_employment_periods period
          where period.personnel_id = p.id
            and v_attendance_date >= coalesce(period.employment_start_date, v_attendance_date)
            and v_attendance_date <= period.employment_end_date
        )
      )
  ) then
    raise exception 'Çalışma dönemi dışındaki günler için puantaj düzenlenemez';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;


--
-- Name: guard_material_category_flow(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_material_category_flow() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare v_category text;
begin
  select material_category into v_category
  from public.inventory_materials where id = new.material_id;

  if tg_table_name in ('inventory_custody_balances', 'inventory_custody_movements')
    and v_category <> 'equipment' then
    raise exception 'Saha stok malzemesi araç ekipmanı zimmetine eklenemez';
  end if;
  return new;
end;
$$;


--
-- Name: guard_personnel_with_active_custody(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_personnel_with_active_custody() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare
  v_personnel_id uuid;
  v_custody_count integer;
begin
  if tg_op = 'UPDATE' then
    if old.is_active is not true or new.is_active is true then
      return new;
    end if;
    v_personnel_id := old.id;
  else
    v_personnel_id := old.id;
  end if;

  select count(*)::integer
  into v_custody_count
  from public.inventory_custody_balances
  where holder_type = 'personnel'
    and holder_id = v_personnel_id
    and quantity > 0;

  if v_custody_count > 0 then
    raise exception
      'Personelin üzerinde % adet aktif malzeme zimmeti var. Önce zimmetleri aktarın veya depoya iade edin.',
      v_custody_count
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;


--
-- Name: FUNCTION guard_personnel_with_active_custody(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.guard_personnel_with_active_custody() IS 'Aktif zimmeti bulunan personelin pasife alınmasını veya silinmesini engeller.';


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare
  v_is_first_user boolean;
begin
  perform pg_advisory_xact_lock(hashtext('mk-ops-first-site-chief'));

  select not exists (
    select 1
    from public.profiles
    where role = 'site_chief' and is_approved = true
  ) into v_is_first_user;

  insert into public.profiles (
    id,
    full_name,
    email,
    role,
    is_approved,
    approved_at,
    approved_by
  )
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      split_part(new.email, '@', 1)
    ),
    new.email,
    case when v_is_first_user then 'site_chief' else 'pending' end,
    v_is_first_user,
    case when v_is_first_user then now() else null end,
    case when v_is_first_user then new.id else null end
  );
  return new;
end;
$$;


--
-- Name: has_module_write_permission(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_module_write_permission(p_module text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
  select case
    when public.current_user_role()='site_chief' then true
    when public.current_user_role() not in ('company_manager','accounting') then false
    else coalesce((select case p_module
      when 'projects' then cmp.projects_write when 'work_plans' then cmp.work_plans_write
      when 'personnel' then cmp.personnel_write when 'attendance' then cmp.attendance_write
      when 'vehicles' then cmp.vehicles_write when 'inventory' then cmp.inventory_write
      when 'custody' then cmp.custody_write when 'productions' then cmp.productions_write
      else false end from public.company_manager_permissions cmp where cmp.user_id=auth.uid()),false)
  end;
$$;


--
-- Name: is_site_chief(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_site_chief() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
  select coalesce(public.current_user_role() = 'site_chief', false);
$$;


--
-- Name: limit_production_item_definitions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.limit_production_item_definitions() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if (select count(*) from public.production_item_definitions) >= 50 then
    raise exception 'En fazla 50 iş kalemi tanımlanabilir';
  end if;
  return new;
end;
$$;


--
-- Name: log_attendance_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_attendance_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
begin
  if tg_op = 'INSERT' then
    if new.is_auto_generated then
      return new;
    end if;
    insert into public.attendance_audit_logs (
      attendance_record_id, personnel_id, attendance_date, action,
      new_status, new_leave_type, changed_by
    ) values (
      new.id, new.personnel_id, new.attendance_date, 'insert',
      new.status, new.leave_type, auth.uid()
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status is not distinct from new.status
      and old.leave_type is not distinct from new.leave_type then
      return new;
    end if;
    insert into public.attendance_audit_logs (
      attendance_record_id, personnel_id, attendance_date, action,
      old_status, new_status, old_leave_type, new_leave_type, changed_by
    ) values (
      new.id, new.personnel_id, new.attendance_date, 'update',
      old.status, new.status, old.leave_type, new.leave_type, auth.uid()
    );
    return new;
  end if;

  insert into public.attendance_audit_logs (
    attendance_record_id, personnel_id, attendance_date, action,
    old_status, old_leave_type, changed_by
  ) values (
    old.id, old.personnel_id, old.attendance_date, 'delete',
    old.status, old.leave_type, auth.uid()
  );
  return old;
end;
$$;


--
-- Name: projects_archive_on_complete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.projects_archive_on_complete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    new.is_archived := true;
    new.archived_at := coalesce(new.archived_at, now());
    new.completed_at := coalesce(new.completed_at, current_date);
  end if;
  return new;
end;
$$;


--
-- Name: projects_derive_automatic_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.projects_derive_automatic_status() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_all_required_steps_done boolean;
  v_has_started_step boolean;
  v_sheet_count integer;
  v_completed_sheet_count integer;
  v_cabinet_count integer;
  v_completed_cabinet_count integer;
begin
  new.received_at := coalesce(new.received_at,current_date);

  select count(*),count(*) filter(where is_completed)
    into v_sheet_count,v_completed_sheet_count
  from public.project_sheets where project_id=new.id;
  select count(*),count(*) filter(where is_completed)
    into v_cabinet_count,v_completed_cabinet_count
  from public.project_cabinets where project_id=new.id;

  v_has_started_step :=
    new.obk_pulled is true or new.joint_done is true or new.cable_pulled is true or
    exists(select 1 from public.project_sheet_progress sp join public.project_sheets s on s.id=sp.sheet_id where s.project_id=new.id) or
    exists(select 1 from public.project_cabinet_progress cp join public.project_cabinets c on c.id=cp.cabinet_id where c.project_id=new.id);

  if new.project_type='BGFD' and v_cabinet_count>0 then
    v_all_required_steps_done := v_completed_cabinet_count=v_cabinet_count;
  elsif v_sheet_count>0 then
    v_all_required_steps_done := v_completed_sheet_count=v_sheet_count;
  else
    v_all_required_steps_done := new.joint_done is true and new.cable_pulled is true
      and (not new.tracks_obk or new.obk_pulled is true)
      and (not new.tracks_excavation or new.excavation_done is true);
  end if;

  if v_all_required_steps_done then
    new.status := 'completed';
    new.completed_at := coalesce(new.completed_at,current_date);
    new.is_archived := true;
    new.archived_at := coalesce(new.archived_at,now());
  elsif v_has_started_step then
    new.status := 'in_progress';
    new.in_progress_at := coalesce(new.in_progress_at,current_date);
    new.completed_at := null;
    new.is_archived := false;
    new.archived_at := null;
  elsif new.received_at <= current_date-30 then
    new.status := 'delayed';
    new.delayed_at := coalesce(new.delayed_at,current_date);
    new.completed_at := null;
    new.is_archived := false;
    new.archived_at := null;
  else
    new.status := 'waiting';
    new.waiting_at := coalesce(new.waiting_at,new.received_at,current_date);
    new.completed_at := null;
    new.is_archived := false;
    new.archived_at := null;
  end if;
  return new;
end; $$;


--
-- Name: FUNCTION projects_derive_automatic_status(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.projects_derive_automatic_status() IS 'Durum sırası: tamamlandı, 30 gün gecikmiş, işlem başladı, başlamadı.';


--
-- Name: projects_set_stage_dates(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.projects_set_stage_dates() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: protect_primary_site_chief(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_primary_site_chief() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare
  v_site_chief_id uuid;
begin
  select id
  into v_site_chief_id
  from public.profiles
  where role = 'site_chief'
  order by approved_at nulls last, created_at, id
  limit 1;

  if tg_op = 'DELETE' and old.id = v_site_chief_id then
    raise exception 'Ana şantiye şefi hesabı silinemez'
      using errcode = '42501';
  end if;

  if tg_op in ('INSERT', 'UPDATE')
    and new.role = 'site_chief'
    and v_site_chief_id is not null
    and new.id <> v_site_chief_id then
    raise exception 'Başka bir kullanıcı şantiye şefi yapılamaz'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and old.id = v_site_chief_id then
    if new.id <> v_site_chief_id
      or new.role <> 'site_chief'
      or new.is_approved is not true
      or new.approved_at is null
      or new.approved_by is distinct from v_site_chief_id then
      raise exception 'Ana şantiye şefinin rolü ve onayı değiştirilemez'
        using errcode = '42501';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE')
    and new.role = 'site_chief'
    and v_site_chief_id is null then
    if new.is_approved is not true
      or new.approved_at is null
      or new.approved_by is distinct from new.id then
      raise exception 'Ana şantiye şefi yalnız korumalı rol ile oluşturulabilir'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;


--
-- Name: FUNCTION protect_primary_site_chief(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.protect_primary_site_chief() IS 'Ana şantiye şefinin silinmesini, rol/onay değişimini ve ikinci şef atanmasını engeller.';


--
-- Name: reactivate_cancelled_project(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reactivate_cancelled_project(p_project_id uuid) RETURNS public.projects
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_project public.projects;
begin
  if not public.has_module_write_permission('projects') then raise exception 'Proje aktifleştirme yetkiniz yok' using errcode='42501'; end if;
  select * into v_project from public.projects where id=p_project_id for update;
  if not found then raise exception 'Proje bulunamadı'; end if;
  if v_project.is_archived or v_project.status='completed' then raise exception 'Biten veya arşivlenmiş proje yeniden aktif edilemez'; end if;
  if not v_project.is_cancelled then raise exception 'Yalnızca iptal edilmiş proje yeniden aktif edilebilir'; end if;

  update public.project_cancellation_history set reactivated_at=now(),reactivated_by=auth.uid()
  where id=(select id from public.project_cancellation_history where project_id=p_project_id and reactivated_at is null order by cancelled_at desc limit 1);
  update public.projects set is_cancelled=false,cancellation_reason=null,cancelled_at=null,cancelled_by=null,updated_by=auth.uid()
  where id=p_project_id returning * into v_project;
  return v_project;
end $$;


--
-- Name: recalculate_project_sheet_completion(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recalculate_project_sheet_completion(p_sheet_id uuid, p_date date DEFAULT CURRENT_DATE) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare s public.project_sheets; all_done boolean; total_sheets integer; completed_sheets integer;
begin
  select * into s from public.project_sheets where id=p_sheet_id;
  if not found then return; end if;
  all_done :=
    (not s.tracks_cable or (exists(select 1 from public.project_sheet_cables c where c.sheet_id=s.id) and not exists(
      select 1 from public.project_sheet_cables c where c.sheet_id=s.id and
      coalesce((select sum(p.quantity) from public.project_sheet_progress p where p.cable_id=c.id and p.stage='cable'),0)<c.quantity))) and
    (not s.tracks_joint or exists(select 1 from public.project_sheet_progress p where p.sheet_id=s.id and p.stage='joint')) and
    (not s.tracks_obk or exists(select 1 from public.project_sheet_progress p where p.sheet_id=s.id and p.stage='obk')) and
    (not s.tracks_excavation or (
      exists(select 1 from public.project_sheet_progress p where p.sheet_id=s.id and p.stage='excavation_permit_waiting') and
      exists(select 1 from public.project_sheet_progress p where p.sheet_id=s.id and p.stage='excavation_waiting') and
      exists(select 1 from public.project_sheet_progress p where p.sheet_id=s.id and p.stage='excavation_done')));
  update public.project_sheets set is_completed=all_done,
    completed_at=case when all_done then coalesce(completed_at,p_date) else null end where id=s.id;
  select count(*),count(*) filter(where is_completed) into total_sheets,completed_sheets
    from public.project_sheets where project_id=s.project_id;
  update public.projects set
    status=case when total_sheets>0 and completed_sheets=total_sheets then 'completed'::public.project_status else 'in_progress'::public.project_status end,
    completed_at=case when total_sheets>0 and completed_sheets=total_sheets then coalesce(completed_at,p_date) else null end,
    is_archived=total_sheets>0 and completed_sheets=total_sheets,
    archived_at=case when total_sheets>0 and completed_sheets=total_sheets then coalesce(archived_at,now()) else null end,
    in_progress_at=coalesce(in_progress_at,p_date)
  where id=s.project_id and project_type<>'BGFD';
end; $$;


--
-- Name: record_inventory_movement(uuid, public.inventory_movement_type, numeric, text, text, text, uuid[], text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_inventory_movement(p_material_id uuid, p_movement_type public.inventory_movement_type, p_quantity numeric, p_source_location text DEFAULT 'center'::text, p_project_name text DEFAULT NULL::text, p_project_code text DEFAULT NULL::text, p_team_personnel_ids uuid[] DEFAULT '{}'::uuid[], p_description text DEFAULT NULL::text) RETURNS public.inventory_materials
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare
  v_material public.inventory_materials;
  v_balance numeric(14,3);
  v_names text[];
begin
  if not public.has_module_write_permission('inventory') then
    raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
  if p_source_location not in ('center', 'biga') then raise exception 'Geçersiz stok konumu'; end if;
  if p_movement_type = 'out' and char_length(trim(coalesce(p_project_name, ''))) < 2 then
    raise exception 'Proje adı zorunlu';
  end if;

  select * into v_material from public.inventory_materials where id = p_material_id for update;
  if not found then raise exception 'Malzeme bulunamadı'; end if;
  if v_material.unit = 'piece' and p_quantity <> trunc(p_quantity) then raise exception 'Adet miktarı tam sayı olmalıdır'; end if;

  if p_movement_type = 'in' then
    update public.inventory_materials set stock_quantity = stock_quantity + p_quantity, updated_by = auth.uid()
    where id = p_material_id returning * into v_material;
    v_balance := v_material.stock_quantity;
  elsif p_source_location = 'center' then
    if v_material.stock_quantity < p_quantity then raise exception 'Merkez Şantiye stoku yetersiz. Mevcut: %', v_material.stock_quantity; end if;
    update public.inventory_materials set stock_quantity = stock_quantity - p_quantity, updated_by = auth.uid()
    where id = p_material_id returning * into v_material;
    v_balance := v_material.stock_quantity;
  else
    if v_material.biga_stock_quantity < p_quantity then raise exception 'AZG BİGA ŞUBE stoku yetersiz. Mevcut: %', v_material.biga_stock_quantity; end if;
    update public.inventory_materials set biga_stock_quantity = biga_stock_quantity - p_quantity, updated_by = auth.uid()
    where id = p_material_id returning * into v_material;
    v_balance := v_material.biga_stock_quantity;
  end if;

  select coalesce(array_agg(full_name order by full_name), '{}') into v_names
  from public.personnel where id = any(coalesce(p_team_personnel_ids, '{}'));

  insert into public.inventory_movements
    (material_id, movement_type, quantity, usage_location, description, balance_after, created_by,
     action_type, source_location, target_location, project_name, project_code, team_personnel_ids, team_personnel_names)
  values
    (p_material_id, p_movement_type, p_quantity,
     case when p_movement_type = 'out' then trim(p_project_name) else null end,
     nullif(trim(p_description), ''), v_balance, auth.uid(),
     case when p_movement_type = 'in' then 'in' else 'usage' end,
     case when p_movement_type = 'out' then p_source_location else null end,
     case when p_movement_type = 'in' then 'center' else null end,
     case when p_movement_type = 'out' then trim(p_project_name) else null end,
     case when p_movement_type = 'out' then nullif(trim(p_project_code), '') else null end,
     coalesce(p_team_personnel_ids, '{}'), v_names);
  return v_material;
end;
$$;


--
-- Name: vehicle_fuel_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicle_fuel_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vehicle_id uuid NOT NULL,
    fuel_date date DEFAULT CURRENT_DATE NOT NULL,
    odometer_km bigint NOT NULL,
    liters numeric(10,3) NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vehicle_fuel_logs_liters_check CHECK ((liters > (0)::numeric)),
    CONSTRAINT vehicle_fuel_logs_odometer_km_check CHECK ((odometer_km >= 0))
);


--
-- Name: record_vehicle_fuel_purchase(uuid, date, bigint, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_vehicle_fuel_purchase(p_vehicle_id uuid, p_fuel_date date, p_odometer_km bigint, p_liters numeric, p_notes text DEFAULT NULL::text) RETURNS public.vehicle_fuel_logs
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare
  v_vehicle public.vehicles;
  v_latest_km bigint;
  v_log public.vehicle_fuel_logs;
begin
  if not public.has_module_write_permission('vehicles') then
    raise exception 'Araç işlem yetkisi gerekli' using errcode = '42501';
  end if;
  if p_fuel_date is null or p_fuel_date > current_date then
    raise exception 'Yakıt tarihi geçersiz';
  end if;
  if p_liters is null or p_liters <= 0 then raise exception 'Litre sıfırdan büyük olmalıdır'; end if;

  select * into v_vehicle from public.vehicles where id = p_vehicle_id for update;
  if not found then raise exception 'Araç bulunamadı'; end if;
  select max(odometer_km) into v_latest_km from public.vehicle_fuel_logs where vehicle_id = p_vehicle_id;
  v_latest_km := greatest(v_vehicle.current_km, coalesce(v_latest_km, 0));
  if p_odometer_km < v_latest_km then
    raise exception 'Yeni kilometre mevcut kilometreden düşük olamaz. Mevcut: % km', v_latest_km;
  end if;

  insert into public.vehicle_fuel_logs(vehicle_id, fuel_date, odometer_km, liters, notes, created_by)
  values (p_vehicle_id, p_fuel_date, p_odometer_km, p_liters, nullif(trim(p_notes),''), auth.uid())
  returning * into v_log;
  update public.vehicles set current_km = greatest(current_km, p_odometer_km), updated_by = auth.uid()
  where id = p_vehicle_id;
  return v_log;
end;
$$;


--
-- Name: refresh_bgfd_cabinet_completion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_bgfd_cabinet_completion() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare excavation_required boolean; all_done boolean;
begin
  select tracks_excavation into excavation_required
  from public.project_cabinets where id=new.cabinet_id;

  select
    exists(select 1 from public.project_cabinet_progress where cabinet_id=new.cabinet_id and stage='cable') and
    exists(select 1 from public.project_cabinet_progress where cabinet_id=new.cabinet_id and stage='energy_cable') and
    exists(select 1 from public.project_cabinet_progress where cabinet_id=new.cabinet_id and stage='energy') and
    exists(select 1 from public.project_cabinet_progress where cabinet_id=new.cabinet_id and stage='cabinet_installation') and
    exists(select 1 from public.project_cabinet_progress where cabinet_id=new.cabinet_id and stage='joint') and
    exists(select 1 from public.project_cabinet_progress where cabinet_id=new.cabinet_id and stage='transfer') and
    (not excavation_required or (
      exists(select 1 from public.project_cabinet_progress where cabinet_id=new.cabinet_id and stage='excavation_permit_waiting') and
      exists(select 1 from public.project_cabinet_progress where cabinet_id=new.cabinet_id and stage='excavation_waiting') and
      exists(select 1 from public.project_cabinet_progress where cabinet_id=new.cabinet_id and stage='excavation_done')
    )) into all_done;

  update public.project_cabinets
  set is_completed=all_done,
      completed_at=case when all_done then coalesce(completed_at,new.progress_date) else null end
  where id=new.cabinet_id;
  return new;
end; $$;


--
-- Name: refresh_bgfd_project_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_bgfd_project_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare p_id uuid; total_count integer; completed_count integer;
begin
  select project_id into p_id from public.project_cabinets where id=new.cabinet_id;
  select count(*), count(*) filter(where is_completed)
    into total_count, completed_count from public.project_cabinets where project_id=p_id;
  if total_count > 0 and completed_count=total_count then
    update public.projects set status='completed', completed_at=coalesce(completed_at,new.progress_date), tracks_obk=false
    where id=p_id and project_type='BGFD';
  else
    update public.projects set status='in_progress', in_progress_at=coalesce(in_progress_at,new.progress_date),
      is_archived=false, archived_at=null, completed_at=null, tracks_obk=false
    where id=p_id and project_type='BGFD' and status in ('waiting','completed');
  end if;
  return new;
end; $$;


--
-- Name: refresh_hp_focused_project(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_hp_focused_project() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare p_id uuid; total_count integer; done_count integer; next_status public.project_status;
  finisher_id uuid; finisher_name text; leader_id uuid; leader_name text;
begin
  if tg_op='DELETE' then p_id:=old.project_id; else p_id:=new.project_id; end if;
  select count(*),count(*) filter(where manual_status='completed') into total_count,done_count
  from public.project_sheets where project_id=p_id;
  if total_count>0 and done_count=total_count then next_status:='completed';
  elsif exists(select 1 from public.project_sheets where project_id=p_id and manual_status='in_progress') then next_status:='in_progress';
  elsif exists(select 1 from public.project_sheets where project_id=p_id and manual_status='excavation_permit_waiting') then next_status:='excavation_permit_waiting';
  else next_status:='waiting'; end if;
  if next_status='completed' then
    if tg_op<>'DELETE' and new.manual_status='completed' then
      finisher_id:=new.completed_by_personnel_id; finisher_name:=new.completed_by_name;
    else
      select completed_by_personnel_id,completed_by_name into finisher_id,finisher_name from public.project_sheets
      where project_id=p_id and manual_status='completed' order by completed_at desc nulls last,updated_at desc limit 1;
    end if;
  elsif next_status='in_progress' then
    select current_team_leader_personnel_id,current_team_leader_name into leader_id,leader_name from public.project_sheets
    where project_id=p_id and manual_status='in_progress' order by updated_at desc limit 1;
  end if;
  update public.projects set status=next_status,
    progress_percent=case when total_count=0 then 0 else round(done_count*100.0/total_count)::int end,
    is_archived=next_status='completed',archived_at=case when next_status='completed' then coalesce(archived_at,now()) else null end,
    completed_at=case when next_status='completed' then coalesce(completed_at,current_date) else null end,
    completed_by_personnel_id=case when next_status='completed' then finisher_id else null end,
    completed_by_name=case when next_status='completed' then finisher_name else null end,
    current_team_leader_personnel_id=case when next_status='in_progress' then leader_id else null end,
    current_team_leader_name=case when next_status='in_progress' then leader_name else null end
  where id=p_id and project_type='HP_ODAKLI';
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;


--
-- Name: refresh_overdue_project_statuses(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_overdue_project_statuses() RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare v_updated integer;
begin
  update public.projects
  set received_at = received_at
  where is_archived = false
    and is_cancelled = false
    and status <> 'completed'
    and received_at <= current_date - 30
    and status <> 'delayed';
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;


--
-- Name: FUNCTION refresh_overdue_project_statuses(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.refresh_overdue_project_statuses() IS '30 günü geçen tamamlanmamış aktif projeleri gecikmiş olarak yeniler.';


--
-- Name: refresh_sheet_completion_from_cable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_sheet_completion_from_cable() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if tg_op='DELETE' then perform public.recalculate_project_sheet_completion(old.sheet_id,current_date); return old;
  else perform public.recalculate_project_sheet_completion(new.sheet_id,current_date); return new; end if;
end; $$;


--
-- Name: refresh_sheet_completion_from_progress(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_sheet_completion_from_progress() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if tg_op='DELETE' then perform public.recalculate_project_sheet_completion(old.sheet_id,old.progress_date); return old;
  else perform public.recalculate_project_sheet_completion(new.sheet_id,new.progress_date); return new; end if;
end; $$;


--
-- Name: refresh_sheet_completion_from_tracking(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_sheet_completion_from_tracking() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin perform public.recalculate_project_sheet_completion(new.id,current_date); return new; end; $$;


--
-- Name: require_all_project_children_completed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.require_all_project_children_completed() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if new.status = 'completed' then
    if new.project_type = 'HP_ODAKLI'
      and exists (
        select 1
        from public.project_sheets s
        where s.project_id = new.id
          and not s.is_completed
      ) then
      raise exception 'Projenin bütün paftaları tamamlanmadan proje bitirilemez.'
        using errcode = '23514';
    end if;

    if new.project_type = 'BGFD'
      and exists (
        select 1
        from public.project_cabinets c
        where c.project_id = new.id
          and not c.is_completed
      ) then
      raise exception 'Projenin bütün dolapları tamamlanmadan proje bitirilemez.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: FUNCTION require_all_project_children_completed(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.require_all_project_children_completed() IS 'HP Odaklı projelerde paftaları, BGFD projelerinde dolapları tamamlanmadan proje bitişini engeller.';


--
-- Name: save_attendance_changes(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_attendance_changes(p_changes jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_change jsonb;
  v_personnel_id uuid;
  v_date date;
  v_status public.attendance_status;
  v_saved integer := 0;
  v_deleted integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Oturum gerekli' using errcode = '42501';
  end if;

  if jsonb_typeof(p_changes) <> 'array' then
    raise exception 'Puantaj değişiklikleri JSON dizisi olmalıdır';
  end if;

  if jsonb_array_length(p_changes) > 5000 then
    raise exception 'Tek işlemde en fazla 5000 puantaj hücresi kaydedilebilir';
  end if;

  for v_change in select value from jsonb_array_elements(p_changes)
  loop
    begin
      v_personnel_id := (v_change->>'personnel_id')::uuid;
      v_date := (v_change->>'attendance_date')::date;

      if not exists (
        select 1 from public.personnel where id = v_personnel_id
      ) then
        raise exception 'Personel bulunamadı: %', v_personnel_id;
      end if;

      if v_change->>'status' is null then
        delete from public.attendance_records
        where personnel_id = v_personnel_id
          and attendance_date = v_date;
        v_deleted := v_deleted + 1;
      else
        v_status := (v_change->>'status')::public.attendance_status;

        insert into public.attendance_records (
          personnel_id,
          attendance_date,
          status,
          is_auto_generated,
          created_by,
          updated_by
        )
        values (
          v_personnel_id,
          v_date,
          v_status,
          false,
          auth.uid(),
          auth.uid()
        )
        on conflict (personnel_id, attendance_date)
        do update set
          status = excluded.status,
          is_auto_generated = false,
          updated_by = auth.uid();

        v_saved := v_saved + 1;
      end if;
    exception
      when others then
        raise exception 'Puantaj kaydedilemedi (% / %): %',
          coalesce(v_personnel_id::text, 'personel yok'),
          coalesce(v_date::text, 'tarih yok'),
          sqlerrm;
    end;
  end loop;

  return jsonb_build_object(
    'saved', v_saved,
    'deleted', v_deleted
  );
end;
$$;


--
-- Name: save_production_entry(uuid, date, uuid, text, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_production_entry(p_entry_id uuid, p_work_date date, p_team_leader_personnel_id uuid, p_team_leader_name text, p_source_work_plan_id uuid, p_jobs jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare
  v_entry_id uuid;
  v_job jsonb;
  v_item jsonb;
  v_job_id uuid;
  v_item_name text;
  v_unit text;
begin
  if not public.has_module_write_permission('productions') then
    raise exception 'İmalat yazma yetkisi gerekli' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.personnel
    where id = p_team_leader_personnel_id and is_active = true
  ) then
    raise exception 'Aktif ekip personeli bulunamadı';
  end if;
  if jsonb_array_length(coalesce(p_jobs, '[]'::jsonb)) = 0 then
    raise exception 'En az bir proje gerekli';
  end if;

  if p_entry_id is not null and exists (select 1 from public.production_entries where id = p_entry_id) then
    update public.production_entries set
      work_date = p_work_date,
      team_leader_personnel_id = p_team_leader_personnel_id,
      team_leader_name_snapshot = trim(p_team_leader_name),
      source_work_plan_id = null,
      updated_by = auth.uid()
    where id = p_entry_id
    returning id into v_entry_id;
  else
    insert into public.production_entries(
      work_date, team_leader_personnel_id, team_leader_name_snapshot,
      source_work_plan_id, created_by, updated_by
    ) values (
      p_work_date, p_team_leader_personnel_id, trim(p_team_leader_name),
      null, auth.uid(), auth.uid()
    )
    on conflict(work_date, team_leader_personnel_id) do update set
      team_leader_name_snapshot = excluded.team_leader_name_snapshot,
      source_work_plan_id = null,
      updated_by = auth.uid()
    returning id into v_entry_id;
  end if;

  delete from public.production_jobs where production_entry_id = v_entry_id;
  for v_job in select * from jsonb_array_elements(p_jobs) loop
    if char_length(trim(coalesce(v_job->>'project_name', ''))) < 2 then
      raise exception 'Proje adı zorunlu';
    end if;
    insert into public.production_jobs(
      production_entry_id, project_id, project_name_snapshot,
      project_code_snapshot, source, sort_order
    ) values (
      v_entry_id, null, trim(v_job->>'project_name'),
      nullif(trim(v_job->>'project_code'), ''), 'manual',
      coalesce((v_job->>'sort_order')::int, 0)
    ) returning id into v_job_id;

    if jsonb_array_length(coalesce(v_job->'items', '[]'::jsonb)) = 0 then
      raise exception 'Her projede en az bir imalat gerekli';
    end if;
    for v_item in select * from jsonb_array_elements(coalesce(v_job->'items', '[]'::jsonb)) loop
      v_item_name := trim(coalesce(v_item->>'item_name', ''));
      v_unit := upper(trim(coalesce(v_item->>'unit', '')));
      if char_length(v_item_name) < 2 or char_length(v_unit) < 1 then
        raise exception 'İmalat adı ve birim zorunlu';
      end if;
      insert into public.production_items(
        production_job_id, production_item_definition_id, item_name_snapshot,
        quantity, unit_snapshot, sort_order
      ) values (
        v_job_id, null, v_item_name, (v_item->>'quantity')::numeric,
        v_unit, coalesce((v_item->>'sort_order')::int, 0)
      );
    end loop;
  end loop;
  return v_entry_id;
end;
$$;


--
-- Name: set_bgfd_current_team_leader(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_bgfd_current_team_leader() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare p_id uuid;
begin
  select project_id into p_id from public.project_cabinets where id=new.cabinet_id;
  update public.projects set current_team_leader_personnel_id=new.team_leader_personnel_id,
    current_team_leader_name=new.team_leader_name
  where id=p_id and project_type='BGFD' and status<>'completed';
  return new;
end; $$;


--
-- Name: company_manager_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_manager_permissions (
    user_id uuid NOT NULL,
    projects_write boolean DEFAULT false NOT NULL,
    work_plans_write boolean DEFAULT false NOT NULL,
    personnel_write boolean DEFAULT false NOT NULL,
    attendance_write boolean DEFAULT false NOT NULL,
    vehicles_write boolean DEFAULT false NOT NULL,
    inventory_write boolean DEFAULT false NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    custody_write boolean DEFAULT false NOT NULL,
    productions_write boolean DEFAULT false NOT NULL
);


--
-- Name: TABLE company_manager_permissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.company_manager_permissions IS 'Şirket yöneticilerinin alan bazlı işlem yetkileri; varsayılan salt okunur';


--
-- Name: set_company_manager_permission(uuid, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_company_manager_permission(p_user_id uuid, p_module text, p_enabled boolean) RETURNS public.company_manager_permissions
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_permissions public.company_manager_permissions; v_role text;
begin
  if not public.is_site_chief() then raise exception 'Bu işlem için şantiye şefi yetkisi gerekli' using errcode='42501'; end if;
  select role into v_role from public.profiles where id=p_user_id and is_approved=true;
  if v_role not in ('company_manager','accounting') then raise exception 'Kullanıcı yetkilendirilebilir bir rolde değil'; end if;
  if p_module not in ('projects','work_plans','personnel','attendance','vehicles','inventory','custody','productions') then raise exception 'Geçersiz yetki alanı'; end if;
  insert into public.company_manager_permissions(user_id,updated_by) values(p_user_id,auth.uid()) on conflict(user_id) do nothing;
  update public.company_manager_permissions set
    projects_write=case when p_module='projects' then p_enabled else projects_write end,
    work_plans_write=case when p_module='work_plans' then p_enabled else work_plans_write end,
    personnel_write=case when p_module='personnel' then p_enabled else personnel_write end,
    attendance_write=case when p_module='attendance' then p_enabled else attendance_write end,
    vehicles_write=case when p_module='vehicles' then p_enabled else vehicles_write end,
    inventory_write=case when p_module='inventory' then p_enabled else inventory_write end,
    custody_write=case when p_module='custody' then p_enabled else custody_write end,
    productions_write=case when p_module='productions' then p_enabled else productions_write end,
    updated_by=auth.uid()
  where user_id=p_user_id returning * into v_permissions;
  return v_permissions;
end; $$;


--
-- Name: set_project_completion_owner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_project_completion_owner() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if new.status='completed' then
    new.current_team_leader_personnel_id:=null; new.current_team_leader_name:=null;
    if new.completed_by_name is null and new.project_type='BGFD' then
      select cp.team_leader_personnel_id,cp.team_leader_name into new.completed_by_personnel_id,new.completed_by_name
      from public.project_cabinet_progress cp join public.project_cabinets c on c.id=cp.cabinet_id
      where c.project_id=new.id and cp.stage='transfer' order by cp.progress_date desc,cp.created_at desc limit 1;
    end if;
  else
    new.completed_by_personnel_id:=null; new.completed_by_name:=null;
  end if;
  return new;
end; $$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: submit_inventory_request_receipt(uuid, date, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_inventory_request_receipt(p_request_id uuid, p_receipt_date date, p_received_by text, p_dispatch_number text, p_notes text DEFAULT NULL::text, p_items jsonb DEFAULT '[]'::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_request public.inventory_requests; v_item jsonb; v_catalog public.inventory_catalog; v_qty numeric; v_code text;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Stok kabul yetkisi gerekli' using errcode='42501'; end if;
  if p_receipt_date is null or char_length(trim(coalesce(p_received_by,'')))<2 or char_length(trim(coalesce(p_dispatch_number,'')))<1 then raise exception 'Tarih, teslim alan ve irsaliye numarası zorunlu'; end if;
  select * into v_request from public.inventory_requests where id=p_request_id for update;
  if not found or v_request.status<>'approved' then raise exception 'Yalnızca onaylanmış talep stoğa alınabilir'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'İrsaliyede en az bir malzeme olmalıdır'; end if;
  delete from public.inventory_request_receipt_items where request_id=p_request_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_catalog from public.inventory_catalog where id=(v_item->>'catalog_id')::uuid;
    if not found then raise exception 'Katalog malzemesi bulunamadı'; end if;
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty<=0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
    if v_catalog.unit='piece' and v_qty<>trunc(v_qty) then raise exception 'Adet miktarı tam sayı olmalıdır'; end if;
    v_code := nullif(trim(v_item->>'material_code'),'');
    if v_catalog.has_id and v_code is null then raise exception '% için malzeme ID zorunlu',v_catalog.material_name; end if;
    if not v_catalog.has_id then v_code:=null; end if;
    if v_code is not null and exists(select 1 from public.inventory_materials where lower(trim(material_code))=lower(v_code)) then raise exception 'Bu malzeme ID daha önce kullanılmış: %',v_code; end if;
    insert into public.inventory_request_receipt_items(request_id,catalog_id,quantity,material_code) values(p_request_id,v_catalog.id,v_qty,v_code);
  end loop;
  update public.inventory_requests set status='receipt_review',pending_receipt_date=p_receipt_date,pending_received_by=trim(p_received_by),pending_dispatch_number=trim(p_dispatch_number),pending_receipt_notes=nullif(trim(p_notes),'') where id=p_request_id;
end $$;


--
-- Name: transfer_inventory_custody(uuid, numeric, text, uuid, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.transfer_inventory_custody(p_material_id uuid, p_quantity numeric, p_from_type text, p_from_id uuid, p_to_type text, p_to_id uuid, p_notes text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare
  v_material public.inventory_materials;
  v_source public.inventory_custody_balances;
  v_from_name text;
  v_to_name text;
  v_source_remaining numeric(14,3);
  v_destination_quantity numeric(14,3);
begin
  if not public.has_module_write_permission('custody') then
    raise exception 'Araç ekipmanı işlem yetkisi gerekli' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
  if p_from_type not in ('warehouse','personnel','team','vehicle')
    or p_to_type not in ('warehouse','personnel','team','vehicle') then
    raise exception 'Geçersiz transfer konumu';
  end if;
  if (p_from_type = 'warehouse' and p_from_id is not null)
    or (p_from_type <> 'warehouse' and p_from_id is null)
    or (p_to_type = 'warehouse' and p_to_id is not null)
    or (p_to_type <> 'warehouse' and p_to_id is null) then
    raise exception 'Transfer konumu bilgisi geçersiz';
  end if;
  if p_from_type = p_to_type and p_from_id is not distinct from p_to_id then
    raise exception 'Kaynak ve hedef aynı olamaz';
  end if;

  select * into v_material from public.inventory_materials
  where id = p_material_id for update;
  if not found then raise exception 'Malzeme bulunamadı'; end if;
  if v_material.unit = 'piece' and p_quantity <> trunc(p_quantity) then
    raise exception 'Adet biriminde miktar tam sayı olmalıdır';
  end if;

  if p_from_type = 'warehouse' then
    if v_material.stock_quantity < p_quantity then
      raise exception 'Şantiye deposunda yetersiz miktar. Mevcut: %', v_material.stock_quantity;
    end if;
    v_from_name := 'Şantiye Deposu';
    update public.inventory_materials set stock_quantity = stock_quantity - p_quantity,
      updated_by = auth.uid() where id = p_material_id;
    v_source_remaining := v_material.stock_quantity - p_quantity;
  else
    select * into v_source from public.inventory_custody_balances
    where material_id = p_material_id and holder_type = p_from_type
      and holder_id = p_from_id for update;
    if not found or v_source.quantity < p_quantity then raise exception 'Kaynakta yetersiz malzeme'; end if;
    v_from_name := v_source.holder_name;
    v_source_remaining := v_source.quantity - p_quantity;
    if v_source_remaining = 0 then
      delete from public.inventory_custody_balances where id = v_source.id;
    else
      update public.inventory_custody_balances set quantity = v_source_remaining,
        updated_by = auth.uid() where id = v_source.id;
    end if;
  end if;

  if p_to_type = 'warehouse' then
    v_to_name := 'Şantiye Deposu';
    update public.inventory_materials set stock_quantity = stock_quantity + p_quantity,
      updated_by = auth.uid() where id = p_material_id returning stock_quantity into v_destination_quantity;
  else
    if p_to_type = 'vehicle' then
      select plate into v_to_name from public.vehicles where id = p_to_id;
    elsif p_to_type = 'personnel' then
      select full_name into v_to_name from public.personnel where id = p_to_id;
    else
      select concat('Ekip · ', team_type, ' · ', project_name) into v_to_name
      from public.daily_work_plan_teams where id = p_to_id;
    end if;
    if v_to_name is null then raise exception 'Hedef bulunamadı'; end if;
    insert into public.inventory_custody_balances
      (material_id, holder_type, holder_id, holder_name, quantity, updated_by)
    values (p_material_id, p_to_type, p_to_id, v_to_name, p_quantity, auth.uid())
    on conflict (material_id, holder_type, holder_id) do update set
      quantity = public.inventory_custody_balances.quantity + excluded.quantity,
      holder_name = excluded.holder_name, updated_by = auth.uid()
    returning quantity into v_destination_quantity;
  end if;

  insert into public.inventory_custody_movements
    (material_id, from_type, from_id, from_name, to_type, to_id, to_name, quantity, notes, created_by)
  values (p_material_id, p_from_type, p_from_id, v_from_name,
    p_to_type, p_to_id, v_to_name, p_quantity, nullif(trim(p_notes),''), auth.uid());
  return jsonb_build_object('material_id',p_material_id,'source_remaining',v_source_remaining,
    'destination_quantity',v_destination_quantity);
end;
$$;


--
-- Name: transfer_inventory_to_biga(uuid, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.transfer_inventory_to_biga(p_material_id uuid, p_quantity numeric, p_description text DEFAULT NULL::text) RETURNS public.inventory_materials
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v_material public.inventory_materials;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode='42501'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
  select * into v_material from public.inventory_materials where id=p_material_id for update;
  if not found then raise exception 'Malzeme bulunamadı'; end if;
  if v_material.unit='piece' and p_quantity<>trunc(p_quantity) then raise exception 'Adet miktarı tam sayı olmalıdır'; end if;
  if v_material.stock_quantity < p_quantity then raise exception 'Merkez Şantiye stoku yetersiz. Mevcut: %', v_material.stock_quantity; end if;
  update public.inventory_materials
  set stock_quantity=stock_quantity-p_quantity, biga_stock_quantity=biga_stock_quantity+p_quantity, updated_by=auth.uid()
  where id=p_material_id returning * into v_material;
  insert into public.inventory_movements
    (material_id,movement_type,quantity,usage_location,description,balance_after,created_by,action_type,source_location,target_location)
  values (p_material_id,'out',p_quantity,'AZG BİGA ŞUBE',nullif(trim(p_description),''),v_material.stock_quantity,auth.uid(),'transfer','center','biga');
  return v_material;
end;
$$;


--
-- Name: update_own_profile(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_own_profile(p_full_name text, p_job_title text DEFAULT NULL::text, p_avatar_path text DEFAULT NULL::text) RETURNS public.profiles
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
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


--
-- Name: update_shared_note(uuid, text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_shared_note(p_note_id uuid, p_title text, p_note_date date) RETURNS public.shared_notes
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
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


--
-- Name: validate_attendance_date_and_weekly_rest(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_attendance_date_and_weekly_rest() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_now timestamp := timezone('Europe/Istanbul', now());
begin
  if new.attendance_date > v_now::date
    or (new.attendance_date = v_now::date and v_now::time < time '09:00') then
    raise exception 'Puantaj yalnızca ilgili gün saat 09:00 sonrası veya geçmiş tarihler için girilebilir';
  end if;
  if new.status = 'weekly_rest' and extract(isodow from new.attendance_date) <> 7 then
    raise exception 'Hafta tatili yalnızca pazar günü olabilir';
  end if;
  return new;
end;
$$;


--
-- Name: validate_bgfd_transfer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_bgfd_transfer() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare excavation_required boolean; missing_stage text;
begin
  if new.stage <> 'transfer' then return new; end if;
  select tracks_excavation into excavation_required from public.project_cabinets where id=new.cabinet_id;
  select required.stage into missing_stage from unnest(
    case when excavation_required
      then array['cable','excavation_permit_waiting','excavation_waiting','excavation_done','energy_cable','energy','cabinet_installation','joint']
      else array['cable','energy_cable','energy','cabinet_installation','joint'] end
  ) required(stage)
  where not exists (select 1 from public.project_cabinet_progress p where p.cabinet_id=new.cabinet_id and p.stage=required.stage)
  limit 1;
  if missing_stage is not null then raise exception 'Aktarma öncesinde eksik aşama: %', missing_stage; end if;
  return new;
end; $$;


--
-- Name: validate_personnel_termination(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_personnel_termination() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if old.is_active = true and new.is_active = false then
    if new.employment_end_date is null then
      raise exception 'İşten çıkış tarihi zorunludur';
    end if;
    if nullif(trim(new.termination_reason), '') is null then
      raise exception 'İşten çıkış sebebi zorunludur';
    end if;

    insert into public.personnel_employment_periods (
      personnel_id,
      employment_start_date,
      employment_end_date,
      termination_reason
    ) values (
      old.id,
      old.employment_start_date,
      new.employment_end_date,
      trim(new.termination_reason)
    );
  end if;

  if old.is_active = false and new.is_active = true then
    if new.employment_start_date is null then
      raise exception 'Yeni işe giriş tarihi zorunludur';
    end if;
    if old.employment_end_date is not null
      and new.employment_start_date <= old.employment_end_date then
      raise exception 'Yeni işe giriş tarihi son çıkış tarihinden sonra olmalıdır';
    end if;
    new.employment_end_date := null;
    new.termination_reason := null;
  end if;

  return new;
end;
$$;


--
-- Name: validate_sheet_progress_quantity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_sheet_progress_quantity() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare available integer; used integer;
begin
  if new.stage = 'cable' then
    select quantity into available from public.project_sheet_cables
      where id = new.cable_id and sheet_id = new.sheet_id;
    if available is null then raise exception 'Seçilen kablo bu paftaya ait değil'; end if;
    select coalesce(sum(quantity), 0) into used from public.project_sheet_progress
      where cable_id = new.cable_id and stage = 'cable' and id is distinct from new.id;
    if used + new.quantity > available then
      raise exception 'Kablo ilerleme adedi tanımlı adedi aşamaz';
    end if;
  end if;
  return new;
end;
$$;


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    value jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: TABLE app_settings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_settings IS 'Uygulama ayarları (manuel proje türleri vb.)';


--
-- Name: attendance_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_audit_logs (
    id bigint NOT NULL,
    attendance_record_id uuid,
    personnel_id uuid NOT NULL,
    attendance_date date NOT NULL,
    action text NOT NULL,
    old_status public.attendance_status,
    new_status public.attendance_status,
    old_leave_type public.attendance_leave_type,
    new_leave_type public.attendance_leave_type,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT attendance_audit_logs_action_check CHECK ((action = ANY (ARRAY['insert'::text, 'update'::text, 'delete'::text])))
);


--
-- Name: attendance_audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.attendance_audit_logs ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.attendance_audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: attendance_month_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_month_notes (
    year integer NOT NULL,
    month integer NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT attendance_month_notes_month_check CHECK (((month >= 1) AND (month <= 12))),
    CONSTRAINT attendance_month_notes_year_check CHECK (((year >= 2000) AND (year <= 2100)))
);


--
-- Name: attendance_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    personnel_id uuid NOT NULL,
    attendance_date date NOT NULL,
    status public.attendance_status NOT NULL,
    is_auto_generated boolean DEFAULT false NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    leave_type public.attendance_leave_type
);


--
-- Name: TABLE attendance_records; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.attendance_records IS 'Personel günlük puantaj kayıtları';


--
-- Name: COLUMN attendance_records.is_auto_generated; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.attendance_records.is_auto_generated IS 'Pazar günü sistem tarafından oluşturulan HT kaydını belirtir';


--
-- Name: COLUMN attendance_records.leave_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.attendance_records.leave_type IS 'Gelecekte izinli durumunun yıllık/ücretsiz/mazeret ayrımı için hazırlanmıştır';


--
-- Name: daily_work_plan_absences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_work_plan_absences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_plan_id uuid NOT NULL,
    personnel_id uuid NOT NULL,
    full_name text NOT NULL,
    status public.work_plan_absence_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dwp_absences_name_length CHECK ((char_length(TRIM(BOTH FROM full_name)) >= 2))
);


--
-- Name: TABLE daily_work_plan_absences; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.daily_work_plan_absences IS 'Günlük iş planına özel izinli/raporlu personel snapshot kayıtları; puantajdan bağımsızdır';


--
-- Name: daily_work_plan_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_work_plan_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_date date NOT NULL,
    notes text,
    teams jsonb DEFAULT '[]'::jsonb NOT NULL,
    absences jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: daily_work_plan_team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_work_plan_team_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    personnel_id uuid,
    full_name text NOT NULL,
    phone text,
    is_chief boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    job_title text,
    CONSTRAINT daily_work_plan_team_members_job_title_length CHECK (((job_title IS NULL) OR ((char_length(TRIM(BOTH FROM job_title)) >= 1) AND (char_length(TRIM(BOTH FROM job_title)) <= 120)))),
    CONSTRAINT dwp_members_name CHECK ((char_length(TRIM(BOTH FROM full_name)) >= 2))
);


--
-- Name: TABLE daily_work_plan_team_members; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.daily_work_plan_team_members IS 'Ekip personel snapshot — geçmiş planlar değişmez';


--
-- Name: COLUMN daily_work_plan_team_members.phone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.daily_work_plan_team_members.phone IS 'Yalnız şef satırında WhatsApp çıktısına yazılır';


--
-- Name: COLUMN daily_work_plan_team_members.is_chief; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.daily_work_plan_team_members.is_chief IS 'true ise ilk sırada; WhatsApp etiket yazılmaz';


--
-- Name: COLUMN daily_work_plan_team_members.job_title; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.daily_work_plan_team_members.job_title IS 'Plan oluşturulduğu andaki opsiyonel görev bilgisi snapshot değeri';


--
-- Name: daily_work_plan_teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_work_plan_teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    project_code text NOT NULL,
    project_name text NOT NULL,
    team_type text NOT NULL,
    vehicle_plate text NOT NULL,
    chief_personnel_id uuid,
    chief_name text NOT NULL,
    chief_phone text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    project_id uuid,
    vehicle_id uuid,
    work_location text,
    work_description text,
    notes text,
    CONSTRAINT dwp_teams_chief_name CHECK ((char_length(TRIM(BOTH FROM chief_name)) >= 2)),
    CONSTRAINT dwp_teams_chief_phone CHECK ((char_length(TRIM(BOTH FROM chief_phone)) >= 7)),
    CONSTRAINT dwp_teams_plate CHECK ((char_length(TRIM(BOTH FROM vehicle_plate)) >= 1)),
    CONSTRAINT dwp_teams_project_code CHECK ((char_length(TRIM(BOTH FROM project_code)) >= 1)),
    CONSTRAINT dwp_teams_project_name CHECK ((char_length(TRIM(BOTH FROM project_name)) >= 2)),
    CONSTRAINT dwp_teams_type CHECK ((char_length(TRIM(BOTH FROM team_type)) >= 1))
);


--
-- Name: TABLE daily_work_plan_teams; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.daily_work_plan_teams IS 'Günlük plan ekipleri — proje/araç snapshot';


--
-- Name: COLUMN daily_work_plan_teams.chief_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.daily_work_plan_teams.chief_name IS 'Ekip şefi adı snapshot';


--
-- Name: COLUMN daily_work_plan_teams.chief_phone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.daily_work_plan_teams.chief_phone IS 'Ekip şefi telefon snapshot';


--
-- Name: daily_work_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_work_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_date date NOT NULL,
    notes text,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE daily_work_plans; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.daily_work_plans IS 'Günlük iş planı — tarih başına bir plan';


--
-- Name: inventory_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_catalog (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    material_name text NOT NULL,
    stock_category text NOT NULL,
    material_type text,
    size text,
    unit public.inventory_unit NOT NULL,
    has_id boolean DEFAULT false NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_catalog_stock_category_check CHECK ((stock_category = ANY (ARRAY['fiber_cable'::text, 'copper_network'::text, 'underground'::text, 'fiber_accessory'::text])))
);


--
-- Name: inventory_custody_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_custody_balances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    material_id uuid NOT NULL,
    holder_type text NOT NULL,
    holder_id uuid NOT NULL,
    holder_name text NOT NULL,
    quantity numeric(14,3) NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_custody_balances_holder_type_check CHECK ((holder_type = ANY (ARRAY['personnel'::text, 'team'::text, 'vehicle'::text]))),
    CONSTRAINT inventory_custody_balances_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: inventory_custody_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_custody_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    material_id uuid NOT NULL,
    from_type text NOT NULL,
    from_id uuid,
    from_name text NOT NULL,
    to_type text NOT NULL,
    to_id uuid,
    to_name text NOT NULL,
    quantity numeric(14,3) NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_custody_different_locations CHECK (((from_type <> to_type) OR (from_id IS DISTINCT FROM to_id))),
    CONSTRAINT inventory_custody_from_reference CHECK ((((from_type = 'warehouse'::text) AND (from_id IS NULL)) OR ((from_type <> 'warehouse'::text) AND (from_id IS NOT NULL)))),
    CONSTRAINT inventory_custody_movements_from_type_check CHECK ((from_type = ANY (ARRAY['warehouse'::text, 'personnel'::text, 'team'::text, 'vehicle'::text]))),
    CONSTRAINT inventory_custody_movements_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT inventory_custody_movements_to_type_check CHECK ((to_type = ANY (ARRAY['warehouse'::text, 'personnel'::text, 'team'::text, 'vehicle'::text]))),
    CONSTRAINT inventory_custody_to_reference CHECK ((((to_type = 'warehouse'::text) AND (to_id IS NULL)) OR ((to_type <> 'warehouse'::text) AND (to_id IS NOT NULL))))
);


--
-- Name: inventory_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    material_id uuid NOT NULL,
    movement_type public.inventory_movement_type NOT NULL,
    quantity numeric(14,3) NOT NULL,
    usage_location text,
    description text,
    balance_after numeric(14,3) NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    action_type text DEFAULT 'usage'::text NOT NULL,
    source_location text,
    target_location text,
    project_name text,
    project_code text,
    team_personnel_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    team_personnel_names text[] DEFAULT '{}'::text[] NOT NULL,
    shipment_id uuid,
    receipt_date date,
    received_by text,
    dispatch_number text,
    receipt_id uuid,
    CONSTRAINT inventory_movement_action_check CHECK ((action_type = ANY (ARRAY['in'::text, 'usage'::text, 'transfer'::text]))),
    CONSTRAINT inventory_movement_quantity_positive CHECK ((quantity > (0)::numeric)),
    CONSTRAINT inventory_movement_source_check CHECK (((source_location IS NULL) OR (source_location = ANY (ARRAY['center'::text, 'biga'::text])))),
    CONSTRAINT inventory_movement_target_check CHECK (((target_location IS NULL) OR (target_location = ANY (ARRAY['center'::text, 'biga'::text]))))
);


--
-- Name: TABLE inventory_movements; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.inventory_movements IS 'Silinmeyen malzeme giriş ve kullanım hareketleri';


--
-- Name: inventory_receipt_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_receipt_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    receipt_id uuid NOT NULL,
    material_id uuid NOT NULL,
    quantity numeric(14,3) NOT NULL,
    CONSTRAINT inventory_receipt_items_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: inventory_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    receipt_date date NOT NULL,
    received_by text NOT NULL,
    dispatch_number text NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_receipts_dispatch_number_check CHECK ((char_length(TRIM(BOTH FROM dispatch_number)) >= 1)),
    CONSTRAINT inventory_receipts_received_by_check CHECK ((char_length(TRIM(BOTH FROM received_by)) >= 2))
);


--
-- Name: inventory_request_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_request_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    catalog_id uuid NOT NULL,
    quantity numeric(14,3) NOT NULL,
    CONSTRAINT inventory_request_items_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: inventory_request_receipt_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_request_receipt_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    catalog_id uuid NOT NULL,
    quantity numeric(14,3) NOT NULL,
    material_code text,
    CONSTRAINT inventory_request_receipt_items_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: inventory_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_date date NOT NULL,
    requested_by text NOT NULL,
    status text DEFAULT 'requested'::text NOT NULL,
    notes text,
    approved_at timestamp with time zone,
    approved_by uuid,
    received_at timestamp with time zone,
    receipt_id uuid,
    pending_receipt_date date,
    pending_received_by text,
    pending_dispatch_number text,
    pending_receipt_notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_requests_requested_by_check CHECK ((char_length(TRIM(BOTH FROM requested_by)) >= 2)),
    CONSTRAINT inventory_requests_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'approved'::text, 'receipt_review'::text, 'received'::text])))
);


--
-- Name: inventory_shipment_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_shipment_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shipment_id uuid NOT NULL,
    material_id uuid NOT NULL,
    quantity numeric(14,3) NOT NULL,
    CONSTRAINT inventory_shipment_items_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: inventory_shipments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_shipments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shipment_date date NOT NULL,
    delivered_by text NOT NULL,
    received_by text NOT NULL,
    vehicle_id uuid,
    vehicle_plate text NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_shipments_delivered_by_check CHECK ((char_length(TRIM(BOTH FROM delivered_by)) >= 2)),
    CONSTRAINT inventory_shipments_received_by_check CHECK ((char_length(TRIM(BOTH FROM received_by)) >= 2)),
    CONSTRAINT inventory_shipments_vehicle_plate_check CHECK ((char_length(TRIM(BOTH FROM vehicle_plate)) >= 2))
);


--
-- Name: personnel; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.personnel (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text NOT NULL,
    phone text,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    employment_start_date date,
    employment_end_date date,
    tc_identity_number text,
    job_title text,
    monthly_salary numeric(14,2) DEFAULT 0 NOT NULL,
    termination_reason text,
    CONSTRAINT personnel_active_end_date_valid CHECK (((is_active = false) OR (employment_end_date IS NULL))),
    CONSTRAINT personnel_employment_dates_valid CHECK (((employment_end_date IS NULL) OR (employment_start_date IS NULL) OR (employment_end_date >= employment_start_date))),
    CONSTRAINT personnel_job_title_length CHECK (((job_title IS NULL) OR ((char_length(TRIM(BOTH FROM job_title)) >= 1) AND (char_length(TRIM(BOTH FROM job_title)) <= 120)))),
    CONSTRAINT personnel_monthly_salary_nonnegative CHECK ((monthly_salary >= (0)::numeric)),
    CONSTRAINT personnel_name_length CHECK ((char_length(TRIM(BOTH FROM full_name)) >= 2)),
    CONSTRAINT personnel_tc_identity_number_format CHECK (((tc_identity_number IS NULL) OR (tc_identity_number ~ '^[0-9]{11}$'::text))),
    CONSTRAINT personnel_termination_reason_length CHECK (((termination_reason IS NULL) OR ((char_length(TRIM(BOTH FROM termination_reason)) >= 1) AND (char_length(TRIM(BOTH FROM termination_reason)) <= 1000))))
);


--
-- Name: TABLE personnel; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.personnel IS 'İş planı personel listesi — ekibe kalıcı bağlı değil';


--
-- Name: COLUMN personnel.employment_start_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.personnel.employment_start_date IS 'İşe giriş tarihi';


--
-- Name: COLUMN personnel.employment_end_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.personnel.employment_end_date IS 'İşten ayrılış tarihi; yalnız pasif personelde kullanılır';


--
-- Name: COLUMN personnel.tc_identity_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.personnel.tc_identity_number IS 'Personelin 11 haneli TC Kimlik Numarası; mevcut eski kayıtlar için nullable.';


--
-- Name: COLUMN personnel.job_title; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.personnel.job_title IS 'Opsiyonel serbest metin görev bilgisi';


--
-- Name: COLUMN personnel.termination_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.personnel.termination_reason IS 'Personelin işten çıkış sebebi';


--
-- Name: personnel_advances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.personnel_advances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    personnel_id uuid NOT NULL,
    advance_date date DEFAULT CURRENT_DATE NOT NULL,
    amount numeric(14,2) NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT personnel_advances_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: personnel_employment_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.personnel_employment_periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    personnel_id uuid NOT NULL,
    employment_start_date date,
    employment_end_date date NOT NULL,
    termination_reason text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT personnel_employment_period_dates CHECK (((employment_start_date IS NULL) OR (employment_end_date >= employment_start_date))),
    CONSTRAINT personnel_employment_period_reason CHECK (((char_length(TRIM(BOTH FROM termination_reason)) >= 1) AND (char_length(TRIM(BOTH FROM termination_reason)) <= 1000)))
);


--
-- Name: private_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.private_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    title text NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT private_notes_content_check CHECK ((char_length(content) <= 5000)),
    CONSTRAINT private_notes_title_check CHECK (((char_length(TRIM(BOTH FROM title)) >= 2) AND (char_length(TRIM(BOTH FROM title)) <= 150)))
);


--
-- Name: production_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.production_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_date date NOT NULL,
    team_leader_personnel_id uuid NOT NULL,
    team_leader_name_snapshot text NOT NULL,
    source_work_plan_id uuid,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: production_item_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.production_item_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    unit text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT production_item_definitions_name_check CHECK ((char_length(TRIM(BOTH FROM name)) >= 2)),
    CONSTRAINT production_item_definitions_unit_check CHECK ((char_length(TRIM(BOTH FROM unit)) >= 1))
);


--
-- Name: production_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.production_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    production_job_id uuid NOT NULL,
    production_item_definition_id uuid,
    item_name_snapshot text NOT NULL,
    quantity numeric(14,3) NOT NULL,
    unit_snapshot text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT production_items_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: production_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.production_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    production_entry_id uuid NOT NULL,
    project_id uuid,
    project_name_snapshot text NOT NULL,
    project_code_snapshot text,
    source text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT production_jobs_project_name_snapshot_check CHECK ((char_length(TRIM(BOTH FROM project_name_snapshot)) >= 2)),
    CONSTRAINT production_jobs_source_check CHECK ((source = ANY (ARRAY['work_plan'::text, 'manual'::text])))
);


--
-- Name: project_cabinet_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_cabinet_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cabinet_id uuid NOT NULL,
    stage text NOT NULL,
    cable_info text,
    energy_cable_info text,
    transfer_info text,
    team_leader_personnel_id uuid,
    team_leader_name text NOT NULL,
    progress_date date DEFAULT CURRENT_DATE NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cabinet_energy_cable_info_required CHECK (((stage <> 'energy_cable'::text) OR (NULLIF(TRIM(BOTH FROM energy_cable_info), ''::text) IS NOT NULL))),
    CONSTRAINT cabinet_transfer_info_required CHECK (((stage <> 'transfer'::text) OR (NULLIF(TRIM(BOTH FROM transfer_info), ''::text) IS NOT NULL))),
    CONSTRAINT project_cabinet_progress_stage_check CHECK ((stage = ANY (ARRAY['cable'::text, 'excavation_permit_waiting'::text, 'excavation_waiting'::text, 'excavation_done'::text, 'energy_cable'::text, 'energy'::text, 'cabinet_installation'::text, 'joint'::text, 'transfer'::text])))
);


--
-- Name: project_cabinets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_cabinets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    cabinet_type text NOT NULL,
    cabinet_no integer NOT NULL,
    name text NOT NULL,
    location text,
    coordinates text,
    tracks_excavation boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sd_code text,
    is_completed boolean DEFAULT false NOT NULL,
    completed_at date,
    CONSTRAINT project_cabinets_cabinet_no_check CHECK ((cabinet_no > 0)),
    CONSTRAINT project_cabinets_cabinet_type_check CHECK ((cabinet_type = ANY (ARRAY['T7'::text, 'T9'::text, 'T11'::text, 'T21'::text, 'T23'::text]))),
    CONSTRAINT project_cabinets_sd_code_format CHECK (((sd_code IS NULL) OR (sd_code ~ '^[0-9]{3}$'::text)))
);


--
-- Name: COLUMN project_cabinets.sd_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_cabinets.sd_code IS 'BGFD dolabının zorunlu üç haneli SD numarası';


--
-- Name: project_cancellation_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_cancellation_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    reason text NOT NULL,
    cancelled_at timestamp with time zone DEFAULT now() NOT NULL,
    cancelled_by uuid,
    reactivated_at timestamp with time zone,
    reactivated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_cancellation_history_reason_check CHECK ((char_length(TRIM(BOTH FROM reason)) >= 3))
);


--
-- Name: project_sheet_cables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_sheet_cables (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sheet_id uuid NOT NULL,
    fiber_count integer NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_sheet_cables_fiber_count_check CHECK ((fiber_count > 0)),
    CONSTRAINT project_sheet_cables_quantity_check CHECK ((quantity > 0))
);


--
-- Name: project_sheet_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_sheet_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sheet_id uuid NOT NULL,
    cable_id uuid,
    stage text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    team_leader_personnel_id uuid,
    team_leader_name text NOT NULL,
    progress_date date DEFAULT CURRENT_DATE NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cable_stage_requires_cable CHECK (((stage <> 'cable'::text) OR (cable_id IS NOT NULL))),
    CONSTRAINT project_sheet_progress_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT project_sheet_progress_stage_check_v2 CHECK ((stage = ANY (ARRAY['cable'::text, 'joint'::text, 'obk'::text, 'excavation_permit_waiting'::text, 'excavation_waiting'::text, 'excavation_done'::text, 'completed'::text])))
);


--
-- Name: project_sheets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_sheets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    hp_count integer,
    tracks_cable boolean DEFAULT true NOT NULL,
    tracks_joint boolean DEFAULT true NOT NULL,
    tracks_obk boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tracks_excavation boolean DEFAULT false NOT NULL,
    location text,
    coordinates text,
    is_completed boolean DEFAULT false NOT NULL,
    completed_at date,
    sheet_no text,
    address text,
    notes text,
    manual_status text DEFAULT 'not_started'::text NOT NULL,
    completed_by_personnel_id uuid,
    completed_by_name text,
    current_team_leader_personnel_id uuid,
    current_team_leader_name text,
    image_url text,
    CONSTRAINT project_sheets_coordinates_length CHECK (((coordinates IS NULL) OR (char_length(TRIM(BOTH FROM coordinates)) <= 300))),
    CONSTRAINT project_sheets_hp_count_check CHECK (((hp_count IS NULL) OR (hp_count >= 0))),
    CONSTRAINT project_sheets_location_length CHECK (((location IS NULL) OR (char_length(TRIM(BOTH FROM location)) <= 300))),
    CONSTRAINT project_sheets_manual_status_check CHECK ((manual_status = ANY (ARRAY['not_started'::text, 'excavation_permit_waiting'::text, 'in_progress'::text, 'completed'::text])))
);


--
-- Name: COLUMN project_sheets.tracks_excavation; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_sheets.tracks_excavation IS 'Bu paftada kazı süreci takip edilecek mi';


--
-- Name: COLUMN project_sheets.location; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_sheets.location IS 'Paftaya ait isteğe bağlı lokasyon/adres bilgisi';


--
-- Name: COLUMN project_sheets.coordinates; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_sheets.coordinates IS 'Paftaya ait isteğe bağlı konum, koordinat veya harita bağlantısı';


--
-- Name: app_settings app_settings_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_key_key UNIQUE (key);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);


--
-- Name: attendance_audit_logs attendance_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_audit_logs
    ADD CONSTRAINT attendance_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: attendance_month_notes attendance_month_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_month_notes
    ADD CONSTRAINT attendance_month_notes_pkey PRIMARY KEY (year, month);


--
-- Name: attendance_records attendance_personnel_date_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_personnel_date_unique UNIQUE (personnel_id, attendance_date);


--
-- Name: attendance_records attendance_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_pkey PRIMARY KEY (id);


--
-- Name: company_manager_permissions company_manager_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_manager_permissions
    ADD CONSTRAINT company_manager_permissions_pkey PRIMARY KEY (user_id);


--
-- Name: daily_work_plan_absences daily_work_plan_absences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_work_plan_absences
    ADD CONSTRAINT daily_work_plan_absences_pkey PRIMARY KEY (id);


--
-- Name: daily_work_plan_drafts daily_work_plan_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_work_plan_drafts
    ADD CONSTRAINT daily_work_plan_drafts_pkey PRIMARY KEY (id);


--
-- Name: daily_work_plan_team_members daily_work_plan_team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_work_plan_team_members
    ADD CONSTRAINT daily_work_plan_team_members_pkey PRIMARY KEY (id);


--
-- Name: daily_work_plan_teams daily_work_plan_teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_work_plan_teams
    ADD CONSTRAINT daily_work_plan_teams_pkey PRIMARY KEY (id);


--
-- Name: daily_work_plans daily_work_plans_date_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_work_plans
    ADD CONSTRAINT daily_work_plans_date_unique UNIQUE (plan_date);


--
-- Name: daily_work_plans daily_work_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_work_plans
    ADD CONSTRAINT daily_work_plans_pkey PRIMARY KEY (id);


--
-- Name: daily_work_plan_absences dwp_absences_person_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_work_plan_absences
    ADD CONSTRAINT dwp_absences_person_unique UNIQUE (work_plan_id, personnel_id);


--
-- Name: inventory_catalog inventory_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_catalog
    ADD CONSTRAINT inventory_catalog_pkey PRIMARY KEY (id);


--
-- Name: inventory_custody_balances inventory_custody_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_custody_balances
    ADD CONSTRAINT inventory_custody_balances_pkey PRIMARY KEY (id);


--
-- Name: inventory_custody_balances inventory_custody_holder_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_custody_balances
    ADD CONSTRAINT inventory_custody_holder_unique UNIQUE (material_id, holder_type, holder_id);


--
-- Name: inventory_custody_movements inventory_custody_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_custody_movements
    ADD CONSTRAINT inventory_custody_movements_pkey PRIMARY KEY (id);


--
-- Name: inventory_materials inventory_materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_materials
    ADD CONSTRAINT inventory_materials_pkey PRIMARY KEY (id);


--
-- Name: inventory_movements inventory_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_pkey PRIMARY KEY (id);


--
-- Name: inventory_receipt_items inventory_receipt_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_receipt_items
    ADD CONSTRAINT inventory_receipt_items_pkey PRIMARY KEY (id);


--
-- Name: inventory_receipt_items inventory_receipt_items_receipt_id_material_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_receipt_items
    ADD CONSTRAINT inventory_receipt_items_receipt_id_material_id_key UNIQUE (receipt_id, material_id);


--
-- Name: inventory_receipts inventory_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_receipts
    ADD CONSTRAINT inventory_receipts_pkey PRIMARY KEY (id);


--
-- Name: inventory_request_items inventory_request_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_request_items
    ADD CONSTRAINT inventory_request_items_pkey PRIMARY KEY (id);


--
-- Name: inventory_request_items inventory_request_items_request_id_catalog_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_request_items
    ADD CONSTRAINT inventory_request_items_request_id_catalog_id_key UNIQUE (request_id, catalog_id);


--
-- Name: inventory_request_receipt_items inventory_request_receipt_ite_request_id_catalog_id_materia_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_request_receipt_items
    ADD CONSTRAINT inventory_request_receipt_ite_request_id_catalog_id_materia_key UNIQUE (request_id, catalog_id, material_code);


--
-- Name: inventory_request_receipt_items inventory_request_receipt_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_request_receipt_items
    ADD CONSTRAINT inventory_request_receipt_items_pkey PRIMARY KEY (id);


--
-- Name: inventory_requests inventory_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_requests
    ADD CONSTRAINT inventory_requests_pkey PRIMARY KEY (id);


--
-- Name: inventory_shipment_items inventory_shipment_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_shipment_items
    ADD CONSTRAINT inventory_shipment_items_pkey PRIMARY KEY (id);


--
-- Name: inventory_shipment_items inventory_shipment_items_shipment_id_material_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_shipment_items
    ADD CONSTRAINT inventory_shipment_items_shipment_id_material_id_key UNIQUE (shipment_id, material_id);


--
-- Name: inventory_shipments inventory_shipments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_shipments
    ADD CONSTRAINT inventory_shipments_pkey PRIMARY KEY (id);


--
-- Name: personnel_advances personnel_advances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personnel_advances
    ADD CONSTRAINT personnel_advances_pkey PRIMARY KEY (id);


--
-- Name: personnel_employment_periods personnel_employment_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personnel_employment_periods
    ADD CONSTRAINT personnel_employment_periods_pkey PRIMARY KEY (id);


--
-- Name: personnel personnel_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personnel
    ADD CONSTRAINT personnel_pkey PRIMARY KEY (id);


--
-- Name: private_notes private_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.private_notes
    ADD CONSTRAINT private_notes_pkey PRIMARY KEY (id);


--
-- Name: production_entries production_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_entries
    ADD CONSTRAINT production_entries_pkey PRIMARY KEY (id);


--
-- Name: production_entries production_entry_day_leader_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_entries
    ADD CONSTRAINT production_entry_day_leader_unique UNIQUE (work_date, team_leader_personnel_id);


--
-- Name: production_item_definitions production_item_definitions_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_item_definitions
    ADD CONSTRAINT production_item_definitions_name_key UNIQUE (name);


--
-- Name: production_item_definitions production_item_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_item_definitions
    ADD CONSTRAINT production_item_definitions_pkey PRIMARY KEY (id);


--
-- Name: production_items production_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_items
    ADD CONSTRAINT production_items_pkey PRIMARY KEY (id);


--
-- Name: production_jobs production_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_jobs
    ADD CONSTRAINT production_jobs_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: project_cabinet_progress project_cabinet_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_cabinet_progress
    ADD CONSTRAINT project_cabinet_progress_pkey PRIMARY KEY (id);


--
-- Name: project_cabinets project_cabinets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_cabinets
    ADD CONSTRAINT project_cabinets_pkey PRIMARY KEY (id);


--
-- Name: project_cabinets project_cabinets_project_id_cabinet_type_cabinet_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_cabinets
    ADD CONSTRAINT project_cabinets_project_id_cabinet_type_cabinet_no_key UNIQUE (project_id, cabinet_type, cabinet_no);


--
-- Name: project_cancellation_history project_cancellation_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_cancellation_history
    ADD CONSTRAINT project_cancellation_history_pkey PRIMARY KEY (id);


--
-- Name: project_sheet_cables project_sheet_cables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_sheet_cables
    ADD CONSTRAINT project_sheet_cables_pkey PRIMARY KEY (id);


--
-- Name: project_sheet_progress project_sheet_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_sheet_progress
    ADD CONSTRAINT project_sheet_progress_pkey PRIMARY KEY (id);


--
-- Name: project_sheets project_sheets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_sheets
    ADD CONSTRAINT project_sheets_pkey PRIMARY KEY (id);


--
-- Name: project_sheets project_sheets_project_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_sheets
    ADD CONSTRAINT project_sheets_project_id_name_key UNIQUE (project_id, name);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: projects projects_project_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_project_code_key UNIQUE (project_code);


--
-- Name: shared_notes shared_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_notes
    ADD CONSTRAINT shared_notes_pkey PRIMARY KEY (id);


--
-- Name: vehicle_fuel_logs vehicle_fuel_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_fuel_logs
    ADD CONSTRAINT vehicle_fuel_logs_pkey PRIMARY KEY (id);


--
-- Name: vehicles vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_pkey PRIMARY KEY (id);


--
-- Name: vehicles vehicles_plate_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_plate_unique UNIQUE (plate);


--
-- Name: idx_attendance_audit_changed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_audit_changed_at ON public.attendance_audit_logs USING btree (changed_at DESC);


--
-- Name: idx_attendance_audit_personnel_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_audit_personnel_date ON public.attendance_audit_logs USING btree (personnel_id, attendance_date, changed_at DESC);


--
-- Name: idx_attendance_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_date ON public.attendance_records USING btree (attendance_date);


--
-- Name: idx_attendance_personnel_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_personnel_month ON public.attendance_records USING btree (personnel_id, attendance_date);


--
-- Name: idx_attendance_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_status ON public.attendance_records USING btree (status);


--
-- Name: idx_daily_work_plan_drafts_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_work_plan_drafts_updated ON public.daily_work_plan_drafts USING btree (updated_at DESC);


--
-- Name: idx_daily_work_plans_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_work_plans_date ON public.daily_work_plans USING btree (plan_date DESC);


--
-- Name: idx_dwp_absences_personnel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dwp_absences_personnel ON public.daily_work_plan_absences USING btree (personnel_id);


--
-- Name: idx_dwp_absences_work_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dwp_absences_work_plan ON public.daily_work_plan_absences USING btree (work_plan_id);


--
-- Name: idx_dwp_members_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dwp_members_name ON public.daily_work_plan_team_members USING btree (full_name);


--
-- Name: idx_dwp_members_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dwp_members_name_trgm ON public.daily_work_plan_team_members USING gin (full_name extensions.gin_trgm_ops);


--
-- Name: idx_dwp_members_personnel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dwp_members_personnel ON public.daily_work_plan_team_members USING btree (personnel_id);


--
-- Name: idx_dwp_members_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dwp_members_team ON public.daily_work_plan_team_members USING btree (team_id, sort_order);


--
-- Name: idx_dwp_teams_chief_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dwp_teams_chief_name ON public.daily_work_plan_teams USING btree (chief_name);


--
-- Name: idx_dwp_teams_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dwp_teams_plan ON public.daily_work_plan_teams USING btree (plan_id, sort_order);


--
-- Name: idx_dwp_teams_plate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dwp_teams_plate ON public.daily_work_plan_teams USING btree (vehicle_plate);


--
-- Name: idx_dwp_teams_project_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dwp_teams_project_code ON public.daily_work_plan_teams USING btree (project_code);


--
-- Name: idx_dwp_teams_project_code_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dwp_teams_project_code_trgm ON public.daily_work_plan_teams USING gin (project_code extensions.gin_trgm_ops);


--
-- Name: idx_dwp_teams_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dwp_teams_project_id ON public.daily_work_plan_teams USING btree (project_id);


--
-- Name: idx_dwp_teams_project_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dwp_teams_project_name_trgm ON public.daily_work_plan_teams USING gin (project_name extensions.gin_trgm_ops);


--
-- Name: idx_dwp_teams_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dwp_teams_type ON public.daily_work_plan_teams USING btree (team_type);


--
-- Name: idx_dwp_teams_vehicle_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dwp_teams_vehicle_id ON public.daily_work_plan_teams USING btree (vehicle_id);


--
-- Name: idx_inventory_catalog_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_inventory_catalog_identity ON public.inventory_catalog USING btree (lower(TRIM(BOTH FROM material_name)), stock_category, lower(TRIM(BOTH FROM COALESCE(material_type, ''::text))), lower(TRIM(BOTH FROM COALESCE(size, ''::text))));


--
-- Name: idx_inventory_custody_balances_holder; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_custody_balances_holder ON public.inventory_custody_balances USING btree (holder_type, holder_id);


--
-- Name: idx_inventory_custody_movements_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_custody_movements_created ON public.inventory_custody_movements USING btree (created_at DESC);


--
-- Name: idx_inventory_custody_movements_material; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_custody_movements_material ON public.inventory_custody_movements USING btree (material_id, created_at DESC);


--
-- Name: idx_inventory_material_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_inventory_material_code_unique ON public.inventory_materials USING btree (lower(TRIM(BOTH FROM material_code))) WHERE ((material_code IS NOT NULL) AND (TRIM(BOTH FROM material_code) <> ''::text));


--
-- Name: idx_inventory_material_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_material_name ON public.inventory_materials USING btree (material_name);


--
-- Name: idx_inventory_materials_catalog; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_materials_catalog ON public.inventory_materials USING btree (catalog_id);


--
-- Name: idx_inventory_materials_category_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_materials_category_name ON public.inventory_materials USING btree (material_category, material_name);


--
-- Name: idx_inventory_materials_stock_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_materials_stock_category ON public.inventory_materials USING btree (stock_category, material_name) WHERE (material_category = 'stock'::text);


--
-- Name: idx_inventory_movements_material_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_movements_material_created ON public.inventory_movements USING btree (material_id, created_at DESC);


--
-- Name: idx_inventory_receipts_dispatch; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_inventory_receipts_dispatch ON public.inventory_receipts USING btree (lower(TRIM(BOTH FROM dispatch_number)));


--
-- Name: idx_inventory_shipment_items_shipment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_shipment_items_shipment ON public.inventory_shipment_items USING btree (shipment_id);


--
-- Name: idx_inventory_shipments_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_shipments_date ON public.inventory_shipments USING btree (shipment_date DESC);


--
-- Name: idx_personnel_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_personnel_active ON public.personnel USING btree (is_active);


--
-- Name: idx_personnel_advances_personnel_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_personnel_advances_personnel_date ON public.personnel_advances USING btree (personnel_id, advance_date DESC);


--
-- Name: idx_personnel_employment_periods_personnel_end; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_personnel_employment_periods_personnel_end ON public.personnel_employment_periods USING btree (personnel_id, employment_end_date DESC);


--
-- Name: idx_personnel_employment_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_personnel_employment_start ON public.personnel USING btree (employment_start_date);


--
-- Name: idx_personnel_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_personnel_name ON public.personnel USING btree (full_name);


--
-- Name: idx_personnel_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_personnel_name_trgm ON public.personnel USING gin (full_name extensions.gin_trgm_ops);


--
-- Name: idx_private_notes_owner_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_private_notes_owner_updated ON public.private_notes USING btree (user_id, updated_at DESC);


--
-- Name: idx_production_entries_date_leader; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_production_entries_date_leader ON public.production_entries USING btree (work_date DESC, team_leader_personnel_id);


--
-- Name: idx_production_items_job_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_production_items_job_order ON public.production_items USING btree (production_job_id, sort_order);


--
-- Name: idx_production_jobs_entry_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_production_jobs_entry_order ON public.production_jobs USING btree (production_entry_id, sort_order);


--
-- Name: idx_project_cancellation_history_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_cancellation_history_project ON public.project_cancellation_history USING btree (project_id, cancelled_at DESC);


--
-- Name: idx_projects_access_obligation_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_access_obligation_priority ON public.projects USING btree (priority_order, created_at) WHERE ((project_type = 'ERISIM_ZORUNLULUK'::text) AND (is_archived = false) AND (priority_order IS NOT NULL));


--
-- Name: idx_projects_active_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_active_updated ON public.projects USING btree (updated_at DESC) WHERE (is_archived = false);


--
-- Name: idx_projects_archived; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_archived ON public.projects USING btree (is_archived);


--
-- Name: idx_projects_bf_gf_tracking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_bf_gf_tracking ON public.projects USING btree (project_type, tracks_obk, obk_pulled, joint_done) WHERE (project_type = ANY (ARRAY['BF'::text, 'GF'::text]));


--
-- Name: idx_projects_cancelled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_cancelled ON public.projects USING btree (is_cancelled, cancelled_at DESC);


--
-- Name: idx_projects_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_code ON public.projects USING btree (project_code);


--
-- Name: idx_projects_code_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_code_trgm ON public.projects USING gin (project_code extensions.gin_trgm_ops);


--
-- Name: idx_projects_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_created_at ON public.projects USING btree (created_at DESC);


--
-- Name: idx_projects_default_active_list_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_default_active_list_order ON public.projects USING btree (project_type_sort_order, priority_order, default_status_sort_order, updated_at DESC) WHERE (is_archived = false);


--
-- Name: idx_projects_description_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_description_trgm ON public.projects USING gin (COALESCE(description, ''::text) extensions.gin_trgm_ops);


--
-- Name: idx_projects_excel_tracking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_excel_tracking ON public.projects USING btree (tracks_obk, obk_pulled, tracks_joint, joint_done, tracks_cable, cable_pulled, tracks_excavation, excavation_done) WHERE (is_archived = false);


--
-- Name: idx_projects_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_location ON public.projects USING btree (location);


--
-- Name: idx_projects_location_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_location_trgm ON public.projects USING gin (location extensions.gin_trgm_ops);


--
-- Name: idx_projects_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_name_trgm ON public.projects USING gin (name extensions.gin_trgm_ops);


--
-- Name: idx_projects_status_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_status_active ON public.projects USING btree (status) WHERE (is_archived = false);


--
-- Name: idx_projects_status_archived; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_status_archived ON public.projects USING btree (status, is_archived);


--
-- Name: idx_projects_team_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_team_name ON public.projects USING btree (team_name);


--
-- Name: idx_projects_team_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_team_trgm ON public.projects USING gin (team_name extensions.gin_trgm_ops);


--
-- Name: idx_projects_ttvpn_list_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_ttvpn_list_order ON public.projects USING btree (priority_order, status_sort_order, updated_at DESC) WHERE (project_type = 'KURUMSAL_TTVPN'::text);


--
-- Name: idx_projects_ttvpn_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_ttvpn_priority ON public.projects USING btree (priority_order, created_at) WHERE ((project_type = 'KURUMSAL_TTVPN'::text) AND (is_archived = false) AND (priority_order IS NOT NULL));


--
-- Name: idx_projects_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_type ON public.projects USING btree (project_type);


--
-- Name: idx_projects_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_updated_at ON public.projects USING btree (updated_at DESC);


--
-- Name: idx_shared_notes_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shared_notes_created_at ON public.shared_notes USING btree (created_at DESC);


--
-- Name: idx_shared_notes_note_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shared_notes_note_date ON public.shared_notes USING btree (note_date, created_at DESC);


--
-- Name: idx_vehicle_fuel_logs_vehicle_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicle_fuel_logs_vehicle_date ON public.vehicle_fuel_logs USING btree (vehicle_id, fuel_date DESC, created_at DESC);


--
-- Name: idx_vehicles_assigned_personnel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicles_assigned_personnel ON public.vehicles USING btree (assigned_personnel_id);


--
-- Name: idx_vehicles_inspection_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicles_inspection_date ON public.vehicles USING btree (inspection_date);


--
-- Name: idx_vehicles_insurance_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicles_insurance_date ON public.vehicles USING btree (insurance_date);


--
-- Name: idx_vehicles_plate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicles_plate ON public.vehicles USING btree (plate);


--
-- Name: personnel_tc_identity_number_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX personnel_tc_identity_number_unique ON public.personnel USING btree (tc_identity_number) WHERE (tc_identity_number IS NOT NULL);


--
-- Name: project_cabinet_progress_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_cabinet_progress_idx ON public.project_cabinet_progress USING btree (cabinet_id, progress_date DESC);


--
-- Name: project_cabinets_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_cabinets_project_idx ON public.project_cabinets USING btree (project_id);


--
-- Name: project_cabinets_project_sd_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX project_cabinets_project_sd_unique ON public.project_cabinets USING btree (project_id, sd_code) WHERE (sd_code IS NOT NULL);


--
-- Name: project_sheet_cables_sheet_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_sheet_cables_sheet_idx ON public.project_sheet_cables USING btree (sheet_id);


--
-- Name: project_sheet_progress_sheet_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_sheet_progress_sheet_idx ON public.project_sheet_progress USING btree (sheet_id, progress_date DESC);


--
-- Name: project_sheets_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_sheets_project_idx ON public.project_sheets USING btree (project_id);


--
-- Name: vehicles_one_per_personnel_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vehicles_one_per_personnel_unique ON public.vehicles USING btree (assigned_personnel_id) WHERE (assigned_personnel_id IS NOT NULL);


--
-- Name: app_settings app_settings_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER app_settings_set_updated_at BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: attendance_month_notes attendance_month_notes_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER attendance_month_notes_set_updated_at BEFORE UPDATE ON public.attendance_month_notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: attendance_records attendance_records_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER attendance_records_audit AFTER INSERT OR DELETE OR UPDATE ON public.attendance_records FOR EACH ROW EXECUTE FUNCTION public.log_attendance_change();


--
-- Name: attendance_records attendance_records_guard_employment_period; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER attendance_records_guard_employment_period BEFORE INSERT OR DELETE OR UPDATE ON public.attendance_records FOR EACH ROW EXECUTE FUNCTION public.guard_attendance_employment_period();


--
-- Name: attendance_records attendance_records_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER attendance_records_set_updated_at BEFORE UPDATE ON public.attendance_records FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: attendance_records attendance_records_validate_date_and_weekly_rest; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER attendance_records_validate_date_and_weekly_rest BEFORE INSERT OR UPDATE ON public.attendance_records FOR EACH ROW EXECUTE FUNCTION public.validate_attendance_date_and_weekly_rest();


--
-- Name: project_cabinet_progress bgfd_set_current_team_leader; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER bgfd_set_current_team_leader AFTER INSERT OR UPDATE ON public.project_cabinet_progress FOR EACH ROW EXECUTE FUNCTION public.set_bgfd_current_team_leader();


--
-- Name: company_manager_permissions company_manager_permissions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER company_manager_permissions_set_updated_at BEFORE UPDATE ON public.company_manager_permissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: inventory_custody_balances custody_balances_category_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER custody_balances_category_guard BEFORE INSERT OR UPDATE ON public.inventory_custody_balances FOR EACH ROW EXECUTE FUNCTION public.guard_material_category_flow();


--
-- Name: inventory_custody_movements custody_movements_category_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER custody_movements_category_guard BEFORE INSERT OR UPDATE ON public.inventory_custody_movements FOR EACH ROW EXECUTE FUNCTION public.guard_material_category_flow();


--
-- Name: daily_work_plan_drafts daily_work_plan_drafts_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER daily_work_plan_drafts_set_updated_at BEFORE UPDATE ON public.daily_work_plan_drafts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: daily_work_plan_teams daily_work_plan_teams_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER daily_work_plan_teams_set_updated_at BEFORE UPDATE ON public.daily_work_plan_teams FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: daily_work_plans daily_work_plans_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER daily_work_plans_set_updated_at BEFORE UPDATE ON public.daily_work_plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: inventory_custody_balances inventory_custody_balances_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_custody_balances_set_updated_at BEFORE UPDATE ON public.inventory_custody_balances FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: inventory_materials inventory_materials_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_materials_set_updated_at BEFORE UPDATE ON public.inventory_materials FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: personnel personnel_guard_active_custody; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER personnel_guard_active_custody BEFORE DELETE OR UPDATE OF is_active ON public.personnel FOR EACH ROW EXECUTE FUNCTION public.guard_personnel_with_active_custody();


--
-- Name: personnel personnel_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER personnel_set_updated_at BEFORE UPDATE ON public.personnel FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: personnel personnel_validate_termination; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER personnel_validate_termination BEFORE UPDATE ON public.personnel FOR EACH ROW EXECUTE FUNCTION public.validate_personnel_termination();


--
-- Name: private_notes private_notes_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER private_notes_set_updated_at BEFORE UPDATE ON public.private_notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: production_item_definitions production_definitions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER production_definitions_set_updated_at BEFORE UPDATE ON public.production_item_definitions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: production_entries production_entries_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER production_entries_set_updated_at BEFORE UPDATE ON public.production_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: production_item_definitions production_item_definitions_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER production_item_definitions_limit BEFORE INSERT ON public.production_item_definitions FOR EACH ROW EXECUTE FUNCTION public.limit_production_item_definitions();


--
-- Name: profiles profiles_enforce_role_user_limits; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_enforce_role_user_limits BEFORE INSERT OR UPDATE OF role, is_approved ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.enforce_role_user_limits();


--
-- Name: profiles profiles_protect_primary_site_chief; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_protect_primary_site_chief BEFORE INSERT OR DELETE OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_primary_site_chief();


--
-- Name: profiles profiles_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: project_sheets project_sheets_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER project_sheets_set_updated_at BEFORE UPDATE ON public.project_sheets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: projects projects_apply_stage_dates; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER projects_apply_stage_dates BEFORE INSERT OR UPDATE OF status, waiting_at, in_progress_at, excavation_permit_waiting_at, delayed_at, completed_at ON public.projects FOR EACH ROW EXECUTE FUNCTION public.projects_set_stage_dates();


--
-- Name: projects projects_derive_automatic_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER projects_derive_automatic_status BEFORE INSERT OR UPDATE OF received_at, tracks_obk, obk_pulled, joint_done, cable_pulled, tracks_excavation, excavation_done ON public.projects FOR EACH ROW WHEN ((new.project_type <> ALL (ARRAY['KURUMSAL_TTVPN'::text, 'ERISIM_ZORUNLULUK'::text]))) EXECUTE FUNCTION public.projects_derive_automatic_status();


--
-- Name: projects projects_require_all_children_completed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER projects_require_all_children_completed BEFORE INSERT OR UPDATE OF status ON public.projects FOR EACH ROW EXECUTE FUNCTION public.require_all_project_children_completed();


--
-- Name: projects projects_set_completion_owner; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER projects_set_completion_owner BEFORE UPDATE OF status ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_project_completion_owner();


--
-- Name: projects projects_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER projects_set_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: project_cabinet_progress refresh_bgfd_cabinet_completion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER refresh_bgfd_cabinet_completion AFTER INSERT OR UPDATE ON public.project_cabinet_progress FOR EACH ROW EXECUTE FUNCTION public.refresh_bgfd_cabinet_completion();


--
-- Name: project_cabinet_progress refresh_bgfd_project_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER refresh_bgfd_project_status AFTER INSERT OR UPDATE ON public.project_cabinet_progress FOR EACH ROW EXECUTE FUNCTION public.refresh_bgfd_project_status();


--
-- Name: project_sheets refresh_hp_focused_project; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER refresh_hp_focused_project AFTER INSERT OR DELETE OR UPDATE ON public.project_sheets FOR EACH ROW EXECUTE FUNCTION public.refresh_hp_focused_project();


--
-- Name: project_sheet_cables refresh_sheet_completion_from_cable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER refresh_sheet_completion_from_cable AFTER INSERT OR DELETE OR UPDATE ON public.project_sheet_cables FOR EACH ROW EXECUTE FUNCTION public.refresh_sheet_completion_from_cable();


--
-- Name: project_sheet_progress refresh_sheet_completion_from_progress; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER refresh_sheet_completion_from_progress AFTER INSERT OR DELETE OR UPDATE ON public.project_sheet_progress FOR EACH ROW EXECUTE FUNCTION public.refresh_sheet_completion_from_progress();


--
-- Name: project_sheets refresh_sheet_completion_from_tracking; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER refresh_sheet_completion_from_tracking AFTER UPDATE OF tracks_cable, tracks_joint, tracks_obk, tracks_excavation ON public.project_sheets FOR EACH ROW EXECUTE FUNCTION public.refresh_sheet_completion_from_tracking();


--
-- Name: shared_notes shared_notes_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER shared_notes_set_updated_at BEFORE UPDATE ON public.shared_notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: project_cabinet_progress validate_bgfd_transfer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validate_bgfd_transfer BEFORE INSERT OR UPDATE ON public.project_cabinet_progress FOR EACH ROW EXECUTE FUNCTION public.validate_bgfd_transfer();


--
-- Name: project_sheet_progress validate_sheet_progress_quantity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validate_sheet_progress_quantity BEFORE INSERT OR UPDATE ON public.project_sheet_progress FOR EACH ROW EXECUTE FUNCTION public.validate_sheet_progress_quantity();


--
-- Name: vehicles vehicles_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vehicles_set_updated_at BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: app_settings app_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: attendance_audit_logs attendance_audit_logs_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_audit_logs
    ADD CONSTRAINT attendance_audit_logs_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: attendance_audit_logs attendance_audit_logs_personnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_audit_logs
    ADD CONSTRAINT attendance_audit_logs_personnel_id_fkey FOREIGN KEY (personnel_id) REFERENCES public.personnel(id) ON DELETE CASCADE;


--
-- Name: attendance_records attendance_records_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: attendance_records attendance_records_personnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_personnel_id_fkey FOREIGN KEY (personnel_id) REFERENCES public.personnel(id) ON DELETE CASCADE;


--
-- Name: attendance_records attendance_records_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: company_manager_permissions company_manager_permissions_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_manager_permissions
    ADD CONSTRAINT company_manager_permissions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: company_manager_permissions company_manager_permissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_manager_permissions
    ADD CONSTRAINT company_manager_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: daily_work_plan_absences daily_work_plan_absences_personnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_work_plan_absences
    ADD CONSTRAINT daily_work_plan_absences_personnel_id_fkey FOREIGN KEY (personnel_id) REFERENCES public.personnel(id) ON DELETE RESTRICT;


--
-- Name: daily_work_plan_absences daily_work_plan_absences_work_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_work_plan_absences
    ADD CONSTRAINT daily_work_plan_absences_work_plan_id_fkey FOREIGN KEY (work_plan_id) REFERENCES public.daily_work_plans(id) ON DELETE CASCADE;


--
-- Name: daily_work_plan_drafts daily_work_plan_drafts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_work_plan_drafts
    ADD CONSTRAINT daily_work_plan_drafts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: daily_work_plan_team_members daily_work_plan_team_members_personnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_work_plan_team_members
    ADD CONSTRAINT daily_work_plan_team_members_personnel_id_fkey FOREIGN KEY (personnel_id) REFERENCES public.personnel(id) ON DELETE SET NULL;


--
-- Name: daily_work_plan_team_members daily_work_plan_team_members_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_work_plan_team_members
    ADD CONSTRAINT daily_work_plan_team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.daily_work_plan_teams(id) ON DELETE CASCADE;


--
-- Name: daily_work_plan_teams daily_work_plan_teams_chief_personnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_work_plan_teams
    ADD CONSTRAINT daily_work_plan_teams_chief_personnel_id_fkey FOREIGN KEY (chief_personnel_id) REFERENCES public.personnel(id) ON DELETE SET NULL;


--
-- Name: daily_work_plan_teams daily_work_plan_teams_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_work_plan_teams
    ADD CONSTRAINT daily_work_plan_teams_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.daily_work_plans(id) ON DELETE CASCADE;


--
-- Name: daily_work_plan_teams daily_work_plan_teams_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_work_plan_teams
    ADD CONSTRAINT daily_work_plan_teams_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: daily_work_plan_teams daily_work_plan_teams_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_work_plan_teams
    ADD CONSTRAINT daily_work_plan_teams_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;


--
-- Name: daily_work_plans daily_work_plans_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_work_plans
    ADD CONSTRAINT daily_work_plans_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: daily_work_plans daily_work_plans_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_work_plans
    ADD CONSTRAINT daily_work_plans_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: inventory_catalog inventory_catalog_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_catalog
    ADD CONSTRAINT inventory_catalog_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: inventory_custody_balances inventory_custody_balances_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_custody_balances
    ADD CONSTRAINT inventory_custody_balances_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.inventory_materials(id) ON DELETE RESTRICT;


--
-- Name: inventory_custody_balances inventory_custody_balances_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_custody_balances
    ADD CONSTRAINT inventory_custody_balances_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: inventory_custody_movements inventory_custody_movements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_custody_movements
    ADD CONSTRAINT inventory_custody_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: inventory_custody_movements inventory_custody_movements_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_custody_movements
    ADD CONSTRAINT inventory_custody_movements_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.inventory_materials(id) ON DELETE RESTRICT;


--
-- Name: inventory_materials inventory_materials_catalog_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_materials
    ADD CONSTRAINT inventory_materials_catalog_id_fkey FOREIGN KEY (catalog_id) REFERENCES public.inventory_catalog(id) ON DELETE CASCADE;


--
-- Name: inventory_materials inventory_materials_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_materials
    ADD CONSTRAINT inventory_materials_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: inventory_materials inventory_materials_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_materials
    ADD CONSTRAINT inventory_materials_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: inventory_movements inventory_movements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: inventory_movements inventory_movements_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.inventory_materials(id) ON DELETE RESTRICT;


--
-- Name: inventory_movements inventory_movements_receipt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES public.inventory_receipts(id) ON DELETE CASCADE;


--
-- Name: inventory_movements inventory_movements_shipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES public.inventory_shipments(id) ON DELETE CASCADE;


--
-- Name: inventory_receipt_items inventory_receipt_items_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_receipt_items
    ADD CONSTRAINT inventory_receipt_items_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.inventory_materials(id) ON DELETE CASCADE;


--
-- Name: inventory_receipt_items inventory_receipt_items_receipt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_receipt_items
    ADD CONSTRAINT inventory_receipt_items_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES public.inventory_receipts(id) ON DELETE CASCADE;


--
-- Name: inventory_receipts inventory_receipts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_receipts
    ADD CONSTRAINT inventory_receipts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: inventory_request_items inventory_request_items_catalog_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_request_items
    ADD CONSTRAINT inventory_request_items_catalog_id_fkey FOREIGN KEY (catalog_id) REFERENCES public.inventory_catalog(id) ON DELETE RESTRICT;


--
-- Name: inventory_request_items inventory_request_items_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_request_items
    ADD CONSTRAINT inventory_request_items_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.inventory_requests(id) ON DELETE CASCADE;


--
-- Name: inventory_request_receipt_items inventory_request_receipt_items_catalog_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_request_receipt_items
    ADD CONSTRAINT inventory_request_receipt_items_catalog_id_fkey FOREIGN KEY (catalog_id) REFERENCES public.inventory_catalog(id) ON DELETE RESTRICT;


--
-- Name: inventory_request_receipt_items inventory_request_receipt_items_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_request_receipt_items
    ADD CONSTRAINT inventory_request_receipt_items_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.inventory_requests(id) ON DELETE CASCADE;


--
-- Name: inventory_requests inventory_requests_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_requests
    ADD CONSTRAINT inventory_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: inventory_requests inventory_requests_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_requests
    ADD CONSTRAINT inventory_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: inventory_requests inventory_requests_receipt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_requests
    ADD CONSTRAINT inventory_requests_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES public.inventory_receipts(id) ON DELETE SET NULL;


--
-- Name: inventory_shipment_items inventory_shipment_items_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_shipment_items
    ADD CONSTRAINT inventory_shipment_items_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.inventory_materials(id) ON DELETE RESTRICT;


--
-- Name: inventory_shipment_items inventory_shipment_items_shipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_shipment_items
    ADD CONSTRAINT inventory_shipment_items_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES public.inventory_shipments(id) ON DELETE CASCADE;


--
-- Name: inventory_shipments inventory_shipments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_shipments
    ADD CONSTRAINT inventory_shipments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: inventory_shipments inventory_shipments_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_shipments
    ADD CONSTRAINT inventory_shipments_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;


--
-- Name: personnel_advances personnel_advances_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personnel_advances
    ADD CONSTRAINT personnel_advances_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: personnel_advances personnel_advances_personnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personnel_advances
    ADD CONSTRAINT personnel_advances_personnel_id_fkey FOREIGN KEY (personnel_id) REFERENCES public.personnel(id) ON DELETE RESTRICT;


--
-- Name: personnel personnel_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personnel
    ADD CONSTRAINT personnel_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: personnel_employment_periods personnel_employment_periods_personnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personnel_employment_periods
    ADD CONSTRAINT personnel_employment_periods_personnel_id_fkey FOREIGN KEY (personnel_id) REFERENCES public.personnel(id) ON DELETE CASCADE;


--
-- Name: personnel personnel_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personnel
    ADD CONSTRAINT personnel_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: private_notes private_notes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.private_notes
    ADD CONSTRAINT private_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: production_entries production_entries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_entries
    ADD CONSTRAINT production_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: production_entries production_entries_source_work_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_entries
    ADD CONSTRAINT production_entries_source_work_plan_id_fkey FOREIGN KEY (source_work_plan_id) REFERENCES public.daily_work_plans(id) ON DELETE SET NULL;


--
-- Name: production_entries production_entries_team_leader_personnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_entries
    ADD CONSTRAINT production_entries_team_leader_personnel_id_fkey FOREIGN KEY (team_leader_personnel_id) REFERENCES public.personnel(id) ON DELETE RESTRICT;


--
-- Name: production_entries production_entries_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_entries
    ADD CONSTRAINT production_entries_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: production_item_definitions production_item_definitions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_item_definitions
    ADD CONSTRAINT production_item_definitions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: production_items production_items_production_item_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_items
    ADD CONSTRAINT production_items_production_item_definition_id_fkey FOREIGN KEY (production_item_definition_id) REFERENCES public.production_item_definitions(id) ON DELETE SET NULL;


--
-- Name: production_items production_items_production_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_items
    ADD CONSTRAINT production_items_production_job_id_fkey FOREIGN KEY (production_job_id) REFERENCES public.production_jobs(id) ON DELETE CASCADE;


--
-- Name: production_jobs production_jobs_production_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_jobs
    ADD CONSTRAINT production_jobs_production_entry_id_fkey FOREIGN KEY (production_entry_id) REFERENCES public.production_entries(id) ON DELETE CASCADE;


--
-- Name: production_jobs production_jobs_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_jobs
    ADD CONSTRAINT production_jobs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: project_cabinet_progress project_cabinet_progress_cabinet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_cabinet_progress
    ADD CONSTRAINT project_cabinet_progress_cabinet_id_fkey FOREIGN KEY (cabinet_id) REFERENCES public.project_cabinets(id) ON DELETE CASCADE;


--
-- Name: project_cabinet_progress project_cabinet_progress_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_cabinet_progress
    ADD CONSTRAINT project_cabinet_progress_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: project_cabinet_progress project_cabinet_progress_team_leader_personnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_cabinet_progress
    ADD CONSTRAINT project_cabinet_progress_team_leader_personnel_id_fkey FOREIGN KEY (team_leader_personnel_id) REFERENCES public.personnel(id) ON DELETE SET NULL;


--
-- Name: project_cabinets project_cabinets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_cabinets
    ADD CONSTRAINT project_cabinets_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: project_cabinets project_cabinets_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_cabinets
    ADD CONSTRAINT project_cabinets_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_cancellation_history project_cancellation_history_cancelled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_cancellation_history
    ADD CONSTRAINT project_cancellation_history_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: project_cancellation_history project_cancellation_history_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_cancellation_history
    ADD CONSTRAINT project_cancellation_history_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_cancellation_history project_cancellation_history_reactivated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_cancellation_history
    ADD CONSTRAINT project_cancellation_history_reactivated_by_fkey FOREIGN KEY (reactivated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: project_sheet_cables project_sheet_cables_sheet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_sheet_cables
    ADD CONSTRAINT project_sheet_cables_sheet_id_fkey FOREIGN KEY (sheet_id) REFERENCES public.project_sheets(id) ON DELETE CASCADE;


--
-- Name: project_sheet_progress project_sheet_progress_cable_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_sheet_progress
    ADD CONSTRAINT project_sheet_progress_cable_id_fkey FOREIGN KEY (cable_id) REFERENCES public.project_sheet_cables(id) ON DELETE CASCADE;


--
-- Name: project_sheet_progress project_sheet_progress_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_sheet_progress
    ADD CONSTRAINT project_sheet_progress_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: project_sheet_progress project_sheet_progress_sheet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_sheet_progress
    ADD CONSTRAINT project_sheet_progress_sheet_id_fkey FOREIGN KEY (sheet_id) REFERENCES public.project_sheets(id) ON DELETE CASCADE;


--
-- Name: project_sheet_progress project_sheet_progress_team_leader_personnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_sheet_progress
    ADD CONSTRAINT project_sheet_progress_team_leader_personnel_id_fkey FOREIGN KEY (team_leader_personnel_id) REFERENCES public.personnel(id) ON DELETE SET NULL;


--
-- Name: project_sheets project_sheets_completed_by_personnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_sheets
    ADD CONSTRAINT project_sheets_completed_by_personnel_id_fkey FOREIGN KEY (completed_by_personnel_id) REFERENCES public.personnel(id) ON DELETE SET NULL;


--
-- Name: project_sheets project_sheets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_sheets
    ADD CONSTRAINT project_sheets_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: project_sheets project_sheets_current_team_leader_personnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_sheets
    ADD CONSTRAINT project_sheets_current_team_leader_personnel_id_fkey FOREIGN KEY (current_team_leader_personnel_id) REFERENCES public.personnel(id) ON DELETE SET NULL;


--
-- Name: project_sheets project_sheets_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_sheets
    ADD CONSTRAINT project_sheets_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: projects projects_cancelled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: projects projects_completed_by_personnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_completed_by_personnel_id_fkey FOREIGN KEY (completed_by_personnel_id) REFERENCES public.personnel(id) ON DELETE SET NULL;


--
-- Name: projects projects_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: projects projects_current_team_leader_personnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_current_team_leader_personnel_id_fkey FOREIGN KEY (current_team_leader_personnel_id) REFERENCES public.personnel(id) ON DELETE SET NULL;


--
-- Name: projects projects_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: shared_notes shared_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_notes
    ADD CONSTRAINT shared_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: vehicle_fuel_logs vehicle_fuel_logs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_fuel_logs
    ADD CONSTRAINT vehicle_fuel_logs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: vehicle_fuel_logs vehicle_fuel_logs_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_fuel_logs
    ADD CONSTRAINT vehicle_fuel_logs_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE CASCADE;


--
-- Name: vehicles vehicles_assigned_personnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_assigned_personnel_id_fkey FOREIGN KEY (assigned_personnel_id) REFERENCES public.personnel(id) ON DELETE SET NULL;


--
-- Name: vehicles vehicles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: vehicles vehicles_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: app_settings accounting_granted_module_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounting_granted_module_select ON public.app_settings FOR SELECT TO authenticated USING (public.has_module_write_permission('projects'::text));


--
-- Name: daily_work_plan_absences accounting_granted_module_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounting_granted_module_select ON public.daily_work_plan_absences FOR SELECT TO authenticated USING (public.has_module_write_permission('work_plans'::text));


--
-- Name: daily_work_plan_team_members accounting_granted_module_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounting_granted_module_select ON public.daily_work_plan_team_members FOR SELECT TO authenticated USING (public.has_module_write_permission('work_plans'::text));


--
-- Name: daily_work_plan_teams accounting_granted_module_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounting_granted_module_select ON public.daily_work_plan_teams FOR SELECT TO authenticated USING (public.has_module_write_permission('work_plans'::text));


--
-- Name: daily_work_plans accounting_granted_module_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounting_granted_module_select ON public.daily_work_plans FOR SELECT TO authenticated USING (public.has_module_write_permission('work_plans'::text));


--
-- Name: inventory_custody_balances accounting_granted_module_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounting_granted_module_select ON public.inventory_custody_balances FOR SELECT TO authenticated USING (public.has_module_write_permission('custody'::text));


--
-- Name: inventory_custody_movements accounting_granted_module_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounting_granted_module_select ON public.inventory_custody_movements FOR SELECT TO authenticated USING (public.has_module_write_permission('custody'::text));


--
-- Name: inventory_materials accounting_granted_module_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounting_granted_module_select ON public.inventory_materials FOR SELECT TO authenticated USING (public.has_module_write_permission('inventory'::text));


--
-- Name: inventory_movements accounting_granted_module_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounting_granted_module_select ON public.inventory_movements FOR SELECT TO authenticated USING (public.has_module_write_permission('inventory'::text));


--
-- Name: production_entries accounting_granted_module_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounting_granted_module_select ON public.production_entries FOR SELECT TO authenticated USING (public.has_module_write_permission('productions'::text));


--
-- Name: production_item_definitions accounting_granted_module_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounting_granted_module_select ON public.production_item_definitions FOR SELECT TO authenticated USING (public.has_module_write_permission('productions'::text));


--
-- Name: production_items accounting_granted_module_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounting_granted_module_select ON public.production_items FOR SELECT TO authenticated USING (public.has_module_write_permission('productions'::text));


--
-- Name: production_jobs accounting_granted_module_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounting_granted_module_select ON public.production_jobs FOR SELECT TO authenticated USING (public.has_module_write_permission('productions'::text));


--
-- Name: project_cabinet_progress accounting_granted_module_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounting_granted_module_select ON public.project_cabinet_progress FOR SELECT TO authenticated USING (public.has_module_write_permission('projects'::text));


--
-- Name: project_cabinets accounting_granted_module_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounting_granted_module_select ON public.project_cabinets FOR SELECT TO authenticated USING (public.has_module_write_permission('projects'::text));


--
-- Name: project_sheet_cables accounting_granted_module_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounting_granted_module_select ON public.project_sheet_cables FOR SELECT TO authenticated USING (public.has_module_write_permission('projects'::text));


--
-- Name: project_sheet_progress accounting_granted_module_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounting_granted_module_select ON public.project_sheet_progress FOR SELECT TO authenticated USING (public.has_module_write_permission('projects'::text));


--
-- Name: project_sheets accounting_granted_module_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounting_granted_module_select ON public.project_sheets FOR SELECT TO authenticated USING (public.has_module_write_permission('projects'::text));


--
-- Name: projects accounting_granted_module_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounting_granted_module_select ON public.projects FOR SELECT TO authenticated USING (public.has_module_write_permission('projects'::text));


--
-- Name: vehicle_fuel_logs accounting_granted_module_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounting_granted_module_select ON public.vehicle_fuel_logs FOR SELECT TO authenticated USING (public.has_module_write_permission('vehicles'::text));


--
-- Name: vehicles accounting_granted_module_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounting_granted_module_select ON public.vehicles FOR SELECT TO authenticated USING (public.has_module_write_permission('vehicles'::text));


--
-- Name: app_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: app_settings app_settings_insert_site_chief; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_settings_insert_site_chief ON public.app_settings FOR INSERT TO authenticated WITH CHECK (public.is_site_chief());


--
-- Name: app_settings app_settings_select_role_based; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_settings_select_role_based ON public.app_settings FOR SELECT TO authenticated USING (public.can_view_all());


--
-- Name: app_settings app_settings_update_site_chief; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_settings_update_site_chief ON public.app_settings FOR UPDATE TO authenticated USING (public.is_site_chief()) WITH CHECK (public.is_site_chief());


--
-- Name: attendance_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance_audit_logs attendance_audit_select_personnel_roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_audit_select_personnel_roles ON public.attendance_audit_logs FOR SELECT TO authenticated USING (public.can_view_personnel_attendance());


--
-- Name: attendance_records attendance_delete_module_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_delete_module_write ON public.attendance_records FOR DELETE TO authenticated USING (public.has_module_write_permission('attendance'::text));


--
-- Name: attendance_records attendance_insert_module_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_insert_module_write ON public.attendance_records FOR INSERT TO authenticated WITH CHECK (public.has_module_write_permission('attendance'::text));


--
-- Name: attendance_month_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance_month_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance_month_notes attendance_month_notes_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_month_notes_insert ON public.attendance_month_notes FOR INSERT TO authenticated WITH CHECK (public.has_module_write_permission('attendance'::text));


--
-- Name: attendance_month_notes attendance_month_notes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_month_notes_select ON public.attendance_month_notes FOR SELECT TO authenticated USING (public.can_view_personnel_attendance());


--
-- Name: attendance_month_notes attendance_month_notes_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_month_notes_update ON public.attendance_month_notes FOR UPDATE TO authenticated USING (public.has_module_write_permission('attendance'::text)) WITH CHECK (public.has_module_write_permission('attendance'::text));


--
-- Name: attendance_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance_records attendance_select_role_based; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_select_role_based ON public.attendance_records FOR SELECT TO authenticated USING (public.can_view_personnel_attendance());


--
-- Name: attendance_records attendance_update_module_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_update_module_write ON public.attendance_records FOR UPDATE TO authenticated USING (public.has_module_write_permission('attendance'::text)) WITH CHECK (public.has_module_write_permission('attendance'::text));


--
-- Name: company_manager_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_manager_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: company_manager_permissions company_manager_permissions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_manager_permissions_select ON public.company_manager_permissions FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_site_chief()));


--
-- Name: daily_work_plan_absences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_work_plan_absences ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_work_plan_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_work_plan_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_work_plan_team_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_work_plan_team_members ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_work_plan_teams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_work_plan_teams ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_work_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_work_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_work_plan_absences dwp_absences_delete_module_writer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dwp_absences_delete_module_writer ON public.daily_work_plan_absences FOR DELETE TO authenticated USING (public.has_module_write_permission('work_plans'::text));


--
-- Name: daily_work_plan_absences dwp_absences_insert_module_writer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dwp_absences_insert_module_writer ON public.daily_work_plan_absences FOR INSERT TO authenticated WITH CHECK (public.has_module_write_permission('work_plans'::text));


--
-- Name: daily_work_plan_absences dwp_absences_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dwp_absences_select_authenticated ON public.daily_work_plan_absences FOR SELECT TO authenticated USING (true);


--
-- Name: daily_work_plan_absences dwp_absences_update_module_writer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dwp_absences_update_module_writer ON public.daily_work_plan_absences FOR UPDATE TO authenticated USING (public.has_module_write_permission('work_plans'::text)) WITH CHECK (public.has_module_write_permission('work_plans'::text));


--
-- Name: daily_work_plans dwp_delete_module_writer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dwp_delete_module_writer ON public.daily_work_plans FOR DELETE TO authenticated USING (public.has_module_write_permission('work_plans'::text));


--
-- Name: daily_work_plans dwp_insert_module_writer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dwp_insert_module_writer ON public.daily_work_plans FOR INSERT TO authenticated WITH CHECK (public.has_module_write_permission('work_plans'::text));


--
-- Name: daily_work_plan_team_members dwp_members_delete_module_writer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dwp_members_delete_module_writer ON public.daily_work_plan_team_members FOR DELETE TO authenticated USING (public.has_module_write_permission('work_plans'::text));


--
-- Name: daily_work_plan_team_members dwp_members_insert_module_writer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dwp_members_insert_module_writer ON public.daily_work_plan_team_members FOR INSERT TO authenticated WITH CHECK (public.has_module_write_permission('work_plans'::text));


--
-- Name: daily_work_plan_team_members dwp_members_select_role_based; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dwp_members_select_role_based ON public.daily_work_plan_team_members FOR SELECT TO authenticated USING (public.can_view_all());


--
-- Name: daily_work_plan_team_members dwp_members_update_module_writer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dwp_members_update_module_writer ON public.daily_work_plan_team_members FOR UPDATE TO authenticated USING (public.has_module_write_permission('work_plans'::text)) WITH CHECK (public.has_module_write_permission('work_plans'::text));


--
-- Name: daily_work_plans dwp_select_role_based; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dwp_select_role_based ON public.daily_work_plans FOR SELECT TO authenticated USING (public.can_view_all());


--
-- Name: daily_work_plan_teams dwp_teams_delete_module_writer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dwp_teams_delete_module_writer ON public.daily_work_plan_teams FOR DELETE TO authenticated USING (public.has_module_write_permission('work_plans'::text));


--
-- Name: daily_work_plan_teams dwp_teams_insert_module_writer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dwp_teams_insert_module_writer ON public.daily_work_plan_teams FOR INSERT TO authenticated WITH CHECK (public.has_module_write_permission('work_plans'::text));


--
-- Name: daily_work_plan_teams dwp_teams_select_role_based; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dwp_teams_select_role_based ON public.daily_work_plan_teams FOR SELECT TO authenticated USING (public.can_view_all());


--
-- Name: daily_work_plan_teams dwp_teams_update_module_writer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dwp_teams_update_module_writer ON public.daily_work_plan_teams FOR UPDATE TO authenticated USING (public.has_module_write_permission('work_plans'::text)) WITH CHECK (public.has_module_write_permission('work_plans'::text));


--
-- Name: daily_work_plans dwp_update_module_writer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dwp_update_module_writer ON public.daily_work_plans FOR UPDATE TO authenticated USING (public.has_module_write_permission('work_plans'::text)) WITH CHECK (public.has_module_write_permission('work_plans'::text));


--
-- Name: inventory_catalog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_catalog ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_catalog inventory_catalog_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_catalog_select ON public.inventory_catalog FOR SELECT TO authenticated USING (true);


--
-- Name: inventory_custody_balances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_custody_balances ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_custody_balances inventory_custody_balances_select_role_based; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_custody_balances_select_role_based ON public.inventory_custody_balances FOR SELECT TO authenticated USING (public.can_view_all());


--
-- Name: inventory_custody_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_custody_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_custody_movements inventory_custody_movements_select_role_based; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_custody_movements_select_role_based ON public.inventory_custody_movements FOR SELECT TO authenticated USING (public.can_view_all());


--
-- Name: inventory_materials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_materials ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_materials inventory_materials_select_role_based; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_materials_select_role_based ON public.inventory_materials FOR SELECT TO authenticated USING (public.can_view_all());


--
-- Name: inventory_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_movements inventory_movements_select_role_based; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_movements_select_role_based ON public.inventory_movements FOR SELECT TO authenticated USING (public.can_view_all());


--
-- Name: inventory_receipt_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_receipt_items ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_receipt_items inventory_receipt_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_receipt_items_select ON public.inventory_receipt_items FOR SELECT TO authenticated USING (true);


--
-- Name: inventory_receipts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_receipts ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_receipts inventory_receipts_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_receipts_select ON public.inventory_receipts FOR SELECT TO authenticated USING (true);


--
-- Name: inventory_request_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_request_items ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_request_items inventory_request_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_request_items_select ON public.inventory_request_items FOR SELECT TO authenticated USING (true);


--
-- Name: inventory_request_receipt_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_request_receipt_items ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_request_receipt_items inventory_request_receipt_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_request_receipt_items_select ON public.inventory_request_receipt_items FOR SELECT TO authenticated USING (true);


--
-- Name: inventory_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_requests inventory_requests_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_requests_select ON public.inventory_requests FOR SELECT TO authenticated USING (true);


--
-- Name: inventory_shipment_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_shipment_items ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_shipment_items inventory_shipment_items_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_shipment_items_select_authenticated ON public.inventory_shipment_items FOR SELECT TO authenticated USING (true);


--
-- Name: inventory_shipments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_shipments ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_shipments inventory_shipments_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_shipments_select_authenticated ON public.inventory_shipments FOR SELECT TO authenticated USING (true);


--
-- Name: personnel; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.personnel ENABLE ROW LEVEL SECURITY;

--
-- Name: personnel_advances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.personnel_advances ENABLE ROW LEVEL SECURITY;

--
-- Name: personnel_advances personnel_advances_delete_module_writer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY personnel_advances_delete_module_writer ON public.personnel_advances FOR DELETE TO authenticated USING (public.has_module_write_permission('attendance'::text));


--
-- Name: personnel_advances personnel_advances_insert_module_writer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY personnel_advances_insert_module_writer ON public.personnel_advances FOR INSERT TO authenticated WITH CHECK (public.has_module_write_permission('attendance'::text));


--
-- Name: personnel_advances personnel_advances_select_role_based; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY personnel_advances_select_role_based ON public.personnel_advances FOR SELECT TO authenticated USING (public.can_view_personnel_attendance());


--
-- Name: personnel_advances personnel_advances_update_module_writer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY personnel_advances_update_module_writer ON public.personnel_advances FOR UPDATE TO authenticated USING (public.has_module_write_permission('attendance'::text)) WITH CHECK (public.has_module_write_permission('attendance'::text));


--
-- Name: personnel personnel_delete_module_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY personnel_delete_module_write ON public.personnel FOR DELETE TO authenticated USING (public.has_module_write_permission('personnel'::text));


--
-- Name: personnel_employment_periods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.personnel_employment_periods ENABLE ROW LEVEL SECURITY;

--
-- Name: personnel_employment_periods personnel_employment_periods_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY personnel_employment_periods_insert ON public.personnel_employment_periods FOR INSERT TO authenticated WITH CHECK (public.has_module_write_permission('personnel'::text));


--
-- Name: personnel_employment_periods personnel_employment_periods_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY personnel_employment_periods_select ON public.personnel_employment_periods FOR SELECT TO authenticated USING (public.can_view_personnel_attendance());


--
-- Name: personnel personnel_insert_module_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY personnel_insert_module_write ON public.personnel FOR INSERT TO authenticated WITH CHECK (public.has_module_write_permission('personnel'::text));


--
-- Name: personnel personnel_select_role_based; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY personnel_select_role_based ON public.personnel FOR SELECT TO authenticated USING (public.can_view_personnel_attendance());


--
-- Name: personnel personnel_update_module_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY personnel_update_module_write ON public.personnel FOR UPDATE TO authenticated USING (public.has_module_write_permission('personnel'::text)) WITH CHECK (public.has_module_write_permission('personnel'::text));


--
-- Name: private_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.private_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: private_notes private_notes_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY private_notes_delete_own ON public.private_notes FOR DELETE TO authenticated USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (( SELECT auth.uid() AS uid) = user_id)));


--
-- Name: private_notes private_notes_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY private_notes_insert_own ON public.private_notes FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (( SELECT auth.uid() AS uid) = user_id)));


--
-- Name: private_notes private_notes_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY private_notes_select_own ON public.private_notes FOR SELECT TO authenticated USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (( SELECT auth.uid() AS uid) = user_id)));


--
-- Name: private_notes private_notes_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY private_notes_update_own ON public.private_notes FOR UPDATE TO authenticated USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (( SELECT auth.uid() AS uid) = user_id))) WITH CHECK (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (( SELECT auth.uid() AS uid) = user_id)));


--
-- Name: production_item_definitions production_definitions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY production_definitions_select ON public.production_item_definitions FOR SELECT TO authenticated USING (public.can_view_all());


--
-- Name: production_item_definitions production_definitions_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY production_definitions_write ON public.production_item_definitions TO authenticated USING (public.has_module_write_permission('productions'::text)) WITH CHECK (public.has_module_write_permission('productions'::text));


--
-- Name: production_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.production_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: production_entries production_entries_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY production_entries_select ON public.production_entries FOR SELECT TO authenticated USING (public.can_view_all());


--
-- Name: production_item_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.production_item_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: production_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.production_items ENABLE ROW LEVEL SECURITY;

--
-- Name: production_items production_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY production_items_select ON public.production_items FOR SELECT TO authenticated USING (public.can_view_all());


--
-- Name: production_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.production_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: production_jobs production_jobs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY production_jobs_select ON public.production_jobs FOR SELECT TO authenticated USING (public.can_view_all());


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_select_role_based; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_role_based ON public.profiles FOR SELECT TO authenticated USING (((id = auth.uid()) OR public.is_site_chief()));


--
-- Name: project_cabinet_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_cabinet_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: project_cabinet_progress project_cabinet_progress_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_cabinet_progress_authenticated ON public.project_cabinet_progress TO authenticated USING (true) WITH CHECK (true);


--
-- Name: project_cabinets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_cabinets ENABLE ROW LEVEL SECURITY;

--
-- Name: project_cabinets project_cabinets_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_cabinets_authenticated ON public.project_cabinets TO authenticated USING (true) WITH CHECK (true);


--
-- Name: project_cancellation_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_cancellation_history ENABLE ROW LEVEL SECURITY;

--
-- Name: project_cancellation_history project_cancellation_history_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_cancellation_history_select ON public.project_cancellation_history FOR SELECT TO authenticated USING (true);


--
-- Name: project_sheet_cables; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_sheet_cables ENABLE ROW LEVEL SECURITY;

--
-- Name: project_sheet_cables project_sheet_cables_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_sheet_cables_authenticated ON public.project_sheet_cables TO authenticated USING (true) WITH CHECK (true);


--
-- Name: project_sheet_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_sheet_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: project_sheet_progress project_sheet_progress_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_sheet_progress_authenticated ON public.project_sheet_progress TO authenticated USING (true) WITH CHECK (true);


--
-- Name: project_sheets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_sheets ENABLE ROW LEVEL SECURITY;

--
-- Name: project_sheets project_sheets_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_sheets_authenticated ON public.project_sheets TO authenticated USING (true) WITH CHECK (true);


--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: projects projects_delete_module_writer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_delete_module_writer ON public.projects FOR DELETE TO authenticated USING (public.has_module_write_permission('projects'::text));


--
-- Name: projects projects_insert_module_writer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_insert_module_writer ON public.projects FOR INSERT TO authenticated WITH CHECK (public.has_module_write_permission('projects'::text));


--
-- Name: projects projects_select_role_based; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_select_role_based ON public.projects FOR SELECT TO authenticated USING (public.can_view_all());


--
-- Name: projects projects_update_module_writer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_update_module_writer ON public.projects FOR UPDATE TO authenticated USING (public.has_module_write_permission('projects'::text)) WITH CHECK (public.has_module_write_permission('projects'::text));


--
-- Name: shared_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shared_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: shared_notes shared_notes_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shared_notes_delete_own ON public.shared_notes FOR DELETE TO authenticated USING ((created_by = auth.uid()));


--
-- Name: shared_notes shared_notes_insert_approved; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shared_notes_insert_approved ON public.shared_notes FOR INSERT TO authenticated WITH CHECK (((public.current_user_role() <> 'pending'::text) AND (created_by = auth.uid())));


--
-- Name: shared_notes shared_notes_select_approved; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shared_notes_select_approved ON public.shared_notes FOR SELECT TO authenticated USING ((public.current_user_role() <> 'pending'::text));


--
-- Name: shared_notes shared_notes_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shared_notes_update_own ON public.shared_notes FOR UPDATE TO authenticated USING ((created_by = auth.uid())) WITH CHECK ((created_by = auth.uid()));


--
-- Name: vehicle_fuel_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vehicle_fuel_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: vehicle_fuel_logs vehicle_fuel_logs_select_role_based; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vehicle_fuel_logs_select_role_based ON public.vehicle_fuel_logs FOR SELECT TO authenticated USING (public.can_view_all());


--
-- Name: vehicles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

--
-- Name: vehicles vehicles_insert_module_writer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vehicles_insert_module_writer ON public.vehicles FOR INSERT TO authenticated WITH CHECK (public.has_module_write_permission('vehicles'::text));


--
-- Name: vehicles vehicles_select_role_based; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vehicles_select_role_based ON public.vehicles FOR SELECT TO authenticated USING (public.can_view_all());


--
-- Name: vehicles vehicles_update_module_writer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vehicles_update_module_writer ON public.vehicles FOR UPDATE TO authenticated USING (public.has_module_write_permission('vehicles'::text)) WITH CHECK (public.has_module_write_permission('vehicles'::text));


--
-- Name: daily_work_plan_drafts work_plan_drafts_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY work_plan_drafts_delete ON public.daily_work_plan_drafts FOR DELETE TO authenticated USING (public.has_module_write_permission('work_plans'::text));


--
-- Name: daily_work_plan_drafts work_plan_drafts_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY work_plan_drafts_insert ON public.daily_work_plan_drafts FOR INSERT TO authenticated WITH CHECK ((public.has_module_write_permission('work_plans'::text) AND (created_by = auth.uid())));


--
-- Name: daily_work_plan_drafts work_plan_drafts_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY work_plan_drafts_select ON public.daily_work_plan_drafts FOR SELECT TO authenticated USING (true);


--
-- Name: daily_work_plan_drafts work_plan_drafts_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY work_plan_drafts_update ON public.daily_work_plan_drafts FOR UPDATE TO authenticated USING (public.has_module_write_permission('work_plans'::text)) WITH CHECK (public.has_module_write_permission('work_plans'::text));


--
-- Supabase, public şemasında oluşturulan her nesneye anon/authenticated/service_role
-- için varsayılan yetki verir. Aşağıdaki GRANT/REVOKE listesi nesnelerin son
-- yetkilerini tam olarak tanımladığı için önce bu varsayılanlar sıfırlanır.
--

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated, service_role;

--
-- Name: TYPE attendance_status; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TYPE public.attendance_status TO authenticated;


--
-- Name: FUNCTION approve_inventory_request(p_request_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.approve_inventory_request(p_request_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.approve_inventory_request(p_request_id uuid) TO anon;
GRANT ALL ON FUNCTION public.approve_inventory_request(p_request_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.approve_inventory_request(p_request_id uuid) TO service_role;


--
-- Name: FUNCTION approve_inventory_request_receipt(p_request_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.approve_inventory_request_receipt(p_request_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.approve_inventory_request_receipt(p_request_id uuid) TO anon;
GRANT ALL ON FUNCTION public.approve_inventory_request_receipt(p_request_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.approve_inventory_request_receipt(p_request_id uuid) TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: FUNCTION assign_user_role(p_user_id uuid, p_role text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.assign_user_role(p_user_id uuid, p_role text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.assign_user_role(p_user_id uuid, p_role text) TO anon;
GRANT ALL ON FUNCTION public.assign_user_role(p_user_id uuid, p_role text) TO authenticated;
GRANT ALL ON FUNCTION public.assign_user_role(p_user_id uuid, p_role text) TO service_role;


--
-- Name: TABLE vehicles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vehicles TO anon;
GRANT ALL ON TABLE public.vehicles TO authenticated;
GRANT ALL ON TABLE public.vehicles TO service_role;


--
-- Name: FUNCTION assign_vehicle_personnel(p_vehicle_id uuid, p_personnel_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.assign_vehicle_personnel(p_vehicle_id uuid, p_personnel_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.assign_vehicle_personnel(p_vehicle_id uuid, p_personnel_id uuid) TO anon;
GRANT ALL ON FUNCTION public.assign_vehicle_personnel(p_vehicle_id uuid, p_personnel_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.assign_vehicle_personnel(p_vehicle_id uuid, p_personnel_id uuid) TO service_role;


--
-- Name: TABLE projects; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.projects TO anon;
GRANT ALL ON TABLE public.projects TO authenticated;
GRANT ALL ON TABLE public.projects TO service_role;


--
-- Name: FUNCTION bulk_update_project_tracking(p_updates jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.bulk_update_project_tracking(p_updates jsonb) TO anon;
GRANT ALL ON FUNCTION public.bulk_update_project_tracking(p_updates jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.bulk_update_project_tracking(p_updates jsonb) TO service_role;


--
-- Name: FUNCTION can_view_all(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.can_view_all() FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_view_all() TO anon;
GRANT ALL ON FUNCTION public.can_view_all() TO authenticated;
GRANT ALL ON FUNCTION public.can_view_all() TO service_role;


--
-- Name: FUNCTION can_view_personnel_attendance(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.can_view_personnel_attendance() FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_view_personnel_attendance() TO anon;
GRANT ALL ON FUNCTION public.can_view_personnel_attendance() TO authenticated;
GRANT ALL ON FUNCTION public.can_view_personnel_attendance() TO service_role;


--
-- Name: FUNCTION cancel_project(p_project_id uuid, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancel_project(p_project_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_project(p_project_id uuid, p_reason text) TO anon;
GRANT ALL ON FUNCTION public.cancel_project(p_project_id uuid, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.cancel_project(p_project_id uuid, p_reason text) TO service_role;


--
-- Name: FUNCTION create_biga_inventory_shipment(p_shipment_date date, p_delivered_by text, p_received_by text, p_vehicle_plate text, p_notes text, p_items jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_biga_inventory_shipment(p_shipment_date date, p_delivered_by text, p_received_by text, p_vehicle_plate text, p_notes text, p_items jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_biga_inventory_shipment(p_shipment_date date, p_delivered_by text, p_received_by text, p_vehicle_plate text, p_notes text, p_items jsonb) TO anon;
GRANT ALL ON FUNCTION public.create_biga_inventory_shipment(p_shipment_date date, p_delivered_by text, p_received_by text, p_vehicle_plate text, p_notes text, p_items jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.create_biga_inventory_shipment(p_shipment_date date, p_delivered_by text, p_received_by text, p_vehicle_plate text, p_notes text, p_items jsonb) TO service_role;


--
-- Name: FUNCTION create_custody_material(p_material_name text, p_material_code text, p_unit public.inventory_unit, p_initial_quantity numeric, p_vehicle_id uuid, p_notes text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_custody_material(p_material_name text, p_material_code text, p_unit public.inventory_unit, p_initial_quantity numeric, p_vehicle_id uuid, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_custody_material(p_material_name text, p_material_code text, p_unit public.inventory_unit, p_initial_quantity numeric, p_vehicle_id uuid, p_notes text) TO anon;
GRANT ALL ON FUNCTION public.create_custody_material(p_material_name text, p_material_code text, p_unit public.inventory_unit, p_initial_quantity numeric, p_vehicle_id uuid, p_notes text) TO authenticated;
GRANT ALL ON FUNCTION public.create_custody_material(p_material_name text, p_material_code text, p_unit public.inventory_unit, p_initial_quantity numeric, p_vehicle_id uuid, p_notes text) TO service_role;


--
-- Name: FUNCTION create_hp_project_with_sheets(p_project jsonb, p_sheets jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_hp_project_with_sheets(p_project jsonb, p_sheets jsonb) TO anon;
GRANT ALL ON FUNCTION public.create_hp_project_with_sheets(p_project jsonb, p_sheets jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.create_hp_project_with_sheets(p_project jsonb, p_sheets jsonb) TO service_role;


--
-- Name: FUNCTION create_inventory_catalog_material(p_material_name text, p_stock_category text, p_material_type text, p_size text, p_unit public.inventory_unit, p_has_id boolean, p_notes text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_inventory_catalog_material(p_material_name text, p_stock_category text, p_material_type text, p_size text, p_unit public.inventory_unit, p_has_id boolean, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_inventory_catalog_material(p_material_name text, p_stock_category text, p_material_type text, p_size text, p_unit public.inventory_unit, p_has_id boolean, p_notes text) TO anon;
GRANT ALL ON FUNCTION public.create_inventory_catalog_material(p_material_name text, p_stock_category text, p_material_type text, p_size text, p_unit public.inventory_unit, p_has_id boolean, p_notes text) TO authenticated;
GRANT ALL ON FUNCTION public.create_inventory_catalog_material(p_material_name text, p_stock_category text, p_material_type text, p_size text, p_unit public.inventory_unit, p_has_id boolean, p_notes text) TO service_role;


--
-- Name: TABLE inventory_materials; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inventory_materials TO anon;
GRANT ALL ON TABLE public.inventory_materials TO authenticated;
GRANT ALL ON TABLE public.inventory_materials TO service_role;


--
-- Name: FUNCTION create_inventory_material(p_material_name text, p_material_code text, p_unit public.inventory_unit, p_initial_quantity numeric, p_stock_category text, p_receipt_date date, p_received_by text, p_dispatch_number text, p_notes text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_inventory_material(p_material_name text, p_material_code text, p_unit public.inventory_unit, p_initial_quantity numeric, p_stock_category text, p_receipt_date date, p_received_by text, p_dispatch_number text, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_inventory_material(p_material_name text, p_material_code text, p_unit public.inventory_unit, p_initial_quantity numeric, p_stock_category text, p_receipt_date date, p_received_by text, p_dispatch_number text, p_notes text) TO anon;
GRANT ALL ON FUNCTION public.create_inventory_material(p_material_name text, p_material_code text, p_unit public.inventory_unit, p_initial_quantity numeric, p_stock_category text, p_receipt_date date, p_received_by text, p_dispatch_number text, p_notes text) TO authenticated;
GRANT ALL ON FUNCTION public.create_inventory_material(p_material_name text, p_material_code text, p_unit public.inventory_unit, p_initial_quantity numeric, p_stock_category text, p_receipt_date date, p_received_by text, p_dispatch_number text, p_notes text) TO service_role;


--
-- Name: FUNCTION create_inventory_receipt(p_receipt_date date, p_received_by text, p_dispatch_number text, p_notes text, p_items jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_inventory_receipt(p_receipt_date date, p_received_by text, p_dispatch_number text, p_notes text, p_items jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_inventory_receipt(p_receipt_date date, p_received_by text, p_dispatch_number text, p_notes text, p_items jsonb) TO anon;
GRANT ALL ON FUNCTION public.create_inventory_receipt(p_receipt_date date, p_received_by text, p_dispatch_number text, p_notes text, p_items jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.create_inventory_receipt(p_receipt_date date, p_received_by text, p_dispatch_number text, p_notes text, p_items jsonb) TO service_role;


--
-- Name: FUNCTION create_inventory_request(p_request_date date, p_requested_by text, p_notes text, p_items jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_inventory_request(p_request_date date, p_requested_by text, p_notes text, p_items jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_inventory_request(p_request_date date, p_requested_by text, p_notes text, p_items jsonb) TO anon;
GRANT ALL ON FUNCTION public.create_inventory_request(p_request_date date, p_requested_by text, p_notes text, p_items jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.create_inventory_request(p_request_date date, p_requested_by text, p_notes text, p_items jsonb) TO service_role;


--
-- Name: TABLE shared_notes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.shared_notes TO anon;
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE ON TABLE public.shared_notes TO authenticated;
GRANT ALL ON TABLE public.shared_notes TO service_role;


--
-- Name: FUNCTION create_shared_note(p_title text, p_note_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_shared_note(p_title text, p_note_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_shared_note(p_title text, p_note_date date) TO anon;
GRANT ALL ON FUNCTION public.create_shared_note(p_title text, p_note_date date) TO authenticated;
GRANT ALL ON FUNCTION public.create_shared_note(p_title text, p_note_date date) TO service_role;


--
-- Name: FUNCTION current_user_role(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT ALL ON FUNCTION public.current_user_role() TO anon;
GRANT ALL ON FUNCTION public.current_user_role() TO authenticated;
GRANT ALL ON FUNCTION public.current_user_role() TO service_role;


--
-- Name: FUNCTION delete_biga_inventory_shipment(p_shipment_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_biga_inventory_shipment(p_shipment_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_biga_inventory_shipment(p_shipment_id uuid) TO anon;
GRANT ALL ON FUNCTION public.delete_biga_inventory_shipment(p_shipment_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_biga_inventory_shipment(p_shipment_id uuid) TO service_role;


--
-- Name: FUNCTION delete_inactive_personnel_without_earned_days(p_personnel_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_inactive_personnel_without_earned_days(p_personnel_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_inactive_personnel_without_earned_days(p_personnel_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_inactive_personnel_without_earned_days(p_personnel_id uuid) TO service_role;


--
-- Name: FUNCTION delete_inventory_catalog_with_history(p_catalog_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_inventory_catalog_with_history(p_catalog_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_inventory_catalog_with_history(p_catalog_id uuid) TO anon;
GRANT ALL ON FUNCTION public.delete_inventory_catalog_with_history(p_catalog_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_inventory_catalog_with_history(p_catalog_id uuid) TO service_role;


--
-- Name: FUNCTION delete_inventory_material_with_history(p_material_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_inventory_material_with_history(p_material_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_inventory_material_with_history(p_material_id uuid) TO anon;
GRANT ALL ON FUNCTION public.delete_inventory_material_with_history(p_material_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_inventory_material_with_history(p_material_id uuid) TO service_role;


--
-- Name: FUNCTION delete_inventory_movement(p_movement_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_inventory_movement(p_movement_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_inventory_movement(p_movement_id uuid) TO anon;
GRANT ALL ON FUNCTION public.delete_inventory_movement(p_movement_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_inventory_movement(p_movement_id uuid) TO service_role;


--
-- Name: FUNCTION delete_production_entry(p_entry_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.delete_production_entry(p_entry_id uuid) TO anon;
GRANT ALL ON FUNCTION public.delete_production_entry(p_entry_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_production_entry(p_entry_id uuid) TO service_role;


--
-- Name: FUNCTION enforce_role_user_limits(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_role_user_limits() TO anon;
GRANT ALL ON FUNCTION public.enforce_role_user_limits() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_role_user_limits() TO service_role;


--
-- Name: FUNCTION ensure_current_sunday_attendance(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ensure_current_sunday_attendance() FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_current_sunday_attendance() TO authenticated;
GRANT ALL ON FUNCTION public.ensure_current_sunday_attendance() TO service_role;


--
-- Name: FUNCTION ensure_sunday_attendance_for_month(p_year integer, p_month integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ensure_sunday_attendance_for_month(p_year integer, p_month integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_sunday_attendance_for_month(p_year integer, p_month integer) TO authenticated;
GRANT ALL ON FUNCTION public.ensure_sunday_attendance_for_month(p_year integer, p_month integer) TO service_role;


--
-- Name: FUNCTION get_attendance_month_archives(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_attendance_month_archives() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_attendance_month_archives() TO authenticated;
GRANT ALL ON FUNCTION public.get_attendance_month_archives() TO service_role;


--
-- Name: FUNCTION get_dashboard_overview(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_dashboard_overview() TO anon;
GRANT ALL ON FUNCTION public.get_dashboard_overview() TO authenticated;
GRANT ALL ON FUNCTION public.get_dashboard_overview() TO service_role;


--
-- Name: FUNCTION get_dashboard_stats(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_dashboard_stats() TO anon;
GRANT ALL ON FUNCTION public.get_dashboard_stats() TO authenticated;
GRANT ALL ON FUNCTION public.get_dashboard_stats() TO service_role;


--
-- Name: FUNCTION get_location_suggestions(p_query text, p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_location_suggestions(p_query text, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.get_location_suggestions(p_query text, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_location_suggestions(p_query text, p_limit integer) TO service_role;


--
-- Name: FUNCTION get_monthly_attendance(p_year integer, p_month integer, p_active_filter text, p_search text, p_status_filter text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_monthly_attendance(p_year integer, p_month integer, p_active_filter text, p_search text, p_status_filter text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_monthly_attendance(p_year integer, p_month integer, p_active_filter text, p_search text, p_status_filter text) TO authenticated;
GRANT ALL ON FUNCTION public.get_monthly_attendance(p_year integer, p_month integer, p_active_filter text, p_search text, p_status_filter text) TO service_role;


--
-- Name: FUNCTION get_monthly_payroll(p_year integer, p_month integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_monthly_payroll(p_year integer, p_month integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_monthly_payroll(p_year integer, p_month integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_monthly_payroll(p_year integer, p_month integer) TO service_role;


--
-- Name: FUNCTION get_personnel_attendance_detail(p_personnel_id uuid, p_year integer, p_month integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_personnel_attendance_detail(p_personnel_id uuid, p_year integer, p_month integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_personnel_attendance_detail(p_personnel_id uuid, p_year integer, p_month integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_personnel_attendance_detail(p_personnel_id uuid, p_year integer, p_month integer) TO service_role;


--
-- Name: FUNCTION get_personnel_attendance_summary(p_personnel_id uuid, p_year integer, p_month integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_personnel_attendance_summary(p_personnel_id uuid, p_year integer, p_month integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_personnel_attendance_summary(p_personnel_id uuid, p_year integer, p_month integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_personnel_attendance_summary(p_personnel_id uuid, p_year integer, p_month integer) TO service_role;


--
-- Name: FUNCTION get_personnel_list_summaries(p_year integer, p_month integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_personnel_list_summaries(p_year integer, p_month integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_personnel_list_summaries(p_year integer, p_month integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_personnel_list_summaries(p_year integer, p_month integer) TO service_role;


--
-- Name: FUNCTION get_shared_notes(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_shared_notes() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_shared_notes() TO anon;
GRANT ALL ON FUNCTION public.get_shared_notes() TO authenticated;
GRANT ALL ON FUNCTION public.get_shared_notes() TO service_role;


--
-- Name: FUNCTION get_team_suggestions(p_query text, p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_team_suggestions(p_query text, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.get_team_suggestions(p_query text, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_team_suggestions(p_query text, p_limit integer) TO service_role;


--
-- Name: FUNCTION get_team_type_suggestions(p_query text, p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_team_type_suggestions(p_query text, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.get_team_type_suggestions(p_query text, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_team_type_suggestions(p_query text, p_limit integer) TO service_role;


--
-- Name: FUNCTION get_vehicle_plate_suggestions(p_query text, p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_vehicle_plate_suggestions(p_query text, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.get_vehicle_plate_suggestions(p_query text, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_vehicle_plate_suggestions(p_query text, p_limit integer) TO service_role;


--
-- Name: FUNCTION guard_attendance_employment_period(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_attendance_employment_period() TO anon;
GRANT ALL ON FUNCTION public.guard_attendance_employment_period() TO authenticated;
GRANT ALL ON FUNCTION public.guard_attendance_employment_period() TO service_role;


--
-- Name: FUNCTION guard_material_category_flow(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_material_category_flow() TO anon;
GRANT ALL ON FUNCTION public.guard_material_category_flow() TO authenticated;
GRANT ALL ON FUNCTION public.guard_material_category_flow() TO service_role;


--
-- Name: FUNCTION guard_personnel_with_active_custody(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_personnel_with_active_custody() TO anon;
GRANT ALL ON FUNCTION public.guard_personnel_with_active_custody() TO authenticated;
GRANT ALL ON FUNCTION public.guard_personnel_with_active_custody() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION has_module_write_permission(p_module text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_module_write_permission(p_module text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_module_write_permission(p_module text) TO anon;
GRANT ALL ON FUNCTION public.has_module_write_permission(p_module text) TO authenticated;
GRANT ALL ON FUNCTION public.has_module_write_permission(p_module text) TO service_role;


--
-- Name: FUNCTION is_site_chief(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_site_chief() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_site_chief() TO anon;
GRANT ALL ON FUNCTION public.is_site_chief() TO authenticated;
GRANT ALL ON FUNCTION public.is_site_chief() TO service_role;


--
-- Name: FUNCTION limit_production_item_definitions(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.limit_production_item_definitions() TO anon;
GRANT ALL ON FUNCTION public.limit_production_item_definitions() TO authenticated;
GRANT ALL ON FUNCTION public.limit_production_item_definitions() TO service_role;


--
-- Name: FUNCTION log_attendance_change(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.log_attendance_change() TO anon;
GRANT ALL ON FUNCTION public.log_attendance_change() TO authenticated;
GRANT ALL ON FUNCTION public.log_attendance_change() TO service_role;


--
-- Name: FUNCTION projects_archive_on_complete(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.projects_archive_on_complete() TO anon;
GRANT ALL ON FUNCTION public.projects_archive_on_complete() TO authenticated;
GRANT ALL ON FUNCTION public.projects_archive_on_complete() TO service_role;


--
-- Name: FUNCTION projects_derive_automatic_status(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.projects_derive_automatic_status() TO anon;
GRANT ALL ON FUNCTION public.projects_derive_automatic_status() TO authenticated;
GRANT ALL ON FUNCTION public.projects_derive_automatic_status() TO service_role;


--
-- Name: FUNCTION projects_set_stage_dates(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.projects_set_stage_dates() TO anon;
GRANT ALL ON FUNCTION public.projects_set_stage_dates() TO authenticated;
GRANT ALL ON FUNCTION public.projects_set_stage_dates() TO service_role;


--
-- Name: FUNCTION protect_primary_site_chief(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.protect_primary_site_chief() TO anon;
GRANT ALL ON FUNCTION public.protect_primary_site_chief() TO authenticated;
GRANT ALL ON FUNCTION public.protect_primary_site_chief() TO service_role;


--
-- Name: FUNCTION reactivate_cancelled_project(p_project_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reactivate_cancelled_project(p_project_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reactivate_cancelled_project(p_project_id uuid) TO anon;
GRANT ALL ON FUNCTION public.reactivate_cancelled_project(p_project_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.reactivate_cancelled_project(p_project_id uuid) TO service_role;


--
-- Name: FUNCTION recalculate_project_sheet_completion(p_sheet_id uuid, p_date date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.recalculate_project_sheet_completion(p_sheet_id uuid, p_date date) TO anon;
GRANT ALL ON FUNCTION public.recalculate_project_sheet_completion(p_sheet_id uuid, p_date date) TO authenticated;
GRANT ALL ON FUNCTION public.recalculate_project_sheet_completion(p_sheet_id uuid, p_date date) TO service_role;


--
-- Name: FUNCTION record_inventory_movement(p_material_id uuid, p_movement_type public.inventory_movement_type, p_quantity numeric, p_source_location text, p_project_name text, p_project_code text, p_team_personnel_ids uuid[], p_description text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_inventory_movement(p_material_id uuid, p_movement_type public.inventory_movement_type, p_quantity numeric, p_source_location text, p_project_name text, p_project_code text, p_team_personnel_ids uuid[], p_description text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_inventory_movement(p_material_id uuid, p_movement_type public.inventory_movement_type, p_quantity numeric, p_source_location text, p_project_name text, p_project_code text, p_team_personnel_ids uuid[], p_description text) TO anon;
GRANT ALL ON FUNCTION public.record_inventory_movement(p_material_id uuid, p_movement_type public.inventory_movement_type, p_quantity numeric, p_source_location text, p_project_name text, p_project_code text, p_team_personnel_ids uuid[], p_description text) TO authenticated;
GRANT ALL ON FUNCTION public.record_inventory_movement(p_material_id uuid, p_movement_type public.inventory_movement_type, p_quantity numeric, p_source_location text, p_project_name text, p_project_code text, p_team_personnel_ids uuid[], p_description text) TO service_role;


--
-- Name: TABLE vehicle_fuel_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vehicle_fuel_logs TO anon;
GRANT ALL ON TABLE public.vehicle_fuel_logs TO authenticated;
GRANT ALL ON TABLE public.vehicle_fuel_logs TO service_role;


--
-- Name: FUNCTION record_vehicle_fuel_purchase(p_vehicle_id uuid, p_fuel_date date, p_odometer_km bigint, p_liters numeric, p_notes text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_vehicle_fuel_purchase(p_vehicle_id uuid, p_fuel_date date, p_odometer_km bigint, p_liters numeric, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_vehicle_fuel_purchase(p_vehicle_id uuid, p_fuel_date date, p_odometer_km bigint, p_liters numeric, p_notes text) TO anon;
GRANT ALL ON FUNCTION public.record_vehicle_fuel_purchase(p_vehicle_id uuid, p_fuel_date date, p_odometer_km bigint, p_liters numeric, p_notes text) TO authenticated;
GRANT ALL ON FUNCTION public.record_vehicle_fuel_purchase(p_vehicle_id uuid, p_fuel_date date, p_odometer_km bigint, p_liters numeric, p_notes text) TO service_role;


--
-- Name: FUNCTION refresh_bgfd_cabinet_completion(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.refresh_bgfd_cabinet_completion() TO anon;
GRANT ALL ON FUNCTION public.refresh_bgfd_cabinet_completion() TO authenticated;
GRANT ALL ON FUNCTION public.refresh_bgfd_cabinet_completion() TO service_role;


--
-- Name: FUNCTION refresh_bgfd_project_status(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.refresh_bgfd_project_status() TO anon;
GRANT ALL ON FUNCTION public.refresh_bgfd_project_status() TO authenticated;
GRANT ALL ON FUNCTION public.refresh_bgfd_project_status() TO service_role;


--
-- Name: FUNCTION refresh_hp_focused_project(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.refresh_hp_focused_project() TO anon;
GRANT ALL ON FUNCTION public.refresh_hp_focused_project() TO authenticated;
GRANT ALL ON FUNCTION public.refresh_hp_focused_project() TO service_role;


--
-- Name: FUNCTION refresh_overdue_project_statuses(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.refresh_overdue_project_statuses() TO anon;
GRANT ALL ON FUNCTION public.refresh_overdue_project_statuses() TO authenticated;
GRANT ALL ON FUNCTION public.refresh_overdue_project_statuses() TO service_role;


--
-- Name: FUNCTION refresh_sheet_completion_from_cable(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.refresh_sheet_completion_from_cable() TO anon;
GRANT ALL ON FUNCTION public.refresh_sheet_completion_from_cable() TO authenticated;
GRANT ALL ON FUNCTION public.refresh_sheet_completion_from_cable() TO service_role;


--
-- Name: FUNCTION refresh_sheet_completion_from_progress(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.refresh_sheet_completion_from_progress() TO anon;
GRANT ALL ON FUNCTION public.refresh_sheet_completion_from_progress() TO authenticated;
GRANT ALL ON FUNCTION public.refresh_sheet_completion_from_progress() TO service_role;


--
-- Name: FUNCTION refresh_sheet_completion_from_tracking(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.refresh_sheet_completion_from_tracking() TO anon;
GRANT ALL ON FUNCTION public.refresh_sheet_completion_from_tracking() TO authenticated;
GRANT ALL ON FUNCTION public.refresh_sheet_completion_from_tracking() TO service_role;


--
-- Name: FUNCTION require_all_project_children_completed(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.require_all_project_children_completed() TO anon;
GRANT ALL ON FUNCTION public.require_all_project_children_completed() TO authenticated;
GRANT ALL ON FUNCTION public.require_all_project_children_completed() TO service_role;


--
-- Name: FUNCTION save_attendance_changes(p_changes jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_attendance_changes(p_changes jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_attendance_changes(p_changes jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.save_attendance_changes(p_changes jsonb) TO service_role;


--
-- Name: FUNCTION save_production_entry(p_entry_id uuid, p_work_date date, p_team_leader_personnel_id uuid, p_team_leader_name text, p_source_work_plan_id uuid, p_jobs jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.save_production_entry(p_entry_id uuid, p_work_date date, p_team_leader_personnel_id uuid, p_team_leader_name text, p_source_work_plan_id uuid, p_jobs jsonb) TO anon;
GRANT ALL ON FUNCTION public.save_production_entry(p_entry_id uuid, p_work_date date, p_team_leader_personnel_id uuid, p_team_leader_name text, p_source_work_plan_id uuid, p_jobs jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.save_production_entry(p_entry_id uuid, p_work_date date, p_team_leader_personnel_id uuid, p_team_leader_name text, p_source_work_plan_id uuid, p_jobs jsonb) TO service_role;


--
-- Name: FUNCTION set_bgfd_current_team_leader(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_bgfd_current_team_leader() TO anon;
GRANT ALL ON FUNCTION public.set_bgfd_current_team_leader() TO authenticated;
GRANT ALL ON FUNCTION public.set_bgfd_current_team_leader() TO service_role;


--
-- Name: TABLE company_manager_permissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.company_manager_permissions TO anon;
GRANT ALL ON TABLE public.company_manager_permissions TO authenticated;
GRANT ALL ON TABLE public.company_manager_permissions TO service_role;


--
-- Name: FUNCTION set_company_manager_permission(p_user_id uuid, p_module text, p_enabled boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_company_manager_permission(p_user_id uuid, p_module text, p_enabled boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_company_manager_permission(p_user_id uuid, p_module text, p_enabled boolean) TO anon;
GRANT ALL ON FUNCTION public.set_company_manager_permission(p_user_id uuid, p_module text, p_enabled boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_company_manager_permission(p_user_id uuid, p_module text, p_enabled boolean) TO service_role;


--
-- Name: FUNCTION set_project_completion_owner(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_project_completion_owner() TO anon;
GRANT ALL ON FUNCTION public.set_project_completion_owner() TO authenticated;
GRANT ALL ON FUNCTION public.set_project_completion_owner() TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: FUNCTION submit_inventory_request_receipt(p_request_id uuid, p_receipt_date date, p_received_by text, p_dispatch_number text, p_notes text, p_items jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.submit_inventory_request_receipt(p_request_id uuid, p_receipt_date date, p_received_by text, p_dispatch_number text, p_notes text, p_items jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.submit_inventory_request_receipt(p_request_id uuid, p_receipt_date date, p_received_by text, p_dispatch_number text, p_notes text, p_items jsonb) TO anon;
GRANT ALL ON FUNCTION public.submit_inventory_request_receipt(p_request_id uuid, p_receipt_date date, p_received_by text, p_dispatch_number text, p_notes text, p_items jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.submit_inventory_request_receipt(p_request_id uuid, p_receipt_date date, p_received_by text, p_dispatch_number text, p_notes text, p_items jsonb) TO service_role;


--
-- Name: FUNCTION transfer_inventory_custody(p_material_id uuid, p_quantity numeric, p_from_type text, p_from_id uuid, p_to_type text, p_to_id uuid, p_notes text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.transfer_inventory_custody(p_material_id uuid, p_quantity numeric, p_from_type text, p_from_id uuid, p_to_type text, p_to_id uuid, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.transfer_inventory_custody(p_material_id uuid, p_quantity numeric, p_from_type text, p_from_id uuid, p_to_type text, p_to_id uuid, p_notes text) TO anon;
GRANT ALL ON FUNCTION public.transfer_inventory_custody(p_material_id uuid, p_quantity numeric, p_from_type text, p_from_id uuid, p_to_type text, p_to_id uuid, p_notes text) TO authenticated;
GRANT ALL ON FUNCTION public.transfer_inventory_custody(p_material_id uuid, p_quantity numeric, p_from_type text, p_from_id uuid, p_to_type text, p_to_id uuid, p_notes text) TO service_role;


--
-- Name: FUNCTION transfer_inventory_to_biga(p_material_id uuid, p_quantity numeric, p_description text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.transfer_inventory_to_biga(p_material_id uuid, p_quantity numeric, p_description text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.transfer_inventory_to_biga(p_material_id uuid, p_quantity numeric, p_description text) TO anon;
GRANT ALL ON FUNCTION public.transfer_inventory_to_biga(p_material_id uuid, p_quantity numeric, p_description text) TO authenticated;
GRANT ALL ON FUNCTION public.transfer_inventory_to_biga(p_material_id uuid, p_quantity numeric, p_description text) TO service_role;


--
-- Name: FUNCTION update_own_profile(p_full_name text, p_job_title text, p_avatar_path text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_own_profile(p_full_name text, p_job_title text, p_avatar_path text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_own_profile(p_full_name text, p_job_title text, p_avatar_path text) TO anon;
GRANT ALL ON FUNCTION public.update_own_profile(p_full_name text, p_job_title text, p_avatar_path text) TO authenticated;
GRANT ALL ON FUNCTION public.update_own_profile(p_full_name text, p_job_title text, p_avatar_path text) TO service_role;


--
-- Name: FUNCTION update_shared_note(p_note_id uuid, p_title text, p_note_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_shared_note(p_note_id uuid, p_title text, p_note_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_shared_note(p_note_id uuid, p_title text, p_note_date date) TO anon;
GRANT ALL ON FUNCTION public.update_shared_note(p_note_id uuid, p_title text, p_note_date date) TO authenticated;
GRANT ALL ON FUNCTION public.update_shared_note(p_note_id uuid, p_title text, p_note_date date) TO service_role;


--
-- Name: FUNCTION validate_attendance_date_and_weekly_rest(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_attendance_date_and_weekly_rest() TO anon;
GRANT ALL ON FUNCTION public.validate_attendance_date_and_weekly_rest() TO authenticated;
GRANT ALL ON FUNCTION public.validate_attendance_date_and_weekly_rest() TO service_role;


--
-- Name: FUNCTION validate_bgfd_transfer(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_bgfd_transfer() TO anon;
GRANT ALL ON FUNCTION public.validate_bgfd_transfer() TO authenticated;
GRANT ALL ON FUNCTION public.validate_bgfd_transfer() TO service_role;


--
-- Name: FUNCTION validate_personnel_termination(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_personnel_termination() TO anon;
GRANT ALL ON FUNCTION public.validate_personnel_termination() TO authenticated;
GRANT ALL ON FUNCTION public.validate_personnel_termination() TO service_role;


--
-- Name: FUNCTION validate_sheet_progress_quantity(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_sheet_progress_quantity() TO anon;
GRANT ALL ON FUNCTION public.validate_sheet_progress_quantity() TO authenticated;
GRANT ALL ON FUNCTION public.validate_sheet_progress_quantity() TO service_role;


--
-- Name: TABLE app_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.app_settings TO anon;
GRANT ALL ON TABLE public.app_settings TO authenticated;
GRANT ALL ON TABLE public.app_settings TO service_role;


--
-- Name: TABLE attendance_audit_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.attendance_audit_logs TO anon;
GRANT ALL ON TABLE public.attendance_audit_logs TO authenticated;
GRANT ALL ON TABLE public.attendance_audit_logs TO service_role;


--
-- Name: SEQUENCE attendance_audit_logs_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.attendance_audit_logs_id_seq TO anon;
GRANT ALL ON SEQUENCE public.attendance_audit_logs_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.attendance_audit_logs_id_seq TO service_role;


--
-- Name: TABLE attendance_month_notes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.attendance_month_notes TO anon;
GRANT ALL ON TABLE public.attendance_month_notes TO authenticated;
GRANT ALL ON TABLE public.attendance_month_notes TO service_role;


--
-- Name: TABLE attendance_records; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.attendance_records TO anon;
GRANT ALL ON TABLE public.attendance_records TO authenticated;
GRANT ALL ON TABLE public.attendance_records TO service_role;


--
-- Name: TABLE daily_work_plan_absences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.daily_work_plan_absences TO anon;
GRANT ALL ON TABLE public.daily_work_plan_absences TO authenticated;
GRANT ALL ON TABLE public.daily_work_plan_absences TO service_role;


--
-- Name: TABLE daily_work_plan_drafts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.daily_work_plan_drafts TO anon;
GRANT ALL ON TABLE public.daily_work_plan_drafts TO authenticated;
GRANT ALL ON TABLE public.daily_work_plan_drafts TO service_role;


--
-- Name: TABLE daily_work_plan_team_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.daily_work_plan_team_members TO anon;
GRANT ALL ON TABLE public.daily_work_plan_team_members TO authenticated;
GRANT ALL ON TABLE public.daily_work_plan_team_members TO service_role;


--
-- Name: TABLE daily_work_plan_teams; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.daily_work_plan_teams TO anon;
GRANT ALL ON TABLE public.daily_work_plan_teams TO authenticated;
GRANT ALL ON TABLE public.daily_work_plan_teams TO service_role;


--
-- Name: TABLE daily_work_plans; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.daily_work_plans TO anon;
GRANT ALL ON TABLE public.daily_work_plans TO authenticated;
GRANT ALL ON TABLE public.daily_work_plans TO service_role;


--
-- Name: TABLE inventory_catalog; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inventory_catalog TO anon;
GRANT ALL ON TABLE public.inventory_catalog TO authenticated;
GRANT ALL ON TABLE public.inventory_catalog TO service_role;


--
-- Name: TABLE inventory_custody_balances; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inventory_custody_balances TO anon;
GRANT ALL ON TABLE public.inventory_custody_balances TO authenticated;
GRANT ALL ON TABLE public.inventory_custody_balances TO service_role;


--
-- Name: TABLE inventory_custody_movements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inventory_custody_movements TO anon;
GRANT ALL ON TABLE public.inventory_custody_movements TO authenticated;
GRANT ALL ON TABLE public.inventory_custody_movements TO service_role;


--
-- Name: TABLE inventory_movements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inventory_movements TO anon;
GRANT ALL ON TABLE public.inventory_movements TO authenticated;
GRANT ALL ON TABLE public.inventory_movements TO service_role;


--
-- Name: TABLE inventory_receipt_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inventory_receipt_items TO anon;
GRANT ALL ON TABLE public.inventory_receipt_items TO authenticated;
GRANT ALL ON TABLE public.inventory_receipt_items TO service_role;


--
-- Name: TABLE inventory_receipts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inventory_receipts TO anon;
GRANT ALL ON TABLE public.inventory_receipts TO authenticated;
GRANT ALL ON TABLE public.inventory_receipts TO service_role;


--
-- Name: TABLE inventory_request_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inventory_request_items TO anon;
GRANT ALL ON TABLE public.inventory_request_items TO authenticated;
GRANT ALL ON TABLE public.inventory_request_items TO service_role;


--
-- Name: TABLE inventory_request_receipt_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inventory_request_receipt_items TO anon;
GRANT ALL ON TABLE public.inventory_request_receipt_items TO authenticated;
GRANT ALL ON TABLE public.inventory_request_receipt_items TO service_role;


--
-- Name: TABLE inventory_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inventory_requests TO anon;
GRANT ALL ON TABLE public.inventory_requests TO authenticated;
GRANT ALL ON TABLE public.inventory_requests TO service_role;


--
-- Name: TABLE inventory_shipment_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inventory_shipment_items TO anon;
GRANT ALL ON TABLE public.inventory_shipment_items TO authenticated;
GRANT ALL ON TABLE public.inventory_shipment_items TO service_role;


--
-- Name: TABLE inventory_shipments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inventory_shipments TO anon;
GRANT ALL ON TABLE public.inventory_shipments TO authenticated;
GRANT ALL ON TABLE public.inventory_shipments TO service_role;


--
-- Name: TABLE personnel; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.personnel TO anon;
GRANT ALL ON TABLE public.personnel TO authenticated;
GRANT ALL ON TABLE public.personnel TO service_role;


--
-- Name: TABLE personnel_advances; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.personnel_advances TO anon;
GRANT ALL ON TABLE public.personnel_advances TO authenticated;
GRANT ALL ON TABLE public.personnel_advances TO service_role;


--
-- Name: TABLE personnel_employment_periods; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.personnel_employment_periods TO anon;
GRANT ALL ON TABLE public.personnel_employment_periods TO authenticated;
GRANT ALL ON TABLE public.personnel_employment_periods TO service_role;


--
-- Name: TABLE private_notes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.private_notes TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.private_notes TO authenticated;


--
-- Name: TABLE production_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.production_entries TO anon;
GRANT ALL ON TABLE public.production_entries TO authenticated;
GRANT ALL ON TABLE public.production_entries TO service_role;


--
-- Name: TABLE production_item_definitions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.production_item_definitions TO anon;
GRANT ALL ON TABLE public.production_item_definitions TO authenticated;
GRANT ALL ON TABLE public.production_item_definitions TO service_role;


--
-- Name: TABLE production_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.production_items TO anon;
GRANT ALL ON TABLE public.production_items TO authenticated;
GRANT ALL ON TABLE public.production_items TO service_role;


--
-- Name: TABLE production_jobs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.production_jobs TO anon;
GRANT ALL ON TABLE public.production_jobs TO authenticated;
GRANT ALL ON TABLE public.production_jobs TO service_role;


--
-- Name: TABLE project_cabinet_progress; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_cabinet_progress TO anon;
GRANT ALL ON TABLE public.project_cabinet_progress TO authenticated;
GRANT ALL ON TABLE public.project_cabinet_progress TO service_role;


--
-- Name: TABLE project_cabinets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_cabinets TO anon;
GRANT ALL ON TABLE public.project_cabinets TO authenticated;
GRANT ALL ON TABLE public.project_cabinets TO service_role;


--
-- Name: TABLE project_cancellation_history; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_cancellation_history TO anon;
GRANT ALL ON TABLE public.project_cancellation_history TO authenticated;
GRANT ALL ON TABLE public.project_cancellation_history TO service_role;


--
-- Name: TABLE project_sheet_cables; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_sheet_cables TO anon;
GRANT ALL ON TABLE public.project_sheet_cables TO authenticated;
GRANT ALL ON TABLE public.project_sheet_cables TO service_role;


--
-- Name: TABLE project_sheet_progress; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_sheet_progress TO anon;
GRANT ALL ON TABLE public.project_sheet_progress TO authenticated;
GRANT ALL ON TABLE public.project_sheet_progress TO service_role;


--
-- Name: TABLE project_sheets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_sheets TO anon;
GRANT ALL ON TABLE public.project_sheets TO authenticated;
GRANT ALL ON TABLE public.project_sheets TO service_role;

-- 3. Başlangıç verisi -----------------------------------------------------------
SELECT pg_catalog.set_config('search_path', 'public, extensions', false);

insert into public.app_settings (key, value)
values (
  'custom_project_types',
  jsonb_build_object(
    'custom_1', 'Özel Kategori 1',
    'custom_2', 'Özel Kategori 2',
    'custom_3', 'Özel Kategori 3',
    'custom_4', 'Özel Kategori 4'
  )
)
on conflict (key) do nothing;

-- 4. Supabase platform nesneleri -------------------------------------------------

-- Yeni auth kullanıcısı için profil oluşturur; ilk kullanıcı ana şantiye şefi olur.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Profil fotoğrafları
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

-- pg_cron etkinse her gün kontrol et; pazar değilse fonksiyon işlem yapmaz.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
    and not exists (
      select 1 from cron.job where jobname = 'sunday-attendance'
    )
  then
    perform cron.schedule(
      'sunday-attendance',
      '5 0 * * *',
      'select public.ensure_current_sunday_attendance();'
    );
  end if;
exception
  when undefined_table then
    null;
end
$$;
