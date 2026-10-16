// HP odaklı projeler: süper admin eklentisi, paftalar, paftadan proje durumu, HP raporu
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
for (const [id, email] of [[chief, "a@a"], [other, "b@b"], [admin, "admin@x"]]) {
  await sys(`insert into auth.users (id, email) values ($1, $2)`, [id, email]);
}
await sys(`insert into public.platform_admins (user_id) values ($1)`, [admin]);
await as(chief, `select public.create_company('HP Firma')`);
await as(other, `select public.create_company('Diğer Firma')`);
const one = async (sql, params, uid = chief) => (await as(uid, sql, params)).rows[0];
const companyId = (await one(`select public.current_company_id() id`)).id;

// 1. Eklenti -------------------------------------------------------------------------------------
let error = await asErr(chief, `select public.save_addon_project_type(null, 'HP Odaklı', null, null, 'hp')`);
check("addon off: HP type rejected", /açık değil/.test(error ?? ""), error);
error = await asErr(chief, `insert into public.project_types (name, screen) values ('Sızma', 'hp')`);
check("addon off: direct HP type insert rejected", /açık değil/.test(error ?? ""), error);
error = await asErr(chief, `update public.companies set project_addons = '{hp}' where id = $1`, [companyId]);
const stillOff = (await one(`select project_addons from public.companies where id = $1`, [companyId])).project_addons;
check("company cannot enable its own addon", stillOff.length === 0, error ?? "no error, unchanged");
error = await asErr(chief, `select public.admin_set_company_project_addons($1, array['hp'])`, [companyId]);
check("only super admin sets addons", /süper admin/.test(error ?? ""), error);
error = await asErr(admin, `select public.admin_set_company_project_addons($1, array['hp', 'nope'])`, [companyId]);
check("unknown addon rejected", !!error, error);
await as(admin, `select public.admin_set_company_project_addons($1, array['hp', 'hp'])`, [companyId]);
const listed = (await one(`select public.admin_list_companies() c`, [], admin)).c.find((c) => c.id === companyId);
check("admin list shows addons", JSON.stringify(listed.project_addons) === '["hp"]', JSON.stringify(listed.project_addons));
check("company sees its addon", (await one(`select public.company_has_project_addon('hp') v`)).v === true);
check("other company does not", (await one(`select public.company_has_project_addon('hp') v`, [], other)).v === false);

// 2. HP türü -----------------------------------------------------------------------------------
const hpType = (await one(`select public.save_addon_project_type(null, 'HP Odaklı', 'Fiber', '#2563eb', 'hp') id`)).id;
check("HP type created", !!hpType);
error = await asErr(chief, `insert into public.project_type_stages (project_type_id, name) values ($1, 'Kablo')`, [hpType]);
check("HP type cannot get stages", /iş kalemi tanımlanmaz/.test(error ?? ""), error);
error = await asErr(chief, `select public.save_project_type($1, 'HP Odaklı', null, true, 'Pafta', null, '[{"name":"Kablo"}]'::jsonb)`, [hpType]);
check("standard editor cannot add stages to HP type", !!error, error);
error = await asErr(chief, `update public.project_types set screen = 'standard' where id = $1`, [hpType]);
check("screen cannot change", /değiştirilemez/.test(error ?? ""), error);
error = await asErr(other, `select public.save_addon_project_type(null, 'HP', null, null, 'corporate')`);
check("corporate addon still off", /açık değil/.test(error ?? ""), error);
const stdType = (await one(`select public.save_project_type(null, 'Doğalgaz', null, false, null, null, '[{"name":"Kazı"}]'::jsonb) id`)).id;

// 3. Paftalarla proje ----------------------------------------------------------------------------
const project = { project_code: "HP-1", name: "Merkez Fiber", project_type_id: hpType, location: "Merkez" };
error = await asErr(chief, `select public.create_hp_project($1::jsonb, $2::jsonb)`,
  [JSON.stringify(project), JSON.stringify([{ sheet_no: "P1" }, { sheet_no: " p1 " }])]);
check("duplicate sheet numbers rejected", /birden fazla/.test(error ?? ""), error);
error = await asErr(chief, `select public.create_hp_project($1::jsonb, $2::jsonb)`,
  [JSON.stringify({ ...project, project_type_id: stdType }), JSON.stringify([{ sheet_no: "P1" }])]);
