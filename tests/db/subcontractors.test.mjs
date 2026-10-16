// Ekipler ve taşeronlar: taşeron payı, ekstre, harcama/ödeme, maaş dökümü ayrımı, yetkiler
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

const [owner, chief, acc] = ["1", "2", "3"].map((n) => `00000000-0000-0000-0000-00000000000${n}`);
await sys(`insert into auth.users (id, email) values ($1,'a@a'),($2,'b@b'),($3,'c@c')`, [owner, chief, acc]);
await as(owner, `select public.create_company('Deneme Firma')`);
const company = (await one(owner, `select public.get_my_company() r`)).r.company;
for (const [u, role] of [[chief, "company_manager"], [acc, "accounting"]]) {
  await as(u, `select public.join_company('Deneme Firma', $1)`, [company.join_code]);
  await as(owner, `select public.assign_user_role($1, $2)`, [u, role]);
}

// --- kategoriler ----------------------------------------------------------------------------
const categories = (await as(acc, `select id, name from public.subcontractor_expense_categories order by sort_order`)).rows;
check("yeni firmada 5 hazır kategori", categories.length === 5 && categories[0].name === "Hakediş ödemesi", categories.map((c) => c.name).join(", "));
for (let i = 6; i <= 10; i++) await as(acc, `insert into public.subcontractor_expense_categories (name, sort_order) values ($1, $2)`, [`Kategori ${i}`, i]);
let e = await asErr(acc, `insert into public.subcontractor_expense_categories (name) values ('Fazla')`);
check("en fazla 10 kategori", /10/.test(e ?? ""), e);
check("şef (fiyat izni yok) kategorileri göremez", (await one(chief, `select count(*)::int n from public.subcontractor_expense_categories`)).n === 0);

// --- taşeron ve ekipler -------------------------------------------------------------------------
const mehmet = (await one(chief, `insert into public.subcontractors (name, share_percent) values ('Mehmet Altyapı', 70) returning id`)).id;
check("şef taşeron kartı açar", !!mehmet);
const ahmet = (await one(owner, `insert into public.subcontractors (name, share_percent) values ('Ahmet Elektrik', 25) returning id`)).id;
e = await asErr(owner, `insert into public.subcontractors (name, share_percent) values ('Fazla Pay', 120)`);
check("yüzde 100'ü geçemez", !!e, e);

const person = async (name, extra = "") =>
  (await one(owner, `insert into public.personnel (full_name, employment_start_date${extra ? ", subcontractor_id" : ""}) values ($1, '2025-01-01'${extra ? ", $2" : ""}) returning id`, extra ? [name, extra] : [name])).id;
const ownLeader = await person("Kendi Ekip Başı");
const subLeader = await person("Taşeron Ekip Başı", mehmet);
const subWorker = await person("Taşeron İşçi", mehmet);

e = await asErr(acc, `insert into public.teams (name, leader_personnel_id) values ('Muhasebe Ekibi', $1)`, [ownLeader]);
check("muhasebe ekip açamaz", !!e, e);
const subTeam = (await one(chief, `insert into public.teams (name, leader_personnel_id, subcontractor_id) values ('Data Ekibi', $1, $2) returning id`, [subLeader, mehmet])).id;
await as(chief, `insert into public.teams (name, leader_personnel_id) values ('Kendi Ekibimiz', $1)`, [ownLeader]);
e = await asErr(chief, `insert into public.teams (name, leader_personnel_id) values ('İkinci Ekip', $1)`, [subLeader]);
check("bir kişi aynı anda iki aktif ekibin başı olamaz", !!e, e);
check("muhasebe ekipleri görür", (await one(acc, `select count(*)::int n from public.teams`)).n === 2);

// --- imalat → taşeron payı ----------------------------------------------------------------------
const typeId = (await one(owner, `select public.save_project_type(null, 'Okul Altyapı', null, false, null, null, $1::jsonb) id`,
  [JSON.stringify([{ name: "Data uç", unit: "adet" }])])).id;
