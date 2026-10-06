// Firma logosu smoke check
import { openDb, applyDir } from "./harness.mjs";

const pg = await openDb();
await applyDir(pg);
const check = (name, ok, extra = "") => console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
async function as(uid, sql, params = []) {
  return pg.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true)`, [uid]);
    await tx.exec(`set local role authenticated`);
    return tx.query(sql, params);
  });
}
const asErr = (uid, sql, params) => as(uid, sql, params).then(() => null, (e) => e.message);
const one = async (uid, sql, params) => (await as(uid, sql, params)).rows[0];

const chief = "00000000-0000-0000-0000-000000000001";
const manager = "00000000-0000-0000-0000-000000000002";
const other = "00000000-0000-0000-0000-000000000003";
await pg.query(`insert into auth.users (id, email) values ($1, 'a@a'), ($2, 'b@b'), ($3, 'c@c')`, [chief, manager, other]);
await as(chief, `select public.create_company('Deneme Firma')`);
await as(other, `select public.create_company('Başka Firma')`);
const company = (await one(chief, `select public.get_my_company() r`)).r.company;
const otherCompany = (await one(other, `select public.get_my_company() r`)).r.company;
await as(manager, `select public.join_company('Deneme Firma', $1)`, [company.join_code]);
await as(chief, `select public.assign_user_role($1, 'company_manager')`, [manager]);

check("get_my_company has logo_path (null)", "logo_path" in company && company.logo_path === null);
const path = `${company.id}/logo-1.png`;
let e = await asErr(chief, `insert into storage.objects (bucket_id, name, owner_id) values ('company-logos', $1, $2)`, [path, chief]);
check("chief uploads into own folder", !e, e);
e = await asErr(chief, `insert into storage.objects (bucket_id, name, owner_id) values ('company-logos', $1, $2)`, [`${otherCompany.id}/x.png`, chief]);
check("chief cannot upload into other company folder", !!e, e);
e = await asErr(manager, `insert into storage.objects (bucket_id, name, owner_id) values ('company-logos', $1, $2)`, [`${company.id}/m.png`, manager]);
check("manager cannot upload logo", !!e, e);
e = await asErr(manager, `select public.set_company_logo($1)`, [path]);
check("manager cannot set logo", !!e, e);
e = await asErr(chief, `select public.set_company_logo($1)`, [`${otherCompany.id}/x.png`]);
check("chief cannot point to other company's file", !!e, e);
e = await asErr(chief, `select public.set_company_logo($1)`, [path]);
check("chief sets logo", !e, e);
check("logo_path returned", (await one(manager, `select public.get_my_company() r`)).r.company.logo_path === path);
check("other company unaffected", (await one(other, `select public.get_my_company() r`)).r.company.logo_path === null);
const deleted = await as(other, `delete from storage.objects where bucket_id = 'company-logos' and name = $1`, [path]);
check("other company's chief cannot delete logo", deleted.affectedRows === 0);
await as(chief, `select public.set_company_logo(null)`);
check("logo removed", (await one(chief, `select public.get_my_company() r`)).r.company.logo_path === null);
e = await asErr(null, `select 1`).then(() => null);
const anon = await pg.transaction(async (tx) => {
  await tx.exec(`set local role anon`);
  return tx.query(`select public.set_company_logo('x')`).then(() => null, (err) => err.message);
});
check("anon cannot call set_company_logo", !!anon, anon);

// FAIL satırlarını koşturucu yakalar; PGlite süreci açık tutmasın.
process.exit(0);
