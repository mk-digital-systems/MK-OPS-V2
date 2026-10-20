// Data API yetki denetimi: Supabase 30 Ekim 2026'dan sonra public'teki yeni nesnelere otomatik
// yetki vermiyor. Bu test, her tablonun yetkisinin migration'larda AÇIKÇA yazıldığını ve
// gereğinden geniş olmadığını doğrular (yeni tablo eklenip GRANT unutulursa burada kırılır).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, applyDir, applyFile, MIGRATIONS_DIR } from "./harness.mjs";

const pg = await openDb();
await applyDir(pg);
const check = (name, ok, extra = "") => console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
const rows = async (sql) => (await pg.query(sql)).rows;
const list = (r) => r.map((x) => x.t).join(", ");

// Yalnızca fonksiyonla (RPC) erişilen, istemciye kapalı olması gereken tablolar.
const rpcOnly = new Set([
  "attendance_month_approvals", "company_join_attempts", "company_vault_attempts", "company_vault_notes",
  "company_vault_sessions", "company_vaults", "head_office_grants", "notification_reads", "platform_admins",
  "user_branches", "vehicle_assignment_history",
]);

const tables = await rows(`select c.relname t, c.relrowsecurity rls from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p')`);
check("her public tablosunda RLS açık", tables.every((t) => t.rls), list(tables.filter((t) => !t.rls)));

let r = await rows(`select distinct table_name t from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon'`);
check("anon hiçbir tabloda yetkili değil", !r.length, list(r));

r = await rows(`select distinct table_name t from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role') and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')`);
check("istemci rollerinde TRUNCATE / TRIGGER / REFERENCES yok", !r.length, list(r));

r = await rows(`select distinct object_name t from information_schema.role_usage_grants where object_schema = 'public' and object_type = 'SEQUENCE' and grantee = 'anon'`);
check("anon hiçbir sequence'ta yetkili değil", !r.length, list(r));

// Politikası olan her tabloda authenticated SELECT yetkisi olmalı (yoksa politika ölü, uygulama "permission denied" alır).
r = await rows(`
  select distinct c.relname t
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where not has_table_privilege('authenticated', c.oid, 'select')`);
check("politikalı her tabloda authenticated SELECT var", !r.length, list(r));

// Politika izin vermediği işlem için yetki verilmemeli (en az yetki).
r = await rows(`
  select t.relname || ':' || op.cmd t
  from pg_class t
  join pg_namespace n on n.oid = t.relnamespace and n.nspname = 'public' and t.relkind = 'r'
  cross join (values ('INSERT'), ('UPDATE'), ('DELETE')) op(cmd)
  where has_table_privilege('authenticated', t.oid, op.cmd)
    and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.relname
                    and p.permissive = 'PERMISSIVE' and p.cmd in (op.cmd, 'ALL'))`);
check("politikasız yazma yetkisi yok", !r.length, list(r));

r = await rows(`select c.relname t from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not has_table_privilege('authenticated', c.oid, 'select')`);
const unexpected = r.filter((x) => !rpcOnly.has(x.t));
check("yalnızca bilinen RPC tabloları istemciye kapalı", !unexpected.length, list(unexpected));
r = [...rpcOnly].filter((t) => tables.every((x) => x.t !== t));
check("RPC-only listesi güncel (olmayan tablo yok)", !r.length, r.join(", "));

r = await rows(`select c.relname t from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not has_table_privilege('service_role', c.oid, 'select')`);
check("service_role her tabloyu okuyabilir", !r.length, list(r));

// Yeni bir tablo oluşturulunca otomatik yetki gelmemeli (varsayılan yetki tanımı yok).
await pg.exec(`create table public.__grant_probe (id int)`);
r = await rows(`select grantee t from information_schema.role_table_grants where table_schema = 'public' and table_name = '__grant_probe' and grantee in ('anon', 'authenticated', 'service_role')`);
check("yeni tabloya otomatik yetki verilmiyor", !r.length, list(r));
await pg.exec(`drop table public.__grant_probe`);

