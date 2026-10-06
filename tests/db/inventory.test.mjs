// Çoklu depo + firma kategorileri
// Önce eski şemayla (yeni migration hariç) telekom kategorili + Biga stoklu veri kurulur,
// sonra yeni migration uygulanıp taşıma ve yeni fonksiyonlar denenir.
import { openDb, MIGRATIONS_DIR } from "./harness.mjs";
import fs from "node:fs";
import path from "node:path";

const dir = MIGRATIONS_DIR;
const NEW = "20261011000001_inventory_locations_categories.sql";
const pg = await openDb();
const apply = async (f) => {
  await pg.exec(fs.readFileSync(path.join(dir, f), "utf8"));
  await pg.exec(`reset all; set search_path = "$user", public, extensions;`);
};
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (f >= NEW) continue;
  await apply(f);
}

let failures = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`); if (!ok) failures++; };
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
await sys(`insert into auth.users (id, email) values ($1, 'a@a'), ($2, 'b@b'), ($3, 'c@c')`, [chief, manager, other]);
await as(chief, `select public.create_company('Deneme Firma')`);
await as(other, `select public.create_company('Başka Firma')`);
const company = (await one(chief, `select public.get_my_company() r`)).r.company;
await as(manager, `select public.join_company('Deneme Firma', $1)`, [company.join_code]);
await as(chief, `select public.assign_user_role($1, 'company_manager')`, [manager]);

// --- Eski şemada veri: fiber_cable kategorisi, merkez 100, Biga'ya 30 sevk
const oldCat = (await one(chief, `select public.create_inventory_catalog_material('Kablo 12F', 'fiber_cable', null, null, 'meter', false) id`)).id;
await as(chief, `select public.create_inventory_receipt(current_date, 'Ali Veli', 'IRS-1', null, $1::jsonb)`, [JSON.stringify([{ catalog_id: oldCat, quantity: 100 }])]);
const mat = (await one(chief, `select id from public.inventory_materials where catalog_id = $1`, [oldCat])).id;
await as(chief, `select public.create_biga_inventory_shipment(current_date, 'Ali Veli', 'Can Su', '34 AB 12', null, $1::jsonb)`, [JSON.stringify([{ material_id: mat, quantity: 30 }])]);
await as(chief, `select public.record_inventory_movement($1, 'out', 5, 'biga', 'Proje X')`, [mat]);

// --- Yeni migration
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".sql") && f >= NEW).sort()) await apply(f);
if (process.env.TWICE) await apply("20261011000002_inventory_messages.sql");
check("migration applied", true);

const cats = (await one(chief, `select json_agg(name) n from public.inventory_categories`)).n;
check("old category became company category", JSON.stringify(cats) === JSON.stringify(["Fiber Kablo"]), JSON.stringify(cats));
const catalog = await one(chief, `select c.category_id, k.name from public.inventory_catalog c join public.inventory_categories k on k.id = c.category_id where c.id = $1`, [oldCat]);
check("catalog mapped to category", catalog?.name === "Fiber Kablo");
const locs = (await as(chief, `select name, is_main from public.inventory_locations order by sort_order`)).rows;
check("main + migrated branch location", locs.length === 2 && locs[0].name === "Merkez Depo" && locs[0].is_main && locs[1].name === "Şube Deposu", JSON.stringify(locs));
const main = (await one(chief, `select id from public.inventory_locations where is_main`)).id;
const branch = (await one(chief, `select id from public.inventory_locations where not is_main`)).id;
check("main stock kept (70)", Number((await one(chief, `select stock_quantity q from public.inventory_materials where id = $1`, [mat])).q) === 70);
check("branch stock migrated (25)", Number((await one(chief, `select quantity q from public.inventory_location_stocks where material_id = $1`, [mat])).q) === 25);
const oldShip = await one(chief, `select from_location_id f, to_location_id t from public.inventory_shipments`);
check("old shipment mapped main → branch", oldShip.f === main && oldShip.t === branch);
const usage = await one(chief, `select source_location_id s from public.inventory_movements where action_type = 'usage'`);
check("old usage movement mapped to branch", usage.s === branch);
check("other company got its own main location", Number((await one(other, `select count(*)::int n from public.inventory_locations where is_main`)).n) === 1);
check("other company sees no foreign locations", Number((await one(other, `select count(*)::int n from public.inventory_locations`)).n) === 1);

// --- Yeni akışlar
const elec = (await one(chief, `select public.save_inventory_category(null, 'Elektrik') id`)).id;
let e = await asErr(chief, `select public.save_inventory_category(null, 'elektrik')`);
check("duplicate category name rejected", !!e, e);
e = await asErr(manager, `select public.save_inventory_category(null, 'X')`);
check("manager without inventory permission cannot add category", !!e, e);
const cable = (await one(chief, `select public.create_inventory_catalog_material('NYM 3x2.5', $1, null, null, 'meter', false) id`, [elec])).id;
e = await asErr(other, `select public.create_inventory_catalog_material('Yabancı', $1, null, null, 'meter', false)`, [elec]);
check("other company cannot use foreign category", !!e, e);

const site = (await one(chief, `select public.save_inventory_location(null, 'Şantiye A') id`)).id;
await as(chief, `select public.create_inventory_receipt(current_date, 'Ali Veli', 'IRS-2', null, $1::jsonb, $2)`, [JSON.stringify([{ catalog_id: cable, quantity: 200 }]), site]);
const cableMat = (await one(chief, `select id from public.inventory_materials where catalog_id = $1`, [cable])).id;
check("receipt into chosen location", Number((await one(chief, `select public.inventory_stock_at($1, $2) q`, [cableMat, site]).catch(() => ({ q: -1 }))).q) === -1
  ? Number((await sys(`select quantity q from public.inventory_location_stocks where material_id = $1 and location_id = $2`, [cableMat, site])).rows[0]?.q) === 200
  : false);
check("main stock untouched by branch receipt", Number((await one(chief, `select stock_quantity q from public.inventory_materials where id = $1`, [cableMat])).q) === 0);
check("receipt movement target is location", (await one(chief, `select target_location_id t from public.inventory_movements where material_id = $1`, [cableMat])).t === site);

const ship = (await one(chief, `select public.create_inventory_transfer(current_date, $1, $2, 'Ali Veli', 'Can Su', null, 'not', $3::jsonb) id`,
  [site, main, JSON.stringify([{ material_id: cableMat, quantity: 50 }])])).id;
check("transfer without vehicle works", !!ship);
const stocks = async () => [
  Number((await sys(`select stock_quantity q from public.inventory_materials where id = $1`, [cableMat])).rows[0].q),
  Number((await sys(`select coalesce(sum(quantity),0) q from public.inventory_location_stocks where material_id = $1 and location_id = $2`, [cableMat, site])).rows[0].q),
];
check("transfer moved stock (main 50, site 150)", JSON.stringify(await stocks()) === "[50,150]", JSON.stringify(await stocks()));
e = await asErr(chief, `select public.create_inventory_transfer(current_date, $1, $2, 'Ali Veli', 'Can Su', null, null, $3::jsonb)`,
  [main, site, JSON.stringify([{ material_id: cableMat, quantity: 51 }])]);
check("transfer over stock rejected with depot name", !!e && e.includes("Merkez Depo:") && e.includes("Mevcut: 50") && !e.includes("50.000"), e);
e = await asErr(chief, `select public.create_inventory_transfer(current_date, $1, $1, 'Ali Veli', 'Can Su', null, null, $2::jsonb)`,
  [main, JSON.stringify([{ material_id: cableMat, quantity: 1 }])]);
check("same from/to rejected", !!e, e);

await as(chief, `select public.record_inventory_movement($1, 'out', 40, $2, 'Proje Y')`, [cableMat, main]);
check("usage from main", JSON.stringify(await stocks()) === "[10,150]");
e = await asErr(chief, `select public.delete_inventory_transfer($1)`, [ship]);
check("transfer undo blocked when target stock used", !!e, e);
const usageId = (await one(chief, `select id from public.inventory_movements where material_id = $1 and action_type = 'usage'`, [cableMat])).id;
await as(chief, `select public.delete_inventory_movement($1)`, [usageId]);
check("usage undo restores main", JSON.stringify(await stocks()) === "[50,150]");
await as(chief, `select public.delete_inventory_transfer($1)`, [ship]);
check("transfer undo restores", JSON.stringify(await stocks()) === "[0,200]", JSON.stringify(await stocks()));

e = await asErr(chief, `select public.delete_inventory_location($1)`, [site]);
check("location with stock cannot be deleted", !!e, e);
e = await asErr(chief, `select public.delete_inventory_location($1)`, [main]);
check("main location cannot be deleted", !!e, e);
await as(chief, `select public.save_inventory_location($1, 'Ana Depo')`, [main]);
check("main location renamed", (await one(chief, `select name from public.inventory_locations where id = $1`, [main])).name === "Ana Depo");
const empty = (await one(chief, `select public.save_inventory_location(null, 'Boş Depo') id`)).id;
await as(chief, `select public.delete_inventory_location($1)`, [empty]);
check("empty location deleted", Number((await one(chief, `select count(*)::int n from public.inventory_locations where id = $1`, [empty])).n) === 0);

await as(chief, `select public.delete_inventory_category($1)`, [elec]);
check("deleting category leaves catalog uncategorized", (await one(chief, `select category_id from public.inventory_catalog where id = $1`, [cable])).category_id === null);

// Custody uses main location name
const eq = (await one(chief, `select public.create_custody_material('Matkap', null, 'piece', 2) id`)).id;
const vehicle = (await one(chief, `insert into public.vehicles (plate, brand, model) values ('34 XY 1', 'Ford', 'Transit') returning id`)).id;
await as(chief, `select public.transfer_inventory_custody($1, 1, 'warehouse', null, 'vehicle', $2)`, [eq, vehicle]);
check("custody uses main location name", (await one(chief, `select from_name from public.inventory_custody_movements where material_id = $1`, [eq])).from_name === "Ana Depo");

// Direct writes blocked
e = await asErr(chief, `insert into public.inventory_locations (name) values ('Hack')`);
check("direct location insert blocked", !!e, e);
e = await asErr(chief, `update public.inventory_location_stocks set quantity = 999`);
check("direct stock update blocked", !!e, e);
check("new company gets main location", true);
check("no legacy functions left", Number((await sys(`select count(*)::int n from pg_proc where proname in ('create_biga_inventory_shipment','transfer_inventory_to_biga','delete_biga_inventory_shipment','create_inventory_material')`)).rows[0].n) === 0);
check("no biga column left", Number((await sys(`select count(*)::int n from information_schema.columns where column_name in ('biga_stock_quantity','stock_category')`)).rows[0].n) === 0);
const bad = (await sys(`select proname from pg_proc where pronamespace = 'public'::regnamespace and prosrc ~* 'biga|stock_category|Şantiye Deposu|fiber_cable'`)).rows.map((r) => r.proname);
check("no function references biga/old categories", bad.length === 0, bad.join(", "));

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
