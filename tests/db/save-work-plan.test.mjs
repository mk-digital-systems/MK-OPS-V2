// V-01: iş planı kaydı atomik — hata halinde eski plan eksiksiz korunur; yetki ve firma ayrımı geçerli
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
const asCode = (uid, sql, params) => as(uid, sql, params).then(() => null, (e) => e.code);
const one = async (uid, sql, params) => (await as(uid, sql, params)).rows[0];
const sys = (sql, params) => pg.query(sql, params);

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const [ownerA, manager, accounting, ownerB] = [1, 2, 3, 4].map(id);
for (const [i, u] of [ownerA, manager, accounting, ownerB].entries()) await sys(`insert into auth.users (id, email) values ($1, $2)`, [u, `u${i}@x`]);
await as(ownerA, `select public.create_company('Alfa Yapı')`);
await as(ownerB, `select public.create_company('Beta Yapı')`);
const compA = (await one(ownerA, `select public.get_my_company() r`)).r.company;
for (const u of [manager, accounting]) await as(u, `select public.join_company('Alfa Yapı', $1)`, [compA.join_code]);
await as(ownerA, `select public.assign_user_role($1, 'company_manager')`, [manager]);
await as(ownerA, `select public.assign_user_role($1, 'accounting')`, [accounting]);

const mkPerson = async (name, tc) => (await one(ownerA, `insert into public.personnel (full_name, phone, tc_identity_number, employment_start_date) values ($1, '5551112233', $2, current_date) returning id`, [name, tc])).id;
const [p1, p2, p3, p4, p5] = [await mkPerson("Ali Usta", "10000000001"), await mkPerson("Veli Usta", "10000000002"), await mkPerson("Can Usta", "10000000003"), await mkPerson("Deniz Usta", "10000000004"), await mkPerson("Ece Usta", "10000000005")];

const member = (pid, name, chief = false) => ({ personnel_id: pid, full_name: name, job_title: "Usta", phone: chief ? "5551112233" : null, is_chief: chief });
const team = (over = {}) => ({
  project_id: null, project_code: "P-1", project_name: "Hat Çekimi", team_type: "Kazı", vehicle_plate: "14 AB 01",
  chief_personnel_id: p1, chief_name: "Ali Usta", chief_phone: "5551112233",
  members: [member(p1, "Ali Usta", true), member(p2, "Veli Usta")], ...over,
});
const planDate = "2099-01-15";
const save = (uid, { planId = null, teams = [team()], absences = [], notes = "not", expected = null, date = planDate } = {}) =>
  as(uid, `select public.save_work_plan($1, $2, null, $3, $4::jsonb, $5::jsonb, $6) id`, [planId, date, notes, JSON.stringify(teams), JSON.stringify(absences), expected]);
const saveErr = (uid, opts) => save(uid, opts).then(() => null, (e) => e);
const snapshot = async (planId) => JSON.stringify({
  plan: (await sys(`select notes, updated_by from public.daily_work_plans where id = $1`, [planId])).rows,
  teams: (await sys(`select id, project_name, vehicle_plate from public.daily_work_plan_teams where plan_id = $1 order by sort_order`, [planId])).rows,
  members: (await sys(`select m.full_name, m.is_chief, m.sort_order from public.daily_work_plan_team_members m join public.daily_work_plan_teams t on t.id = m.team_id where t.plan_id = $1 order by t.sort_order, m.sort_order`, [planId])).rows,
  absences: (await sys(`select personnel_id, status from public.daily_work_plan_absences where work_plan_id = $1 order by personnel_id`, [planId])).rows,
});

// --- Mutlu yol ----------------------------------------------------------------------------
const planId = (await save(ownerA, { absences: [{ personnel_id: p3, full_name: "Can Usta", status: "leave" }] })).rows[0].id;
check("yeni plan oluşturuldu", !!planId);
let counts = (await sys(`select (select count(*) from public.daily_work_plan_teams where plan_id = $1)::int t, (select count(*) from public.daily_work_plan_team_members m join public.daily_work_plan_teams t on t.id = m.team_id where t.plan_id = $1)::int m, (select count(*) from public.daily_work_plan_absences where work_plan_id = $1)::int a`, [planId])).rows[0];
check("1 ekip, 2 üye, 1 izinli yazıldı", counts.t === 1 && counts.m === 2 && counts.a === 1, JSON.stringify(counts));
const before = await snapshot(planId);

