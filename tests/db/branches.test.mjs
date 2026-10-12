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

const [owner, chief, acc, acc2, hq] = ["1", "2", "3", "4", "5"].map((n) => `00000000-0000-0000-0000-00000000000${n}`);
await sys(`insert into auth.users (id, email) values ($1,'a@a'),($2,'b@b'),($3,'c@c'),($4,'d@d'),($5,'e@e')`, [owner, chief, acc, acc2, hq]);
await as(owner, `select public.create_company('Şubeli Firma')`);
const company = (await one(owner, `select public.get_my_company() r`)).r.company;
for (const u of [chief, acc, acc2, hq]) await as(u, `select public.join_company('Şubeli Firma', $1)`, [company.join_code]);
await as(owner, `select public.assign_user_role($1, 'company_manager')`, [chief]);
await as(owner, `select public.assign_user_role($1, 'company_manager')`, [hq]);
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
check("şube şefi Merkez yetkisinde değil", chiefBranches.head_office === false && ownerBranches.head_office === true);
const hqBranches = (await one(hq, `select public.get_my_branches() r`)).r;
check("Merkez şantiye şefi bütün şubeleri görür", hqBranches.head_office === true && hqBranches.branches.length === 2 && hqBranches.assignments === null);

// --- kayıtlar ve görünürlük -----------------------------------------------------------------------
const merkezPerson = (await one(owner, `insert into public.personnel (full_name, employment_start_date) values ('Merkez Usta', '2025-01-01') returning id, branch_id`));
check("firma yöneticisinin kaydı varsayılan Merkez", merkezPerson.branch_id === merkez.id);
const aPerson = (await one(chief, `insert into public.personnel (full_name, employment_start_date) values ('Şube A Usta', '2025-01-01') returning id, branch_id`));
check("şefin kaydı kendi şubesine düşer", aPerson.branch_id === branchA);

// Şube şefinin eklediği personel onay bekler; onayı firma yöneticisi veya Merkez şantiye şefi verir.
check("şube şefinin eklediği personel onay bekler", (await sys(`select approval_status from public.personnel where id = $1`, [aPerson.id])).rows[0].approval_status === "pending");
check("firma yöneticisinin eklediği personel onaylı", (await sys(`select approval_status from public.personnel where id = $1`, [merkezPerson.id])).rows[0].approval_status === "approved");
e = await asErr(chief, `select public.review_pending_record('personnel', $1, true)`, [aPerson.id]);
check("şube şefi onay veremez", /Merkez/.test(e ?? ""), e);
check("şube şefi onay bildirimi almaz", !(await one(chief, `select public.get_my_notifications() n`)).n.some((x) => x.type === "pending_approval"));
check("Merkez şefi onay bildirimi alır", (await one(hq, `select public.get_my_notifications() n`)).n.some((x) => x.type === "pending_approval" && x.link === "/panel/approvals"));
check("Merkez şefi başka şubenin bekleyen personelini görür", (await one(hq, `select count(*)::int n from public.personnel where id = $1`, [aPerson.id])).n === 1);
e = await asErr(hq, `select public.review_pending_record('personnel', $1, true)`, [aPerson.id]);
check("Merkez şefi şube personelini onaylar", !e && (await sys(`select approval_status from public.personnel where id = $1`, [aPerson.id])).rows[0].approval_status === "approved", e);
const hqPerson = await one(hq, `insert into public.personnel (full_name, employment_start_date, branch_id) values ('Merkez Şefinin Ustası', '2025-01-01', $1) returning id, approval_status`, [branchA]);
check("Merkez şefi başka şubeye onaysız personel ekler", hqPerson.approval_status === "approved", JSON.stringify(hqPerson));
await sys(`delete from public.personnel where id = $1`, [hqPerson.id]);
const pendingVehicle = await one(chief, `insert into public.vehicles (plate, brand, model) values ('14 ŞUB 01', 'Fiat', 'Doblo') returning id, approval_status`);
check("şube şefinin eklediği araç onay bekler", pendingVehicle.approval_status === "pending");
await as(owner, `select public.review_pending_record('vehicle', $1, false)`, [pendingVehicle.id]);
check("firma yöneticisi bekleyen aracı reddeder", (await sys(`select count(*)::int n from public.vehicles where id = $1`, [pendingVehicle.id])).rows[0].n === 0);
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

