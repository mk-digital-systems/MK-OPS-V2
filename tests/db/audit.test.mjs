// Denetim kaydı smoke check
import { openDb, applyDir } from "./harness.mjs";

const pg = await openDb();
await applyDir(pg);
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
const admin = "00000000-0000-0000-0000-000000000009";
await sys(`insert into auth.users (id, email) values ($1, 'a@a'), ($2, 'b@b'), ($3, 'c@c'), ($4, 'admin@x')`, [chief, manager, other, admin]);
await sys(`update public.profiles set full_name = 'Ali Şef' where id = $1`, [chief]);
await as(chief, `select public.create_company('Deneme Firma')`);
await as(other, `select public.create_company('Başka Firma')`);
const company = (await one(chief, `select public.get_my_company() r`)).r.company;
await as(manager, `select public.join_company('Deneme Firma', $1)`, [company.join_code]);
await as(chief, `select public.assign_user_role($1, 'company_manager')`, [manager]);
await as(chief, `select public.set_company_manager_permission($1, 'projects', true)`, [manager]);

const count = async (where = "true", params = []) => Number((await sys(`select count(*)::int n from public.audit_logs where ${where}`, params)).rows[0].n);

let n = await count(`entity_type = 'profiles' and action = 'update' and changes ? 'role'`);
check("role assignment logged", n >= 1, `${n}`);
n = await count(`entity_type = 'company_manager_permissions'`);
check("permission change logged", n >= 1, `${n}`);

const typeId = (await one(chief, `select public.save_project_type(null, 'Altyapı', null, false, null, null, $1::jsonb) id`,
  [JSON.stringify([{ name: "Kazı", unit: "m" }])])).id;
const stage = (await one(chief, `select id from public.project_type_stages where project_type_id = $1`, [typeId])).id;
const before = await count();
const p1 = (await one(manager, `insert into public.projects (project_code, name, location, project_type_id) values ('A-1', 'Hat 1', 'Merkez', $1) returning id`, [typeId])).id;
let row = (await sys(`select * from public.audit_logs where entity_type = 'projects' and action = 'insert'`)).rows[0];
check("project insert logged with actor and label", row && row.actor_user_id === manager && row.entity_label === "Hat 1 · A-1" && row.module === "projects", JSON.stringify(row && { a: row.actor_user_id, l: row.entity_label }));
check("stage sync rows (derived) not logged", (await count(`entity_type = 'project_stage_progress'`)) === 0);

const prog = (await one(chief, `select id from public.project_stage_progress where project_id = $1`, [p1])).id;
await as(manager, `insert into public.project_stage_logs (progress_id, quantity, team_leader_name) values ($1, 25, 'Ahmet')`, [prog]);
row = (await sys(`select * from public.audit_logs where entity_type = 'project_stage_logs'`)).rows[0];
check("stage log logged with project · stage label", row && row.entity_label === "Hat 1 · Kazı" && Number(row.changes.quantity) === 25, row && row.entity_label);
check("derived progress/rollup updates not logged",
  (await count(`entity_type in ('project_stage_progress') or (entity_type = 'projects' and action = 'update')`)) === 0);

await as(manager, `update public.projects set name = 'Hat 1A' where id = $1`, [p1]);
row = (await sys(`select * from public.audit_logs where entity_type = 'projects' and action = 'update'`)).rows[0];
check("update stores old → new", row && row.changes.name?.old === "Hat 1" && row.changes.name?.new === "Hat 1A" && !("updated_at" in row.changes), JSON.stringify(row?.changes));
await as(manager, `update public.projects set name = name where id = $1`, [p1]);
check("no-op update not logged", (await count(`entity_type = 'projects' and action = 'update'`)) === 1);

await as(chief, `select public.save_stage_prices($1::jsonb)`, [JSON.stringify([{ stage_id: stage, unit_price: 40 }])]);
row = (await sys(`select * from public.audit_logs where entity_type = 'hakedis_stage_prices'`)).rows[0];
check("price change logged (module hakedis)", row && row.module === "hakedis" && row.entity_label === "Altyapı · Kazı", row?.entity_label);

const person = (await one(chief, `insert into public.personnel (full_name, phone, tc_identity_number, employment_start_date) values ('Veli Usta', '5551112233', '12345678901', current_date) returning id`)).id;
row = (await sys(`select * from public.audit_logs where entity_type = 'personnel'`)).rows[0];
check("TC kimlik masked", row && row.changes.tc_identity_number === "***", JSON.stringify(row?.changes));

const logsBeforeDelete = await count(`entity_type = 'project_stage_logs'`);
await as(chief, `delete from public.projects where id = $1`, [p1]);
check("project delete logged once, cascades not logged",
  (await count(`entity_type = 'projects' and action = 'delete'`)) === 1 && (await count(`entity_type = 'project_stage_logs'`)) === logsBeforeDelete);

// Visibility and immutability
check("chief sees own logs", Number((await one(chief, `select count(*)::int n from public.audit_logs`)).n) === (await count(`company_id = $1`, [company.id])));
check("manager sees nothing", Number((await one(manager, `select count(*)::int n from public.audit_logs`)).n) === 0);
check("other company's chief sees only own", Number((await one(other, `select count(*)::int n from public.audit_logs where company_id = $1`, [company.id])).n) === 0);
let e = await asErr(chief, `insert into public.audit_logs (company_id, module, entity_type, action) values ($1, 'x', 'x', 'insert')`, [company.id]);
check("chief cannot insert", !!e, e);
e = await asErr(chief, `delete from public.audit_logs`);
const remaining = await count(`company_id = $1`, [company.id]);
check("chief cannot delete", !!e || remaining > 0, e ?? `remaining ${remaining}`);
e = await sys(`update public.audit_logs set entity_label = 'x'`).then(() => null, (err) => err.message);
check("even system cannot update", !!e, e);
e = await sys(`delete from public.audit_logs`).then(() => null, (err) => err.message);
check("even system cannot delete while company exists", !!e, e);

// Company deletion by super admin removes its logs
await sys(`insert into public.platform_admins (user_id) values ($1)`, [admin]);
e = await asErr(admin, `select public.admin_delete_company($1, 'Deneme Firma')`, [company.id]);
if (e && /function .* does not exist/.test(e)) {
  const fn = (await sys(`select p.oid::regprocedure::text f from pg_proc p where prosrc like '%delete from public.companies where id = p_company_id%'`)).rows[0]?.f;
  e = fn ? await asErr(admin, `select public.${fn.replace(/^public\./, "").replace(/\(.*/, "")}($1, 'Deneme Firma')`, [company.id]) : "delete fn not found";
}
check("company delete works with audit logs present", !e, e);
check("company's audit logs removed", (await count(`company_id = $1`, [company.id])) === 0);
check("other company's logs remain", (await count()) > 0);

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
