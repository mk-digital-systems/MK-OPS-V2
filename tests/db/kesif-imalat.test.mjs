// F3: keşif, imalatta poz seçimi, iş tarihindeki fiyat, keşif ≠ tamamlama, HP'de pafta
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
const sys = (sql, params) => pg.query(sql, params);

const [owner, accountant, admin] = ["1", "2", "9"].map((n) => `00000000-0000-0000-0000-00000000000${n}`);
await sys(`insert into auth.users (id, email) values ($1,'a@a'),($2,'b@b'),($3,'admin@x')`, [owner, accountant, admin]);
await sys(`insert into public.platform_admins (user_id) values ($1)`, [admin]);
await as(owner, `select public.create_company('Altyapı Firma')`);
const company = (await one(owner, `select public.get_my_company() r`)).r.company;
await as(accountant, `select public.join_company('Altyapı Firma', $1)`, [company.join_code]);
await as(owner, `select public.assign_user_role($1, 'accounting')`, [accountant]);

// Kurulum (süper admin): doğalgaz kataloğu + standart tür, telekom (HP), pozlar ve fiyatlar
const telekom = (await sys(`select id from public.catalogs where name = 'Telekom Altyapı'`)).rows[0].id;
const dogalgaz = (await one(admin, `select public.admin_save_catalog(null, 'Doğalgaz Altyapı', null) id`)).id;
await as(admin, `select public.admin_save_catalog_type(null, $1, 'Hat Yapımı', 'standard', null, null)`, [dogalgaz]);
await as(admin, `select public.admin_set_company_catalogs($1, array[$2, $3]::uuid[])`, [company.id, dogalgaz, telekom]);
const imp = (catalog, items, date) => as(admin, `select public.import_poz_items($1, $2, $3::jsonb, $4)`, [company.id, catalog, JSON.stringify(items), date]);
await imp(dogalgaz, [
  { group_name: "Kazı", poz_code: "1/1", name: "Kazı", unit: "m", unit_price: 10 },
  { group_name: "Boru", poz_code: "2/1", name: "PE boru döşeme", unit: "m", unit_price: 20 },
  { group_name: "Servis", poz_code: "3/1", name: "Servis kutusu", unit: "adet" },
], "2026-10-01");
await imp(telekom, [{ group_name: "Kablo", poz_code: "1/2", name: "Yeraltı kablo çekimi", unit: "m", unit_price: 5 }], "2026-10-01");
const poz = async (name) => (await sys(`select id from public.project_type_stages where company_id = $1 and project_type_id is null and name = $2`, [company.id, name])).rows[0].id;
const kazi = await poz("Kazı");
const boru = await poz("PE boru döşeme");
const kutu = await poz("Servis kutusu");
const kablo = await poz("Yeraltı kablo çekimi");
await as(admin, `select public.set_poz_price($1, $2, 12, '2026-11-01')`, [company.id, kazi]);

const hatType = (await sys(`select id from public.project_types where company_id = $1 and name = 'Hat Yapımı'`, [company.id])).rows[0].id;
let e = await asErr(owner, `insert into public.project_type_stages (project_type_id, name) values ($1, 'Eski kalem')`, [hatType]);
check("catalog type cannot get type stages", /iş kalemi tanımlanmaz/.test(e ?? ""), e);

// Proje ve keşif
const project = (await one(owner, `insert into public.projects (project_code, name, location, project_type_id) values ('DG-1', 'Merkez Hat', 'Merkez', $1) returning id`, [hatType])).id;
check("new poz project has no rows", (await one(owner, `select count(*)::int n from public.project_stage_progress where project_id = $1`, [project])).n === 0);
const kesif = (items, uid = owner) => asErr(uid, `select public.save_project_kesif($1, $2::jsonb)`, [project, JSON.stringify(items)]);
e = await kesif([{ stage_id: kablo, quantity: 10 }]);
check("poz from another catalog rejected", /kataloğunda değil/.test(e ?? ""), e);
e = await kesif([{ stage_id: kazi, quantity: 0 }]);
check("zero keşif rejected", /sıfırdan büyük/.test(e ?? ""), e);
e = await kesif([{ stage_id: kazi, quantity: 100 }], accountant);
check("no projects permission: keşif rejected", /yetkiniz yok/.test(e ?? ""), e);
check("keşif saved", !(await kesif([{ stage_id: kazi, quantity: 100 }, { stage_id: boru, quantity: 50 }])));
let p = await one(owner, `select status, progress_percent, has_activity from public.projects where id = $1`, [project]);
check("keşif alone: waiting, 0%", p.status === "waiting" && p.progress_percent === 0 && !p.has_activity, JSON.stringify(p));

