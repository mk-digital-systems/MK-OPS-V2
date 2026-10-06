// Smoke check of the generic project model
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
const one = async (sql, params) => (await as(chief, sql, params)).rows[0];

const chief = "00000000-0000-0000-0000-000000000001";
await pg.query(`insert into auth.users (id, email) values ($1, 'a@a')`, [chief]);
await as(chief, `select public.create_company('Deneme Firma')`);

const gas = (await one(`select public.save_project_type(null, 'Doğalgaz Hattı', null, false, null, null, $1::jsonb) id`,
  [JSON.stringify([{ name: "Kazı izni" }, { name: "Boru döşeme", unit: "m" }, { name: "Test" }])])).id;
const building = (await one(`select public.save_project_type(null, 'Konut', null, true, 'Blok', null, $1::jsonb) id`,
  [JSON.stringify([{ name: "Temel" }, { name: "Kaba inşaat" }])])).id;

const p1 = (await one(`insert into public.projects (project_code, name, location, project_type_id, estimated_end_date)
  values ('DG-1', 'Merkez Hat', 'Merkez', $1, current_date + 30) returning id, status`, [gas]));
check("new project waiting", p1.status === "waiting", p1.status);
const rows = (await as(chief, `select sp.id, st.name from public.project_stage_progress sp join public.project_type_stages st on st.id = sp.stage_id where sp.project_id = $1 order by st.sort_order`, [p1.id])).rows;
check("stage rows created", rows.length === 3);
const pipe = rows.find((r) => r.name === "Boru döşeme").id;
await as(chief, `update public.project_stage_progress set target_quantity = 1000 where id = $1`, [pipe]);
await as(chief, `insert into public.project_stage_logs (progress_id, quantity, team_leader_name) values ($1, 400, 'Ahmet')`, [pipe]);
let p = await one(`select status, progress_percent, current_team_leader_name from public.projects where id = $1`, [p1.id]);
check("log starts stage, project in progress", p.status === "in_progress" && p.progress_percent === 13 && p.current_team_leader_name === "Ahmet", JSON.stringify(p));
await as(chief, `insert into public.project_stage_logs (progress_id, quantity, team_leader_name) values ($1, 600, 'Mehmet')`, [pipe]);
const pipeRow = await one(`select status, percent, done_quantity from public.project_stage_progress where id = $1`, [pipe]);
check("target reached -> stage done", pipeRow.status === "done" && Number(pipeRow.percent) === 100, JSON.stringify(pipeRow));
await as(chief, `update public.project_stage_progress set status = 'done' where project_id = $1`, [p1.id]);
p = await one(`select status, progress_percent, completed_by_name from public.projects where id = $1`, [p1.id]);
check("all stages done -> completed", p.status === "completed" && p.progress_percent === 100 && p.completed_by_name === "Mehmet", JSON.stringify(p));
await as(chief, `update public.project_stage_progress set status = 'in_progress' where id = $1`, [rows[2].id]);
p = await one(`select status from public.projects where id = $1`, [p1.id]);
check("reopened stage -> in progress", p.status === "in_progress", p.status);

const p2 = (await one(`insert into public.projects (project_code, name, location, project_type_id) values ('K-1', 'Site', 'Kuzey', $1) returning id`, [building])).id;
check("sectioned project has no rows until sections", (await one(`select count(*)::int n from public.project_stage_progress where project_id = $1`, [p2])).n === 0);
await as(chief, `insert into public.project_sections (project_id, name) values ($1, 'A Blok'), ($1, 'B Blok')`, [p2]);
check("sections create stage rows", (await one(`select count(*)::int n from public.project_stage_progress where project_id = $1`, [p2])).n === 4);
await as(chief, `update public.project_stage_progress sp set status = 'done' from public.project_sections s where s.id = sp.section_id and s.name = 'A Blok'`);
p = await one(`select status, progress_percent from public.projects where id = $1`, [p2]);
check("section average progress", p.progress_percent === 50 && p.status === "in_progress", JSON.stringify(p));

await as(chief, `update public.projects set estimated_end_date = current_date - 1 where id = $1`, [p2]);
check("overdue -> delayed", (await one(`select status from public.projects where id = $1`, [p2])).status === "delayed");
await as(chief, `update public.projects set status = 'on_hold', hold_reason = 'İzin bekleniyor' where id = $1`, [p2]);
p = await one(`select status, hold_reason from public.projects where id = $1`, [p2]);
check("manual on hold kept", p.status === "on_hold" && p.hold_reason === "İzin bekleniyor", JSON.stringify(p));

const kaziStage = (await one(`select stage_id from public.project_stage_progress where id = $1`, [rows[0].id])).stage_id;
const e1 = await as(chief, `select public.save_project_type($1, 'Doğalgaz Hattı', null, false, null, null, $2::jsonb)`,
  [gas, JSON.stringify([{ id: kaziStage, name: "Kazı izni" }, { name: "Test" }])]).then(() => null, (e) => e.message);
check("stage with logs cannot be removed", /silinemez/.test(e1 ?? ""), e1);
const pipeStage = (await one(`select stage_id from public.project_stage_progress where id = $1`, [pipe])).stage_id;
const e2 = await as(chief, `select public.save_project_type($1, 'Doğalgaz Hattı', null, false, null, null, $2::jsonb)`,
  [gas, JSON.stringify([{ id: kaziStage, name: "Kazı izni" }, { id: pipeStage, name: "Boru döşeme", unit: "m" }, { name: "Test" }, { name: "Asfalt" }])]).then(() => null, (e) => e.message);
check("adding a stage to existing type works", !e2 && (await one(`select count(*)::int n from public.project_stage_progress where project_id = $1`, [p1.id])).n === 4, e2);
const overview = (await one(`select public.get_dashboard_overview() o`)).o;
check("dashboard overview types", overview.types.length === 2 && overview.recent_logs.length === 2, `${overview.types.length} types, ${overview.recent_logs.length} logs`);
const stats = (await one(`select public.get_dashboard_stats() s`)).s;
check("dashboard stats", stats.total === 2, JSON.stringify(stats));

// FAIL satırlarını koşturucu yakalar; PGlite süreci açık tutmasın.
process.exit(0);
