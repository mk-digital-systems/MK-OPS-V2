// Resmi tatiller: RT pazar gibi ödenir (+1 mesai), pazar/tatilde izinli ücretsiz, geçmiş hesaplar değişmez
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

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const [owner, admin] = [1, 9].map(id);
for (const [i, u] of [owner, admin].entries()) await sys(`insert into auth.users (id, email) values ($1, $2)`, [u, `u${i}@x`]);
await sys(`insert into public.platform_admins (user_id) values ($1)`, [admin]);
await as(owner, `select public.create_company('Alfa Yapı')`);

// --- Tatil takvimi ------------------------------------------------------------------------------
const is = async (d) => (await one(owner, `select public.is_official_holiday($1::date) v`, [d])).v;
check("1 Ocak 2027 resmi tatil (sabit)", (await is("2027-01-01")) === true);
check("23 Nisan, 1 Mayıs, 19 Mayıs, 15 Temmuz, 30 Ağustos, 29 Ekim 2027 resmi tatil", (await Promise.all(["2027-04-23", "2027-05-01", "2027-05-19", "2027-07-15", "2027-08-30", "2027-10-29"].map(is))).every(Boolean));
check("sıradan gün tatil değil", (await is("2027-01-02")) === false);
check("yürürlük tarihinden önceki tatil sayılmaz (geçmiş hesaplar korunur): 29 Ekim 2026", (await is("2026-10-29")) === false);
const list27 = (await one(owner, `select public.list_official_holidays(2027) r`)).r;
check("2027 listesinde 7 sabit tatil", list27.length === 7 && list27.every((h) => h.kind === "fixed"), String(list27.length));
check("2026 listesi yürürlükten önceki sabit tatilleri içermez", (await one(owner, `select public.list_official_holidays(2026) r`)).r.length === 0);

// Pazar da dinlenme günü
check("pazar dinlenme günü", (await one(owner, `select public.is_rest_day('2027-01-03') v`)).v === true);
check("cuma (tatil değil) dinlenme günü değil", (await one(owner, `select public.is_rest_day('2027-01-08') v`)).v === false);

// --- Bayram ekleme: yalnızca süper admin ----------------------------------------------------------
let e = await asErr(owner, `select public.admin_save_official_holiday('Ramazan Bayramı', '2027-03-09', 3)`);
check("firma yöneticisi bayram ekleyemez", /süper admin/i.test(e ?? ""), e);
e = await asErr(admin, `select public.admin_save_official_holiday('Ramazan Bayramı', '2027-03-09', 9)`);
check("gün sayısı 1-5 dışında reddedilir", /1 ile 5/.test(e ?? ""), e);
e = await asErr(admin, `select public.admin_save_official_holiday('R', '2027-03-09', 3)`);
check("çok kısa ad reddedilir", /2-80/.test(e ?? ""), e);
const added = (await one(admin, `select public.admin_save_official_holiday('Ramazan Bayramı', '2027-03-09', 3) n`)).n;
check("3 günlük bayram eklenir", added === 3, String(added));
check("bayram günleri tatil", (await Promise.all(["2027-03-09", "2027-03-10", "2027-03-11"].map(is))).every(Boolean) && (await is("2027-03-12")) === false);
const list27b = (await one(owner, `select public.list_official_holidays(2027) r`)).r;
check("liste artık 10 tatil (7 sabit + 3 bayram)", list27b.length === 10 && list27b.filter((h) => h.kind === "movable").length === 3);
e = await asErr(owner, `insert into public.official_holidays (holiday_date, name) values ('2027-06-01', 'Sahte')`);
check("firma tabloya doğrudan yazamaz", !!e, e);
e = await asErr(owner, `select public.admin_delete_official_holiday('2027-03-09')`);
check("firma bayram silemez", /süper admin/i.test(e ?? ""), e);