// Şube değiştirme: şube şefi kendi şubeleri arasında da taşıyamaz; Merkez yetkisi verilen şef taşır.
const bolu2 = (await one(owner, `insert into public.branches (name, sort_order) values ('Düzce', 3) returning id`)).id;
await as(owner, `select public.set_user_branches($1, $2::uuid[])`, [chief, [branchA, bolu2]]);
e = await asErr(chief, `update public.personnel set branch_id = $2 where id = $1`, [aPerson.id, bolu2]);
check("şube şefi personeli kendi şubeleri arasında da taşıyamaz", /yalnızca firma yöneticisi veya Merkez/.test(e ?? ""), e);
e = await asErr(chief, `select public.set_user_head_office($1, true)`, [chief]);
check("şef kendine Merkez yetkisi veremez", !!e, e);
await as(owner, `select public.set_user_head_office($1, true)`, [chief]);
const granted = (await one(chief, `select public.get_my_branches() r`)).r;
check("Merkez yetkisi verilen şef bütün şubeleri görür", granted.head_office === true && granted.branches.length === 3);
check("firma yöneticisi Merkez yetkililerini görür", (await one(owner, `select public.get_my_branches() r`)).r.head_office_users.includes(chief));
e = await asErr(chief, `update public.personnel set branch_id = $2 where id = $1`, [aPerson.id, merkez.id]);
check("Merkez yetkili şef personeli başka şubeye taşır", !e, e);
await as(chief, `update public.personnel set branch_id = $2 where id = $1`, [aPerson.id, branchA]);
await as(owner, `select public.set_user_head_office($1, false)`, [chief]);
await as(owner, `select public.set_user_branches($1, $2::uuid[])`, [chief, [branchA]]);
await as(owner, `delete from public.branches where id = $1`, [bolu2]);
check("yetki kaldırılınca şef yalnızca kendi şubesinde", (await one(chief, `select public.get_my_branches() r`)).r.branches.length === 1);

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

// --- D2: iş planı, imalat, hakediş, ay onayı, taşeron, depo --------------------------------------------
const planDate = "2026-09-15";
const merkezPlan = (await one(owner, `insert into public.daily_work_plans (plan_date) values ($1) returning id, branch_id`, [planDate]));
check("firma yöneticisinin planı Merkez'de", merkezPlan.branch_id === merkez.id);
e = await asErr(chief, `insert into public.daily_work_plans (plan_date) values ($1)`, [planDate]);
check("aynı gün her şubenin ayrı planı olur", !e, e);
check("şef yalnızca kendi şubesinin planını görür", (await one(chief, `select count(*)::int n from public.daily_work_plans`)).n === 1);
e = await asErr(owner, `insert into public.daily_work_plans (plan_date, branch_id) values ($1, $2)`, [planDate, merkez.id]);
check("bir şubede günde tek plan", !!e, e);

const aEntry = (await sys(`select branch_id from public.production_entries where team_leader_personnel_id = $1`, [aPerson.id])).rows[0];
check("imalat ekip başının şubesini tutar", aEntry?.branch_id === branchA);

// Hakediş: fiyat izni verilen şef yalnızca kendi şubesinin tutarlarını görür.
await as(owner, `select public.save_stage_prices($1::jsonb)`, [JSON.stringify([{ stage_id: (await sys(`select id from public.project_type_stages where project_type_id = $1`, [typeId])).rows[0].id, unit_price: 100 }])]);
await as(owner, `select public.save_production_entry(null, current_date, $1, 'Merkez Usta', null, $2::jsonb)`,
  [merkezPerson.id, JSON.stringify([{ project_id: merkezProject, sort_order: 0, items: [{ kind: "stage", progress_id: merkezProgress, quantity: 5, sort_order: 0 }] }])]);
await as(owner, `select public.set_company_manager_permission($1, 'hakedis', true)`, [chief]);
const chiefReport = (await one(chief, `select public.get_hakedis_report(current_date - 1, current_date) r`)).r;
check("şefin hakediş raporunda yalnızca kendi şubesi", chiefReport.by_project.length === 1 && chiefReport.by_project[0].project_code === "A-1", JSON.stringify(chiefReport.by_project.map((p) => p.project_code)));
const ownerAll = (await one(owner, `select public.get_hakedis_report(current_date - 1, current_date) r`)).r;
const ownerMerkez = (await one(owner, `select public.get_hakedis_report(current_date - 1, current_date, $1) r`, [merkez.id])).r;
check("firma yöneticisi bütün şubeleri ya da tek şubeyi görür", ownerAll.by_project.length === 2 && ownerMerkez.by_project.length === 1 && ownerMerkez.by_project[0].project_code === "M-1");
check("Genel Bakış şube süzgeci", (await one(owner, `select public.get_dashboard_stats($1) r`, [branchA])).r.total === 1 && (await one(owner, `select public.get_dashboard_stats() r`)).r.total === 2);

