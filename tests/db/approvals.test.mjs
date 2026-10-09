// Onaylar: muhasebenin eklediği personel/araç ve ay sonu puantaj onayı
import { openDb, applyDir } from "./harness.mjs";

const pg = await openDb();
await applyDir(pg);

let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
};

async function as(uid, sql, params = []) {
  return pg.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true)`, [uid]);
    await tx.exec(`set local role authenticated`);
    return tx.query(sql, params);
  });
}
const asErr = (uid, sql, params = []) => as(uid, sql, params).then(() => null, (e) => e.message);
const one = async (uid, sql, params) => (await as(uid, sql, params)).rows[0];
const sys = (sql, params = []) => pg.query(sql, params);

// --- kurulum ---------------------------------------------------------------------
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const [owner, chief, acc] = [1, 2, 3].map(id);
for (const [i, u] of [owner, chief, acc].entries()) await sys(`insert into auth.users (id, email) values ($1, $2)`, [u, `u${i}@a`]);
const A = (await sys(`insert into public.companies (name, join_code, owner_user_id) values ('Alfa Yapı', '1234', $1) returning id`, [owner])).rows[0].id;
await sys(`update public.profiles set company_id = $2, role = 'site_chief', is_approved = true, approved_at = now(), approved_by = $1 where id = $1`, [owner, A]);
for (const u of [chief, acc]) await sys(`update public.profiles set company_id = $2 where id = $1`, [u, A]);
await as(owner, `select public.assign_user_role($1, 'company_manager')`, [chief]);
await as(owner, `select public.assign_user_role($1, 'accounting')`, [acc]);

// --- personel onayı ----------------------------------------------------------------
const addPerson = (uid, name) =>
  one(uid, `insert into public.personnel (full_name, employment_start_date) values ($1, '2025-01-01') returning id, approval_status`, [name]);
const approved = await addPerson(chief, "Ali Usta");
check("şefin eklediği personel doğrudan onaylı", approved.approval_status === "approved");
const pending = await addPerson(acc, "Veli Usta");
check("muhasebenin eklediği personel onay bekler", pending.approval_status === "pending");

let e = await asErr(acc, `update public.personnel set phone = '05551112233' where id = $1`, [pending.id]);
check("muhasebe kendi bekleyen kaydını düzeltebilir", !e, e);
e = await asErr(acc, `update public.personnel set approval_status = 'approved' where id = $1`, [pending.id]);
check("onay durumu doğrudan değiştirilemez", /onay işlemiyle/.test(e ?? ""), e);
const accUpdate = await as(acc, `update public.personnel set phone = '1' where id = $1`, [approved.id]);
check("muhasebe onaylı personeli düzenleyemez", accUpdate.affectedRows === 0);

const monthly = async (uid, y, m) => (await one(uid, `select public.get_monthly_attendance($1, $2) r`, [y, m])).r;
const names = (r) => r.personnel.map((p) => p.full_name);
check("bekleyen personel puantajda görünmez", !names(await monthly(chief, 2025, 12)).includes("Veli Usta"));
e = await asErr(chief, `select public.save_attendance_changes($1::jsonb)`, [JSON.stringify([{ personnel_id: pending.id, attendance_date: "2025-12-01", status: "worked" }])]);
check("bekleyen personele puantaj girilemez", /Onay bekleyen/.test(e ?? ""), e);
e = await asErr(chief, `insert into public.personnel_advances (personnel_id, advance_date, amount) values ($1, '2025-12-02', 100)`, [pending.id]);
check("bekleyen personele avans girilemez", /Onay bekleyen/.test(e ?? ""), e);
const payroll = (await one(chief, `select public.get_monthly_payroll(2025, 12) r`)).r;
check("bekleyen personel maaş dökümünde yok", !payroll.some((row) => row.full_name === "Veli Usta"));

const notes = async (uid, type) => (await one(uid, `select public.get_my_notifications() n`)).n.filter((x) => x.type === type);
check("şef onay bekleyen personel bildirimi alır", (await notes(chief, "pending_approval")).some((x) => x.link === "/panel/personnel"));
check("muhasebe onay bildirimi almaz", (await notes(acc, "pending_approval")).length === 0);

e = await asErr(acc, `select public.review_pending_record('personnel', $1, true)`, [pending.id]);
check("muhasebe onay veremez", !!e, e);
e = await asErr(chief, `select public.review_pending_record('personnel', $1, true)`, [pending.id]);
const after = await one(chief, `select approval_status, approved_by from public.personnel where id = $1`, [pending.id]);
check("şef personeli onaylar", !e && after.approval_status === "approved" && after.approved_by === chief, e);
check("onaylanan personel puantajda görünür", names(await monthly(chief, 2025, 12)).includes("Veli Usta"));
e = await asErr(chief, `select public.review_pending_record('personnel', $1, true)`, [pending.id]);
check("onaylı kayıt yeniden onaylanamaz", /bulunamadı/.test(e ?? ""), e);

// --- araç onayı / reddi ------------------------------------------------------------
const vehicle = await one(acc, `insert into public.vehicles (plate, brand, model) values ('17 AB 9', 'Ford', 'Transit') returning id, approval_status`);
check("muhasebenin eklediği araç onay bekler", vehicle.approval_status === "pending");
e = await asErr(chief, `select public.record_vehicle_fuel_purchase($1, current_date, 1000, 40)`, [vehicle.id]);
check("bekleyen araca yakıt girilemez", /Onay bekleyen araç/.test(e ?? ""), e);
e = await asErr(owner, `select public.review_pending_record('vehicle', $1, false)`, [vehicle.id]);
check("firma yöneticisi aracı reddeder (silinir)", !e && (await one(owner, `select count(*)::int n from public.vehicles where id = $1`, [vehicle.id])).n === 0, e);

// --- ay sonu puantaj onayı ----------------------------------------------------------
await as(chief, `select public.save_attendance_changes($1::jsonb)`, [JSON.stringify([{ personnel_id: approved.id, attendance_date: "2025-11-03", status: "worked" }])]);
e = await asErr(acc, `select public.approve_attendance_month(2025, 11)`);
check("muhasebe ayı onaylayamaz", !!e, e);
const future = timezoneToday();
e = await asErr(chief, `select public.approve_attendance_month($1, $2)`, [future.year, future.month]);
check("ay bitmeden onaylanamaz", /Ay bitmeden/.test(e ?? ""), e);
e = await asErr(chief, `select public.approve_attendance_month(2025, 11)`);
check("şef geçmiş ayı onaylar", !e, e);
const approval = (await one(acc, `select public.get_attendance_month_approval(2025, 11) a`)).a;
check("onay bilgisi muhasebeye görünür", approval?.approved_by_name === "u1", JSON.stringify(approval));
e = await asErr(chief, `select public.approve_attendance_month(2025, 11)`);
check("aynı ay iki kez onaylanamaz", /zaten/.test(e ?? ""), e);

e = await asErr(chief, `select public.save_attendance_changes($1::jsonb)`, [JSON.stringify([{ personnel_id: approved.id, attendance_date: "2025-11-04", status: "worked" }])]);
check("onaylı aya puantaj girilemez", /11\.2025 puantajı onaylandı/.test(e ?? ""), e);
e = await asErr(owner, `delete from public.attendance_records where attendance_date = '2025-11-03'`);
const stillThere = (await sys(`select count(*)::int n from public.attendance_records where attendance_date = '2025-11-03'`)).rows[0].n;
check("onaylı aydan puantaj silinemez", !!e && stillThere === 1, e);
e = await asErr(chief, `insert into public.personnel_advances (personnel_id, advance_date, amount) values ($1, '2025-11-10', 100)`, [approved.id]);
check("onaylı aya avans girilemez", /onaylandı/.test(e ?? ""), e);
e = await asErr(chief, `select public.get_monthly_attendance(2025, 11)`);
check("onaylı ay görüntülenebilir (pazar ekleme atlanır)", !e, e);

e = await asErr(chief, `select public.reopen_attendance_month(2025, 11)`);
check("şef onayı kaldıramaz", /yalnızca firma yöneticisi/.test(e ?? ""), e);
e = await asErr(owner, `select public.reopen_attendance_month(2025, 11)`);
check("firma yöneticisi onayı kaldırır", !e, e);
e = await asErr(chief, `select public.save_attendance_changes($1::jsonb)`, [JSON.stringify([{ personnel_id: approved.id, attendance_date: "2025-11-04", status: "worked" }])]);
check("onay kalkınca puantaj düzenlenir", !e, e);
const history = (await sys(`select count(*)::int n, count(reopened_at)::int r from public.attendance_month_approvals`)).rows[0];
check("kaldırılan onay geçmişte kalır", history.n === 1 && history.r === 1, JSON.stringify(history));
e = await asErr(chief, `select public.approve_attendance_month(2025, 11)`);
check("ay yeniden onaylanabilir", !e, e);

check("onay tablosu doğrudan okunamaz", !!(await asErr(owner, `select * from public.attendance_month_approvals`)));

if (failures) {
  console.log(`\n${failures} kontrol başarısız`);
  process.exit(1);
}

function timezoneToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "numeric" }).formatToParts(new Date());
  return { year: Number(parts.find((p) => p.type === "year").value), month: Number(parts.find((p) => p.type === "month").value) };
}
