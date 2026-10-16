// Araç kirası ve yakıtı taşeron hesabına: atama geçmişi, yakıt kesintisi, gün oranlı aylık kira, koruma
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

const [owner] = ["00000000-0000-0000-0000-000000000001"];
await sys(`insert into auth.users (id, email) values ($1,'a@a')`, [owner]);
await as(owner, `select public.create_company('Araç Firma')`);

const mehmet = (await one(owner, `insert into public.subcontractors (name, share_percent) values ('Mehmet Altyapı', 70) returning id`)).id;
const subWorker = (await one(owner, `insert into public.personnel (full_name, employment_start_date, subcontractor_id) values ('Taşeron İşçi', '2025-01-01', $1) returning id`, [mehmet])).id;
const ownWorker = (await one(owner, `insert into public.personnel (full_name, employment_start_date) values ('Kendi İşçi', '2025-01-01') returning id`)).id;

// --- kira ve atama geçmişi ----------------------------------------------------------------------
const vehicle = (await one(owner, `insert into public.vehicles (plate, brand, model, monthly_rent) values ('34 TAS 01', 'Ford', 'Transit', 3000) returning id, rent_from`));
check("kira girilince hesap başlangıcı bugün", !!vehicle.rent_from);
const plain = (await one(owner, `insert into public.vehicles (plate, brand, model) values ('34 TAS 02', 'Fiat', 'Doblo') returning id, rent_from`));
check("kirasız araçta hesap başlangıcı yok", plain.rent_from === null);

// Atanmamış araçta yakıt taşerona yazılmaz
await as(owner, `select public.record_vehicle_fuel_purchase($1, current_date, 100, 40, null, null, 50)`, [vehicle.id]);
check("atanmamış aracın yakıtı taşerona yazılmaz", (await sys(`select count(*)::int n from public.subcontractor_transactions where source = 'fuel'`)).rows[0].n === 0);

// Taşeron personeline atanınca yakıt taşeronun hesabına
await as(owner, `update public.vehicles set assigned_personnel_id = $2 where id = $1`, [vehicle.id, subWorker]);
check("atama geçmişe yazılır", (await sys(`select count(*)::int n from public.vehicle_assignment_history where vehicle_id = $1 and end_date is null`, [vehicle.id])).rows[0].n === 1);
const fuel = await one(owner, `select public.record_vehicle_fuel_purchase($1, current_date, 200, 40, null, null, 50) r`, [vehicle.id]);
const tx = (await sys(`select t.amount::float a, t.subcontractor_id, c.name from public.subcontractor_transactions t join public.subcontractor_expense_categories c on c.id = t.category_id where t.source = 'fuel'`)).rows;
check("yakıt 40 lt × 50 = 2000, taşeronun hesabına, 'Araç yakıtı'", tx.length === 1 && tx[0].a === 2000 && tx[0].subcontractor_id === mehmet && tx[0].name === "Araç yakıtı", JSON.stringify(tx));
check("sistem kategorisi 10 sınırına sayılmaz", (await sys(`select count(*)::int n from public.subcontractor_expense_categories where is_system`)).rows[0].n === 1);

// Kendi personeline atalı araç taşerona yazılmaz; fiyatsız yakıt da yazılmaz
await as(owner, `update public.vehicles set assigned_personnel_id = $2 where id = $1`, [plain.id, ownWorker]);
await as(owner, `select public.record_vehicle_fuel_purchase($1, current_date, 10, 30, null, null, 50)`, [plain.id]);
await as(owner, `select public.record_vehicle_fuel_purchase($1, current_date, 300, 10)`, [vehicle.id]);
check("firma personelindeki araç ve fiyatsız yakıt yazılmaz", (await sys(`select count(*)::int n from public.subcontractor_transactions where source = 'fuel'`)).rows[0].n === 1);

// Yakıt kaydı değişince / silinince kesinti düzelir
const logId = (await sys(`select id from public.vehicle_fuel_logs where unit_price = 50 and vehicle_id = $1`, [vehicle.id])).rows[0].id;
await sys(`update public.vehicle_fuel_logs set liters = 20 where id = $1`, [logId]);
check("yakıt düzeltilince kesinti güncellenir (20 × 50)", Number((await sys(`select amount from public.subcontractor_transactions where fuel_log_id = $1`, [logId])).rows[0].amount) === 1000);

// Elle değiştirilemez
let e = await asErr(owner, `update public.subcontractor_transactions set amount = 1 where source = 'fuel'`);
check("araçtan doğan kesinti elle değiştirilemez", /araç kaydından/.test(e ?? ""), e);
e = await asErr(owner, `delete from public.subcontractor_transactions where source = 'fuel'`);
check("araçtan doğan kesinti elle silinemez", /araç kaydından/.test(e ?? ""), e);
const category = (await one(owner, `select id from public.subcontractor_expense_categories where name = 'Avans'`)).id;
e = await asErr(owner, `insert into public.subcontractor_transactions (subcontractor_id, category_id, amount) values ($1, $2, 500)`, [mehmet, category]);
check("elle ödeme/harcama girişi sürer", !e, e);
await sys(`delete from public.vehicle_fuel_logs where id = $1`, [logId]);
check("yakıt kaydı silinince kesinti de silinir", (await sys(`select count(*)::int n from public.subcontractor_transactions where fuel_log_id = $1`, [logId])).rows[0].n === 0);

// --- aylık kira: gün oranıyla, biten aylar ------------------------------------------------------
// Atama ve kira başlangıcını geçmişe çek: Ağustos'ta 11. günden beri taşeron personelinde.
await sys(`update public.vehicle_assignment_history set start_date = '2026-08-11' where vehicle_id = $1 and end_date is null`, [vehicle.id]);
await sys(`update public.vehicles set rent_from = '2026-08-01' where id = $1`, [vehicle.id]);
const first = (await one(owner, `select public.charge_vehicle_rent() n`)).n;
const rents = (await sys(`select to_char(rent_month, 'YYYY-MM') m, amount::float a, transaction_date::text d from public.subcontractor_transactions where source = 'rent' order by rent_month`)).rows;
check("biten aylara kira yazılır (Ağustos 21/31 gün, Eylül tam)", first === rents.length && rents.length >= 2 && rents[0].m === "2026-08" && rents[0].a === 2032.26 && rents[1].a === 3000, JSON.stringify(rents));
check("kira ay sonu tarihiyle yazılır", rents[0].d === "2026-08-31" && rents[1].d === "2026-09-30");
check("içinde bulunulan ay yazılmaz", !rents.some((r) => r.m === new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" }).slice(0, 7)));
check("aynı ay iki kez yazılmaz", (await one(owner, `select public.charge_vehicle_rent() n`)).n === 0);

// Taşeron ekstresinde kategori olarak görünür
const stmt = (await one(owner, `select public.get_subcontractor_statement($1, '2026-08-01', '2026-09-30') r`, [mehmet])).r;
check("ekstrede 'Araç kirası' kategorisi ve bakiyeden düşüş", stmt.by_category.some((c) => c.category_name === "Araç kirası") && Number(stmt.balance) < 0, JSON.stringify(stmt.by_category));

// Atama kalkınca geçmiş kapanır
await as(owner, `update public.vehicles set assigned_personnel_id = null where id = $1`, [vehicle.id]);
check("atama kalkınca geçmiş kapanır", (await sys(`select count(*)::int n from public.vehicle_assignment_history where vehicle_id = $1 and end_date is null`, [vehicle.id])).rows[0].n === 0);

console.log(failures ? `\n${failures} kontrol başarısız` : "\nhepsi geçti");
process.exit(failures ? 1 : 0);
