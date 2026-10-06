// İmalat → proje/hakediş bağlantısı
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

const chief = "00000000-0000-0000-0000-000000000001";
const manager = "00000000-0000-0000-0000-000000000002";
await sys(`insert into auth.users (id, email) values ($1,'a@a'),($2,'b@b')`, [chief, manager]);
await as(chief, `select public.create_company('Deneme Firma')`);
const company = (await one(chief, `select public.get_my_company() r`)).r.company;
await as(manager, `select public.join_company('Deneme Firma', $1)`, [company.join_code]);
await as(chief, `select public.assign_user_role($1, 'company_manager')`, [manager]);
await as(chief, `select public.set_company_manager_permission($1, 'productions', true)`, [manager]);

const typeId = (await one(chief, `select public.save_project_type(null, 'Altyapı', null, false, null, null, $1::jsonb) id`,
  [JSON.stringify([{ name: "Kazı", unit: "m" }, { name: "Kontrol" }])])).id;
const stage = (await one(chief, `select id from public.project_type_stages where project_type_id = $1 and name = 'Kazı'`, [typeId])).id;
await as(chief, `select public.save_stage_prices($1::jsonb)`, [JSON.stringify([{ stage_id: stage, unit_price: 100 }])]);
const project = (await one(chief, `insert into public.projects (project_code, name, location, project_type_id) values ('A-1', 'Hat 1', 'Merkez', $1) returning id`, [typeId])).id;
const prog = (await one(chief, `select id from public.project_stage_progress where project_id = $1 and stage_id = $2`, [project, stage])).id;
const leader = (await one(chief, `insert into public.personnel (full_name, phone, employment_start_date) values ('Ahmet Usta', '5550000000', current_date) returning id`)).id;

const save = (uid, entryId, items, extra = {}) => one(uid, `select public.save_production_entry($1, current_date, $2, 'Ahmet Usta', null, $3::jsonb) id`,
  [entryId, leader, JSON.stringify([{ project_id: project, sort_order: 0, items, ...extra }])]);

// Manager (no hakediş permission) saves stage line + extra line with a price attempt
let entry = (await save(manager, null, [
  { kind: "stage", progress_id: prog, quantity: 30, sort_order: 0 },
  { kind: "extra", item_name: "Asfalt kırma", quantity: 2, unit: "saat", unit_price: 999, sort_order: 1 },
])).id;
let log = (await sys(`select * from public.project_stage_logs where progress_id = $1`, [prog])).rows;
check("stage line creates project log", log.length === 1 && Number(log[0].quantity) === 30 && log[0].source === "production" && log[0].team_leader_name === "Ahmet Usta");
check("hakediş priced at stage price", Number((await sys(`select amount from public.hakedis_log_values where log_id = $1`, [log[0].id])).rows[0]?.amount) === 3000);
check("progress updated", Number((await sys(`select done_quantity from public.project_stage_progress where id = $1`, [prog])).rows[0].done_quantity) === 30);
check("manager's price attempt ignored", Number((await sys(`select count(*)::int n from public.hakedis_extra_values`)).rows[0].n) === 0);
const items1 = (await sys(`select id, kind from public.production_items order by sort_order`)).rows;
check("job snapshot from project", (await sys(`select project_name_snapshot n, project_code_snapshot c, project_id from public.production_jobs`)).rows[0].c === "A-1");

// Chief prices extra via hakediş page
const extraId = items1.find((i) => i.kind === "extra").id;
await as(chief, `select public.set_production_extra_price($1, 150)`, [extraId]);
let report = (await one(chief, `select public.get_hakedis_report(current_date - 1, current_date) r`)).r;
check("report includes extra", Number(report.total_amount) === 3300 && report.rows.some((r) => r.kind === "extra" && Number(r.amount) === 300), `${report.total_amount}`);
check("summary includes extra", Number((await one(chief, `select public.get_hakedis_summary() r`)).r.today) === 3300);
let e = await asErr(manager, `select public.set_production_extra_price($1, 1)`, [extraId]);
check("manager cannot price extra", !!e, e);
check("manager cannot read extra prices", Number((await one(manager, `select count(*)::int n from public.hakedis_extra_values`)).n) === 0);