// --- Hata enjeksiyonu: eski plan korunmalı (eskiden eski ekipler silinip kayboluyordu) -------------
// 1. ekip geçerli, 2. ekibin telefonu kısıt ihlali (>=7 karakter) → fonksiyon ortasında hata
const bad = await saveErr(ownerA, { planId, notes: "YENİ", teams: [
  team({ project_name: "Yeni Ekip 1", vehicle_plate: "34 ZZ 1", members: [member(p4, "Deniz Usta", true)], chief_personnel_id: p4, chief_name: "Deniz Usta" }),
  team({ project_name: "Yeni Ekip 2", vehicle_plate: "34 ZZ 2", chief_phone: "123", members: [member(p5, "Ece Usta", true)], chief_personnel_id: p5, chief_name: "Ece Usta" }),
] });
check("kısıt ihlali ortada hata verir", !!bad, bad?.message);
check("hata sonrası eski plan, ekipler, üyeler ve izinliler bire bir aynı", (await snapshot(planId)) === before);

// Üye ekleme aşamasında hata (üye adı çok kısa → dwp_members_name)
const bad2 = await saveErr(ownerA, { planId, teams: [team({ members: [member(p1, "Ali Usta", true), member(p2, "V")] })] });
check("üye aşamasındaki hata da her şeyi geri alır", !!bad2 && (await snapshot(planId)) === before, bad2?.message);

// İzinli aşamasında hata (izinli adı çok kısa)
const bad3 = await saveErr(ownerA, { planId, absences: [{ personnel_id: p3, full_name: "C", status: "leave" }] });
check("izinli aşamasındaki hata da her şeyi geri alır", !!bad3 && (await snapshot(planId)) === before, bad3?.message);

// Doğrulama hataları veri yazmadan reddedilir
const cases = [
  ["aynı personel iki ekipte", { teams: [team(), team({ vehicle_plate: "06 X 1", chief_personnel_id: p2, chief_name: "Veli Usta", members: [member(p2, "Veli Usta", true)] })] }, /başka bir ekipte/],
  ["aynı plaka iki ekipte", { teams: [team(), team({ members: [member(p4, "Deniz Usta", true)], chief_personnel_id: p4, chief_name: "Deniz Usta" })] }, /plakalı araç/],
  ["personel hem ekipte hem izinli", { absences: [{ personnel_id: p1, full_name: "Ali Usta", status: "leave" }] }, /hem ekipte hem/],
  ["ekip şefi ilk sırada değil", { teams: [team({ members: [member(p2, "Veli Usta"), member(p1, "Ali Usta", true)] })] }, /ilk sırada/],
  ["ekip yok", { teams: [] }, /En az bir ekip/],
  ["şef telefonu yok", { teams: [team({ chief_phone: "" })] }, /telefon zorunlu/],
];
for (const [name, opts, re] of cases) {
  const e = await saveErr(ownerA, { planId, ...opts });
  check(`reddedilir: ${name}`, !!e && re.test(e.message), e?.message);
}
check("reddedilen denemelerden sonra plan hâlâ aynı", (await snapshot(planId)) === before);

// --- Başarılı güncelleme: eski ekipler değişir ------------------------------------------------------
await save(ownerA, { planId, notes: "güncel", teams: [team({ project_name: "Yeni Hat", members: [member(p1, "Ali Usta", true), member(p4, "Deniz Usta")] })], absences: [] });
const after = (await sys(`select p.notes, (select count(*) from public.daily_work_plan_teams where plan_id = p.id)::int t, (select string_agg(m.full_name, ',' order by m.sort_order) from public.daily_work_plan_team_members m join public.daily_work_plan_teams t on t.id = m.team_id where t.plan_id = p.id) names, (select count(*) from public.daily_work_plan_absences where work_plan_id = p.id)::int a from public.daily_work_plans p where p.id = $1`, [planId])).rows[0];
check("güncelleme: not, ekip, üyeler değişti; izinli temizlendi", after.notes === "güncel" && after.t === 1 && after.names === "Ali Usta,Deniz Usta" && after.a === 0, JSON.stringify(after));

