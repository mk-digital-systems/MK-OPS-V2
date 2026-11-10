// Süper admin: firma sağlığı ve platform işlem geçmişi (silinen firma dahil)
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

const owner = "00000000-0000-0000-0000-000000000001";
const admin = "00000000-0000-0000-0000-000000000009";
await sys(`insert into auth.users (id, email, last_sign_in_at) values ($1, 'owner@x', now() - interval '2 days'), ($2, 'admin@x', now())`, [owner, admin]);
await sys(`insert into public.platform_admins (user_id) values ($1)`, [admin]);
await as(owner, `select public.create_company('Mavi Yapı')`);
const company = (await one(owner, `select public.get_my_company() r`)).r.company;

// Yetki
let e = await asErr(owner, `select public.admin_company_health()`);
check("firma kullanıcısı firma sağlığını göremez", !!e, e);
e = await asErr(owner, `select public.admin_platform_events()`);
check("firma kullanıcısı platform geçmişini göremez", !!e, e);
e = await asErr(owner, `select * from public.platform_events`);
check("platform_events tablosu istemciye kapalı", !!e, e);

// Sağlık
await as(owner, `select public.save_project_type(null, 'Altyapı', null, false, null, null, $1::jsonb)`, [JSON.stringify([{ name: "Kazı", unit: "m" }])]);
let health = (await one(admin, `select public.admin_company_health() r`)).r.find((h) => h.company_id === company.id);
check("sağlık: son giriş ve son hareket dolu", !!health.last_sign_in_at && !!health.last_activity_at, JSON.stringify(health));
check("sağlık: sayılar", Number(health.project_count) === 0 && Number(health.personnel_count) === 0 && Number(health.vehicle_count) === 0);
check("sağlık: son hareket son girişten eski değil", new Date(health.last_activity_at) >= new Date(health.last_sign_in_at));

// Olay kaydı: plan değişikliği
await as(admin, `select public.admin_update_company($1, 'Başlangıç', now() + interval '90 days', 5, now() + interval '2 days', 1, 2, 2, 1)`, [company.id]);
let events = (await one(admin, `select public.admin_platform_events() r`)).r;
let ev = events.find((x) => x.action === "update_company");
check("plan değişikliği kaydedildi (eski → yeni)", ev && ev.company_name === "Mavi Yapı" && ev.actor_email === "admin@x" && ev.details.plan?.new === "Başlangıç" && ev.details.plan?.old === null && ev.details.user_limit?.new === 5, JSON.stringify(ev?.details));
const n0 = events.length;
const cur = (await sys(`select plan_ends_at, trial_ends_at from public.companies where id = $1`, [company.id])).rows[0];
await as(admin, `select public.admin_update_company($1, 'Başlangıç', $2, 5, $3, 1, 2, 2, 1)`, [company.id, cur.plan_ends_at, cur.trial_ends_at]);
events = (await one(admin, `select public.admin_platform_events() r`)).r;
check("değişiklik yoksa kayıt yazılmaz", events.length === n0, `${n0} → ${events.length}`);

// Askıya alma
await as(admin, `select public.admin_set_company_suspended($1, true)`, [company.id]);
await as(admin, `select public.admin_set_company_suspended($1, true)`, [company.id]);
await as(admin, `select public.admin_set_company_suspended($1, false)`, [company.id]);
events = (await one(admin, `select public.admin_platform_events($1) r`, [company.id])).r;
check("askıya alma ve açma birer kez kaydedilir", events.filter((x) => x.action === "suspend_company").length === 1 && events.filter((x) => x.action === "unsuspend_company").length === 1, events.map((x) => x.action).join(","));

// Değiştirilemez
e = await asErr(admin, `update public.platform_events set company_name = 'x'`);
check("kayıt değiştirilemez (yetki ya da tetikleyici)", !!e, e);
e = await sys(`update public.platform_events set company_name = 'x'`).then(() => null, (x) => x.message);
check("sahip rol bile değiştiremez", /değiştirilemez/.test(e ?? ""), e);

// Silme: firma gider, kayıt kalır
e = await asErr(admin, `select public.admin_delete_company($1, 'yanlış')`, [company.id]);
check("yanlış adla silinmez", /aynen/.test(e ?? ""), e);
await as(admin, `select public.admin_delete_company($1, 'Mavi Yapı')`, [company.id]);
check("firma silindi", (await sys(`select count(*)::int n from public.companies where id = $1`, [company.id])).rows[0].n === 0);
events = (await one(admin, `select public.admin_platform_events() r`)).r;
ev = events.find((x) => x.action === "delete_company");
check("silme kaydı firma adı ve yöneticiyle kalır", ev && ev.company_name === "Mavi Yapı" && ev.details.owner_email === "owner@x" && ev.details.user_count === 1, JSON.stringify(ev));
check("silinen firmanın eski kayıtları da durur", events.filter((x) => x.company_id === company.id).length >= 4);
check("filtre: tek firma", (await one(admin, `select public.admin_platform_events($1, 2) r`, [company.id])).r.length === 2);

if (failures) { console.log(`\n${failures} başarısız`); process.exit(1); }
