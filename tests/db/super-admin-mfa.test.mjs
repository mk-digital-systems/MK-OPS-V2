// Süper admin MFA: doğrulanmış faktörü olan yönetici aal2 olmadan süper admin sayılmaz
import { openDb, applyDir } from "./harness.mjs";

const pg = await openDb();
await applyDir(pg);
let failures = 0;
const check = (name, ok, more = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${more ? ` — ${more}` : ""}`); if (!ok) failures++; };
async function as(uid, sql, params = [], claims = null) {
  return pg.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claims', $2, true)`, [uid, claims ? JSON.stringify({ sub: uid, ...claims }) : ""]);
    await tx.exec(`set local role authenticated`);
    return tx.query(sql, params);
  });
}
const asErr = (uid, sql, params, claims) => as(uid, sql, params, claims).then(() => null, (e) => e);
const one = async (uid, sql, params, claims) => (await as(uid, sql, params, claims)).rows[0];
const sys = (sql, params) => pg.query(sql, params);

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const [owner, admin, admin2] = [1, 9, 10].map(id);
for (const [i, u] of [owner, admin, admin2].entries()) await sys(`insert into auth.users (id, email) values ($1, $2)`, [u, `u${i}@x`]);
await sys(`insert into public.platform_admins (user_id) values ($1), ($2)`, [admin, admin2]);
await as(owner, `select public.create_company('Alfa Yapı')`);

const isAdmin = async (uid, claims) => (await one(uid, `select public.is_super_admin() v`, [], claims)).v;

// --- Faktör yokken hiçbir şey değişmez (geçiş güvenli) --------------------------------------------------
check("faktörü olmayan yönetici (aal1) süper admin", (await isAdmin(admin, { aal: "aal1" })) === true);
check("faktörü olmayan yönetici, claim hiç yokken de süper admin", (await isAdmin(admin)) === true);
check("admin fonksiyonu çalışır", (await asErr(admin, `select public.admin_list_companies()`, [], { aal: "aal1" })) === null);
check("firma kullanıcısı süper admin değil", (await isAdmin(owner, { aal: "aal2" })) === false);

// --- Doğrulanmamış (yarım kalmış) kayıt kilitlemez -------------------------------------------------------------
await sys(`insert into auth.mfa_factors (user_id, status) values ($1, 'unverified')`, [admin]);
check("doğrulanmamış faktör yönetici erişimini kilitlemez", (await isAdmin(admin, { aal: "aal1" })) === true);

// --- Doğrulanmış faktör: aal2 şart --------------------------------------------------------------------------------------
await sys(`update auth.mfa_factors set status = 'verified' where user_id = $1`, [admin]);
check("doğrulanmış faktör + aal1 → süper admin DEĞİL", (await isAdmin(admin, { aal: "aal1" })) === false);
check("doğrulanmış faktör + claim yok → süper admin DEĞİL", (await isAdmin(admin)) === false);
check("doğrulanmış faktör + aal2 → süper admin", (await isAdmin(admin, { aal: "aal2" })) === true);
let e = await asErr(admin, `select public.admin_list_companies()`, [], { aal: "aal1" });
check("aal1 oturum admin fonksiyonunu çalıştıramaz, hata açıklayıcı ve 42501", e && e.code === "42501" && /İki adımlı doğrulama gerekli/.test(e.message) && e.hint === "mfa_required", e?.message);
check("aal2 oturum admin fonksiyonunu çalıştırır", (await asErr(admin, `select public.admin_list_companies()`, [], { aal: "aal2" })) === null);
e = await asErr(admin, `select public.admin_save_official_holiday('Bayram', '2027-03-09', 1)`, [], { aal: "aal1" });
check("aal1 ile yazma işlemi (bayram ekleme) de reddedilir", e && e.hint === "mfa_required", e?.message);
e = await asErr(admin, `select public.admin_save_plan_prices('[]'::jsonb)`, [], { aal: "aal1" });
check("aal1 ile fiyat kaydetme reddedilir", e && e.hint === "mfa_required", e?.message);
e = await asErr(admin, `select public.admin_inbox()`, [], { aal: "aal1" });
check("aal1 ile gelen kutusu da kapalı", e && e.hint === "mfa_required", e?.message);

// --- Diğerleri etkilenmez -------------------------------------------------------------------------------------------------------------
check("faktörü olmayan diğer yönetici etkilenmez", (await isAdmin(admin2, { aal: "aal1" })) === true);
check("başkasının faktörü bu yöneticiyi kilitlemez", (await asErr(admin2, `select public.admin_list_companies()`, [], { aal: "aal1" })) === null);
e = await asErr(owner, `select public.admin_list_companies()`, [], { aal: "aal2" });
check("firma kullanıcısı aal2 olsa bile admin fonksiyonu çalıştıramaz; mesaj MFA değil yetki", e && !e.hint && /süper admin yetkisi/.test(e.message), e?.message);

// --- Faktör kaldırılınca (kurtarma) erişim geri gelir -----------------------------------------------------------------------------------
await sys(`delete from auth.mfa_factors where user_id = $1`, [admin]);
check("kurtarma: faktör silinince aal1 oturumla erişim geri gelir", (await isAdmin(admin, { aal: "aal1" })) === true);

// --- Yetkiler bozulmadı ----------------------------------------------------------------------------------------------------------------
const anonExec = (await sys(`select has_function_privilege('anon', 'public.is_super_admin()', 'execute') a, has_function_privilege('anon', 'public.assert_super_admin()', 'execute') b`)).rows[0];
check("anon is_super_admin / assert_super_admin çalıştıramaz (yetkiler korunur)", !anonExec.a && !anonExec.b, JSON.stringify(anonExec));

if (failures) { console.log(`\n${failures} başarısız`); process.exit(1); }