// İmalat: poz seçerek
const leader = (await one(owner, `insert into public.personnel (full_name, phone, employment_start_date) values ('Ahmet Usta', '5550000000', '2026-01-01') returning id`)).id;
const imalat = (date, items, projectId = project) => one(owner, `select public.save_production_entry(null, $1, $2, 'Ahmet Usta', null, $3::jsonb) id`,
  [date, leader, JSON.stringify([{ project_id: projectId, sort_order: 0, items: items.map((item, i) => ({ kind: "stage", sort_order: i, ...item })) }])]).then((r) => r.id);
await imalat("2026-10-28", [{ stage_id: kazi, quantity: 40 }]);
p = await one(owner, `select status, progress_percent from public.projects where id = $1`, [project]);
check("first imalat -> in progress, keşif 20%", p.status === "in_progress" && p.progress_percent === 20, JSON.stringify(p));
const amounts = async () => (await sys(`select l.log_date::text d, l.quantity::float q, v.unit_price::float pr, v.amount::float a from public.project_stage_logs l left join public.hakedis_log_values v on v.log_id = l.id order by l.created_at`)).rows;
let rows = await amounts();
check("October work priced at 10", rows[0].pr === 10 && rows[0].a === 400, JSON.stringify(rows));
await imalat("2026-11-03", [{ stage_id: kazi, quantity: 60 }, { stage_id: kutu, quantity: 3 }]);
rows = await amounts();
check("November work priced at 12 (escalation)", rows[1].pr === 12 && rows[1].a === 720, JSON.stringify(rows[1]));
check("unpriced poz stays unpriced", rows[2].pr === null, JSON.stringify(rows[2]));
const kutuRow = await one(owner, `select target_quantity from public.project_stage_progress where project_id = $1 and stage_id = $2`, [project, kutu]);
check("poz outside keşif opens a row without keşif", kutuRow && kutuRow.target_quantity === null);
await as(owner, `select public.set_poz_price(null, $1, 150, '2026-11-01')`, [kutu]);
rows = await amounts();
check("price entered later prices pending log by date", rows[2].pr === 150 && rows[2].a === 450, JSON.stringify(rows[2]));
await as(owner, `select public.set_poz_price(null, $1, 999, '2026-12-01')`, [kazi]);
check("fixed amounts don't change", (await amounts())[1].a === 720);

await imalat("2026-11-04", [{ stage_id: boru, quantity: 50 }]);
p = await one(owner, `select status, progress_percent from public.projects where id = $1`, [project]);
check("keşif 100% -> project NOT completed", p.status === "in_progress" && p.progress_percent === 100, JSON.stringify(p));
check("keşif tamamlanınca proje tamamlamaya hazır işaretlenir (sorulur)", (await one(owner, `select completion_ready from public.projects where id = $1`, [project])).completion_ready === true);
await as(owner, `update public.projects set status = 'completed' where id = $1`, [project]);
await imalat("2026-11-05", [{ stage_id: kutu, quantity: 1 }]);
check("manual completion kept after more imalat", (await one(owner, `select status from public.projects where id = $1`, [project])).status === "completed");

