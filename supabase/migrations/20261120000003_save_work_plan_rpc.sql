-- =============================================================================
-- MK OPS — iş planı kaydı tek transaction'da (V-01)
--
-- Sorun: WorkPlanRepository.upsertFullPlan planı güncelledikten sonra eski ekipleri ve izinlileri
-- siliyor, sonra yeni ekip/üye/izinli kayıtlarını tek tek ekliyordu. Araya giren herhangi bir hata
-- (bağlantı kopması, kısıt ihlali, yetki) planı yarım bırakıyor, eski ekipler kayboluyordu.
--
-- Çözüm: save_work_plan(...) tek fonksiyon = tek transaction. Hata olursa hepsi geri alınır.
--
-- Güvenlik: SECURITY INVOKER (bilerek). Fonksiyon çağıranın yetkisiyle çalışır; mevcut RLS
-- (company_isolation, branch_isolation, has_module_write_permission), şube yazma koruması ve
-- tüm tetikleyiciler aynen geçerlidir. Yeni bir ayrıcalıklı yol açılmaz.
-- Eşzamanlılık: mevcut plan satırı FOR UPDATE ile kilitlenir (iki kaydetme sıraya girer);
-- p_expected_updated_at verilirse, düzenleme başladıktan sonra başkası kaydettiyse reddedilir.
-- =============================================================================
begin;