const stage = (await one(owner, `select id from public.project_type_stages where project_type_id = $1`, [typeId])).id;
await as(owner, `select public.save_stage_prices($1::jsonb)`, [JSON.stringify([{ stage_id: stage, unit_price: 100 }])]);
const project = (await one(owner, `insert into public.projects (project_code, name, location, project_type_id) values ('OK-1', 'Okul 1', 'Rize', $1) returning id`, [typeId])).id;
const prog = (await one(owner, `select id from public.project_stage_progress where project_id = $1`, [project])).id;

const save = (leader, name, date, items) => one(owner, `select public.save_production_entry(null, $1::date, $2, $3, null, $4::jsonb) id`,
  [date, leader, name, JSON.stringify([{ project_id: project, sort_order: 0, items }])]);
const subEntry = (await save(subLeader, "Taşeron Ekip Başı", "2026-09-10", [
  { kind: "stage", progress_id: prog, quantity: 10, sort_order: 0 },
  { kind: "extra", item_name: "Ek kanal", quantity: 1, unit: "iş", unit_price: 200, sort_order: 1 },
])).id;
await save(ownLeader, "Kendi Ekip Başı", "2026-09-10", [{ kind: "stage", progress_id: prog, quantity: 5, sort_order: 0 }]);

const snap = (await sys(`select subcontractor_id, subcontractor_share_percent p from public.production_entries where id = $1`, [subEntry])).rows[0];
check("imalata taşeron ve yüzde işlenir", snap.subcontractor_id === mehmet && Number(snap.p) === 70, JSON.stringify(snap));
check("kendi ekibin imalatı taşerona yazılmaz",
  (await sys(`select count(*)::int n from public.production_entries where subcontractor_id is null`)).rows[0].n === 1);

const statement = async (uid, start = "2026-09-01", end = "2026-09-30") =>
  (await one(uid, `select public.get_subcontractor_statement($1, $2::date, $3::date) r`, [mehmet, start, end])).r;
let st = await statement(acc);
check("işveren tutarı: 10×100 + fiyatlı ek iş 200", Number(st.employer_total) === 1200, st.employer_total);
check("taşeron payı %70", Number(st.share_total) === 840, st.share_total);
check("firmaya kalan %30", Number(st.company_total) === 360, st.company_total);

// Yüzde sonradan değişince geçmiş bozulmaz; aynı imalatı yeniden kaydetmek de bozmaz.
await as(owner, `update public.subcontractors set share_percent = 50 where id = $1`, [mehmet]);
const items = (await sys(`select i.id, i.kind, i.stage_log_id from public.production_items i join public.production_jobs j on j.id = i.production_job_id where j.production_entry_id = $1 order by i.sort_order`, [subEntry])).rows;
await one(owner, `select public.save_production_entry($1, '2026-09-10'::date, $2, 'Taşeron Ekip Başı', null, $3::jsonb) id`, [subEntry, subLeader,
  JSON.stringify([{ project_id: project, sort_order: 0, items: [
    { kind: "stage", item_id: items[0].id, progress_id: prog, quantity: 10, sort_order: 0 },
    { kind: "extra", item_id: items[1].id, item_name: "Ek kanal", quantity: 1, unit: "iş", unit_price: 200, sort_order: 1 },
  ] }])]);
check("yüzde değişince eski imalat eski yüzdeyle kalır", Number((await statement(acc)).share_total) === 840);
const newEntry = (await save(subLeader, "Taşeron Ekip Başı", "2026-09-20", [{ kind: "stage", progress_id: prog, quantity: 2, sort_order: 0 }])).id;
check("yeni imalat yeni yüzdeyle", Number((await sys(`select subcontractor_share_percent p from public.production_entries where id = $1`, [newEntry])).rows[0].p) === 50);
check("dönem toplamı: 840 + 2×100×%50", Number((await statement(acc)).share_total) === 940);