// --- Puantaj ve bordro ---------------------------------------------------------------------------------
// Puantaj gelecek tarihe girilemez; test saati 10 Kasım 2026 olduğu için geçmiş dönem (Mayıs 2026) kullanılır.
const personId = (await one(owner, `insert into public.personnel (full_name, phone, tc_identity_number, employment_start_date, monthly_salary) values ('Veli Usta', '5551112233', '12345678901', '2026-01-01', 30000) returning id`)).id;
const save = (changes) => asErr(owner, `select public.save_attendance_changes($1::jsonb)`, [JSON.stringify(changes.map(([d, s]) => ({ personnel_id: personId, attendance_date: d, status: s })))]);
const payrollRow = async (y, m) => (await one(owner, `select public.get_monthly_payroll($1, $2) r`, [y, m])).r.find((r) => r.full_name === "Veli Usta");

// Yürürlük tarihi (2026-11-11) öncesi: 1 Mayıs 2026 tatil SAYILMAZ, geçmiş hesap eskisi gibi kalır
await save([["2026-05-01", "worked"], ["2026-05-04", "worked"]]);
let past = await payrollRow(2026, 5);
check("yürürlük öncesi tatilde çalışma eskisi gibi normal gün (mesai yok): geçmiş bordro korunur", past.worked_days === 2 && past.overtime_days === 0, JSON.stringify({ w: past.worked_days, o: past.overtime_days }));
e = await save([["2026-05-01", "weekly_rest"]]);
check("yürürlük öncesi tatil günü RT kaydedilemez (eski kural: yalnızca pazar)", /pazar veya resmi tatil/.test(e ?? ""), e);
await save([["2026-05-01", null], ["2026-05-04", null]]);

// Testte yürürlük tarihini öne çek (yalnızca bu test veritabanında)
await sys(`create or replace function public.official_holiday_effective_from() returns date language sql immutable set search_path = public as $$ select date '2026-01-01' $$`);
await as(admin, `select public.admin_save_official_holiday('Kurban Bayramı', '2026-05-27', 4)`);

e = await save([["2026-05-08", "weekly_rest"]]);
check("sıradan günde (cuma) hafta tatili/RT kaydedilemez", /pazar veya resmi tatil/.test(e ?? ""), e);
e = await save([["2026-05-01", "weekly_rest"]]);
check("resmi tatilde RT (weekly_rest) kaydedilebilir", e === null, e);
e = await save([["2026-05-28", "weekly_rest"]]);
check("bayram gününde RT kaydedilebilir", e === null, e);
e = await save([["2026-05-03", "leave"], ["2026-05-10", "leave"]]);
check("pazar günü İzinli kaydedilebilir", e === null, e);
e = await save([["2026-05-29", "leave"]]);
check("resmi tatil gününde İzinli kaydedilebilir", e === null, e);
await save([["2026-05-28", null], ["2026-05-29", null]]);

// Mayıs 2026: 4 normal gün çalıştı (4-7 May), 1 May RT (çalışmadı, ödenir), 3 ve 10 May pazar İZİNLİ (ücretsiz)
await save([["2026-05-04", "worked"], ["2026-05-05", "worked"], ["2026-05-06", "worked"], ["2026-05-07", "worked"]]);
let p = await payrollRow(2026, 5);
check("RT çalışılmasa da ödenir, pazar izinli ücretsiz: çalışılan 4, dinlenme günü 1, mesai 0, ödenen 5", p.worked_days === 4 && p.weekly_rest_days === 1 && p.overtime_days === 0 && p.payable_days === 5, JSON.stringify({ w: p.worked_days, r: p.weekly_rest_days, o: p.overtime_days, p: p.payable_days }));

// Tatilde çalıştı: 1 May "worked" => 1 dinlenme günü + 1 mesai
await save([["2026-05-01", "worked"]]);
p = await payrollRow(2026, 5);
check("tatilde çalışılırsa +1 mesai: dinlenme günü 1, mesai 1, ödenen 4+1+1 = 6", p.worked_days === 4 && p.weekly_rest_days === 1 && p.overtime_days === 1 && p.payable_days === 6, JSON.stringify({ w: p.worked_days, r: p.weekly_rest_days, o: p.overtime_days, p: p.payable_days }));