create function public.save_work_plan(
  p_plan_id uuid,
  p_plan_date date,
  p_branch_id uuid,
  p_notes text,
  p_teams jsonb,
  p_absences jsonb default '[]'::jsonb,
  p_expected_updated_at timestamptz default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_plan public.daily_work_plans;
  v_found boolean := false;
  v_team jsonb;
  v_member jsonb;
  v_team_id uuid;
  v_idx integer := 0;
  v_people uuid[] := '{}';
  v_plates text[] := '{}';
  v_absent uuid[] := '{}';
  v_person uuid;
  v_plate text;
  v_chiefs integer;
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
begin
  if auth.uid() is null or v_company is null or not public.has_module_write_permission('work_plans') then
    raise exception 'İş planı kaydetme yetkiniz yok' using errcode = '42501';
  end if;
  if p_plan_date is null then
    raise exception 'Plan tarihi zorunlu';
  end if;
  if jsonb_typeof(p_teams) is distinct from 'array' or jsonb_array_length(p_teams) = 0 then
    raise exception 'En az bir ekip gerekli';
  end if;
  if jsonb_typeof(coalesce(p_absences, '[]'::jsonb)) is distinct from 'array' then
    raise exception 'Geçersiz izinli/raporlu listesi';
  end if;

  -- 1) Doğrulama (veri yazılmadan önce) ----------------------------------------------------------
  for v_team in select value from jsonb_array_elements(p_teams) loop
    v_idx := v_idx + 1;
    if nullif(trim(coalesce(v_team ->> 'chief_name', '')), '') is null
      or nullif(trim(coalesce(v_team ->> 'chief_phone', '')), '') is null then
      raise exception 'Her ekipte ekip şefi ve telefon zorunlu';
    end if;
    if jsonb_typeof(v_team -> 'members') is distinct from 'array' or jsonb_array_length(v_team -> 'members') = 0 then
      raise exception 'Ekip % için personel listesi boş olamaz', v_idx;
    end if;
    select count(*) into v_chiefs from jsonb_array_elements(v_team -> 'members') m
    where coalesce((m.value ->> 'is_chief')::boolean, false);
    if v_chiefs <> 1 or coalesce((v_team -> 'members' -> 0 ->> 'is_chief')::boolean, false) is not true then
      raise exception 'Ekip şefi ilk sırada olmalıdır';
    end if;

    for v_member in select value from jsonb_array_elements(v_team -> 'members') loop
      v_person := nullif(v_member ->> 'personnel_id', '')::uuid;
      if v_person is null then continue; end if;
      if v_person = any (v_people) then
        raise exception '% bu tarihte başka bir ekipte görevli.', coalesce(v_member ->> 'full_name', 'Personel');
      end if;
      v_people := v_people || v_person;
    end loop;

    v_plate := upper(nullif(trim(coalesce(v_team ->> 'vehicle_plate', '')), ''));
    if v_plate is not null then
      if v_plate = any (v_plates) then
        raise exception '% plakalı araç bu tarihte başka bir ekipte kullanılıyor.', v_plate;
      end if;
      v_plates := v_plates || v_plate;
    end if;
  end loop;

  for v_member in select value from jsonb_array_elements(coalesce(p_absences, '[]'::jsonb)) loop
    v_person := nullif(v_member ->> 'personnel_id', '')::uuid;
    if v_person is null then
      raise exception 'İzinli/raporlu kaydında personel zorunlu';
    end if;
    if v_person = any (v_absent) then
      raise exception 'Aynı personel izinli/raporlu listesine iki kez eklenemez';
    end if;
    if v_person = any (v_people) then
      raise exception 'Personel aynı planda hem ekipte hem izinli/raporlu olamaz';
    end if;
    v_absent := v_absent || v_person;
  end loop;

  -- 2) Plan: mevcutu kilitle ya da oluştur ----------------------------------------------------------
  if p_plan_id is not null then
    select * into v_plan from public.daily_work_plans where id = p_plan_id for update;
    v_found := found;
    if not v_found then
      raise exception 'Plan bulunamadı veya erişiminiz yok' using errcode = 'P0002';
    end if;
  else
    -- Şube verilmediyse RLS'in izin verdiği o günkü plana bakılır; birden fazlaysa şube istenir.
    if p_branch_id is null and (select count(*) from public.daily_work_plans where plan_date = p_plan_date) > 1 then
      raise exception 'Bu tarihte birden fazla şubenin planı var; şube belirtilmelidir';
    end if;
    select * into v_plan from public.daily_work_plans
    where plan_date = p_plan_date and (p_branch_id is null or branch_id = p_branch_id) for update;
    v_found := found;
  end if;

  if v_found then
    if p_expected_updated_at is not null and v_plan.updated_at is distinct from p_expected_updated_at then
      raise exception 'Bu plan siz düzenlerken başka biri tarafından değiştirildi. Sayfayı yenileyip tekrar deneyin.'
        using errcode = '40001';
    end if;
    update public.daily_work_plans set notes = v_notes, updated_by = auth.uid() where id = v_plan.id;
    delete from public.daily_work_plan_teams where plan_id = v_plan.id;       -- üyeler zincirleme silinir
    delete from public.daily_work_plan_absences where work_plan_id = v_plan.id;
  else
    begin
      insert into public.daily_work_plans (plan_date, branch_id, notes, created_by, updated_by)
      values (p_plan_date, p_branch_id, v_notes, auth.uid(), auth.uid())
      returning * into v_plan;
    exception when unique_violation then
      raise exception 'Bu tarih için plan az önce başka biri tarafından oluşturuldu. Sayfayı yenileyip tekrar deneyin.'
        using errcode = '40001';
    end;
  end if;

  -- 3) Ekipler, üyeler, izinliler ----------------------------------------------------------------------
  v_idx := 0;
  for v_team in select value from jsonb_array_elements(p_teams) loop
    insert into public.daily_work_plan_teams
      (plan_id, sort_order, project_id, project_code, project_name, team_type, vehicle_plate,
       chief_personnel_id, chief_name, chief_phone)
    values (
      v_plan.id, v_idx,
      nullif(v_team ->> 'project_id', '')::uuid,
      coalesce(nullif(trim(coalesce(v_team ->> 'project_code', '')), ''), '-'),
      trim(coalesce(v_team ->> 'project_name', '')),
      trim(coalesce(v_team ->> 'team_type', '')),
      nullif(trim(coalesce(v_team ->> 'vehicle_plate', '')), ''),
      nullif(v_team ->> 'chief_personnel_id', '')::uuid,
      trim(v_team ->> 'chief_name'),
      trim(v_team ->> 'chief_phone')
    ) returning id into v_team_id;

    insert into public.daily_work_plan_team_members
      (team_id, sort_order, personnel_id, full_name, job_title, phone, is_chief)
    select
      v_team_id, (t.ord - 1)::integer,
      nullif(t.m ->> 'personnel_id', '')::uuid,
      trim(coalesce(t.m ->> 'full_name', '')),
      nullif(trim(coalesce(t.m ->> 'job_title', '')), ''),
      case when coalesce((t.m ->> 'is_chief')::boolean, false)
        then coalesce(nullif(trim(coalesce(t.m ->> 'phone', '')), ''), trim(v_team ->> 'chief_phone')) end,
      coalesce((t.m ->> 'is_chief')::boolean, false)
    from jsonb_array_elements(v_team -> 'members') with ordinality as t(m, ord);

    v_idx := v_idx + 1;
  end loop;

  insert into public.daily_work_plan_absences (work_plan_id, personnel_id, full_name, status)
  select v_plan.id, (a.value ->> 'personnel_id')::uuid, trim(coalesce(a.value ->> 'full_name', '')),
         (a.value ->> 'status')::public.work_plan_absence_status
  from jsonb_array_elements(coalesce(p_absences, '[]'::jsonb)) as a;

  return v_plan.id;
end;
$$;

revoke all on function public.save_work_plan(uuid, date, uuid, text, jsonb, jsonb, timestamptz) from public, anon;
grant execute on function public.save_work_plan(uuid, date, uuid, text, jsonb, jsonb, timestamptz) to authenticated;

commit;