// --- harcama/ödeme ve bakiye ---------------------------------------------------------------------
await as(acc, `insert into public.subcontractor_transactions (subcontractor_id, category_id, transaction_date, amount, notes) values ($1, $2, '2026-09-25', 300, 'Eylül avansı')`, [mehmet, categories[1].id]);
await as(acc, `insert into public.subcontractor_transactions (subcontractor_id, category_id, transaction_date, amount) values ($1, $2, '2026-10-02', 100)`, [mehmet, categories[4].id]);
st = await statement(acc);
check("dönem ödemesi ve bakiye", Number(st.paid_total) === 300 && Number(st.balance) === 640, `${st.paid_total} / ${st.balance}`);
const october = await statement(acc, "2026-10-01", "2026-10-31");
check("sonraki döneme devreden bakiye", Number(october.carried_balance) === 640 && Number(october.balance) === 540, `${october.carried_balance} / ${october.balance}`);
const list = (await one(acc, `select public.list_subcontractors() r`)).r;
check("listede güncel bakiye", Number(list.find((s) => s.id === mehmet).balance) === 540);
const chiefList = (await one(chief, `select public.list_subcontractors() r`)).r;
check("fiyat izni olmayan şef bakiyeyi görmez", chiefList.length === 2 && chiefList.every((s) => s.balance === null));
e = await asErr(chief, `select public.get_subcontractor_statement($1, '2026-09-01', '2026-09-30')`, [mehmet]);
check("fiyat izni olmayan şef ekstreyi göremez", !!e, e);
e = await asErr(chief, `insert into public.subcontractor_transactions (subcontractor_id, category_id, amount) values ($1, $2, 10)`, [mehmet, categories[0].id]);
check("fiyat izni olmayan şef ödeme giremez", !!e, e);

// --- maaş dökümü ayrımı -------------------------------------------------------------------------
await sys(`update public.personnel set monthly_salary = 30000`);
const mainPayroll = (await one(owner, `select public.get_monthly_payroll(2026, 9) r`)).r;
check("ana firma maaş dökümünde taşeron personeli yok", mainPayroll.length === 1 && mainPayroll[0].full_name === "Kendi Ekip Başı", mainPayroll.map((r) => r.full_name).join(", "));
const subPayroll = (await one(owner, `select public.get_monthly_payroll(2026, 9, $1) r`, [mehmet])).r;
check("taşeronun maaş dökümü yalnızca kendi personeli", subPayroll.length === 2 && subPayroll.every((r) => r.full_name.startsWith("Taşeron")));

// --- silme kuralları ------------------------------------------------------------------------------
e = await asErr(owner, `delete from public.subcontractors where id = $1`, [mehmet]);
check("kullanılan taşeron silinemez (pasife alınır)", !!e, e);
e = await asErr(owner, `delete from public.subcontractors where id = $1`, [ahmet]);
check("kullanılmayan taşeron silinir", !e, e);
check("ekip kaydı işlem geçmişine düşer", (await sys(`select count(*)::int n from public.audit_logs where entity_type = 'teams'`)).rows[0].n === 2);
void subTeam; void subWorker;

// --- taşeron personelden açılır; firmanın ödediği maaş alacaktan düşer ---------------------------------
const ahmetP = await person("Ahmet Usta");
const worker1 = await person("Ahmet Ekip İşçi 1");
const worker2 = await person("Ahmet Ekip İşçi 2");
e = await asErr(acc, `select public.set_personnel_subcontractor($1, true, 60)`, [ahmetP]);
check("muhasebe personeli taşeron yapamaz", !!e, e);
const ahmetSub = (await one(chief, `select public.set_personnel_subcontractor($1, true, 60, 'tr12 3456', '1234567890') id`, [ahmetP])).id;
const ahmetRow = (await sys(`select s.name, s.share_percent, s.iban, s.personnel_id, p.subcontractor_id from public.subcontractors s join public.personnel p on p.id = s.personnel_id where s.id = $1`, [ahmetSub])).rows[0];
check("personelden taşeron hesabı açılır", ahmetRow.name === "Ahmet Usta" && Number(ahmetRow.share_percent) === 60 && ahmetRow.iban === "TR123456" && ahmetRow.subcontractor_id === ahmetSub, JSON.stringify(ahmetRow));
await sys(`update public.personnel set subcontractor_id = $1, monthly_salary = 3000 where id = $2`, [ahmetSub, worker1]);
await sys(`update public.personnel set subcontractor_id = $1, monthly_salary = 0 where id = $2`, [ahmetSub, worker2]);
await sys(`update public.personnel set monthly_salary = 0 where id = $1`, [ahmetP]);

