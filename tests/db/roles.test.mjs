// Rol yapısı: Firma Yöneticisi / Şantiye Şefi / Muhasebe yetkileri
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
const assign = (by, user, role) => asErr(by, `select public.assign_user_role($1, $2)`, [user, role]);
const can = async (uid, module) => (await one(uid, `select public.has_module_write_permission($1) ok`, [module])).ok;

// --- kurulum ---------------------------------------------------------------------
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const [owner, fy2, chief, acc, joiner, chief2, rejected, extra1, extra2, extra3] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(id);
for (const [i, u] of [owner, fy2, chief, acc, joiner, chief2, rejected, extra1, extra2, extra3].entries()) {
  await sys(`insert into auth.users (id, email) values ($1, $2)`, [u, `u${i}@a`]);
}
const A = (await sys(`insert into public.companies (name, join_code, owner_user_id) values ('Alfa Yapı', '1234', $1) returning id`, [owner])).rows[0].id;
await sys(`update public.profiles set company_id = $2, role = 'site_chief', is_approved = true, approved_at = now(), approved_by = $1 where id = $1`, [owner, A]);
for (const u of [fy2, chief, acc, joiner, chief2, rejected, extra1, extra2, extra3]) {
  await sys(`update public.profiles set company_id = $2 where id = $1`, [u, A]);
}

// --- Firma Yöneticisi ------------------------------------------------------------------
let e = await assign(owner, fy2, "site_chief");
check("firma yöneticisi ikinci bir firma yöneticisi atayabilir", !e, e);
check("iki firma yöneticisi var", (await sys(`select count(*)::int n from public.profiles where company_id = $1 and role = 'site_chief'`, [A])).rows[0].n === 2);
e = await assign(fy2, owner, "company_manager");
check("kurucunun rolü değiştirilemez", /kuran/i.test(e ?? ""), e);
e = await assign(owner, owner, "company_manager");
check("kimse kendi rolünü değiştiremez", !!e, e);
e = await sys(`delete from public.profiles where id = $1`, [owner]).then(() => null, (x) => x.message);
check("kurucu hesap silinemez", /silinemez/i.test(e ?? ""), e);
check("ikinci firma yöneticisi bütün modüllerde yetkili", (await can(fy2, "hakedis")) && (await can(fy2, "attendance")));

// --- Şantiye Şefi ----------------------------------------------------------------------
e = await assign(owner, chief, "company_manager");
check("firma yöneticisi şantiye şefi atar", !e, e);
check("şef varsayılan olarak operasyon modüllerinde yetkili",
  (await can(chief, "projects")) && (await can(chief, "work_plans")) && (await can(chief, "attendance"))
  && (await can(chief, "personnel")) && (await can(chief, "inventory")) && (await can(chief, "productions")));
check("şef fiyat/hakediş yetkisini varsayılan olarak almaz", !(await can(chief, "hakedis")));
check("şef firmadaki kullanıcıları görür", (await one(chief, `select count(*)::int n from public.profiles`)).n === 10);

e = await assign(chief, acc, "accounting");
check("şef katılım isteğini muhasebe olarak onaylar", !e, e);
e = await assign(chief, joiner, "company_manager");
check("şef şantiye şefi atayamaz", !!e, e);
e = await assign(chief, joiner, "site_chief");
check("şef firma yöneticisi atayamaz", !!e, e);
e = await assign(chief, fy2, "pending");
check("şef firma yöneticisinin erişimini kaldıramaz", !!e, e);
e = await assign(owner, chief2, "company_manager");
check("ikinci şef atandı", !e, e);
e = await assign(chief, chief2, "accounting");
check("şef başka bir şefin rolünü değiştiremez", !!e, e);
e = await asErr(chief, `select public.set_company_manager_permission($1, 'hakedis', true)`, [acc]);
check("şef modül yetkisi veremez", !!e, e);
e = await asErr(chief, `select public.reject_join_request($1)`, [rejected]);
check("şef katılım isteğini reddeder", !e && (await sys(`select company_id from public.profiles where id = $1`, [rejected])).rows[0].company_id === null, e);