// Ay sonu puantaj onayı şube bazında.
await as(owner, `select public.save_attendance_changes($1::jsonb)`, [JSON.stringify([{ personnel_id: merkezPerson.id, attendance_date: "2026-08-03", status: "worked" }, { personnel_id: aPerson.id, attendance_date: "2026-08-03", status: "worked" }])]);
e = await asErr(owner, `select public.approve_attendance_month(2026, 8)`);
check("birden fazla şubesi olan şube seçmeden onaylayamaz", /Şube seçin/.test(e ?? ""), e);
e = await asErr(chief, `select public.approve_attendance_month(2026, 8, $1)`, [merkez.id]);
check("şef başka şubenin ayını onaylayamaz", !!e, e);
e = await asErr(chief, `select public.approve_attendance_month(2026, 8)`);
check("tek şubeli şef şube seçmeden onaylar", !e, e);
e = await asErr(owner, `select public.save_attendance_changes($1::jsonb)`, [JSON.stringify([{ personnel_id: aPerson.id, attendance_date: "2026-08-04", status: "worked" }])]);
check("onaylı şubenin ayına puantaj girilemez", /onaylandı/.test(e ?? ""), e);
e = await asErr(owner, `select public.save_attendance_changes($1::jsonb)`, [JSON.stringify([{ personnel_id: merkezPerson.id, attendance_date: "2026-08-04", status: "worked" }])]);
check("diğer şubenin aynı ayı açık kalır", !e, e);
const approvals = (await one(owner, `select public.get_attendance_month_approvals(2026, 8) r`)).r;
check("onay durumu şube başına", approvals.length === 2 && approvals.find((a) => a.branch_id === branchA)?.approved_at && !approvals.find((a) => a.branch_id === merkez.id)?.approved_at);
const filteredMonth = (await one(owner, `select public.get_monthly_attendance(2026, 8, 'active', '', 'all', $1) r`, [merkez.id])).r;
check("puantaj şube süzgeci", filteredMonth.personnel.every((p) => p.id !== aPerson.id) && filteredMonth.personnel.some((p) => p.id === merkezPerson.id));

// Taşeron listesi erişilebilen şubelerle sınırlı.
await as(owner, `select public.set_personnel_subcontractor($1, true, 60)`, [merkezPerson.id]);
check("şef başka şubenin taşeronunu görmez", (await one(chief, `select public.list_subcontractors() r`)).r.length === 0);

// Depo: şef başka şubenin deposundan çıkış yapamaz; kendi deposundan başka şubeye gönderir.
const autoDepots = (await sys(`select id, name from public.inventory_locations where branch_id = $1`, [branchA])).rows;
check("yeni şubeye otomatik depo açılır", autoDepots.length === 1 && autoDepots[0].name === "Şube A Depo", JSON.stringify(autoDepots));
const aDepot = autoDepots[0].id;
const mainDepotIdEarly = (await sys(`select id from public.inventory_locations where company_id = $1 and is_main`, [company.id])).rows[0].id;
const extraDepot = (await one(chief, `select public.save_inventory_location(null, 'Şube A Saha') id`)).id;
check("şefin açtığı depo kendi şubesinde", (await sys(`select branch_id from public.inventory_locations where id = $1`, [extraDepot])).rows[0].branch_id === branchA);const unit = (await sys(`select (enum_range(null::public.inventory_unit))[1]::text u`)).rows[0].u;
const catalog = (await one(owner, `select public.create_inventory_catalog_material('Kablo', null, null, null, $1::public.inventory_unit, false) id`, [unit])).id;
await as(owner, `select public.create_inventory_receipt(current_date, 'Depocu', 'IRS-1', null, $1::jsonb)`, [JSON.stringify([{ catalog_id: catalog, quantity: 10 }])]);
const material = (await sys(`select id from public.inventory_materials where catalog_id = $1`, [catalog])).rows[0].id;
e = await asErr(chief, `select public.record_inventory_movement($1, 'out', 1, null, 'Proje', null, null, null)`, [material]);
check("şef Merkez deposundan çıkış yapamaz", /erişiminiz olmayan/.test(e ?? ""), e);
e = await asErr(chief, `select public.create_inventory_receipt(current_date, 'Şef', 'IRS-2', null, $1::jsonb, $2)`, [JSON.stringify([{ catalog_id: catalog, quantity: 4 }]), aDepot]);
check("şef kendi deposuna irsaliye girer", !e, e);
const chiefReceipt = (await sys(`select id, status, branch_id from public.inventory_receipts where dispatch_number = 'IRS-2'`)).rows[0];
check("şube şefinin irsaliyesi onay bekler, stok değişmez", chiefReceipt.status === "pending" && chiefReceipt.branch_id === branchA
  && (await sys(`select count(*)::int n from public.inventory_location_stocks where location_id = $1`, [aDepot])).rows[0].n === 0);
