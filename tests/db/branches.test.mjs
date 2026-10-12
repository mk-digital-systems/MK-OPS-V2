// Şubeler: Merkez, şube atama, şef/muhasebe yalnızca kendi şubesi (RLS ve fonksiyon içi yazmalar)
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

const [owner, chief, acc, acc2] = ["1", "2", "3", "4"].map((n) => `00000000-0000-0000-0000-00000000000${n}`);
await sys(`insert into auth.users (id, email) values ($1,'a@a'),($2,'b@b'),($3,'c@c'),($4,'d@d')`, [owner, chief, acc, acc2]);
await as(owner, `select public.create_company('Şubeli Firma')`);
const company = (await one(owner, `select public.get_my_company() r`)).r.company;
for (const u of [chief, acc, acc2]) await as(u, `select public.join_company('Şubeli Firma', $1)`, [company.join_code]);
await as(owner, `select public.assign_user_role($1, 'company_manager')`, [chief]);
await as(owner, `select public.assign_user_role($1, 'accounting')`, [acc]);

// --- Merkez ve şube açma -------------------------------------------------------------------
const merkez = (await sys(`select id, name from public.branches where company_id = $1 and is_main`, [company.id])).rows[0];
check("yeni firmada Merkez şubesi", merkez?.name === "Merkez");
const mainDepot = (await sys(`select branch_id from public.inventory_locations where company_id = $1 and is_main`, [company.id])).rows[0];
check("ana depo Merkez'e bağlı", mainDepot?.branch_id === merkez.id);
let e = await asErr(chief, `insert into public.branches (name) values ('Şefin Şubesi')`);
check("şef şube açamaz", !!e, e);
const branchA = (await one(owner, `insert into public.branches (name, sort_order) values ('Şube A', 1) returning id`)).id;
check("firma yöneticisi şube açar", !!branchA);
e = await asErr(owner, `delete from public.branches where id = $1`, [merkez.id]);
const merkezStill = (await sys(`select count(*)::int n from public.branches where id = $1`, [merkez.id])).rows[0].n;
check("Merkez silinemez", merkezStill === 1, e ?? "0 satır");

// --- şube atama -------------------------------------------------------------------------------
check("yeni şef varsayılan olarak Merkez'de", (await sys(`select branch_id from public.user_branches where user_id = $1`, [chief])).rows.map((r) => r.branch_id).join() === merkez.id);
e = await asErr(chief, `select public.set_user_branches($1, $2::uuid[])`, [acc, [branchA]]);
check("şef şube ataması yapamaz", !!e, e);
e = await asErr(owner, `select public.set_user_branches($1, $2::uuid[])`, [chief, []]);
check("en az bir şube gerekir", !!e, e);
await as(owner, `select public.set_user_branches($1, $2::uuid[])`, [chief, [branchA]]);
const chiefBranches = (await one(chief, `select public.get_my_branches() r`)).r;
check("şef yalnızca kendi şubesini görür", chiefBranches.branches.length === 1 && chiefBranches.branches[0].id === branchA && chiefBranches.assignments === null);
const ownerBranches = (await one(owner, `select public.get_my_branches() r`)).r;
check("firma yöneticisi bütün şubeleri ve atamaları görür", ownerBranches.branches.length === 2 && ownerBranches.total_count === 2 && ownerBranches.assignments.length >= 2);

// --- kayıtlar ve görünürlük -----------------------------------------------------------------------
const merkezPerson = (await one(owner, `insert into public.personnel (full_name, employment_start_date) values ('Merkez Usta', '2025-01-01') returning id, branch_id`));
check("firma yöneticisinin kaydı varsayılan Merkez", merkezPerson.branch_id === merkez.id);
const aPerson = (await one(chief, `insert into public.personnel (full_name, employment_start_date) values ('Şube A Usta', '2025-01-01') returning id, branch_id`));
check("şefin kaydı kendi şubesine düşer", aPerson.branch_id === branchA);
e = await asErr(chief, `insert into public.personnel (full_name, branch_id) values ('Sızma', $1)`, [merkez.id]);
check("şef başka şubeye kayıt açamaz", !!e, e);
check("şef yalnızca kendi şubesinin personelini görür", (await one(chief, `select count(*)::int n from public.personnel`)).n === 1);
check("firma yöneticisi bütün personeli görür", (await one(owner, `select count(*)::int n from public.personnel`)).n === 2);
const upd = await as(chief, `update public.personnel set phone = '1' where id = $1`, [merkezPerson.id]);
check("şef başka şubenin personelini değiştiremez", upd.affectedRows === 0);
e = await asErr(chief, `update public.personnel set branch_id = $2 where id = $1`, [aPerson.id, merkez.id]);
check("şef personelini erişemediği şubeye taşıyamaz", !!e, e);
e = await asErr(owner, `update public.personnel set branch_id = $2 where id = $1`, [aPerson.id, merkez.id]);
check("firma yöneticisi personelin şubesini değiştirir", !e, e);
await as(owner, `update public.personnel set branch_id = $2 where id = $1`, [aPerson.id, branchA]);