e = await asErr(owner, `select public.set_company_manager_permission($1, 'hakedis', true)`, [chief]);
check("firma yöneticisi şefe fiyat izni verir", !e && (await can(chief, "hakedis")), e);

// --- Muhasebe ----------------------------------------------------------------------------
check("muhasebe hakediş ve fiyatları görür", await can(acc, "hakedis"));
check("muhasebe varsayılan olarak araç/personel işlemi yapamaz", !(await can(acc, "vehicles")) && !(await can(acc, "personnel")));
await as(owner, `insert into public.vehicles (plate, brand, model) values ('17 AB 1', 'Ford', 'Transit')`);
check("muhasebe araçları görür", (await one(acc, `select count(*)::int n from public.vehicles`)).n === 1);
e = await asErr(acc, `insert into public.vehicles (plate, brand, model) values ('17 AB 2', 'Fiat', 'Doblo')`);
check("muhasebe izinsiz araç ekleyemez", !!e, e);
const unit = (await sys(`select (enum_range(null::public.inventory_unit))[1]::text u`)).rows[0].u;
const catalog = (await one(owner, `select public.create_inventory_catalog_material('Kablo', null, null, null, $1::public.inventory_unit, false) id`, [unit])).id;
e = await asErr(acc, `select public.create_inventory_receipt(current_date, 'Muhasebe', 'IRS-9', null, $1::jsonb)`, [JSON.stringify([{ catalog_id: catalog, quantity: 5 }])]);
check("muhasebe irsaliye teslim alır", !e, e);
check("muhasebe malzeme stokunu görür", (await one(acc, `select count(*)::int n from public.inventory_materials`)).n === 1);
check("muhasebe stok hareketlerini görür", (await one(acc, `select count(*)::int n from public.inventory_movements`)).n === 1);
e = await asErr(acc, `select public.assign_user_role($1, 'accounting')`, [joiner]);
check("muhasebe kullanıcı onaylayamaz", !!e, e);
check("muhasebe diğer kullanıcıları görmez", (await one(acc, `select count(*)::int n from public.profiles`)).n === 1);

// --- Firma bilgisi ve bildirimler -----------------------------------------------------------
const company = async (uid) => (await one(uid, `select public.get_my_company() c`)).c.company;
check("şef katılım kodunu görür", (await company(chief)).join_code === "1234");
check("muhasebe katılım kodunu görmez", (await company(acc)).join_code === null);
check("kurucu bilgisi döner", (await company(acc)).primary_manager_id === owner);
const joinNotes = async (uid) => (await one(uid, `select public.get_my_notifications() n`)).n.filter((x) => x.type === "join_request").length;
const pendingCount = (await sys(`select count(*)::int n from public.profiles where company_id = $1 and not is_approved`, [A])).rows[0].n;
check("şef her katılım isteği için bildirim alır", pendingCount > 0 && (await joinNotes(chief)) === pendingCount);
check("muhasebe katılım isteği bildirimi almaz", (await joinNotes(acc)) === 0);

// --- Sınırlar ------------------------------------------------------------------------------
e = (await assign(owner, extra1, "company_manager")) ?? (await assign(owner, extra2, "company_manager"));
check("3'ten fazla şantiye şefi atanabilir", !e, e);
e = await assign(owner, fy2, "company_manager");
check("kurucu olmayan firma yöneticisi şefe çevrilebilir", !e, e);
check("şefe çevrilen eski yöneticinin hakediş izni yok", !(await can(fy2, "hakedis")));
const approved = (await sys(`select count(*)::int n from public.profiles where company_id = $1 and is_approved`, [A])).rows[0].n;
await sys(`update public.companies set user_limit = $2 where id = $1`, [A, approved]);
e = await assign(owner, extra3, "accounting");
check("paketin kullanıcı limiti uygulanır", /limit/i.test(e ?? ""), e);

if (failures) {
  console.log(`\n${failures} kontrol başarısız`);
  process.exit(1);
}