check("şef bekleyen irsaliyesini ve satırlarını görür", (await one(chief, `select count(*)::int n from public.inventory_receipt_lines where receipt_id = $1`, [chiefReceipt.id])).n === 1);
e = await asErr(chief, `select public.review_inventory_receipt($1, true)`, [chiefReceipt.id]);
check("şube şefi kendi irsaliyesini onaylayamaz", /Merkez/.test(e ?? ""), e);
check("şef Merkez'in irsaliyesini görmez", (await one(chief, `select count(*)::int n from public.inventory_receipts where dispatch_number = 'IRS-1'`)).n === 0);
check("Merkez şefi onay bildirimi alır (irsaliye)", (await one(hq, `select public.get_my_notifications() n`)).n.some((x) => x.key === `pending_receipt:${chiefReceipt.id}` && x.title === "Şube A şubesine malzeme girişi"));
e = await asErr(hq, `select public.review_inventory_receipt($1, true)`, [chiefReceipt.id]);
check("Merkez şefi onaylayınca şube deposuna girer", !e && Number((await sys(`select quantity from public.inventory_location_stocks where location_id = $1`, [aDepot])).rows[0]?.quantity) === 4, e);

// Malzeme talebi şubeye bağlı; talebi ve stok girişini Merkez onaylar, malzeme şube deposuna girer.
const reqId = (await one(chief, `select public.create_inventory_request(current_date, 'Şef', null, $1::jsonb) id`, [JSON.stringify([{ catalog_id: catalog, quantity: 3 }])])).id;
check("şefin talebi kendi şubesinde", (await sys(`select branch_id from public.inventory_requests where id = $1`, [reqId])).rows[0].branch_id === branchA);
check("firma yöneticisi şubenin talebini görür", (await one(owner, `select count(*)::int n from public.inventory_requests where id = $1`, [reqId])).n === 1);
e = await asErr(chief, `select public.approve_inventory_request($1)`, [reqId]);
check("şube şefi talebi onaylayamaz", /Merkez/.test(e ?? ""), e);
await as(owner, `select public.approve_inventory_request($1)`, [reqId]);
e = await asErr(chief, `select public.submit_inventory_request_receipt($1, current_date, 'Şef', 'IRS-T1', null, $2::jsonb, $3)`, [reqId, JSON.stringify([{ catalog_id: catalog, quantity: 3 }]), mainDepotIdEarly]);
check("talep başka şubenin deposuna alınamaz", !!e, e);
e = await asErr(chief, `select public.submit_inventory_request_receipt($1, current_date, 'Şef', 'IRS-T1', null, $2::jsonb)`, [reqId, JSON.stringify([{ catalog_id: catalog, quantity: 3 }])]);
check("şef talebin irsaliyesini kontrol eder", !e, e);
e = await asErr(chief, `select public.approve_inventory_request_receipt($1)`, [reqId]);
check("şube şefi stok girişini onaylayamaz", /Merkez/.test(e ?? ""), e);
await as(owner, `select public.approve_inventory_request_receipt($1)`, [reqId]);
check("talep malzemesi şube deposuna girer", Number((await sys(`select quantity from public.inventory_location_stocks where location_id = $1`, [aDepot])).rows[0]?.quantity) === 7);
e = await asErr(hq, `select public.create_inventory_receipt(current_date, 'Merkez Şefi', 'IRS-3', null, $1::jsonb, $2)`, [JSON.stringify([{ catalog_id: catalog, quantity: 2 }]), aDepot]);
check("Merkez şefi başka şubenin deposuna irsaliye girer", !e, e);
const mainDepotId = (await sys(`select id from public.inventory_locations where company_id = $1 and is_main`, [company.id])).rows[0].id;
e = await asErr(chief, `select public.create_inventory_transfer(current_date, $1, $2, 'Şef', 'Depocu', null, null, $3::jsonb)`, [aDepot, mainDepotId, JSON.stringify([{ material_id: material, quantity: 1 }])]);
check("şef kendi deposundan başka şubeye sevk eder", !e, e);
check("şef başka şubenin depo stokunu görmez", (await one(chief, `select count(*)::int n from public.inventory_location_stocks`)).n === 1);