// Aynı tarih/şube için plan id verilmeden kaydedilirse mevcut plan güncellenir (çift plan oluşmaz)
const again = (await save(ownerA, { notes: "tekrar" })).rows[0].id;
check("plan id verilmeden aynı tarihe kayıt mevcut planı günceller", again === planId && (await sys(`select count(*)::int n from public.daily_work_plans where plan_date = $1`, [planDate])).rows[0].n === 1);

// --- Eşzamanlı düzenleme çakışması ----------------------------------------------------------------
const cur = (await sys(`select updated_at from public.daily_work_plans where id = $1`, [planId])).rows[0].updated_at;
const stale = new Date(new Date(cur).getTime() - 60000).toISOString();
const conflict = await saveErr(ownerA, { planId, expected: stale });
check("başkası değiştirdiyse (eski updated_at) çakışma hatası 40001", conflict?.code === "40001", conflict?.message);
const okExpected = await saveErr(ownerA, { planId, expected: new Date(cur).toISOString() });
check("güncel updated_at ile kayıt geçer", okExpected === null, okExpected?.message);

// --- Yetki ve firma ayrımı ------------------------------------------------------------------------
await as(ownerA, `select public.set_company_manager_permission($1, 'work_plans', false)`, [manager]);
let e = await saveErr(manager, { planId });
check("iş planı izni kapalı şantiye şefi kaydedemez", e?.code === "42501", e?.message);
e = await saveErr(accounting, { planId });
check("muhasebe kaydedemez", e?.code === "42501", e?.message);
e = await saveErr(ownerB, { planId });
check("başka firma planı güncelleyemez (plan görünmez)", e?.code === "P0002", e?.message);
e = await saveErr(ownerB, { date: "2099-01-15", teams: [team({ chief_personnel_id: p1, members: [member(p1, "Ali Usta", true)] })] });
check("başka firma, A firmasının personelini plana ekleyemez (firma kapsamlı FK)", !!e, e?.message);
e = await saveErr(ownerB, { date: "2099-01-15", teams: [team({ chief_personnel_id: null, members: [member(null, "Beta Şefi", true)], chief_name: "Beta Şefi" })] });
check("başka firma kendi planını oluşturabilir (ayrı firma, aynı tarih)", e === null, e?.message);
check("her firmanın o tarihte kendi planı var, A'nınki değişmedi", (await sys(`select count(*)::int n from public.daily_work_plans where plan_date = $1 and company_id = $2`, [planDate, compA.id])).rows[0].n === 1 && (await sys(`select count(*)::int n from public.daily_work_plans where plan_date = $1`, [planDate])).rows[0].n === 2);
await as(ownerA, `select public.set_company_manager_permission($1, 'work_plans', true)`, [manager]);
e = await saveErr(manager, { planId });
check("izin açılınca şantiye şefi kaydedebilir", e === null, e?.message);

// anon çalıştıramaz
const anonErr = await pg.transaction(async (tx) => {
  await tx.exec(`set local role anon`);
  return tx.query(`select public.save_work_plan(null, '2099-01-01', null, null, '[]'::jsonb)`);
}).then(() => null, (x) => x.message);
check("anon çalıştıramaz", !!anonErr, anonErr);

// Fonksiyon SECURITY INVOKER (ayrıcalık yükseltmez)
const def = (await sys(`select prosecdef from pg_proc where proname = 'save_work_plan'`)).rows[0];
check("fonksiyon SECURITY INVOKER", def.prosecdef === false);

if (failures) { console.log(`\n${failures} başarısız`); process.exit(1); }
