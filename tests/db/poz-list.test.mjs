// Firma poz listesi (F2): elle ve toplu ekleme, yetkiler, yürürlük tarihli fiyat, toplu yüzde, pasife alma
import { openDb, applyDir } from "./harness.mjs";

const pg = await openDb();
await applyDir(pg);
const check = (name, ok, extra = "") => console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
async function as(uid, sql, params = []) {
  return pg.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true)`, [uid]);
    await tx.exec(`set local role authenticated`);
    return tx.query(sql, params);
  });
}
const asErr = (uid, sql, params) => as(uid, sql, params).then(() => null, (error) => error.message);
const one = async (uid, sql, params) => (await as(uid, sql, params)).rows[0];
const sys = (sql, params) => pg.query(sql, params);

const [owner, hqChief, branchChief, acc, other, admin] = ["1", "2", "3", "4", "5", "9"].map((n) => `00000000-0000-0000-0000-00000000000${n}`);
await sys(`insert into auth.users (id, email) values ($1,'a@a'),($2,'b@b'),($3,'c@c'),($4,'d@d'),($5,'e@e'),($6,'admin@x')`, [owner, hqChief, branchChief, acc, other, admin]);
await sys(`insert into public.platform_admins (user_id) values ($1)`, [admin]);
await as(owner, `select public.create_company('Telekom Firma')`);
await as(other, `select public.create_company('Diğer Firma')`);
const company = (await one(owner, `select public.get_my_company() r`)).r.company;
await sys(`update public.companies set branch_limit = 10 where id = $1`, [company.id]);
for (const u of [hqChief, branchChief, acc]) await as(u, `select public.join_company('Telekom Firma', $1)`, [company.join_code]);
await as(owner, `select public.assign_user_role($1, 'company_manager')`, [hqChief]);
await as(owner, `select public.assign_user_role($1, 'company_manager')`, [branchChief]);
await as(owner, `select public.assign_user_role($1, 'accounting')`, [acc]);
const branchA = (await one(owner, `insert into public.branches (name, sort_order) values ('Şube A', 1) returning id`)).id;
await as(owner, `select public.set_user_branches($1, $2::uuid[])`, [branchChief, [branchA]]);

const telekom = (await sys(`select id from public.catalogs where name = 'Telekom Altyapı'`)).rows[0].id;
const insaat = (await one(admin, `select public.admin_save_catalog(null, 'İnşaat', null) id`)).id;
await as(admin, `select public.admin_save_catalog_items($1, $2::jsonb)`, [telekom, JSON.stringify([
  { group_name: "Kablo", name: "Yeraltı kablo çekimi", unit: "m" },
  { group_name: "Ek", name: "Fiber ek yapımı", unit: "adet" },
])]);
await as(admin, `select public.admin_set_company_catalogs($1, array[$2]::uuid[])`, [company.id, telekom]);

const save = (uid, id, catalog, group, poz, name, unit, active = null, companyId = null) =>
  as(uid, `select public.save_poz_item($1, $2, $3, $4, $5, $6, $7, $8) id`, [companyId, id, catalog, group, poz, name, unit, active]).then((r) => r.rows[0].id);
const saveErr = (uid, ...args) => save(uid, ...args).then(() => null, (e) => e.message);
const list = (uid, companyId = null) => one(uid, `select public.get_poz_list($1) r`, [companyId]).then((r) => r.r);

// 1. Süper admin ilk kurulumu yapar
const p11 = await save(admin, null, telekom, "Kablo", "1/1", "Blokta kablo çekimi", "m", null, company.id);
check("super admin adds poz to a firm", !!p11);
let error = await saveErr(admin, null, insaat, null, null, "Duvar", "m²", null, company.id);
check("catalog must be assigned to firm", /atanmamış/.test(error ?? ""), error);
const imported = (await one(admin, `select public.import_poz_items($1, $2, $3::jsonb, '2026-10-01') r`, [company.id, telekom, JSON.stringify([
  { group_name: "Kablo", poz_code: "1/2", name: "Yeraltı kablo çekimi", unit: "m", unit_price: "12,50" },
  { group_name: "Kablo", poz_code: "1/3", name: "Havai kablo çekimi", unit: "m", unit_price: 10 },
  { group_name: "Ek", poz_code: "2/1", name: "Fiber ek yapımı", unit: "adet", unit_price: 150 },
  { group_name: "Kablo", poz_code: "1/1", name: "Blokta kablo çekimi", unit: "m", unit_price: 8 },
])])).r;
check("Excel import: 4 rows, 4 priced", imported.count === 4 && imported.priced === 4, JSON.stringify(imported));
let data = await list(owner);
const items = data.items;
check("import matched existing by poz no (no duplicate)", items.length === 4 && items.filter((i) => i.poz_code === "1/1").length === 1, items.map((i) => i.poz_code).join());
const id = (code) => items.find((i) => i.poz_code === code).id;
check("decimal comma price", data.prices.some((p) => p.stage_id === id("1/2") && Number(p.unit_price) === 12.5));

// 2. Firma yetkileri
error = await saveErr(owner, null, telekom, "Kablo", "1/2", "Kopya", "m");
check("duplicate poz no rejected", /aynı ad veya aynı poz/.test(error ?? ""), error);
error = await saveErr(owner, null, telekom, "Kablo", "ÇOKUZUN", "Uzun", "m");
check("poz no longer than 5 rejected", /3–5/.test(error ?? ""), error);
const own = await save(owner, null, telekom, "Direk", "3/1", "Direk dikimi", "adet");
check("firma yöneticisi adds poz", !!own);
const hq = await save(hqChief, null, telekom, "Direk", "3/2", "Ek odası konması", "adet");
check("Merkez şefi adds poz", !!hq);
error = await saveErr(branchChief, null, telekom, null, null, "Şube pozu", "m");
check("şube şefi cannot edit", /firma yöneticisi ve Merkez/.test(error ?? ""), error);
error = await saveErr(acc, null, telekom, null, null, "Muhasebe pozu", "m");
check("muhasebe cannot edit", /firma yöneticisi ve Merkez/.test(error ?? ""), error);
data = await list(branchChief);
check("şube şefi reads list without prices", data.items.length === 6 && data.prices.length === 0 && !data.can_edit && !data.can_price, JSON.stringify({ n: data.items.length, p: data.prices.length }));
data = await list(hqChief);
check("Merkez şefi without hakediş: edit yes, price no", data.can_edit && !data.can_price && data.prices.length === 0);
error = await asErr(hqChief, `select public.set_poz_price(null, $1, 20, current_date)`, [own]);
check("Merkez şefi without hakediş cannot price", /hakediş yetkisi/.test(error ?? ""), error);
error = await asErr(hqChief, `select public.import_poz_items(null, $1, '[{"name":"X","unit_price":"5"}]'::jsonb, current_date)`, [telekom]);
check("import with price needs hakediş", /hakediş yetkisi/.test(error ?? ""), error);
await as(owner, `select public.set_company_manager_permission($1, 'hakedis', true)`, [hqChief]);
check("Merkez şefi with hakediş can price", !(await asErr(hqChief, `select public.set_poz_price(null, $1, 20, '2026-10-01')`, [own])));
check("catalog suggestions in list", (await list(owner)).catalogs[0].items.length === 2);
check("list carries currency", (await list(admin, company.id)).currency_code === "TRY");

// Firma ayrımı
error = await asErr(other, `select public.get_poz_list($1)`, [company.id]);
check("other firm cannot read", /erişiminiz yok/.test(error ?? ""), error);
error = await saveErr(other, own, telekom, null, null, "Hack", "m", null, company.id);
check("other firm cannot edit", /erişiminiz yok/.test(error ?? ""), error);
check("other firm sees no prices table rows", (await as(other, `select count(*)::int n from public.poz_prices`)).rows[0].n === 0);
error = await asErr(owner, `insert into public.poz_prices (stage_id, valid_from, unit_price) values ($1, current_date, 1)`, [own]);
check("poz_prices not writable directly", !!error, error);

// 3. Yürürlük tarihli fiyat ve toplu yüzde
const priceAt = (stage, date) => sys(`select public.poz_price_at($1, $2) p`, [stage, date]).then((r) => (r.rows[0].p === null ? null : Number(r.rows[0].p)));
await as(owner, `select public.set_poz_price(null, $1, 12, '2026-11-01')`, [id("1/3")]);
check("price before new date stays old", (await priceAt(id("1/3"), "2026-10-28")) === 10);
check("price from new date", (await priceAt(id("1/3"), "2026-11-03")) === 12);
check("no price before first date", (await priceAt(id("1/3"), "2026-09-01")) === null);
error = await asErr(owner, `select public.bulk_adjust_poz_prices(null, null, null, 0, '2026-12-01')`);
check("zero percent rejected", /sıfırdan farklı/.test(error ?? ""), error);
const n = (await one(owner, `select public.bulk_adjust_poz_prices(null, $1, 'kablo', 10, '2026-12-01') n`, [telekom])).n;
check("bulk +10% on Kablo group (3 priced)", n === 3, n);
check("1/2: 12.50 -> 13.75", (await priceAt(id("1/2"), "2026-12-05")) === 13.75);
check("1/3 uses latest base: 12 -> 13.20", (await priceAt(id("1/3"), "2026-12-05")) === 13.2);
check("Ek group untouched", (await priceAt(id("2/1"), "2026-12-05")) === 150);
check("old date still old price", (await priceAt(id("1/2"), "2026-11-15")) === 12.5);
await as(owner, `select public.bulk_adjust_poz_prices(null, null, null, 5, '2027-01-01')`);
check("bulk all: 2/1 150 -> 157.50", (await priceAt(id("2/1"), "2027-01-02")) === 157.5);
check("unpriced poz skipped", (await priceAt(hq, "2027-01-02")) === null);
await as(owner, `select public.set_poz_price(null, $1, null, '2027-01-01')`, [id("2/1")]);
check("delete one price entry -> previous applies", (await priceAt(id("2/1"), "2027-01-02")) === 150);

// 4. Pasife alma ve silme
await save(owner, own, telekom, "Direk", "3/1", "Direk dikimi", "adet", false);
check("deactivate poz", (await list(owner)).items.find((i) => i.id === own).is_active === false);
const typeId = (await one(owner, `select public.save_project_type(null, 'Bina', null, false, null, null, '[{"name":"Temel"}]'::jsonb) id`)).id;
const project = (await one(owner, `insert into public.projects (project_code, name, location, project_type_id) values ('A-1', 'Hat', 'Merkez', $1) returning id`, [typeId])).id;
await sys(`insert into public.project_stage_progress (company_id, project_id, stage_id) values ($1, $2, $3)`, [company.id, project, id("1/2")]);
error = await asErr(owner, `select public.delete_poz_item(null, $1)`, [id("1/2")]);
check("used poz cannot be deleted", /pasife alın/.test(error ?? ""), error);
check("unused poz deleted", !(await asErr(owner, `select public.delete_poz_item(null, $1)`, [hq])));
check("used flag in list", (await list(owner)).items.find((i) => i.poz_code === "1/2").used === true);

// 5. Eski tür kalemleri etkilenmez
check("type stages unaffected", (await one(owner, `select count(*)::int n from public.project_type_stages where project_type_id = $1`, [typeId])).n === 1);
const assigned = (await one(admin, `select public.admin_set_company_catalogs($1, '{}'::uuid[]) r`, [company.id]));
error = await asErr(admin, `select public.admin_delete_catalog($1)`, [telekom]);
check("catalog with firm pozes cannot be deleted", /firma pozları/.test(error ?? ""), error ?? JSON.stringify(assigned));

process.exit(0);
