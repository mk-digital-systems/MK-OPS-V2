// Plan sınırları: süper admin firmaya toplam kullanıcı, rol kotaları ve ek şube sayısı verir; firma aşamaz
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

const ids = ["1", "2", "3", "4", "5", "6", "9"].map((n) => `00000000-0000-0000-0000-00000000000${n}`);
const [owner, u2, u3, u4, u5, u6, admin] = ids;
await sys(`insert into auth.users (id, email) values ${ids.map((_, i) => `($${i + 1}, 'u${i}@x')`).join(", ")}`, ids);
await sys(`insert into public.platform_admins (user_id) values ($1)`, [admin]);
await as(owner, `select public.create_company('Mavi Kentaş Sitesi')`);
const company = (await one(owner, `select public.get_my_company() r`)).r.company;
const join = (u) => as(u, `select public.join_company('Mavi Kentaş Sitesi', $1)`, [company.join_code]);
const setLimits = (args) => asErr(admin, `select public.admin_update_company($1, null, null, $2, now() + interval '30 days', $3, $4, $5, $6)`, [company.id, ...args]);

// Süper admin 5 kullanıcı: 1 firma yöneticisi + 2 şantiye şefi + 2 muhasebe, 1 ek şube
let e = await asErr(owner, `select public.admin_update_company($1, null, null, 5, now(), 1, 2, 2, 1)`, [company.id]);
check("firma kendi sınırını değiştiremez", !!e, e);
e = await setLimits([5, 1, 3, 2, 1]);
check("rol sayıları toplamı toplam kullanıcıyı aşamaz", /aşıyor/.test(e ?? ""), e);
e = await setLimits([5, 1, 2, 2, 1]);
check("süper admin toplam ve rol kotalarını verir", !e, e);
const listed = (await one(admin, `select public.admin_list_companies() r`)).r.find((c) => c.id === company.id);
check("firma listesinde kotalar ve mevcut sayılar", listed.manager_limit === 2 && listed.accounting_limit === 2 && listed.site_chief_limit === 1 && listed.site_chief_count === 1 && listed.branch_limit === 1, JSON.stringify({ m: listed.manager_limit, a: listed.accounting_limit, s: listed.site_chief_limit, c: listed.site_chief_count }));
const mine = (await one(owner, `select public.get_my_company() r`)).r.company;
check("firma kendi kotalarını görür", mine.manager_limit === 2 && mine.branch_limit === 1 && mine.extra_branch_count === 0, JSON.stringify({ m: mine.manager_limit, b: mine.branch_limit }));

// Rol kotası aşılamaz
for (const u of [u2, u3, u4, u5]) await join(u);
await as(owner, `select public.assign_user_role($1, 'company_manager')`, [u2]);
await as(owner, `select public.assign_user_role($1, 'company_manager')`, [u3]);
e = await asErr(owner, `select public.assign_user_role($1, 'company_manager')`, [u4]);
check("şantiye şefi kotası dolunca üçüncü şef atanamaz", /en fazla 2 şantiye şefi/.test(e ?? ""), e);
await as(owner, `select public.assign_user_role($1, 'accounting')`, [u4]);
await as(owner, `select public.assign_user_role($1, 'accounting')`, [u5]);
check("kotası olan roller atanır", (await sys(`select count(*)::int n from public.profiles where company_id = $1 and role = 'accounting'`, [company.id])).rows[0].n === 2);
await join(u6);
e = await asErr(owner, `select public.assign_user_role($1, 'accounting')`, [u6]);
check("toplam kullanıcı dolu / muhasebe kotası dolu", !!e, e);
e = await asErr(owner, `select public.assign_user_role($1, 'site_chief')`, [u6]);
check("firma yöneticisi kotası (1) dolu", !!e, e);

// Kota mevcut kullanıcı sayısının altına inemez
e = await setLimits([5, 1, 1, 2, 1]);
check("kota mevcut şef sayısının altına indirilemez", /kota bunun altına/.test(e ?? ""), e);

// Ek şube sınırı
await as(owner, `insert into public.branches (name, sort_order) values ('Bolu Şubesi', 1)`);
e = await asErr(owner, `insert into public.branches (name, sort_order) values ('Düzce Şubesi', 2)`);
check("ek şube sınırı dolunca şube açılamaz", /en fazla 1 ek şube/.test(e ?? ""), e);
e = await setLimits([5, 1, 2, 2, 0]);
check("şube sınırı açık şube sayısının altına indirilemez", /ek şube açık/.test(e ?? ""), e);
await setLimits([5, 1, 2, 2, 2]);
check("süper admin şube hakkını artırınca yeni şube açılır", !(await asErr(owner, `insert into public.branches (name, sort_order) values ('Düzce Şubesi', 2)`)));

// Yeni firmada varsayılan: yalnızca Merkez
const u7 = "00000000-0000-0000-0000-000000000007";
await sys(`insert into auth.users (id, email) values ($1, 'u7@x')`, [u7]);
await as(u7, `select public.create_company('Yeni Firma')`);
e = await asErr(u7, `insert into public.branches (name, sort_order) values ('Şube', 1)`);
check("yeni firmada ek şube açılamaz (varsayılan 0)", /en fazla 0 ek şube/.test(e ?? ""), e);

console.log(failures ? `\n${failures} kontrol başarısız` : "\nhepsi geçti");
process.exit(failures ? 1 : 0);