// Price change on stage must not alter snapshot; editing imalat keeps log (updates quantity)
await as(chief, `select public.save_stage_prices($1::jsonb)`, [JSON.stringify([{ stage_id: stage, unit_price: 200 }])]);
const stageItem = items1.find((i) => i.kind === "stage").id;
entry = (await save(manager, entry, [
  { kind: "stage", item_id: stageItem, progress_id: prog, quantity: 40, sort_order: 0 },
  { kind: "extra", item_id: extraId, item_name: "Asfalt kırma", quantity: 4, unit: "saat", sort_order: 1 },
])).id;
log = (await sys(`select * from public.project_stage_logs where progress_id = $1`, [prog])).rows;
check("edit updates same log (no duplicate)", log.length === 1 && Number(log[0].quantity) === 40);
check("snapshot price kept on edit (40×100)", Number((await sys(`select amount from public.hakedis_log_values where log_id = $1`, [log[0].id])).rows[0].amount) === 4000);
const newExtra = (await sys(`select x.unit_price, x.amount from public.hakedis_extra_values x`)).rows;
check("extra price carried over on edit by non-hakediş user (4×150)", newExtra.length === 1 && Number(newExtra[0].amount) === 600, JSON.stringify(newExtra));

// Direct edit / delete of production log from project is blocked
e = await asErr(chief, `delete from public.project_stage_logs where id = $1`, [log[0].id]);
check("project-side delete blocked", !!e && /İmalatlar/.test(e), e);
e = await asErr(chief, `update public.project_stage_logs set quantity = 1 where id = $1`, [log[0].id]);
check("project-side quantity edit blocked", !!e, e);
await as(chief, `update public.project_stage_logs set notes = 'not' where id = $1`, [log[0].id]);
check("note edit allowed", true);

// Removing the stage line from imalat removes the log
await save(manager, entry, [{ kind: "extra", item_id: extraId, item_name: "Asfalt kırma", quantity: 4, unit: "saat", sort_order: 0 }]);
check("removed line deletes project log", Number((await sys(`select count(*)::int n from public.project_stage_logs`)).rows[0].n) === 0);
check("progress back to 0", Number((await sys(`select done_quantity from public.project_stage_progress where id = $1`, [prog])).rows[0].done_quantity) === 0);

// Validation
e = await asErr(manager, `select public.save_production_entry(null, current_date, $1, 'Ahmet Usta', null, $2::jsonb)`,
  [leader, JSON.stringify([{ project_name: "Serbest iş", items: [{ kind: "stage", progress_id: prog, quantity: 1 }] }])]);
check("stage line needs a selected project", !!e, e);
const ctl = (await one(chief, `select id from public.project_stage_progress where project_id = $1 and stage_id <> $2`, [project, stage])).id;
e = await asErr(manager, `select public.save_production_entry(null, current_date, $1, 'Ahmet Usta', null, $2::jsonb)`,
  [leader, JSON.stringify([{ project_id: project, items: [{ kind: "stage", progress_id: ctl, quantity: 1 }] }])]);
check("unit-less stage rejected", !!e, e);
const free = (await one(manager, `select public.save_production_entry(null, current_date - 1, $1, 'Ahmet Usta', null, $2::jsonb) id`,
  [leader, JSON.stringify([{ project_name: "Komşu parsel temizlik", items: [{ kind: "extra", item_name: "Moloz", quantity: 3, unit: "sefer" }, { kind: "note", item_name: "Saha teslim edildi" }] }])])).id;
report = (await one(chief, `select public.get_hakedis_report(current_date - 1, current_date) r`)).r;
check("projectless extra listed unpriced", report.rows.some((r) => r.kind === "extra" && r.project_id === null && r.amount === null) && report.unpriced_count >= 1);
check("note lines not in hakediş", !report.rows.some((r) => r.stage_name === "Saha teslim edildi"));

// Delete entry removes logs; project delete with production logs cascades
await save(manager, entry, [{ kind: "stage", progress_id: prog, quantity: 5 }]);
await as(manager, `select public.delete_production_entry($1)`, [entry]);
check("entry delete removes logs", Number((await sys(`select count(*)::int n from public.project_stage_logs`)).rows[0].n) === 0);
entry = (await save(manager, null, [{ kind: "stage", progress_id: prog, quantity: 5 }])).id;
e = await asErr(chief, `delete from public.projects where id = $1`, [project]);
check("project delete still works (cascade)", !e, e);
check("imalat keeps snapshot after project delete", (await sys(`select project_name_snapshot n from public.production_jobs where production_entry_id = $1`, [entry])).rows[0].n === "Hat 1");
console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
