// Kataloglar (F1): süper admin katalog/tür/önerilen kalem, firmaya atama ve türlerin kurulması
import { openDb, applyDir } from "./harness.mjs";

const pg = await openDb();
const sys = (sql, params) => pg.query(sql, params);

// Geçiş: eklentisi açık bir firma, katalog migration'ından önce kurulur.
const chief = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
const admin = "00000000-0000-0000-0000-000000000009";
async function as(uid, sql, params = []) {
  return pg.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true)`, [uid]);
    await tx.exec(`set local role authenticated`);
    return tx.query(sql, params);
  });
}
const asErr = (uid, sql, params) => as(uid, sql, params).then(() => null, (error) => error.message);
const one = async (sql, params, uid = chief) => (await as(uid, sql, params)).rows[0];
const check = (name, ok, extra = "") => console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);

await applyDir(pg, undefined, (file) => file < "20261103000001");
await sys(`insert into auth.users (id, email) values ($1, 'a@a'), ($2, 'b@b'), ($3, 'admin@x')`, [chief, other, admin]);
await sys(`insert into public.platform_admins (user_id) values ($1)`, [admin]);
await as(chief, `select public.create_company('Telekom Firma')`);
await as(other, `select public.create_company('Yapı Firma')`);
const companyId = (await one(`select public.current_company_id() id`)).id;
const otherId = (await one(`select public.current_company_id() id`, [], other)).id;
await as(admin, `select public.admin_set_company_project_addons($1, array['hp'])`, [companyId]);
const oldHp = (await one(`select public.save_addon_project_type(null, 'HP Odaklı', null, null, 'hp') id`)).id;
const hpProject = (await one(`select public.create_hp_project($1::jsonb, '[{"sheet_no":"P1","hp_count":10}]'::jsonb) id`,
  [JSON.stringify({ project_code: "HP-1", name: "Fiber", project_type_id: oldHp, location: "Merkez" })])).id;

// Katalog migration'ı (ve sonrakiler)
await applyDir(pg, undefined, (file) => file >= "20261103000001");

// 1. Geçiş
const telekom = (await sys(`select id from public.catalogs where name = 'Telekom Altyapı'`)).rows[0].id;
check("built-in telekom catalog seeded", !!telekom);
check("addon company moved to telekom catalog", (await sys(`select count(*)::int n from public.company_catalogs where company_id = $1 and catalog_id = $2`, [companyId, telekom])).rows[0].n === 1);
check("addon list cleared", (await sys(`select project_addons from public.companies where id = $1`, [companyId])).rows[0].project_addons.length === 0);
const linked = (await sys(`select id, catalog_type_id is not null as linked from public.project_types where company_id = $1 and name = 'HP Odaklı'`, [companyId])).rows;
check("existing HP type linked, not duplicated", linked.length === 1 && linked[0].id === oldHp && linked[0].linked, JSON.stringify(linked));
check("Kurumsal type installed", (await sys(`select screen from public.project_types where company_id = $1 and name = 'Kurumsal'`, [companyId])).rows[0]?.screen === "corporate");
check("HP project untouched", (await one(`select count(*)::int n from public.project_hp_sheets where project_id = $1`, [hpProject])).n === 1);
check("HP screen still on via catalog", (await one(`select public.company_has_project_addon('hp') v`)).v === true);
check("company without catalog has no HP", (await one(`select public.company_has_project_addon('hp') v`, [], other)).v === false);

// 2. Süper admin yetkisi
let error = await asErr(chief, `select public.admin_save_catalog(null, 'Kuaför', null)`);
check("firm cannot create catalog", /süper admin/.test(error ?? ""), error);
error = await asErr(chief, `insert into public.catalogs (name) values ('X')`);
check("catalog table not writable directly", !!error, error);
error = await asErr(chief, `select public.admin_list_catalogs()`);
check("firm cannot list all catalogs", /süper admin/.test(error ?? ""), error);

// 3. Yeni katalog (müşteriye özel) ve türleri
const insaat = (await one(`select public.admin_save_catalog(null, 'İnşaat', 'Bina alt yüklenicileri') id`, [], admin)).id;
error = await asErr(admin, `select public.admin_save_catalog(null, 'inşaat', null)`);
check("duplicate catalog name rejected", /zaten var/.test(error ?? ""), error);
const kaba = (await one(`select public.admin_save_catalog_type(null, $1, 'Kaba İnşaat', 'standard', '#16a34a', null) id`, [insaat], admin)).id;
await as(admin, `select public.admin_save_catalog_type(null, $1, 'İnce İşler', 'standard', null, null)`, [insaat]);
error = await asErr(admin, `select public.admin_save_catalog_type($1, null, 'Kaba İnşaat', 'hp', null, null)`, [kaba]);
check("catalog type screen cannot change", /değiştirilemez/.test(error ?? ""), error);
await as(admin, `select public.admin_save_catalog_items($1, $2::jsonb)`, [insaat, JSON.stringify([
  { group_name: "Kaba", poz_code: "1/1", name: "Duvar örme", unit: "m²" },
  { group_name: "Kaba", name: "Betonarme", unit: "m³" },
])]);
let catalogs = (await one(`select public.admin_list_catalogs() c`, [], admin)).c;
let insaatRow = catalogs.find((c) => c.id === insaat);
check("catalog listed with types and items", insaatRow.types.length === 2 && insaatRow.items.length === 2 && insaatRow.items[0].poz_code === "1/1", JSON.stringify(insaatRow));
error = await asErr(admin, `select public.admin_save_catalog_items($1, '[{"name":""}]'::jsonb)`, [insaat]);
check("empty item name rejected", /boş olamaz/.test(error ?? ""), error);
check("failed item save keeps old list", (await sys(`select count(*)::int n from public.catalog_poz_items where catalog_id = $1`, [insaat])).rows[0].n === 2);

// 4. Firmaya atama
await as(admin, `select public.admin_set_company_catalogs($1, array[$2, $3]::uuid[])`, [otherId, insaat, telekom]);
let types = (await sys(`select name, screen, is_archived from public.project_types where company_id = $1 order by name`, [otherId])).rows;
const installed = types.map((t) => t.name).sort().join();
check("assigned catalogs install their types", installed === ["HP Odaklı", "İnce İşler", "Kaba İnşaat", "Kurumsal"].sort().join(), installed);
check("firm can read its catalogs", (await as(other, `select count(*)::int n from public.catalogs`)).rows[0].n === 2);
check("firm reads catalog items", (await as(other, `select count(*)::int n from public.catalog_poz_items`)).rows[0].n === 2);
check("other firm cannot read İnşaat catalog", (await as(chief, `select count(*)::int n from public.catalogs where id = $1`, [insaat])).rows[0].n === 0);

// Katalogdaki değişiklik firmaya yansır
await as(admin, `select public.admin_save_catalog_type($1, null, 'Kaba İnşaat İşleri', 'standard', '#dc2626', null)`, [kaba]);
check("renamed catalog type propagates", (await sys(`select color from public.project_types where company_id = $1 and name = 'Kaba İnşaat İşleri'`, [otherId])).rows[0]?.color === "#dc2626");
await as(admin, `select public.admin_save_catalog_type(null, $1, 'Peyzaj', 'standard', null, null)`, [insaat]);
check("new catalog type installed to assigned firms", (await sys(`select count(*)::int n from public.project_types where company_id = $1 and name = 'Peyzaj'`, [otherId])).rows[0].n === 1);
check("not installed to unassigned firms", (await sys(`select count(*)::int n from public.project_types where company_id = $1 and name = 'Peyzaj'`, [companyId])).rows[0].n === 0);

// Kaldırma: kurulu türler arşivlenir, projeler korunur
const kabaType = (await sys(`select id from public.project_types where company_id = $1 and catalog_type_id = $2`, [otherId, kaba])).rows[0].id;
await as(other, `insert into public.projects (project_code, name, location, project_type_id) values ('K-1', 'Blok', 'Merkez', $1)`, [kabaType]);
await as(admin, `select public.admin_set_company_catalogs($1, array[$2]::uuid[])`, [otherId, telekom]);
types = (await sys(`select name, is_archived from public.project_types where company_id = $1 order by name`, [otherId])).rows;
check("removed catalog types archived", types.filter((t) => t.is_archived).map((t) => t.name).sort().join() === "Kaba İnşaat İşleri,Peyzaj,İnce İşler", JSON.stringify(types));
check("project of archived type kept", (await sys(`select count(*)::int n from public.projects where project_code = 'K-1'`)).rows[0].n === 1);
error = await asErr(admin, `select public.admin_delete_catalog($1)`, [telekom]);
check("assigned catalog cannot be deleted", /firmalara atanmış/.test(error ?? ""), error);
await as(admin, `select public.admin_set_company_catalogs($1, array[$2, $3]::uuid[])`, [otherId, telekom, insaat]);
check("re-assign unarchives types", (await sys(`select is_archived from public.project_types where id = $1`, [kabaType])).rows[0].is_archived === false);

// Ad çakışması: aynı ad farklı ekran tipi
await as(chief, `select public.save_project_type(null, 'Peyzaj', null, false, null, null, '[{"name":"Çim"}]'::jsonb)`);
error = await asErr(admin, `select public.admin_set_company_catalogs($1, array[$2, $3]::uuid[])`, [companyId, telekom, insaat]);
check("same-name standard type is linked", !error && (await sys(`select catalog_type_id is not null as l from public.project_types where company_id = $1 and name = 'Peyzaj'`, [companyId])).rows[0].l, error);

// Tür silme: firmadaki kopyalar arşivlenir
const peyzaj = (await sys(`select id from public.catalog_project_types where name = 'Peyzaj'`)).rows[0].id;
await as(admin, `select public.admin_delete_catalog_type($1)`, [peyzaj]);
const peyzajCopies = (await sys(`select is_archived, catalog_type_id from public.project_types where name = 'Peyzaj'`)).rows;
check("deleted catalog type: firm copies archived and unlinked", peyzajCopies.length === 2 && peyzajCopies.every((t) => t.is_archived && t.catalog_type_id === null), JSON.stringify(peyzajCopies));

// Boş katalog silinebilir
const kuafor = (await one(`select public.admin_save_catalog(null, 'Kuaför', 'Çok şubeli kuaför') id`, [], admin)).id;
check("unassigned catalog can be deleted", !(await asErr(admin, `select public.admin_delete_catalog($1)`, [kuafor])));

process.exit(0);