// İşçi ekip başıyken imalat taşerona yazılır (ekip tanımı gerekmeden).
const augEntry = (await save(worker1, "Ahmet Ekip İşçi 1", "2026-08-05", [{ kind: "stage", progress_id: prog, quantity: 5, sort_order: 0 }])).id;
check("taşeronun işçisi ekip başıyken imalat taşerona yazılır",
  (await sys(`select subcontractor_id from public.production_entries where id = $1`, [augEntry])).rows[0].subcontractor_id === ahmetSub);
await as(chief, `select public.save_attendance_changes($1::jsonb)`, [JSON.stringify([
  { personnel_id: worker1, attendance_date: "2026-08-03", status: "worked" },
  { personnel_id: worker1, attendance_date: "2026-08-04", status: "worked" },
  { personnel_id: worker2, attendance_date: "2026-08-04", status: "worked" },
])]);
const noPay = (await one(acc, `select public.get_subcontractor_statement($1, '2026-08-01', '2026-08-31') r`, [ahmetSub])).r;
check("ödeme girilmeden hak edilen maaş hesaptan düşmez, ekstrede görünür (2 gün × 3000/30 = 200)",
  Number(noPay.salary_total) === 0 && noPay.salaries.length === 1 && Number(noPay.salaries[0].earned) === 200, JSON.stringify(noPay.salaries));
// Firma işçiye 120 avans verdi, ay sonunda 80 maaş ödedi: toplam 200 taşeron hesabından düşer.
await as(owner, `insert into public.personnel_advances (personnel_id, advance_date, amount, kind) values ($1, '2026-08-10', 120, 'advance'), ($1, '2026-08-31', 80, 'salary')`, [worker1]);
const aug = (await one(acc, `select public.get_subcontractor_statement($1, '2026-08-01', '2026-08-31') r`, [ahmetSub])).r;
check("ekstre: pay 5×100×%60 = 300", Number(aug.share_total) === 300, aug.share_total);
check("ekstre: avans 120 + maaş ödemesi 80 = 200 taşeron hesabından düşer",
  Number(aug.salary_total) === 200 && aug.salaries.length === 1 && Number(aug.salaries[0].advance_paid) === 120 && Number(aug.salaries[0].salary_paid) === 80, JSON.stringify(aug.salaries));
check("ekstre: kalan bakiye 300 − 200", Number(aug.balance) === 100, aug.balance);
const sept = (await one(acc, `select public.get_subcontractor_statement($1, '2026-09-01', '2026-09-30') r`, [ahmetSub])).r;
check("maaş kesintisi sonraki döneme devreder", Number(sept.carried_balance) === 100, sept.carried_balance);

// --- hakediş dönemini kapatma: ekstre saklanır, kapalı döneme kayıt girilemez ----------------------------------
const category0 = (await sys(`select id from public.subcontractor_expense_categories where company_id = $1 order by sort_order limit 1`, [company.id])).rows[0].id;
let closeErr = await asErr(acc, `select public.close_subcontractor_period($1, '2026-08-01', '2099-12-31')`, [ahmetSub]);
check("bitmemiş dönem kapatılamaz", /bitmeden/.test(closeErr ?? ""), closeErr);
closeErr = await asErr(chief, `select public.close_subcontractor_period($1, '2026-08-01', '2026-08-31')`, [ahmetSub]);
check("hakediş yetkisi olmayan dönemi kapatamaz", !!closeErr, closeErr);
const closureId = (await one(acc, `select public.close_subcontractor_period($1, '2026-08-01', '2026-08-31') id`, [ahmetSub])).id;
check("biten dönem kapatılır", !!closureId);
closeErr = await asErr(acc, `select public.close_subcontractor_period($1, '2026-08-15', '2026-09-15')`, [ahmetSub]);
check("kapalı dönemle çakışan dönem kapatılamaz", /kapatılmış/.test(closeErr ?? ""), closeErr);
const saved = (await one(acc, `select statement from public.subcontractor_period_closures where id = $1`, [closureId])).statement;
check("kapanıştaki ekstre saklanır (hakediş 300, personele ödenen 200, bakiye 100)",
  Number(saved.share_total) === 300 && Number(saved.salary_total) === 200 && Number(saved.balance) === 100, JSON.stringify({ s: saved.share_total, p: saved.salary_total, b: saved.balance }));
