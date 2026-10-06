// Hakediş smoke check
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
const asErr = (uid, sql, params) => as(uid, sql, params).then(() => null, (e) => e.message);
const one = async (uid, sql, params) => (await as(uid, sql, params)).rows[0];

const chief = "00000000-0000-0000-0000-000000000001";
const manager = "00000000-0000-0000-0000-000000000002";
await pg.query(`insert into auth.users (id, email) values ($1, 'a@a'), ($2, 'b@b')`, [chief, manager]);
await as(chief, `select public.create_company('Deneme Firma')`);
const code = (await one(chief, `select public.get_my_company() r`)).r.company.join_code;
await as(manager, `select public.join_company('Deneme Firma', $1)`, [code]);
await as(chief, `select public.assign_user_role($1, 'company_manager')`, [manager]);
await as(chief, `select public.set_company_manager_permission($1, 'projects', true)`, [manager]);

const typeId = (await one(chief, `select public.save_project_type(null, 'Altyapı', null, false, null, null, $1::jsonb) id`,
  [JSON.stringify([{ name: "Kazı", unit: "m" }, { name: "Test" }])])).id;
const stage = (await one(chief, `select id from public.project_type_stages where project_type_id = $1 and name = 'Kazı'`, [typeId])).id;
const p1 = (await one(chief, `insert into public.projects (project_code, name, location, project_type_id) values ('A-1', 'Hat 1', 'Merkez', $1) returning id`, [typeId])).id;
const p2 = (await one(chief, `insert into public.projects (project_code, name, location, project_type_id) values ('A-2', 'Hat 2', 'Kuzey', $1) returning id`, [typeId])).id;
const prog1 = (await one(chief, `select id from public.project_stage_progress where project_id = $1 and stage_id = $2`, [p1, stage])).id;
const prog2 = (await one(chief, `select id from public.project_stage_progress where project_id = $1 and stage_id = $2`, [p2, stage])).id;

// Price-less log first, then price applied later
await as(manager, `insert into public.project_stage_logs (progress_id, quantity, team_leader_name) values ($1, 100, 'Ahmet')`, [prog1]);
check("log without price has no value yet", (await one(chief, `select count(*)::int n from public.hakedis_log_values`)).n === 0);
let e = await asErr(manager, `select public.save_stage_prices($1::jsonb)`, [JSON.stringify([{ stage_id: stage, unit_price: 50 }])]);
check("manager without hakediş permission cannot set prices", !!e, e);
check("manager cannot read prices", (await one(manager, `select count(*)::int n from public.hakedis_stage_prices`).catch(() => ({ n: -1 }))).n <= 0);
await as(chief, `select public.save_stage_prices($1::jsonb)`, [JSON.stringify([{ stage_id: stage, unit_price: 50 }])]);
let v = await one(chief, `select unit_price, amount from public.hakedis_log_values`);
check("pending log priced when stage price set", Number(v.amount) === 5000, JSON.stringify(v));

// Project override and snapshot
await as(chief, `select public.set_project_stage_price($1, 80)`, [prog2]);
await as(chief, `insert into public.project_stage_logs (progress_id, quantity, team_leader_name) values ($1, 10, 'Mehmet')`, [prog2]);
v = await one(chief, `select v.amount from public.hakedis_log_values v join public.project_stage_logs l on l.id = v.log_id where l.progress_id = $1`, [prog2]);
check("project override price used", Number(v.amount) === 800, JSON.stringify(v));
await as(chief, `select public.save_stage_prices($1::jsonb)`, [JSON.stringify([{ stage_id: stage, unit_price: 70 }])]);
v = await one(chief, `select v.amount from public.hakedis_log_values v join public.project_stage_logs l on l.id = v.log_id where l.progress_id = $1`, [prog1]);
check("price change does not alter priced log", Number(v.amount) === 5000, JSON.stringify(v));
await as(chief, `update public.project_stage_logs set quantity = 120 where progress_id = $1`, [prog1]);
v = await one(chief, `select v.amount from public.hakedis_log_values v join public.project_stage_logs l on l.id = v.log_id where l.progress_id = $1`, [prog1]);
check("quantity edit recomputes with snapshot price", Number(v.amount) === 6000, JSON.stringify(v));

// Report and summary
const report = (await one(chief, `select public.get_hakedis_report(current_date - 1, current_date) r`)).r;
check("report total", Number(report.total_amount) === 6800 && report.by_project.length === 2 && report.rows.length === 2, `${report.total_amount}`);
check("report by leader", report.by_leader.length === 2);
e = await asErr(manager, `select public.get_hakedis_report(current_date - 1, current_date)`);
check("manager without permission cannot read report", !!e, e);
await as(chief, `select public.set_company_manager_permission($1, 'hakedis', true)`, [manager]);
check("granted manager reads report", !(await asErr(manager, `select public.get_hakedis_report(current_date - 1, current_date)`)));
const summary = (await one(chief, `select public.get_hakedis_summary() s`)).s;
check("summary period total", Number(summary.period) === 6800 && Number(summary.today) === 6800, JSON.stringify(summary));
await as(chief, `select public.update_company_settings(20, 'eur')`);
const company = (await one(chief, `select public.get_my_company() r`)).r.company;
check("company settings saved", company.payroll_start_day === 20 && company.currency_code === "EUR", JSON.stringify(company));
e = await asErr(manager, `select public.update_company_settings(5, 'TRY')`);
check("manager cannot change company settings", !!e, e);
e = await asErr(chief, `insert into public.hakedis_log_values (log_id, unit_price, amount) values ($1, 1, 1)`, [chief]);
check("users cannot write log values directly", !!e, e);

// FAIL satırlarını koşturucu yakalar; PGlite süreci açık tutmasın.
process.exit(0);
