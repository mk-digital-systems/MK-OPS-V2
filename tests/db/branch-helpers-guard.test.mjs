// V-04: personnel_branch_on / vehicle_branch_on başka firmanın kaydı için şube sızdırmaz
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
const one = async (uid, sql, params) => (await as(uid, sql, params)).rows[0];
const sys = (sql, params) => pg.query(sql, params);

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const [ownerA, ownerB] = [1, 2].map(id);
for (const [i, u] of [ownerA, ownerB].entries()) await sys(`insert into auth.users (id, email) values ($1, $2)`, [u, `u${i}@x`]);
await as(ownerA, `select public.create_company('Alfa Yapı')`);
await as(ownerB, `select public.create_company('Beta Yapı')`);

const personA = (await one(ownerA, `insert into public.personnel (full_name, phone, tc_identity_number, employment_start_date) values ('Veli Usta', '5551112233', '12345678901', current_date) returning id`)).id;
const vehicleA = (await one(ownerA, `insert into public.vehicles (plate, brand, model) values ('14 AB 01', 'Ford', 'Transit') returning id`)).id;
const expectedPerson = (await sys(`select branch_id b from public.personnel where id = $1`, [personA])).rows[0].b;
const expectedVehicle = (await sys(`select branch_id b from public.vehicles where id = $1`, [vehicleA])).rows[0].b;

const pOn = (uid, pid) => one(uid, `select public.personnel_branch_on($1, current_date) b`, [pid]);
const vOn = (uid, vid) => one(uid, `select public.vehicle_branch_on($1, current_date) b`, [vid]);

check("kendi firmasının personeli için şubeyi döndürür", (await pOn(ownerA, personA)).b === expectedPerson && !!expectedPerson);
check("kendi firmasının aracı için şubeyi döndürür", (await vOn(ownerA, vehicleA)).b === expectedVehicle && !!expectedVehicle);
check("başka firmanın personel UUID'si → NULL", (await pOn(ownerB, personA)).b === null);
check("başka firmanın araç UUID'si → NULL", (await vOn(ownerB, vehicleA)).b === null);
check("olmayan UUID → NULL", (await pOn(ownerA, id(999))).b === null && (await vOn(ownerA, id(999))).b === null);
// Kullanıcısız güvenilir bağlam (SQL Editor / service_role) etkilenmez
check("kullanıcısız bağlamda (auth.uid boş) çalışmaya devam eder", (await sys(`select public.personnel_branch_on($1, current_date) b`, [personA])).rows[0].b === expectedPerson);
// anon çalıştıramaz
const anonErr = await pg.transaction(async (tx) => {
  await tx.exec(`set local role anon`);
  return tx.query(`select public.personnel_branch_on($1, current_date)`, [personA]);
}).then(() => null, (e) => e.message);
check("anon çalıştıramaz", !!anonErr, anonErr);
// Mevcut kullanım yolu bozulmadı: puantaj şube günleri
const days = await as(ownerA, `select public.get_attendance_branch_days(extract(year from current_date)::int, extract(month from current_date)::int) r`).then((r) => r.rows[0].r, (e) => e.message);
check("get_attendance_branch_days hâlâ çalışıyor", typeof days !== "string", String(days).slice(0, 120));

if (failures) { console.log(`\n${failures} başarısız`); process.exit(1); }