// Yükseltme senaryosu: Supabase'in eski otomatik yetkileriyle kurulmuş canlı veritabanına yalnızca
// yetki migration'ı uygulanınca, sıfırdan kurulumla AYNI yetki tablosu çıkmalı.
const acl = async (db) => (await db.query(`
  select c.relname || ':' || r.rolname || ':' || string_agg(a.privilege_type, ',' order by a.privilege_type) x
  from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public' and c.relkind = 'r'
  cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role')) r
  cross join lateral (select p privilege_type from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
                      where has_table_privilege(r.rolname, c.oid, p)) a
  group by c.relname, r.rolname order by c.relname, r.rolname`)).rows.map((r) => r.x).join("\n");
const legacy = await openDb();
await legacy.exec(`alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;`);
await applyDir(legacy, undefined, (file) => file < "20261119");
const before = await acl(legacy);
await applyDir(legacy, undefined, (file) => file >= "20261119");
check("yükseltilen canlı veritabanı = sıfırdan kurulum (yetki tablosu aynı)", (await acl(legacy)) === (await acl(pg)));
check("yükseltme öncesi anon yetkisi vardı (testin anlamlı olduğunu doğrular)", /:anon:/.test(before));

// ---------------------------------------------------------------------------------------------
// Varsayılan yetkiler, anon fonksiyon erişimi, uygulamanın kullandığı RPC ve tablolar.
// Her kontrol iki senaryoda koşar: "sıfırdan" (varsayılan yetkisiz kurulum) ve "yükseltme"
// (Supabase'in eski otomatik yetkileriyle kurulmuş canlıya iki yeni migration uygulanmış hali).
// ---------------------------------------------------------------------------------------------
const legacyDefaults = `alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;`;

// 20261119000002 yalnızca postgres'in tablo/sequence varsayılanlarını kaldırır; fonksiyon satırına dokunmaz.
const defaultRows = (await legacy.query(`select defaclobjtype t from pg_default_acl order by 1`)).rows.map((x) => x.t).join("");
check("varsayılan yetki migration'ı yalnızca fonksiyon varsayılanını bırakıyor", defaultRows === "f", defaultRows);

// Migration sırası bağımsızlığı: 002, 001'den önce uygulanınca aynı sonuç çıkmalı.
const swapped = await openDb();
await swapped.exec(legacyDefaults);
await applyDir(swapped, undefined, (file) => file < "20261119");
await applyFile(swapped, path.join(MIGRATIONS_DIR, "20261119000002_default_privileges_lockdown.sql"));
await applyFile(swapped, path.join(MIGRATIONS_DIR, "20261119000001_data_api_grants.sql"));
check("migration sırası (002 sonra 001) sonucu değiştirmiyor", (await acl(swapped)) === (await acl(pg)));

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src");
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []);
const sources = walk(srcDir).map((file) => fs.readFileSync(file, "utf8"));