check("standard type rejected by HP create", /HP odaklı değil/.test(error ?? ""), error);
const hpId = (await one(`select public.create_hp_project($1::jsonb, $2::jsonb) id`, [JSON.stringify(project), JSON.stringify([
  { sheet_no: "P1", hp_count: 120, address: "Atatürk Cd." },
  { sheet_no: "P2", hp_count: "80" },
  { sheet_no: "P3", hp_count: 50, image_url: "https://example.com/p3.jpg" },
  { sheet_no: "P4", hp_count: 0 },
])])).id;
const sheets = (await as(chief, `select id, sheet_no, hp_count from public.project_hp_sheets where project_id = $1 order by sort_order`, [hpId])).rows;
check("sheets created in order", sheets.map((s) => s.sheet_no).join() === "P1,P2,P3,P4" && sheets[1].hp_count === 80, JSON.stringify(sheets));
let p = await one(`select status, progress_percent, has_activity from public.projects where id = $1`, [hpId]);
check("new HP project waiting at 0%", p.status === "waiting" && p.progress_percent === 0 && !p.has_activity, JSON.stringify(p));
const sheetId = (no) => sheets.find((s) => s.sheet_no === no).id;

error = await asErr(chief, `insert into public.project_hp_sheets (project_id, sheet_no) values ((select id from public.projects where project_code = 'HP-1'), 'p2')`);
check("duplicate sheet no on insert rejected", !!error, error);
const stdProject = (await one(`insert into public.projects (project_code, name, location, project_type_id) values ('DG-1', 'Hat', 'Merkez', $1) returning id`, [stdType])).id;
error = await asErr(chief, `insert into public.project_hp_sheets (project_id, sheet_no) values ($1, 'P1')`, [stdProject]);
check("sheet cannot go to standard project", /yalnızca HP/.test(error ?? ""), error);
error = await asErr(chief, `update public.projects set project_type_id = $1 where id = $2`, [stdType, hpId]);
check("HP project type cannot change", /değiştirilemez/.test(error ?? ""), error);
error = await asErr(chief, `insert into public.project_sections (project_id, name) values ($1, 'A')`, [hpId]);
check("HP project has no sections", /bölüm/.test(error ?? ""), error);

// 4. Durum paftalardan ---------------------------------------------------------------------------
await as(chief, `update public.project_hp_sheets set status = 'permit_waiting' where id = $1`, [sheetId("P1")]);
p = await one(`select status, hold_reason from public.projects where id = $1`, [hpId]);
check("permit waiting -> project on hold", p.status === "on_hold" && p.hold_reason === "Kazı izni bekleniyor", JSON.stringify(p));
await as(chief, `update public.project_hp_sheets set status = 'in_progress', current_team_leader_name = 'Ahmet' where id = $1`, [sheetId("P2")]);
p = await one(`select status, has_activity, current_team_leader_name from public.projects where id = $1`, [hpId]);
check("in progress sheet -> project in progress", p.status === "in_progress" && p.has_activity && p.current_team_leader_name === "Ahmet", JSON.stringify(p));
await as(chief, `update public.project_hp_sheets set status = 'completed', completed_by_name = 'Ahmet', completed_at = '2026-09-10', current_team_leader_name = 'x' where id = $1`, [sheetId("P2")]);
const s2 = await one(`select current_team_leader_name, completed_at from public.project_hp_sheets where id = $1`, [sheetId("P2")]);
check("completed sheet clears current leader", s2.current_team_leader_name === null, JSON.stringify(s2));
p = await one(`select status, progress_percent from public.projects where id = $1`, [hpId]);
check("1/4 done, rest waits for permit -> on hold at 25%", p.progress_percent === 25 && p.status === "on_hold", JSON.stringify(p));
await as(chief, `update public.project_hp_sheets set status = 'completed', completed_by_name = 'Mehmet', completed_at = '2026-10-05' where id = any($1)`,
  [[sheetId("P1"), sheetId("P3")]]);
await as(chief, `update public.project_hp_sheets set status = 'completed', completed_by_name = 'Veli' where id = $1`, [sheetId("P4")]);
const s4 = await one(`select completed_at = current_date as today from public.project_hp_sheets where id = $1`, [sheetId("P4")]);
check("completed without date -> today", s4.today === true);
p = await one(`select status, progress_percent, completed_by_name, completed_at = current_date as today from public.projects where id = $1`, [hpId]);
check("all sheets done -> completed by last finisher", p.status === "completed" && p.progress_percent === 100 && p.completed_by_name === "Veli" && p.today, JSON.stringify(p));
await as(chief, `update public.project_hp_sheets set status = 'in_progress', current_team_leader_name = 'Veli' where id = $1`, [sheetId("P4")]);
p = await one(`select status, progress_percent, completed_by_name from public.projects where id = $1`, [hpId]);
check("reopened sheet -> project reopens", p.status === "in_progress" && p.progress_percent === 75 && p.completed_by_name === null, JSON.stringify(p));
await as(chief, `update public.projects set status = 'on_hold', hold_reason = 'Müşteri bekletiyor' where id = $1`, [hpId]);
await as(chief, `update public.project_hp_sheets set notes = 'not' where id = $1`, [sheetId("P4")]);
p = await one(`select status, hold_reason from public.projects where id = $1`, [hpId]);
check("manual hold kept on sheet change", p.status === "on_hold" && p.hold_reason === "Müşteri bekletiyor", JSON.stringify(p));

