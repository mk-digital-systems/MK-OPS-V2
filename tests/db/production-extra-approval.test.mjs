// İmalattaki özel iş kalemi (ek iş): fiyat onayı
import { openDb, applyDir } from "./harness.mjs";

const pg = await openDb();
await applyDir(pg);
const check = (name, ok, more = "") => console.log(`${ok ? "ok  " : "FAIL"} ${name}${more ? ` — ${more}` : ""}`);
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

const chief = "00000000-0000-0000-0000-000000000001";
const manager = "00000000-0000-0000-0000-000000000002";
const other = "00000000-0000-0000-0000-000000000003";
await sys(`insert into auth.users (id, email) values ($1,'a@a'),($2,'b@b'),($3,'c@c')`, [chief, manager, other]);
await as(chief, `select public.create_company('Deneme Firma')`);
await as(other, `select public.create_company('Diğer Firma')`);
const company = (await one(chief, `select public.get_my_company() r`)).r.company;
await as(manager, `select public.join_company('Deneme Firma', $1)`, [company.join_code]);
await as(chief, `select public.assign_user_role($1, 'company_manager')`, [manager]);
await as(chief, `select public.set_company_manager_permission($1, 'productions', true)`, [manager]);

const typeId = (await one(chief, `select public.save_project_type(null, 'Altyapı', null, false, null, null, $1::jsonb) id`,
  [JSON.stringify([{ name: "Kazı", unit: "m" }])])).id;
const stage = (await one(chief, `select id from public.project_type_stages where project_type_id = $1`, [typeId])).id;
await as(chief, `select public.save_stage_prices($1::jsonb)`, [JSON.stringify([{ stage_id: stage, unit_price: 100 }])]);
const project = (await one(chief, `insert into public.projects (project_code, name, location, project_type_id) values ('A-1', 'Hat 1', 'Merkez', $1) returning id`, [typeId])).id;
const prog = (await one(chief, `select id from public.project_stage_progress where project_id = $1`, [project])).id;
const leader = (await one(chief, `insert into public.personnel (full_name, phone, employment_start_date) values ('Ahmet Usta', '5550000000', current_date) returning id`)).id;
const save = (uid, items) => one(uid, `select public.save_production_entry(null, current_date, $1, 'Ahmet Usta', null, $2::jsonb) id`,
  [leader, JSON.stringify([{ project_id: project, sort_order: 0, items }])]);

// Yetkisiz kullanıcı: iş kalemi + iki ek iş
const entry = (await save(manager, [
  { kind: "stage", progress_id: prog, quantity: 30, sort_order: 0 },
  { kind: "extra", item_name: "Asfalt kırma", quantity: 2, unit: "saat", sort_order: 1 },
  { kind: "extra", item_name: "Beton dökümü", quantity: 3, unit: "m³", sort_order: 2 },
])).id;
check("stage line recorded immediately", Number((await sys(`select done_quantity from public.project_stage_progress where id = $1`, [prog])).rows[0].done_quantity) === 30);
check("extras not in project's item list", (await sys(`select count(*)::int n from public.project_type_stages where project_type_id = $1`, [typeId])).rows[0].n === 1);

let pending = (await one(chief, `select public.list_pending_production_extras() r`)).r;
check("entry listed for approval", pending.length === 1 && pending[0].entry_id === entry && pending[0].items.length === 2, JSON.stringify(pending));
check("items carry project and unit", pending[0].items[0].item_name === "Asfalt kırma" && pending[0].items[0].project_code === "A-1" && pending[0].items[1].unit === "m³");
let error = await asErr(manager, `select public.list_pending_production_extras()`);
check("user without hakediş permission cannot list", /hakediş yetkisi/.test(error ?? ""), error);

let report = (await one(chief, `select public.get_hakedis_report(current_date - 1, current_date) r`)).r;
check("pending extras not in hakediş total", Number(report.total_amount) === 3000, `${report.total_amount}`);

// Bildirim
const notes = async (uid) => (await one(uid, `select public.get_my_notifications() r`)).r;
const extraNote = (await notes(chief)).find((item) => item.key.startsWith("pending_extra:"));
check("approver notified", extraNote && extraNote.link === "/panel/approvals" && /1 imalatta/.test(extraNote.body), JSON.stringify(extraNote));
check("unpriced note no longer counts extras", !(await notes(chief)).some((item) => item.type === "hakedis_unpriced"));
check("user without hakediş not notified", !(await notes(manager)).some((item) => item.key.startsWith("pending_extra:")));

// Onay
const [asfalt, beton] = pending[0].items.map((item) => item.id);
error = await asErr(manager, `select public.approve_production_extras($1, $2::jsonb)`, [entry, JSON.stringify([{ item_id: asfalt, unit_price: 1 }, { item_id: beton, unit_price: 1 }])]);
check("user without hakediş permission cannot approve", /hakediş yetkisi/.test(error ?? ""), error);
error = await asErr(chief, `select public.approve_production_extras($1, $2::jsonb)`, [entry, JSON.stringify([{ item_id: asfalt, unit_price: 150 }])]);
check("approval needs every price", /Beton dökümü için birim fiyat/.test(error ?? ""), error);
check("partial approval rolled back", (await sys(`select count(*)::int n from public.hakedis_extra_values`)).rows[0].n === 0);
error = await asErr(chief, `select public.approve_production_extras($1, $2::jsonb)`, [entry, JSON.stringify([{ item_id: asfalt, unit_price: -1 }, { item_id: beton, unit_price: 10 }])]);
check("negative price rejected", /negatif/.test(error ?? ""), error);
error = await asErr(other, `select public.approve_production_extras($1, '[]'::jsonb)`, [entry]);
check("other company cannot approve", /bulunamadı/.test(error ?? ""), error);
error = await asErr(chief, `select public.approve_production_extras($1, $2::jsonb)`, [entry, JSON.stringify([{ item_id: asfalt, unit_price: 150 }, { item_id: beton, unit_price: 0 }])]);
check("approved with prices (zero allowed)", !error, error);
pending = (await one(chief, `select public.list_pending_production_extras() r`)).r;
check("nothing pending after approval", pending.length === 0);
report = (await one(chief, `select public.get_hakedis_report(current_date - 1, current_date) r`)).r;
check("approved extras in hakediş", Number(report.total_amount) === 3300, `${report.total_amount}`);
check("approval notification cleared", !(await notes(chief)).some((item) => item.key.startsWith("pending_extra:")));

// İmalat düzenlenip yeni ek iş eklenirse yalnızca yeni kalem onaya düşer
const items = (await sys(`select id, kind, item_name_snapshot from public.production_items order by sort_order`)).rows;
await as(manager, `select public.save_production_entry($1, current_date, $2, 'Ahmet Usta', null, $3::jsonb)`, [entry, leader, JSON.stringify([{ project_id: project, sort_order: 0, items: [
  { kind: "stage", progress_id: prog, quantity: 30, sort_order: 0, item_id: items[0].id },
  { kind: "extra", item_name: "Asfalt kırma", quantity: 2, unit: "saat", sort_order: 1, item_id: items[1].id },
  { kind: "extra", item_name: "Beton dökümü", quantity: 3, unit: "m³", sort_order: 2, item_id: items[2].id },
  { kind: "extra", item_name: "Nakliye", quantity: 1, unit: "sefer", sort_order: 3 },
] }])]);
pending = (await one(chief, `select public.list_pending_production_extras() r`)).r;
check("only new extra pending after edit", pending.length === 1 && pending[0].items.length === 1 && pending[0].items[0].item_name === "Nakliye", JSON.stringify(pending));

process.exit(0);
