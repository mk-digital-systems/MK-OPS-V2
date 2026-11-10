// V-03: iş planı taslakları — yetkisiz rol taslak oluşturamaz/değiştiremez/silemez, firmalar arası ayrım
import { openDb, applyDir } from "./harness.mjs";

const pg = await openDb();
await applyDir(pg);
let failures = 0;
const check = (name, ok, more = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${more ? ` — ${more}` : ""}`); if (!ok) failures++; };
async function as(uid, sql, params = []) {
  return pg.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true)`, [uid]);
    await tx.exec(`set local role authenticated`);
    return tx.query(sql, params);
  });
}
const asErr = (uid, sql, params) => as(uid, sql, params).then(() => null, (e) => e.message);
const one = async (uid, sql, params) => (await as(uid, sql, params)).rows[0];
const sys = (sql, params) => pg.query(sql, params);

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const [ownerA, manager, accounting, ownerB] = [1, 2, 3, 4].map(id);
for (const [i, u] of [ownerA, manager, accounting, ownerB].entries()) await sys(`insert into auth.users (id, email) values ($1, $2)`, [u, `u${i}@x`]);

await as(ownerA, `select public.create_company('Alfa Yapı')`);
await as(ownerB, `select public.create_company('Beta Yapı')`);
const compA = (await one(ownerA, `select public.get_my_company() r`)).r.company;
for (const u of [manager, accounting]) await as(u, `select public.join_company('Alfa Yapı', $1)`, [compA.join_code]);
await as(ownerA, `select public.assign_user_role($1, 'company_manager')`, [manager]);
await as(ownerA, `select public.assign_user_role($1, 'accounting')`, [accounting]);
// Yeni şantiye şefine hakediş hariç modüller varsayılan açık gelir (tasarım); iş planı iznini kapatıp deniyoruz.
check("yeni şantiye şefinde iş planı yetkisi varsayılan açık (tasarım)", (await one(manager, `select public.has_module_write_permission('work_plans') ok`)).ok === true);
await as(ownerA, `select public.set_company_manager_permission($1, 'work_plans', false)`, [manager]);

const branchA = (await sys(`select public.company_main_branch($1) b`, [compA.id])).rows[0].b;
const insertDraft = (uid, by = uid) => asErr(uid, `insert into public.daily_work_plan_drafts (plan_date, created_by, branch_id) values (current_date + 1, $1, $2)`, [by, branchA]);
const countRows = async (uid, sql, params) => Number((await one(uid, `with r as (${sql} returning 1) select count(*)::int n from r`, params)).n);

// Yetkisiz roller
let e = await insertDraft(manager);
check("izni olmayan şantiye şefi taslak oluşturamaz", !!e, e);
e = await insertDraft(accounting);
check("muhasebe taslak oluşturamaz", !!e, e);

// Firma yöneticisi oluşturur
e = await insertDraft(ownerA);
check("firma yöneticisi taslak oluşturur", !e, e);
const draftId = (await sys(`select id from public.daily_work_plan_drafts limit 1`)).rows[0].id;
e = await insertDraft(ownerA, manager);
check("başkası adına (created_by) taslak oluşturulamaz", !!e, e);

// Yetkisiz güncelleme / silme: RLS satırı görünmez kılar, 0 satır etkilenir
check("izni olmayan şantiye şefi taslağı güncelleyemez (0 satır)", (await countRows(manager, `update public.daily_work_plan_drafts set notes = 'x' where id = $1`, [draftId])) === 0);
check("izni olmayan şantiye şefi taslağı silemez (0 satır)", (await countRows(manager, `delete from public.daily_work_plan_drafts where id = $1`, [draftId])) === 0);
check("muhasebe taslağı güncelleyemez (0 satır)", (await countRows(accounting, `update public.daily_work_plan_drafts set notes = 'x' where id = $1`, [draftId])) === 0);
check("muhasebe taslağı silemez (0 satır)", (await countRows(accounting, `delete from public.daily_work_plan_drafts where id = $1`, [draftId])) === 0);
check("taslak değişmedi", (await sys(`select notes from public.daily_work_plan_drafts where id = $1`, [draftId])).rows[0].notes === null);

// Başka firma
check("başka firma taslağı göremez", Number((await one(ownerB, `select count(*)::int n from public.daily_work_plan_drafts`)).n) === 0);
check("başka firma taslağı güncelleyemez (0 satır)", (await countRows(ownerB, `update public.daily_work_plan_drafts set notes = 'x' where id = $1`, [draftId])) === 0);
check("başka firma taslağı silemez (0 satır)", (await countRows(ownerB, `delete from public.daily_work_plan_drafts where id = $1`, [draftId])) === 0);

// İzin verilince çalışır
await as(ownerA, `select public.set_company_manager_permission($1, 'work_plans', true)`, [manager]);
check("izin verilen şantiye şefi taslağı güncelleyebilir", (await countRows(manager, `update public.daily_work_plan_drafts set notes = 'ok' where id = $1`, [draftId])) === 1);
await as(ownerA, `select public.set_company_manager_permission($1, 'work_plans', false)`, [manager]);
check("izin geri alınınca tekrar güncelleyemez", (await countRows(manager, `update public.daily_work_plan_drafts set notes = 'geri' where id = $1`, [draftId])) === 0);
check("sahip taslağı silebilir", (await countRows(ownerA, `delete from public.daily_work_plan_drafts where id = $1`, [draftId])) === 1);

if (failures) { console.log(`\n${failures} başarısız`); process.exit(1); }