// Pasif poz
await as(owner, `select public.save_poz_item(null, $1, $2, 'Servis', '3/1', 'Servis kutusu', 'adet', false)`, [kutu, dogalgaz]);
await as(owner, `update public.projects set status = 'in_progress' where id = $1`, [project]);
check("inactive poz already in project still usable", !!(await imalat("2026-11-06", [{ stage_id: kutu, quantity: 1 }])));
const project2 = (await one(owner, `insert into public.projects (project_code, name, location, project_type_id) values ('DG-2', 'Kuzey Hat', 'Kuzey', $1) returning id`, [hatType])).id;
e = await as(owner, `select public.save_production_entry(null, '2026-11-07', $1, 'Ahmet Usta', null, $2::jsonb)`, [leader, JSON.stringify([{ project_id: project2, sort_order: 0, items: [{ kind: "stage", stage_id: kutu, quantity: 1, sort_order: 0 }] }])]).then(() => null, (err) => err.message);
check("inactive poz cannot start in a new project", /Pasif poz/.test(e ?? ""), e);

// Keşiften çıkarma: iş kaydı olan satır kalır
check("remove boru from keşif", !(await kesif([{ stage_id: kazi, quantity: 100 }])));
const boruRow = await one(owner, `select target_quantity, status from public.project_stage_progress where project_id = $1 and stage_id = $2`, [project, boru]);
check("row with logs kept without keşif", boruRow && boruRow.target_quantity === null, JSON.stringify(boruRow));

// Hakediş raporu poz kayıtlarını içerir
const report = (await one(owner, `select public.get_hakedis_report('2026-10-01', '2026-11-30') r`)).r;
check("hakediş report includes poz logs", report.rows.length === 6 && Number(report.total_amount) === 400 + 720 + 450 + 1000 + 150 + 150, `${report.rows.length} rows, ${report.total_amount}`);
check("report type name from project", report.by_stage.some((row) => row.type_name === "Hat Yapımı" && row.stage_name === "Kazı"));

// HP projesinde pafta
const hpType = (await sys(`select pt.id from public.project_types pt join public.catalog_project_types ct on ct.id = pt.catalog_type_id where pt.company_id = $1 and ct.screen = 'hp'`, [company.id])).rows[0].id;
const hp = (await one(owner, `select public.create_hp_project($1::jsonb, '[{"sheet_no":"P1","hp_count":10},{"sheet_no":"P2","hp_count":5}]'::jsonb) id`,
  [JSON.stringify({ project_code: "HP-1", name: "Fiber", project_type_id: hpType, location: "Merkez" })])).id;
const sheet = (await one(owner, `select id from public.project_hp_sheets where project_id = $1 and sheet_no = 'P1'`, [hp])).id;
const otherSheet = (await one(owner, `select id from public.project_hp_sheets where project_id = $1 and sheet_no = 'P2'`, [hp])).id;
await imalat("2026-11-10", [{ stage_id: kablo, quantity: 300, sheet_id: sheet }, { stage_id: kablo, quantity: 100 }], hp);
const hpLogs = (await sys(`select l.sheet_id, l.quantity::float q from public.project_stage_logs l join public.project_stage_progress sp on sp.id = l.progress_id where sp.project_id = $1 order by l.quantity desc`, [hp])).rows;
check("pafta written on log (optional)", hpLogs.length === 2 && hpLogs[0].sheet_id === sheet && hpLogs[1].sheet_id === null, JSON.stringify(hpLogs));
check("pafta on production item", (await sys(`select count(*)::int n from public.production_items where sheet_id = $1`, [sheet])).rows[0].n === 1);
check("HP status still from sheets", (await one(owner, `select status from public.projects where id = $1`, [hp])).status === "waiting");
e = await as(owner, `select public.save_production_entry(null, '2026-11-11', $1, 'Ahmet Usta', null, $2::jsonb)`, [leader, JSON.stringify([{ project_id: project, sort_order: 0, items: [{ kind: "stage", stage_id: kazi, quantity: 1, sheet_id: otherSheet, sort_order: 0 }] }])]).then(() => null, (err) => err.message);
check("pafta of another project rejected", /pafta bu projeye ait değil/.test(e ?? ""), e);

process.exit(0);
