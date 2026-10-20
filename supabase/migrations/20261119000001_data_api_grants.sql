-- =============================================================================
-- MK OPS — Data API yetkilerinin açıkça tanımlanması (30 Ekim 2026 uyumu)
--
-- Supabase, 30 Ekim 2026'dan sonra public şemasında oluşturulan tablolara anon /
-- authenticated / service_role için otomatik yetki vermeyi bırakıyor. Önceki
-- migration'lar bu otomatik yetkiye güvenip yalnızca "fazlasını geri alıyordu";
-- bu yüzden sıfırdan kurulumda (yeni proje, db reset) sonradan eklenen ~40 tablo
-- yetkisiz kalıyordu ("permission denied for table ...").
--
-- Bu dosya her tablonun yetkisini AÇIKÇA ve en az yetki ilkesiyle yazar:
--   * anon: hiçbir tabloda ve sıralayıcıda (sequence) yetki yok. Bütün RLS politikaları
--     zaten yalnızca authenticated içindi; uygulama oturumsuz tablo sorgusu yapmaz.
--   * authenticated: yalnızca satır politikasının (RLS) izin verdiği işlemler için
--     SELECT / INSERT / UPDATE / DELETE. Politikası olmayan işlem zaten reddediliyordu;
--     yetki de kaldırılır. Bu yüzden uygulamanın davranışı değişmez.
--     TRUNCATE (RLS'ye takılmaz), TRIGGER ve REFERENCES hiçbir istemci rolünde yok.
--   * service_role: SELECT / INSERT / UPDATE / DELETE (TRUNCATE, TRIGGER, REFERENCES yok).
--   * Sequence'lar: 4 sequence'ın hepsi identity sütunlarına ait; istemci rollerinin yetkisi gerekmez.
--     Yalnızca baseline'dan gelen attendance_audit_logs_id_seq için authenticated / service_role
--     USAGE'ı korunur; geri kalan hepsi kapatılır.
--   * Kasa, platform_admins, user_branches vb. yalnızca fonksiyon (RPC) ile erişilen
--     tablolar kapalı kalır (authenticated yetkisi yok).
--   * ALTER DEFAULT PRIVILEGES kullanılmaz: gelecekte oluşturulan her tablo kendi
--     migration'ında açıkça yetki yazmak zorundadır (bkz. tests/db/grants.test.mjs).
--
-- Mevcut canlı veritabanında bu dosya yalnızca fazla yetkileri kaldırır; hiçbir satıra
-- dokunmaz ve RLS politikalarını değiştirmez. Tekrar çalıştırmak zararsızdır.
-- =============================================================================

-- Tek işlem: herhangi bir adımda (doğrulama dahil) hata olursa hiçbir yetki değişmez.
-- Hata alırsanız SQL Editor'de "rollback;" çalıştırmanız yeterli olur.
begin;
set local lock_timeout = '10s';

-- 0. Ön koşul: "revoke all on all tables" tabloların yanında görünüm (view), materialized view ve
-- foreign table yetkilerini de sıfırlar. Bu dosya yalnızca tabloların yetkisini yeniden yazdığı için
-- public şemasında bunlardan biri varsa güvenli tarafta kalıp durur.
do $$
declare
  v_other text;
begin
  select string_agg(c.relname || ' (' || c.relkind::text || ')', ', ' order by c.relname) into v_other
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm', 'f');
  if v_other is not null then
    raise exception 'public şemasında tablo dışı nesne var: %. Yetkileri ayrıca belirlenmeden bu migration çalıştırılmaz.', v_other;
  end if;
end $$;

-- 1. Önce hepsini kapat -------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated, service_role;
revoke all on all sequences in schema public from anon, authenticated, service_role;

-- 2. authenticated: tablo başına en az yetki -----------------------------------------
grant select on
  public.attendance_audit_logs,
  public.audit_logs,
  public.catalog_poz_items,
  public.catalog_project_types,
  public.catalogs,
  public.companies,
  public.company_catalogs,
  public.company_manager_permissions,
  public.hakedis_extra_values,
  public.hakedis_log_values,
  public.inventory_catalog,
  public.inventory_categories,
  public.inventory_custody_balances,
  public.inventory_custody_movements,
  public.inventory_location_stocks,
  public.inventory_locations,
  public.inventory_materials,
  public.inventory_movements,
  public.inventory_receipt_items,
  public.inventory_receipt_lines,
  public.inventory_receipts,
  public.inventory_request_items,
  public.inventory_request_receipt_items,
  public.inventory_requests,
  public.inventory_shipment_items,
  public.inventory_shipments,
  public.personnel_branch_history,
  public.poz_prices,
  public.production_entries,
  public.production_items,
  public.production_jobs,
  public.profiles,
  public.project_cancellation_history,
  public.project_sheet_kesif,
  public.project_stages,
  public.subcontractor_period_closures,
  public.support_requests,
  public.vehicle_branch_history,
  public.vehicle_fuel_logs
to authenticated;

grant select, insert, update, delete on
  public.attendance_records,
  public.branches,
  public.daily_work_plan_absences,
  public.daily_work_plan_drafts,
  public.daily_work_plan_team_members,
  public.daily_work_plan_teams,
  public.daily_work_plans,
  public.hakedis_project_prices,
  public.hakedis_stage_prices,
  public.personnel,
  public.personnel_advances,
  public.private_notes,
  public.project_hp_sheets,
  public.project_sections,
  public.project_stage_logs,
  public.project_stage_progress,
  public.project_type_stages,
  public.project_types,
  public.projects,
  public.subcontractor_expense_categories,
  public.subcontractor_transactions,
  public.subcontractors,
  public.teams
to authenticated;

grant select, insert, update on
  public.app_settings,
  public.attendance_month_notes,
  public.vehicles
to authenticated;

grant select, insert on
  public.personnel_employment_periods
to authenticated;

grant select, delete on
  public.shared_notes
to authenticated;

-- RPC ile erişilen, istemciye kapalı tablolar (authenticated yetkisi yok):
--   attendance_month_approvals
--   company_join_attempts
--   company_vault_attempts
--   company_vault_notes
--   company_vault_sessions
--   company_vaults
--   head_office_grants
--   notification_reads
--   platform_admins
--   user_branches
--   vehicle_assignment_history

-- 3. service_role (edge function: delete-user) ---------------------------------------
grant select, insert, update, delete on all tables in schema public to service_role;

-- 4. Sıralayıcılar --------------------------------------------------------------------
grant usage on sequence public.attendance_audit_logs_id_seq to authenticated, service_role;

-- 5. Doğrulama: beklenmeyen yetki kalırsa migration geri alınır -----------------------
-- has_table_privilege / has_sequence_privilege rolün PUBLIC ve üyelik yoluyla miras aldığı
-- yetkileri de hesaba katar; ayrıca ACL'de doğrudan PUBLIC kaydı da aranır. Kapsam: public
-- şemasındaki bütün tablo, görünüm, materialized view, foreign table ve sequence'ler.
do $$
declare
  v_rel record;
  v_role text;
  v_priv text;
  v_table_privs text[] := array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
  v_bad text[] := '{}';
  v_tables integer := 0;
  v_sequences integer := 0;
begin
  if current_setting('server_version_num')::integer >= 170000 then
    v_table_privs := array_append(v_table_privs, 'MAINTAIN');
  end if;

  for v_rel in
    select c.oid, c.relname, c.relkind, c.relacl
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
  loop
    -- Doğrudan PUBLIC kaydı (herkese açık yetki)
    if v_rel.relacl is not null and exists (select 1 from aclexplode(v_rel.relacl) a where a.grantee = 0) then
      v_bad := array_append(v_bad, v_rel.relname || ': PUBLIC yetkisi');
    end if;

    if v_rel.relkind = 'S' then
      v_sequences := v_sequences + 1;
      foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
        foreach v_priv in array array['USAGE', 'SELECT', 'UPDATE'] loop
          if has_sequence_privilege(v_role, v_rel.oid, v_priv)
             and not (v_role <> 'anon' and v_rel.relname = 'attendance_audit_logs_id_seq' and v_priv = 'USAGE') then
            v_bad := array_append(v_bad, v_rel.relname || ': ' || v_role || ' ' || v_priv);
          end if;
        end loop;
      end loop;
    else
      v_tables := v_tables + 1;
      foreach v_priv in array v_table_privs loop
        if has_table_privilege('anon', v_rel.oid, v_priv) then
          v_bad := array_append(v_bad, v_rel.relname || ': anon ' || v_priv);
        end if;
        if v_priv in ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN') then
          foreach v_role in array array['authenticated', 'service_role'] loop
            if has_table_privilege(v_role, v_rel.oid, v_priv) then
              v_bad := array_append(v_bad, v_rel.relname || ': ' || v_role || ' ' || v_priv);
            end if;
          end loop;
        end if;
      end loop;
    end if;
  end loop;

  if v_tables = 0 then
    raise exception 'Doğrulama hiçbir tablo bulamadı; migration geri alınıyor';
  end if;
  if cardinality(v_bad) > 0 then
    raise exception 'Beklenmeyen yetki kaldı (% adet): %', cardinality(v_bad), array_to_string(v_bad[1:10], '; ');
  end if;
  raise notice 'Doğrulandı: % tablo, % sequence', v_tables, v_sequences;
end $$;

commit;
