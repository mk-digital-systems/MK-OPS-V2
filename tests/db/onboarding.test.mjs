// Company signup / join / access tests
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
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', $2, true)`,
      [uid ?? "", uid ? "authenticated" : "anon"]);
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    return tx.query(sql, params);
  });
}
const asErr = (uid, sql, params) => as(uid, sql, params).then(() => null, (e) => e.message);
const one = async (uid, sql, params) => (await as(uid, sql, params)).rows[0];
const sys = (sql, params = []) => pg.query(sql, params);
const profile = async (u) => (await sys(`select role, is_approved, company_id from public.profiles where id = $1`, [u])).rows[0];

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const [chief, guesser, joiner, quitter, rejected, other, superAdmin, extra] = [1, 2, 3, 4, 5, 6, 7, 8].map(id);
for (const u of [chief, guesser, joiner, quitter, rejected, other, superAdmin, extra]) {
  await sys(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{"full_name":"Test Kişi"}')`, [u, `${u}@x.com`]);
}
await sys(`insert into public.platform_admins (user_id) values ($1)`, [superAdmin]);

// --- create ----------------------------------------------------------------------
const created = (await one(chief, `select public.create_company('  Alfa   Telekom ') r`)).r;
check("create_company returns trial company", created.company?.access_status === "trial" && created.company.name === "Alfa Telekom", JSON.stringify(created.company));
const code = created.company.join_code;
check("founder sees 4-digit join code", /^[0-9]{4}$/.test(code ?? ""), code);
const p = await profile(chief);
check("founder is approved site chief of the company", p.role === "site_chief" && p.is_approved && p.company_id === created.company.id);
const hours = (new Date(created.company.trial_ends_at) - Date.now()) / 36e5;
check("trial lasts 48 hours", hours > 47.9 && hours <= 48, hours.toFixed(2));
let e = await asErr(chief, `select public.create_company('Başka Şirket')`);
check("user with a company cannot create another", !!e, e);
e = await asErr(other, `select public.create_company('alfa telekom')`);
check("duplicate company name rejected", !!e && /zaten kayıtlı/.test(e), e);
e = await asErr(superAdmin, `select public.create_company('Admin AŞ')`);
check("super admin cannot create company", !!e, e);
e = await asErr(null, `select public.create_company('Anon AŞ')`);
check("anon cannot create company", !!e, e);
check("super admin flag in get_my_company", (await one(superAdmin, `select public.get_my_company() r`)).r.is_super_admin === true);

// --- join ------------------------------------------------------------------------
const wrong = code === "0000" ? "1111" : "0000";
let last;
for (let i = 0; i < 5; i++) last = (await one(guesser, `select public.join_company('Alfa Telekom', $1) r`, [wrong])).r;
check("wrong code rejected", last.ok === false && /hatalı/.test(last.error), last.error);
last = (await one(guesser, `select public.join_company('Alfa Telekom', $1) r`, [code])).r;
check("6th attempt blocked even with right code", last.ok === false && /Çok fazla/.test(last.error), last.error);
check("rate-limited user still without company", (await profile(guesser)).company_id === null);

last = (await one(joiner, `select public.join_company(' alfa  telekom ', $1) r`, [code])).r;
check("join with case/space-insensitive name", last.ok === true && last.company_name === "Alfa Telekom", JSON.stringify(last));
const jp = await profile(joiner);
check("joiner is pending in the company", jp.role === "pending" && !jp.is_approved && jp.company_id === created.company.id);
const jc = (await one(joiner, `select public.get_my_company() r`)).r.company;
check("pending user sees company name but not join code", jc.name === "Alfa Telekom" && jc.join_code === null);
check("pending user sees no company data", (await one(joiner, `select count(*)::int n from public.personnel`)).n === 0);
check("chief sees join request", (await one(chief, `select count(*)::int n from public.profiles where role = 'pending'`)).n === 1);
e = await asErr(chief, `select public.assign_user_role($1, 'accounting')`, [joiner]);
check("chief approves joiner", !e && (await profile(joiner)).is_approved, e);

await one(quitter, `select public.join_company('Alfa Telekom', $1) r`, [code]);
e = await asErr(quitter, `select public.leave_pending_company()`);
check("pending user can cancel own request", !e && (await profile(quitter)).company_id === null, e);
e = await asErr(joiner, `select public.leave_pending_company()`);
check("approved user cannot use cancel", !!e, e);

await one(rejected, `select public.join_company('Alfa Telekom', $1) r`, [code]);
e = await asErr(other, `select public.reject_join_request($1)`, [rejected]);
check("non-chief cannot reject", !!e, e);
e = await asErr(chief, `select public.reject_join_request($1)`, [rejected]);
check("chief rejects request", !e && (await profile(rejected)).company_id === null, e);

// --- user limit --------------------------------------------------------------------
await sys(`update public.companies set user_limit = 2 where id = $1`, [created.company.id]);
await one(extra, `select public.join_company('Alfa Telekom', $1) r`, [code]);
e = await asErr(chief, `select public.assign_user_role($1, 'company_manager')`, [extra]);
check("approval blocked by plan user limit", !!e && /kullanıcı limitine/.test(e), e);
await sys(`update public.companies set user_limit = null where id = $1`, [created.company.id]);

// --- access status --------------------------------------------------------------------
await as(chief, `insert into public.personnel (full_name) values ('Ali Usta')`);
await sys(`update public.companies set trial_ends_at = now() - interval '1 minute' where id = $1`, [created.company.id]);
const exp = (await one(chief, `select public.get_my_company() r`)).r.company;
check("expired trial reported", exp.access_status === "expired");
check("expired company data hidden", (await one(chief, `select count(*)::int n from public.personnel`)).n === 0);
e = await asErr(chief, `insert into public.personnel (full_name) values ('Veli')`);
check("expired company cannot write", !!e, e);
check("expired company user still sees own profile", (await one(chief, `select count(*)::int n from public.profiles`)).n === 1);
last = (await one(other, `select public.join_company('Alfa Telekom', $1) r`, [code])).r;
check("cannot join expired company", last.ok === false && /aktif değil/.test(last.error), last.error);

await sys(`update public.companies set plan = 'standart', plan_ends_at = now() + interval '30 days' where id = $1`, [created.company.id]);
check("assigned plan restores access", (await one(chief, `select count(*)::int n from public.personnel`)).n === 1);
check("status active with plan", (await one(chief, `select public.get_my_company() r`)).r.company.access_status === "active");
await sys(`update public.companies set suspended_at = now() where id = $1`, [created.company.id]);
check("suspended company data hidden", (await one(chief, `select count(*)::int n from public.personnel`)).n === 0);
check("status suspended", (await one(chief, `select public.get_my_company() r`)).r.company.access_status === "suspended");
await sys(`update public.companies set suspended_at = null, plan_ends_at = now() - interval '1 day' where id = $1`, [created.company.id]);
check("ended plan blocks access", (await one(chief, `select public.get_my_company() r`)).r.company.access_status === "expired");

// --- privileges ------------------------------------------------------------------------
check("join attempts hidden from users", !!(await asErr(chief, `select * from public.company_join_attempts`)));
const anonFns = (await sys(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`)).rows[0].n;
check("anon has execute on no public function", anonFns === 0, String(anonFns));

process.exit(failures ? 1 : 0);