// Şube adı değişince otomatik depo da yeniden adlanır; boş şube deposuyla birlikte silinir.
const bolu = (await one(owner, `insert into public.branches (name, sort_order) values ('Bolu', 2) returning id`)).id;
check("Bolu şubesine Bolu Depo açılır", (await sys(`select name from public.inventory_locations where branch_id = $1`, [bolu])).rows.map((r) => r.name).join() === "Bolu Depo");
await as(owner, `update public.branches set name = 'Bolu Şubesi' where id = $1`, [bolu]);
check("şube adı değişince depo adı da değişir", (await sys(`select name from public.inventory_locations where branch_id = $1`, [bolu])).rows.map((r) => r.name).join() === "Bolu Şubesi Depo");
e = await asErr(owner, `delete from public.branches where id = $1`, [bolu]);
check("boş şube deposuyla birlikte silinir", !e && (await sys(`select count(*)::int n from public.inventory_locations where branch_id = $1`, [bolu])).rows[0].n === 0, e);
check("Merkez'e ayrıca depo açılmaz", (await sys(`select count(*)::int n from public.inventory_locations where branch_id = $1`, [merkez.id])).rows[0].n === 1);

// Kaydı olan şube silinemez; rol değişince şube atamaları temizlenir.
e = await asErr(owner, `delete from public.branches where id = $1`, [branchA]);
check("kaydı olan şube silinemez", !!e, e);
await as(owner, `select public.assign_user_role($1, 'site_chief')`, [chief]);
check("firma yöneticisi olan kullanıcının şube ataması kalkar", (await sys(`select count(*)::int n from public.user_branches where user_id = $1`, [chief])).rows[0].n === 0);
check("firma yöneticisi olunca bütün personeli görür", (await one(chief, `select count(*)::int n from public.personnel`)).n === 2);

// Şube geçmişi: kartından geçiş tarihiyle değişir; puantaj günleri ve yakıt o tarihteki şubeye yazılır.
const histPerson = (await one(owner, `insert into public.personnel (full_name, employment_start_date) values ('Gezici Usta', '2026-01-01') returning id`)).id;
e = await asErr(acc, `select public.change_record_branch('personnel', $1, $2, '2026-09-10')`, [histPerson, branchA]);
check("muhasebe şube değiştiremez", !!e, e);
e = await asErr(owner, `select public.change_record_branch('personnel', $1, $2, '2026-09-10')`, [histPerson, branchA]);
check("firma yöneticisi geçiş tarihiyle şube değiştirir", !e && (await sys(`select branch_id from public.personnel where id = $1`, [histPerson])).rows[0].branch_id === branchA, e);
await sys(`insert into public.attendance_records (company_id, personnel_id, attendance_date, status) values ($1, $2, '2026-09-03', 'worked'), ($1, $2, '2026-09-04', 'worked'), ($1, $2, '2026-09-15', 'worked')`, [company.id, histPerson]);
const branchDays = (await one(owner, `select public.get_attendance_branch_days(2026, 9) r`)).r.filter((x) => x.personnel_id === histPerson);
check("puantajda şube bazında gün", branchDays.find((x) => x.branch_id === merkez.id)?.worked === 2 && branchDays.find((x) => x.branch_id === branchA)?.worked === 1, JSON.stringify(branchDays));
check("şube geçmişi görünür", (await one(owner, `select count(*)::int n from public.personnel_branch_history where personnel_id = $1`, [histPerson])).n === 2);
const vehHist = (await one(owner, `insert into public.vehicles (plate, brand, model) values ('17 GZC 01', 'Fiat', 'Doblo') returning id`)).id;
const d = (n) => new Date(Date.now() - n * 86400000).toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
await as(owner, `select public.change_record_branch('vehicle', $1, $2, $3::date)`, [vehHist, branchA, d(5)]);
await as(owner, `select public.record_vehicle_fuel_purchase($1, $2::date, 1000, 40)`, [vehHist, d(10)]);
await as(owner, `select public.record_vehicle_fuel_purchase($1, $2::date, 1200, 30)`, [vehHist, d(1)]);
await as(owner, `select public.record_vehicle_fuel_purchase($1, $2::date, 1300, 10, null, $3)`, [vehHist, d(0), merkez.id]);
const fuel = (await sys(`select branch_id, liters::float l from public.vehicle_fuel_logs where vehicle_id = $1 order by odometer_km`, [vehHist])).rows;
check("yakıt aracın o tarihteki şubesine yazılır", fuel[0].branch_id === merkez.id && fuel[1].branch_id === branchA, JSON.stringify(fuel));
check("yakıt kaydında şube seçilebilir", fuel[2].branch_id === merkez.id);

if (failures) {
  console.log(`\n${failures} kontrol başarısız`);
  process.exit(1);
}