closeErr = await asErr(acc, `insert into public.subcontractor_transactions (subcontractor_id, category_id, transaction_date, amount) values ($1, $2, '2026-08-20', 10)`, [ahmetSub, category0]);
check("kapalı döneme ödeme girilemez", /kapatıldı/.test(closeErr ?? ""), closeErr);
closeErr = await asErr(owner, `insert into public.personnel_advances (personnel_id, advance_date, amount) values ($1, '2026-08-25', 10)`, [worker1]);
check("kapalı döneme taşeron personeli avansı girilemez", /kapatıldı/.test(closeErr ?? ""), closeErr);
closeErr = await asErr(acc, `insert into public.subcontractor_transactions (subcontractor_id, category_id, transaction_date, amount) values ($1, $2, '2026-09-02', 10)`, [ahmetSub, category0]);
check("açık döneme ödeme girilebilir", !closeErr, closeErr);
closeErr = await asErr(acc, `select public.reopen_subcontractor_period($1)`, [closureId]);
check("yalnızca firma yöneticisi dönemi yeniden açar", !!closeErr, closeErr);
await as(owner, `select public.reopen_subcontractor_period($1)`, [closureId]);
check("yeniden açılınca kayıt girilebilir", !(await asErr(acc, `insert into public.subcontractor_transactions (subcontractor_id, category_id, transaction_date, amount) values ($1, $2, '2026-08-20', 10)`, [ahmetSub, category0])));
await sys(`delete from public.subcontractor_transactions where transaction_date in ('2026-08-20', '2026-09-02') and amount = 10`);

// Dönem kapanınca kalan bakiye sonraki döneme devreder; fazla ödeme devreden borç (eksi bakiye) olur.
await as(owner, `select public.close_subcontractor_period($1, '2026-08-01', '2026-08-31')`, [ahmetSub]);
await as(acc, `insert into public.subcontractor_transactions (subcontractor_id, category_id, transaction_date, amount) values ($1, $2, '2026-09-02', 1000)`, [ahmetSub, category0]);
const septOver = (await one(acc, `select public.get_subcontractor_statement($1, '2026-09-01', '2026-09-30') r`, [ahmetSub])).r;
check("kapalı dönemden kalan bakiye (100) sonraki dönemin devredeni", Number(septOver.carried_balance) === 100, septOver.carried_balance);
check("fazla ödeme eksi bakiye olur (taşeron borçlu)", Number(septOver.balance) < 0, septOver.balance);
const octCarry = (await one(acc, `select public.get_subcontractor_statement($1, '2026-10-01', '2026-10-31') r`, [ahmetSub])).r;
check("eksi bakiye de sonraki döneme devreder", Number(octCarry.carried_balance) === Number(septOver.balance), `${octCarry.carried_balance} / ${septOver.balance}`);
await as(owner, `select public.reopen_subcontractor_period(id) from public.subcontractor_period_closures where subcontractor_id = '${ahmetSub}'`);
await sys(`delete from public.subcontractor_transactions where transaction_date = '2026-09-02' and amount = 1000`);

// Maaşı 0 olan taşeron işçisine de avans verilirse fiilen verilen tutar taşeronun hesabından düşer;
// maaşından fazla avans (personel taşerona borçlu) da böyle düşer.
await as(owner, `insert into public.personnel_advances (personnel_id, advance_date, amount) values ($1, '2026-10-05', 50), ($2, '2026-10-06', 5000)`, [worker2, worker1]);
const oct = (await one(acc, `select public.get_subcontractor_statement($1, '2026-10-01', '2026-10-31') r`, [ahmetSub])).r;
check("maaşı 0 işçiye ve fazla verilen avans taşeron hesabından düşer (50 + 5000)",
  Number(oct.salary_total) === 5050 && oct.salaries.length === 2, JSON.stringify(oct.salaries));