const rpcNames = new Set();
let rpcCalls = 0;
let rpcLiteral = 0;
const tableUse = new Map(); // tablo -> gereken yetkiler
for (const text of sources) {
  rpcCalls += (text.match(/\.rpc\(/g) ?? []).length;
  for (const m of text.matchAll(/\.rpc\(\s*(["'`])([A-Za-z0-9_]+)\1/g)) { rpcNames.add(m[2]); rpcLiteral++; }
  for (const m of text.matchAll(/(storage\s*)?\.from\(\s*(["'`])([A-Za-z0-9_]+)\2/g)) {
    if (m[1]) continue; // storage.from(...) bucket adıdır, tablo değil
    const need = tableUse.get(m[3]) ?? new Set(["SELECT"]);
    // Aynı ifadenin devamında (bir sonraki ';' ya da .from'a kadar) yazma çağrısı varsa o yetki de gerekir.
    const rest = text.slice(m.index + m[0].length).split(/;|\.from\(/)[0];
    if (/\.insert\(/.test(rest)) need.add("INSERT");
    if (/\.upsert\(/.test(rest)) { need.add("INSERT"); need.add("UPDATE"); }
    if (/\.update\(/.test(rest)) need.add("UPDATE");
    if (/\.delete\(/.test(rest)) need.add("DELETE");
    tableUse.set(m[3], need);
  }
}
check("uygulamadaki bütün rpc çağrıları sabit adlı (doğrulanabilir)", rpcCalls === rpcLiteral, `${rpcCalls} çağrı, ${rpcLiteral} sabit adlı`);

for (const [label, db] of [["sıfırdan", pg], ["yükseltme", legacy]]) {
  // Yeni tablo ve sequence'a otomatik yetki gelmemeli (varsayılan yetki migration'ı).
  await db.exec(`create table public.__grant_probe (id serial primary key)`);
  const probe = (await db.query(`select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = '__grant_probe' and grantee in ('anon', 'authenticated', 'service_role')
    union all select 1 from information_schema.role_usage_grants where object_schema = 'public' and object_name = '__grant_probe_id_seq' and grantee in ('anon', 'authenticated', 'service_role')`)).rows;
  check(`[${label}] yeni tablo/sequence otomatik yetki almıyor`, !probe.length, `${probe.length} yetki`);
  await db.exec(`drop table public.__grant_probe`);

  // anon hiçbir public fonksiyonu çalıştıramamalı (PUBLIC üzerinden de).
  const anonFns = (await db.query(`select p.oid::regprocedure::text t from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`)).rows;
  check(`[${label}] anon hiçbir public fonksiyonu çalıştıramıyor`, !anonFns.length, list(anonFns));

  // Uygulamanın çağırdığı her RPC: veritabanında var ve authenticated çalıştırabiliyor.
  const fns = (await db.query(`select p.proname n, bool_and(has_function_privilege('authenticated', p.oid, 'execute')) ok
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' group by 1`)).rows;
  const byName = new Map(fns.map((f) => [f.n, f.ok]));
  const missing = [...rpcNames].filter((n) => !byName.has(n));
  const denied = [...rpcNames].filter((n) => byName.has(n) && !byName.get(n));
  check(`[${label}] uygulamadaki ${rpcNames.size} RPC adı veritabanında var`, !missing.length && rpcNames.size > 50, missing.join(", "));
  check(`[${label}] uygulamadaki RPC'leri authenticated çalıştırabiliyor`, !denied.length, denied.join(", "));

  // Uygulamanın doğrudan kullandığı tablolar: var, ve gereken yetkiler (SELECT + kodda görülen yazma) verilmiş.
  const existing = new Set((await db.query(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'`)).rows.map((x) => x.relname));
  const absent = [...tableUse.keys()].filter((t) => !existing.has(t));
  check(`[${label}] uygulamanın kullandığı ${tableUse.size} tablo var`, !absent.length && tableUse.size > 30, absent.join(", "));
  const lacking = [];
  for (const [table, need] of tableUse) {
    if (!existing.has(table)) continue;
    for (const priv of need) {
      const ok = (await db.query(`select has_table_privilege('authenticated', $1, $2) ok`, [`public.${table}`, priv])).rows[0].ok;
      if (!ok) lacking.push(`${table}:${priv}`);
    }
  }
  check(`[${label}] kullanılan tablolarda gereken yetkiler (SELECT + kodda görülen yazma) var`, !lacking.length, lacking.join(", "));

  // service_role (edge function delete-user) profiles tablosunu okuyabilmeli.
  const svc = await db.transaction(async (tx) => {
    await tx.exec(`set local role service_role`);
    return (await tx.query(`select count(*)::int n from public.profiles`)).rows[0].n >= 0;
  }).catch((e) => e.message);
  check(`[${label}] service_role profiles tablosunu okuyabiliyor`, svc === true, String(svc));
}
// Beklenen authenticated yetkileri (S=SELECT, I=INSERT, U=UPDATE, D=DELETE); "" = istemciye kapalı (yalnızca RPC).
// 78 tablonun tamamı burada olmalı; yeni tablo eklenince bu liste de bilinçli olarak güncellenir.
const expectedAuth = {
  app_settings: "SIU",
  attendance_audit_logs: "S",
  attendance_month_approvals: "",
  attendance_month_notes: "SIU",
  attendance_records: "SIUD",
  audit_logs: "S",
  branches: "SIUD",
  catalog_poz_items: "S",
  catalog_project_types: "S",
  catalogs: "S",
  companies: "S",
  company_catalogs: "S",
  company_join_attempts: "",
  company_manager_permissions: "S",
  company_vault_attempts: "",
  company_vault_notes: "",
  company_vault_sessions: "",
  company_vaults: "",
  daily_work_plan_absences: "SIUD",
  daily_work_plan_drafts: "SIUD",
  daily_work_plan_team_members: "SIUD",
  daily_work_plan_teams: "SIUD",
  daily_work_plans: "SIUD",
  hakedis_extra_values: "S",
  hakedis_log_values: "S",
  hakedis_project_prices: "SIUD",
  hakedis_stage_prices: "SIUD",
  head_office_grants: "",
  inventory_catalog: "S",
  inventory_categories: "S",
  inventory_custody_balances: "S",
  inventory_custody_movements: "S",
  inventory_location_stocks: "S",
  inventory_locations: "S",
  inventory_materials: "S",
  inventory_movements: "S",
  inventory_receipt_items: "S",
  inventory_receipt_lines: "S",
  inventory_receipts: "S",
  inventory_request_items: "S",
  inventory_request_receipt_items: "S",
  inventory_requests: "S",
  inventory_shipment_items: "S",
  inventory_shipments: "S",
  notification_reads: "",
  personnel: "SIUD",
  personnel_advances: "SIUD",
  personnel_branch_history: "S",
  personnel_employment_periods: "SI",
  platform_admins: "",
  poz_prices: "S",
  private_notes: "SIUD",
  production_entries: "S",
  production_items: "S",
  production_jobs: "S",
  profiles: "S",
  project_cancellation_history: "S",
  project_hp_sheets: "SIUD",
  project_sections: "SIUD",
  project_sheet_kesif: "S",
  project_stage_logs: "SIUD",
  project_stage_progress: "SIUD",
  project_stages: "S",
  project_type_stages: "SIUD",
  project_types: "SIUD",
  projects: "SIUD",
  shared_notes: "SD",
  subcontractor_expense_categories: "SIUD",
  subcontractor_period_closures: "S",
  subcontractor_transactions: "SIUD",
  subcontractors: "SIUD",
  support_requests: "S",
  teams: "SIUD",
  user_branches: "",
  vehicle_assignment_history: "",
  vehicle_branch_history: "S",
  vehicle_fuel_logs: "S",
  vehicles: "SIU",
};

// ---------------------------------------------------------------------------------------------
// Beklenen yetki matrisi (78 tablo + 4 sequence), işlevsel rol denemeleri ve 001'in doğrulama bloğu.
// ---------------------------------------------------------------------------------------------
const privByLetter = { S: "SELECT", I: "INSERT", U: "UPDATE", D: "DELETE" };
const writeOps = ["SELECT", "INSERT", "UPDATE", "DELETE"];

for (const [label, db] of [["sıfırdan", pg], ["yükseltme", legacy]]) {
  const relTables = (await db.query(`select c.relname t from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') order by 1`)).rows.map((x) => x.t);
  check(`[${label}] tablo listesi beklenenle aynı (${Object.keys(expectedAuth).length} tablo)`,
    relTables.length === Object.keys(expectedAuth).length && relTables.every((t) => t in expectedAuth),
    `fazla: ${relTables.filter((t) => !(t in expectedAuth)).join(", ")} eksik: ${Object.keys(expectedAuth).filter((t) => !relTables.includes(t)).join(", ")}`);

  const wrong = [];
  for (const table of relTables) {
    const want = new Set([...(expectedAuth[table] ?? "")].map((l) => privByLetter[l]));
    for (const priv of writeOps) {
      const authHas = (await db.query(`select has_table_privilege('authenticated', $1::regclass, $2) ok`, [`public.${table}`, priv])).rows[0].ok;
      if (authHas !== want.has(priv)) wrong.push(`${table}: authenticated ${priv} ${authHas ? "var" : "yok"}`);
      const svcHas = (await db.query(`select has_table_privilege('service_role', $1::regclass, $2) ok`, [`public.${table}`, priv])).rows[0].ok;
      if (!svcHas) wrong.push(`${table}: service_role ${priv} yok`);
      const anonHas = (await db.query(`select has_table_privilege('anon', $1::regclass, $2) ok`, [`public.${table}`, priv])).rows[0].ok;
      if (anonHas) wrong.push(`${table}: anon ${priv} var`);
    }
  }
  check(`[${label}] 78 tablonun anon / authenticated / service_role yetkisi beklenen matrisle birebir`, !wrong.length, wrong.slice(0, 5).join("; "));

  const seqs = (await db.query(`select c.oid, c.relname n from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'S' order by 1`)).rows;
  const seqWrong = [];
  for (const s of seqs) {
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const priv of ["USAGE", "SELECT", "UPDATE"]) {
        const has = (await db.query(`select has_sequence_privilege($1, $2::oid, $3) ok`, [role, s.oid, priv])).rows[0].ok;
        const want = role !== "anon" && s.n === "attendance_audit_logs_id_seq" && priv === "USAGE";
        if (has !== want) seqWrong.push(`${s.n}: ${role} ${priv} ${has ? "var" : "yok"}`);
      }
    }
  }
  check(`[${label}] ${seqs.length} sequence: anon yetkisiz, yalnızca baseline'daki sequence'ta authenticated/service_role USAGE`, seqs.length === 4 && !seqWrong.length, seqWrong.join("; ") || `${seqs.length} sequence`);

  // PUBLIC'ten miras: ACL'de PUBLIC kaydı yok.
  const pub = (await db.query(`select c.relname t from pg_class c cross join lateral aclexplode(c.relacl) a
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S') and a.grantee = 0`)).rows;
  check(`[${label}] tablo ve sequence'larda PUBLIC yetkisi yok`, !pub.length, list(pub));

  // İşlevsel: gerçek rollerle her tabloyu sorgula.
  const tryRole = async (role, table) => db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query(`select count(*) from public.${table}`);
  }).then(() => null, (e) => e.message);
  const anonOk = [], authBad = [], svcBad = [];
  for (const table of relTables) {
    if ((await tryRole("anon", table)) === null) anonOk.push(table);
    const authErr = await tryRole("authenticated", table);
    const closed = (expectedAuth[table] ?? "") === "";
    if (closed ? authErr === null : authErr !== null) authBad.push(`${table}${authErr ? ": " + authErr : " (kapalı olması gerekirdi)"}`);
    if ((await tryRole("service_role", table)) !== null) svcBad.push(table);
  }
  check(`[${label}] anon hiçbir tabloyu sorgulayamıyor (boş sonuç değil, yetki hatası)`, !anonOk.length, anonOk.join(", "));
  check(`[${label}] authenticated: açık tablolar sorgulanıyor, RPC-only tablolar kapalı`, !authBad.length, authBad.slice(0, 3).join("; "));
  check(`[${label}] service_role 78 tablonun hepsini sorgulayabiliyor`, !svcBad.length, svcBad.join(", "));
}

// 001'in doğrulama bloğu: bütün tablo ve sequence'larda, PUBLIC ve görünümlerde bozulmayı yakalamalı.
const sql001 = fs.readFileSync(path.join(MIGRATIONS_DIR, "20261119000001_data_api_grants.sql"), "utf8");
const verifyStart = sql001.indexOf("do $$\ndeclare\n  v_rel record;");
const verifyBlock = sql001.slice(verifyStart, sql001.lastIndexOf("commit;"));
const guardBlock = sql001.slice(sql001.indexOf("do $$\ndeclare\n  v_other text;"), sql001.indexOf("-- 1. Önce hepsini kapat"));
check("doğrulama ve ön koşul blokları dosyada bulundu", verifyStart > 0 && guardBlock.length > 50);
const blockError = (sql) => pg.exec(sql).then(() => null, (e) => e.message.split("\n")[0]);
check("doğrulama bloğu temiz veritabanında geçiyor", (await blockError(verifyBlock)) === null);

const allRels = (await pg.query(`select relname, relkind from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r', 'S') order by 1`)).rows;
const missed = [];
for (const rel of allRels) {
  const isSeq = rel.relkind === "S";
  const kind = isSeq ? "sequence" : "table";
  await pg.exec(`grant ${isSeq ? "usage" : "select"} on ${kind} public.${rel.relname} to anon`);
  if (!(await blockError(verifyBlock))) missed.push(`${rel.relname}:anon`);
  await pg.exec(`revoke all on ${kind} public.${rel.relname} from anon`);
  await pg.exec(`grant ${isSeq ? "usage" : "select"} on ${kind} public.${rel.relname} to public`);
  if (!(await blockError(verifyBlock))) missed.push(`${rel.relname}:PUBLIC`);
  await pg.exec(`revoke all on ${kind} public.${rel.relname} from public`);
  if (!isSeq) {
    for (const priv of ["truncate", "trigger", "references"]) {
      await pg.exec(`grant ${priv} on public.${rel.relname} to authenticated`);
      if (!(await blockError(verifyBlock))) missed.push(`${rel.relname}:authenticated ${priv}`);
      await pg.exec(`revoke ${priv} on public.${rel.relname} from authenticated`);
    }
  } else if (rel.relname !== "attendance_audit_logs_id_seq") {
    await pg.exec(`grant usage on sequence public.${rel.relname} to authenticated`);
    if (!(await blockError(verifyBlock))) missed.push(`${rel.relname}:authenticated usage`);
    await pg.exec(`revoke all on sequence public.${rel.relname} from authenticated`);
  }
}
check(`doğrulama bloğu ${allRels.length} tablo/sequence için anon, PUBLIC ve fazla yetkiyi yakalıyor`, !missed.length && allRels.length === 82, missed.slice(0, 5).join("; ") || `${allRels.length} nesne`);
check("doğrulama bloğu, denemelerden sonra eski haline dönen veritabanında yine geçiyor", (await blockError(verifyBlock)) === null);

await pg.exec(`create view public.__probe_view as select 1 as x`);
check("tablo dışı nesne (görünüm) varken ön koşul bloğu migration'ı durduruyor", !!(await blockError(guardBlock)));
await pg.exec(`grant select on public.__probe_view to anon`);
check("doğrulama bloğu görünümdeki anon yetkisini de yakalıyor", !!(await blockError(verifyBlock)));
await pg.exec(`drop view public.__probe_view`);

// BEGIN/COMMIT: ortada hata olursa "rollback" ile hiçbir yetki değişmemiş olmalı.
const atomic = await openDb();
await atomic.exec(legacyDefaults);
await applyDir(atomic, undefined, (file) => file < "20261119");
const beforeFail = await acl(atomic);
const broken = sql001.replace("grant usage on sequence public.attendance_audit_logs_id_seq", "grant usage on sequence public.olmayan_sequence");
const failure = await atomic.exec(broken).then(() => null, (e) => e.message);
await atomic.exec("rollback");
check("001'in ortasında hata olunca rollback sonrası yetkiler değişmiyor", !!failure && (await acl(atomic)) === beforeFail, failure?.split("\n")[0]);