// Puantaj: başka şubenin personeline girilemez; aylık liste yalnızca kendi şubesi.
e = await asErr(chief, `select public.save_attendance_changes($1::jsonb)`, [JSON.stringify([{ personnel_id: merkezPerson.id, attendance_date: "2026-09-01", status: "worked" }])]);
check("şef başka şubenin puantajını giremez", !!e, e);
e = await asErr(chief, `select public.save_attendance_changes($1::jsonb)`, [JSON.stringify([{ personnel_id: aPerson.id, attendance_date: "2026-09-01", status: "worked" }])]);
check("şef kendi şubesinin puantajını girer", !e, e);
const monthly = (await one(chief, `select public.get_monthly_attendance(2026, 9) r`)).r;
check("aylık puantajda yalnızca kendi şubesi", monthly.personnel.length === 1 && monthly.personnel[0].id === aPerson.id);
const sundays = (await sys(`select count(*)::int n from public.attendance_records where personnel_id = $1 and is_auto_generated`, [merkezPerson.id])).rows[0].n;
check("şefin açtığı puantaj başka şubeye pazar eklemez", sundays === 0, sundays);

// Araç ve yakıt (fonksiyon içi yazma da korunur).
const merkezVehicle = (await one(owner, `insert into public.vehicles (plate, brand, model) values ('17 MRK 01', 'Ford', 'Transit') returning id`)).id;
e = await asErr(chief, `select public.record_vehicle_fuel_purchase($1, current_date, 1000, 40)`, [merkezVehicle]);
check("şef başka şubenin aracına yakıt giremez (fonksiyon)", !!e, e);
check("şef başka şubenin aracını görmez", (await one(chief, `select count(*)::int n from public.vehicles`)).n === 0);

// Projeler ve imalat.
const typeId = (await one(owner, `select public.save_project_type(null, 'Altyapı', null, false, null, null, $1::jsonb) id`, [JSON.stringify([{ name: "Kazı", unit: "m" }])])).id;
const merkezProject = (await one(owner, `insert into public.projects (project_code, name, location, project_type_id) values ('M-1', 'Merkez Proje', 'Bolu', $1) returning id`, [typeId])).id;
const aProject = (await one(chief, `insert into public.projects (project_code, name, location, project_type_id) values ('A-1', 'Şube A Proje', 'Düzce', $1) returning id, branch_id`, [typeId]));
check("şefin projesi kendi şubesinde", aProject.branch_id === branchA);
check("şef yalnızca kendi şubesinin projelerini görür", (await one(chief, `select count(*)::int n from public.projects`)).n === 1);
const merkezProgress = (await sys(`select id from public.project_stage_progress where project_id = $1`, [merkezProject])).rows[0].id;
e = await asErr(chief, `select public.save_production_entry(null, current_date, $1, 'Şube A Usta', null, $2::jsonb)`,
  [aPerson.id, JSON.stringify([{ project_id: merkezProject, sort_order: 0, items: [{ kind: "stage", progress_id: merkezProgress, quantity: 3, sort_order: 0 }] }])]);
check("şef başka şubenin projesine imalat yazamaz", !!e, e);
const aProgress = (await sys(`select id from public.project_stage_progress where project_id = $1`, [aProject.id])).rows[0].id;
e = await asErr(chief, `select public.save_production_entry(null, current_date, $1, 'Merkez Usta', null, $2::jsonb)`,
  [merkezPerson.id, JSON.stringify([{ project_id: aProject.id, sort_order: 0, items: [{ kind: "stage", progress_id: aProgress, quantity: 2, sort_order: 0 }] }])]);
check("şef başka şubenin ekip başıyla imalat açamaz", /şubeye ait/.test(e ?? ""), e);
e = await asErr(chief, `select public.save_production_entry(null, current_date, $1, 'Şube A Usta', null, $2::jsonb)`,
  [aPerson.id, JSON.stringify([{ project_id: aProject.id, sort_order: 0, items: [{ kind: "stage", progress_id: aProgress, quantity: 2, sort_order: 0 }] }])]);
check("şef kendi şubesinde imalat girer", !e, e);

// Muhasebe: atanan şubeyi görür; şefin atadığı muhasebe şefin şubelerini alır.
check("Merkez'deki muhasebe Şube A personelini görmez", !(await as(acc, `select id from public.personnel`)).rows.some((r) => r.id === aPerson.id));
await as(chief, `select public.assign_user_role($1, 'accounting')`, [acc2]);
check("şefin atadığı muhasebe şefin şubesini alır", (await sys(`select branch_id from public.user_branches where user_id = $1`, [acc2])).rows.map((r) => r.branch_id).join() === branchA);

// Kaydı olan şube silinemez; rol değişince şube atamaları temizlenir.
e = await asErr(owner, `delete from public.branches where id = $1`, [branchA]);
check("kaydı olan şube silinemez", !!e, e);
await as(owner, `select public.assign_user_role($1, 'site_chief')`, [chief]);
check("firma yöneticisi olan kullanıcının şube ataması kalkar", (await sys(`select count(*)::int n from public.user_branches where user_id = $1`, [chief])).rows[0].n === 0);
check("firma yöneticisi olunca bütün personeli görür", (await one(chief, `select count(*)::int n from public.personnel`)).n === 2);

if (failures) {
  console.log(`\n${failures} kontrol başarısız`);
  process.exit(1);
}