// Pazar çalıştı (mevcut kural aynı)
await save([["2026-05-03", "worked"]]);
p = await payrollRow(2026, 5);
check("pazar çalışması da +1 mesai (kural korunuyor): dinlenme günü 2, mesai 2, ödenen 8", p.weekly_rest_days === 2 && p.overtime_days === 2 && p.payable_days === 8, JSON.stringify({ r: p.weekly_rest_days, o: p.overtime_days, p: p.payable_days }));

// Tatil çalışılmadı (RT) + pazar izinli: izinli pazar ücretsiz
await save([["2026-05-01", "weekly_rest"], ["2026-05-03", "leave"]]);
p = await payrollRow(2026, 5);
check("tatil RT + pazar izinli: ödenen 5 (izinli pazar sayılmaz)", p.payable_days === 5 && p.weekly_rest_days === 1 && p.overtime_days === 0, JSON.stringify({ p: p.payable_days }));

// Tatil bir PAZARA denk gelirse tek dinlenme günü sayılır (çifte sayım yok)
await sys(`insert into public.official_holidays (holiday_date, name) values ('2026-05-10', 'Pazara denk gelen tatil')`);
await save([["2026-05-10", "worked"]]);
p = await payrollRow(2026, 5);
check("pazara denk gelen tatilde çalışma tek +1 mesai (çifte sayım yok): dinlenme günü 2 (1 Mayıs RT + 10 Mayıs), mesai 1", p.overtime_days === 1 && p.weekly_rest_days === 2, JSON.stringify({ r: p.weekly_rest_days, o: p.overtime_days }));

// Brüt formülü korunuyor
check("brüt hesap formülü korunuyor (maaş/30 x (çalışılan + dinlenme günü))", Math.abs(Number(p.gross_accrued) - (30000 / 30) * (p.worked_days + p.weekly_rest_days)) < 0.01, String(p.gross_accrued));

// --- Otomatik üretim fonksiyonları dinlenme günü kuralını kullanıyor ----------------------------------------
const def = async (n) => (await sys(`select pg_get_functiondef(p.oid) d from pg_proc p where pronamespace = 'public'::regnamespace and proname = $1`, [n])).rows[0].d;
check("ensure_sunday_attendance_for_month tatilleri de üretir (is_rest_day)", /is_rest_day\(generated_date/.test(await def("ensure_sunday_attendance_for_month")));
check("ensure_current_sunday_attendance bugün tatilse çalışır (is_rest_day)", /is_rest_day\(current_date/.test(await def("ensure_current_sunday_attendance")));
const leftovers = (await sys(`select p.proname from pg_proc p where pronamespace = 'public'::regnamespace and proname in ('ensure_current_sunday_attendance','ensure_sunday_attendance_for_month','get_attendance_month_archives','get_monthly_payroll','get_personnel_attendance_detail','subcontractor_salary_rows','validate_attendance_date_and_weekly_rest') and pg_get_functiondef(p.oid) ~* 'isodow[^)]*\\)\\s*(=|<>)\\s*7'`)).rows;
check("güncellenen 7 fonksiyonda artık sabit 'pazar mı?' kontrolü kalmadı", leftovers.length === 0, leftovers.map((r) => r.proname).join(", "));

// anon çalıştıramaz
const anonErr = await pg.transaction(async (tx) => { await tx.exec(`set local role anon`); return tx.query(`select public.is_rest_day('2027-01-01')`); }).then(() => null, (x) => x.message);
check("anon yardımcıları çalıştıramaz", !!anonErr, anonErr);

if (failures) { console.log(`\n${failures} başarısız`); process.exit(1); }