// 5. Rapor ---------------------------------------------------------------------------------------
const hp2 = (await one(`select public.create_hp_project($1::jsonb, $2::jsonb) id`, [
  JSON.stringify({ project_code: "HP-2", name: "Kuzey", project_type_id: hpType, location: "Kuzey" }),
  JSON.stringify([{ sheet_no: "K1", hp_count: 200 }, { sheet_no: "K2", hp_count: 300 }]),
])).id;
await as(chief, `update public.project_hp_sheets set status = 'completed', completed_by_name = 'Ali', completed_at = '2026-10-20' where project_id = $1`, [hp2]);
const report = (await one(`select public.hp_report('2026-10-01', '2026-10-31') r`)).r;
const t = report.totals;
check("report totals", t.projects === 2 && t.total_hp === 750 && t.completed_hp === 750 && t.sheets === 6 && t.completed_sheets === 5, JSON.stringify(t));
check("report period HP (October)", t.period_hp === 670 && t.period_sheets === 4, JSON.stringify(t));
const september = (await one(`select public.hp_report('2026-09-01', '2026-09-30') r`)).r;
check("report period HP (September)", september.totals.period_hp === 80 && september.totals.period_sheets === 1, JSON.stringify(september.totals));
check("project completed in period counted", t.period_completed_projects === 1, JSON.stringify(t));
const row = report.projects.find((r) => r.id === hpId);
check("per project HP", row.total_hp === 250 && row.completed_hp === 250 && row.period_hp === 170 && row.sheet_count === 4 && row.completed_sheets === 3, JSON.stringify(row));
check("period sheet list", report.period_sheets.every((s) => s.completed_at >= "2026-10-01") && report.period_sheets[0].project_code === "HP-2", JSON.stringify(report.period_sheets[0]));
const otherReport = (await one(`select public.hp_report('2026-01-01', '2026-12-31') r`, [], other)).r;
check("other company sees nothing", otherReport.totals.projects === 0 && otherReport.projects.length === 0, JSON.stringify(otherReport.totals));
check("other company cannot read sheets", (await as(other, `select count(*)::int n from public.project_hp_sheets`)).rows[0].n === 0);
const hp3 = (await one(`select public.create_hp_project($1::jsonb, '[{"sheet_no":"G1","hp_count":999}]'::jsonb) id`,
  [JSON.stringify({ project_code: "HP-3", name: "Güney", project_type_id: hpType, location: "Güney" })])).id;
check("open project counted", (await one(`select public.hp_report('2026-10-01', '2026-10-31') r`)).r.totals.total_hp === 1749);
await as(chief, `select public.cancel_project($1, 'Vazgeçildi')`, [hp3]);
const afterCancel = (await one(`select public.hp_report('2026-10-01', '2026-10-31') r`)).r;
check("cancelled project excluded", afterCancel.totals.projects === 2 && afterCancel.totals.total_hp === 750, JSON.stringify(afterCancel.totals));

// 6. Standart projeler etkilenmez ---------------------------------------------------------------
const stdRow = (await as(chief, `select sp.id from public.project_stage_progress sp where sp.project_id = $1`, [stdProject])).rows[0].id;
await as(chief, `update public.project_stage_progress set status = 'done' where id = $1`, [stdRow]);
p = await one(`select status, progress_percent, completion_ready from public.projects where id = $1`, [stdProject]);
check("standard project still uses stages", p.status === "in_progress" && p.completion_ready === true && p.progress_percent === 100, JSON.stringify(p));

// 7. Eklenti kapanınca yeni HP projesi açılmaz, mevcutlar kalır --------------------------------------
await as(admin, `select public.admin_set_company_project_addons($1, '{}')`, [companyId]);
error = await asErr(chief, `select public.create_hp_project($1::jsonb, '[{"sheet_no":"X"}]'::jsonb)`,
  [JSON.stringify({ project_code: "HP-4", name: "Yeni", project_type_id: hpType, location: "Merkez" })]);
check("addon off: new HP project rejected", /açık değil/.test(error ?? ""), error);
check("addon off: existing sheets kept", (await one(`select count(*)::int n from public.project_hp_sheets where project_id = $1`, [hpId])).n === 4);

await as(chief, `delete from public.projects where id = $1`, [hpId]);
check("deleting project removes sheets", (await one(`select count(*)::int n from public.project_hp_sheets where project_id = $1`, [hpId])).n === 0);

process.exit(0);
