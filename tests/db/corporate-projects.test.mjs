// Kurumsal projeler: süper admin eklentisi, elle durum, ekip başı, öncelik ve toplam proje tarihi
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
const sys = (sql, params) => pg.query(sql, params);

const chief = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
const admin = "00000000-0000-0000-0000-000000000009";
await sys(`insert into auth.users (id, email) values ($1, 'a@a'), ($2, 'b@b'), ($3, 'admin@x')`, [chief, other, admin]);
await sys(`insert into public.platform_admins (user_id) values ($1)`, [admin]);
await as(chief, `select public.create_company('Telekom Firma')`);
await as(other, `select public.create_company('Diğer Firma')`);
const one = async (sql, params, uid = chief) => (await as(uid, sql, params)).rows[0];
const companyId = (await one(`select public.current_company_id() id`)).id;
const setStatus = (project, status, leaderId = null, leaderName = null, completedAt = null, uid = chief) =>
  asErr(uid, `select public.set_corporate_project_status($1, $2, $3, $4, $5)`, [project, status, leaderId, leaderName, completedAt]);

// Eklenti
let error = await asErr(chief, `select public.save_addon_project_type(null, 'Kurumsal TTVPN', null, null, 'corporate')`);
check("addon off: corporate type rejected", /açık değil/.test(error ?? ""), error);
await as(admin, `select public.admin_set_company_project_addons($1, array['corporate'])`, [companyId]);
const ttvpn = (await one(`select public.save_addon_project_type(null, 'Kurumsal TTVPN', null, '#2563eb', 'corporate') id`)).id;
const erisim = (await one(`select public.save_addon_project_type(null, 'Erişim Zorunluluk', null, null, 'corporate') id`)).id;
check("two corporate types with own names", !!ttvpn && !!erisim);
error = await asErr(chief, `select public.save_addon_project_type(null, 'HP', null, null, 'hp')`);
check("hp addon still off", /açık değil/.test(error ?? ""), error);
error = await asErr(chief, `insert into public.project_type_stages (project_type_id, name) values ($1, 'Kablo')`, [ttvpn]);
check("corporate type has no stages", /iş kalemi tanımlanmaz/.test(error ?? ""), error);

// Proje
const p = (await one(`insert into public.projects (project_code, name, location, project_type_id, project_date, priority_order)
  values ('TT-1', 'Banka Şube', 'Kadıköy', $1, '2026-10-01', 2) returning id, status, progress_percent`, [ttvpn]));
check("new corporate project waiting", p.status === "waiting" && p.progress_percent === 0, JSON.stringify(p));
check("no stage rows", (await one(`select count(*)::int n from public.project_stage_progress where project_id = $1`, [p.id])).n === 0);
const leader = (await one(`insert into public.personnel (full_name, phone, employment_start_date) values ('Ahmet Usta', '5550000000', current_date) returning id`)).id;
const project = () => one(`select status, hold_reason, has_activity, progress_percent, current_team_leader_name, completed_by_name, completed_at::text, project_date::text, priority_order from public.projects where id = $1`, [p.id]);

error = await setStatus(p.id, "in_progress");
check("in progress needs leader", /ekip başını seçin/.test(error ?? ""), error);
check("in progress with leader", !(await setStatus(p.id, "in_progress", leader, "Ahmet Usta")));
let row = await project();
check("status in progress, leader kept", row.status === "in_progress" && row.has_activity && row.current_team_leader_name === "Ahmet Usta", JSON.stringify(row));
check("permit waiting", !(await setStatus(p.id, "permit_waiting")));
row = await project();
check("permit waiting -> on hold with reason", row.status === "on_hold" && row.hold_reason === "Kazı izni bekleniyor", JSON.stringify(row));
error = await setStatus(p.id, "completed");
check("completed needs finisher", /bitiren ekip başını/.test(error ?? ""), error);
error = await setStatus(p.id, "completed", leader, "Ahmet Usta", "2099-01-01");
check("future completion date rejected", /ileri bir tarih/.test(error ?? ""), error);
check("completed with date", !(await setStatus(p.id, "completed", leader, "Ahmet Usta", "2026-10-05")));
row = await project();
check("completed: finisher, date, 100%", row.status === "completed" && row.completed_by_name === "Ahmet Usta" && row.completed_at === "2026-10-05" && row.progress_percent === 100, JSON.stringify(row));
check("project date and priority kept", row.project_date === "2026-10-01" && row.priority_order === 2, JSON.stringify(row));
check("back to not started", !(await setStatus(p.id, "not_started")));
row = await project();
check("not started clears completion", row.status === "waiting" && row.completed_by_name === null && row.completed_at === null && !row.has_activity, JSON.stringify(row));
await as(chief, `update public.projects set estimated_end_date = current_date - 1 where id = $1`, [p.id]);
await setStatus(p.id, "in_progress", leader, "Ahmet Usta");
check("overdue in progress -> delayed", (await project()).status === "delayed");

// Yetki ve ayrım
const std = (await one(`select public.save_project_type(null, 'Bina', null, false, null, null, '[{"name":"Temel"}]'::jsonb) id`)).id;
const stdProject = (await one(`insert into public.projects (project_code, name, location, project_type_id) values ('B-1', 'Bina', 'Merkez', $1) returning id`, [std])).id;
error = await setStatus(stdProject, "in_progress", leader, "Ahmet Usta");
check("standard project rejected", /kurumsal değil/.test(error ?? ""), error);
error = await setStatus(p.id, "not_started", null, null, null, other);
check("other company cannot change", /bulunamadı/.test(error ?? ""), error);
error = await asErr(chief, `update public.projects set project_type_id = $1 where id = $2`, [std, p.id]);
check("corporate project type cannot change", /değiştirilemez/.test(error ?? ""), error);
await as(chief, `select public.cancel_project($1, 'Vazgeçildi')`, [p.id]);
error = await setStatus(p.id, "not_started");
check("cancelled project locked", /iptal edilen/.test(error ?? ""), error);

await as(admin, `select public.admin_set_company_project_addons($1, '{}')`, [companyId]);
error = await asErr(chief, `insert into public.projects (project_code, name, location, project_type_id) values ('TT-2', 'Yeni', 'Merkez', $1)`, [ttvpn]);
check("addon off: new corporate project rejected", /açık değil/.test(error ?? ""), error);

process.exit(0);