check("taşeron işçisi ana firma maaş dökümünde yok",
  !(await one(owner, `select public.get_monthly_payroll(2026, 8) r`)).r.some((row) => row.personnel_id === worker1));

await as(owner, `update public.personnel set full_name = 'Ahmet Usta Yeni' where id = $1`, [ahmetP]);
check("taşeron adı personel adını izler", (await sys(`select name from public.subcontractors where id = $1`, [ahmetSub])).rows[0].name === "Ahmet Usta Yeni");
const augAttendance = (await one(chief, `select public.get_monthly_attendance(2026, 8) r`)).r.personnel;
const w1 = augAttendance.find((row) => row.id === worker1);
check("puantajda personelin taşeronu döner", w1?.subcontractor_name === "Ahmet Usta Yeni" && w1?.subcontractor_id === ahmetSub, JSON.stringify(w1 && { n: w1.subcontractor_name }));
check("firma personelinde taşeron boş", augAttendance.some((row) => row.id === ownLeader && row.subcontractor_id === null));
// Puantaj ekranı ayın pazarlarını hafta tatili olarak ekler; pazarlar da ücretli olduğu için kesintiye girer.
const augBefore = (await one(acc, `select public.get_subcontractor_statement($1, '2026-08-01', '2026-08-31') r`, [ahmetSub])).r;
check("pazar hafta tatilleri hak edilen maaşa girer", augBefore.salaries.reduce((sum, row) => sum + Number(row.earned), 0) > 200, JSON.stringify(augBefore.salaries));

await as(chief, `select public.set_personnel_subcontractor($1, false)`, [ahmetP]);
const off = (await sys(`select s.is_active, p.subcontractor_id from public.subcontractors s join public.personnel p on p.id = s.personnel_id where s.id = $1`, [ahmetSub])).rows[0];
check("taşeronluk kaldırılınca hesap pasife alınır", off.is_active === false && off.subcontractor_id === null, JSON.stringify(off));
const freed = (await sys(`select count(*)::int n from public.personnel where id in ($1, $2) and subcontractor_id is null`, [worker1, worker2])).rows[0].n;
check("taşeronluk kalkınca işçileri firma personeli olur", freed === 2);
const augAfter = (await one(acc, `select public.get_subcontractor_statement($1, '2026-08-01', '2026-08-31') r`, [ahmetSub])).r;
check("taşeronluk kalksa da geçmiş maaş kesintisi korunur", Number(augAfter.salary_total) === Number(augBefore.salary_total) && Number(augAfter.balance) === Number(augBefore.balance), `${augAfter.salary_total} / ${augAfter.balance}`);
check("firmaya geçen işçi ana maaş dökümünde", (await one(owner, `select public.get_monthly_payroll(2026, 8) r`)).r.some((row) => row.personnel_id === worker1));

// Taşeronun işten çıkışı verilince taşeronluk biter, işçileri firmaya geçer.
const veli = await person("Veli Taşeron");
const veliSub = (await one(chief, `select public.set_personnel_subcontractor($1, true, 50) id`, [veli])).id;
const veliWorker = await person("Veli İşçi", veliSub);
await as(owner, `update public.personnel set is_active = false, employment_end_date = '2026-09-30', termination_reason = 'İş bitti' where id = $1`, [veli]);
const ended = (await sys(`select (select is_active from public.subcontractors where id = $1) a, (select subcontractor_id from public.personnel where id = $2) w`, [veliSub, veliWorker])).rows[0];
check("taşeronun çıkışı verilince taşeronluk biter, işçisi firmaya geçer", ended.a === false && ended.w === null, JSON.stringify(ended));

if (failures) {
  console.log(`\n${failures} kontrol başarısız`);
  process.exit(1);
}
