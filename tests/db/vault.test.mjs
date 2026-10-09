// Gizli alan
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

const chief = "00000000-0000-0000-0000-000000000001";
const manager = "00000000-0000-0000-0000-000000000002";
const other = "00000000-0000-0000-0000-000000000003";
const pending = "00000000-0000-0000-0000-000000000004";
await sys(`insert into auth.users (id, email) values ($1,'a@a'),($2,'b@b'),($3,'c@c'),($4,'d@d')`, [chief, manager, other, pending]);
await as(chief, `select public.create_company('Deneme Firma')`);
await as(other, `select public.create_company('Başka Firma')`);
const company = (await one(chief, `select public.get_my_company() r`)).r.company;
await as(manager, `select public.join_company('Deneme Firma', $1)`, [company.join_code]);
await as(chief, `select public.assign_user_role($1, 'company_manager')`, [manager]);
await as(pending, `select public.join_company('Deneme Firma', $1)`, [company.join_code]);

let s = (await one(manager, `select public.get_company_vault_status() r`)).r;
check("status: not configured, manager can use, cannot manage", s.configured === false && s.can_use && !s.can_manage, JSON.stringify(s));
let r = (await one(manager, `select public.unlock_company_vault('x') r`)).r;
check("unlock before password set explains", !r.ok && /henüz şifre/.test(r.error), r.error);
let e = await asErr(manager, `select public.set_company_vault_password('gizli123')`);
check("manager cannot set password", !!e, e);
e = await asErr(chief, `select public.set_company_vault_password('123')`);
check("short password rejected", !!e, e);
await as(chief, `select public.set_company_vault_password('gizli123')`);
const hash = (await sys(`select password_hash from public.company_vaults`)).rows[0].password_hash;
check("password stored as bcrypt hash", hash.startsWith("$2") && !hash.includes("gizli123"));
check("status configured", (await one(chief, `select public.get_company_vault_status() r`)).r.configured === true);

r = (await one(manager, `select public.unlock_company_vault('yanlis') r`)).r;
check("wrong password", !r.ok && r.error === "Şifre hatalı");
check("failed attempt recorded (not rolled back)", Number((await sys(`select count(*)::int n from public.company_vault_attempts`)).rows[0].n) === 1);
r = (await one(manager, `select public.unlock_company_vault('gizli123') r`)).r;
check("correct password unlocks", r.ok && !!r.token);
const token = r.token;
r = (await one(pending, `select public.unlock_company_vault('gizli123') r`)).r;
check("pending user cannot unlock", !r.ok, r.error);
r = (await one(other, `select public.unlock_company_vault('gizli123') r`)).r;
check("other company (no password) cannot unlock", !r.ok, r.error);

const noteId = (await one(manager, `select public.save_company_vault_note($1, null, 'Banka', 'IBAN TR00') id`, [token])).id;
let list = (await one(manager, `select public.list_company_vault_notes($1) r`, [token])).r;
check("note saved and listed", list.length === 1 && list[0].content === "IBAN TR00");
e = await asErr(chief, `select public.list_company_vault_notes($1)`, [token]);
check("token bound to its user", !!e, e);
e = await asErr(manager, `select * from public.company_vault_notes`);
check("direct table read blocked", !!e, e);
e = await asErr(manager, `select public.list_company_vault_notes(gen_random_uuid())`);
check("random token rejected", !!e, e);
await sys(`update public.company_vault_sessions set expires_at = now() - interval '1 minute'`);
e = await asErr(manager, `select public.list_company_vault_notes($1)`, [token]);
check("expired session rejected", !!e, e);

r = (await one(chief, `select public.unlock_company_vault('gizli123') r`)).r;
await as(chief, `select public.save_company_vault_note($1, $2, 'Banka bilgisi', 'IBAN TR11')`, [r.token, noteId]);
check("chief updates shared note", (await one(chief, `select public.list_company_vault_notes($1) r`, [r.token])).r[0].title === "Banka bilgisi");
const audit = (await sys(`select action, entity_label, changes from public.audit_logs where entity_type = 'company_vault_notes' order by id`)).rows;
check("audit has titles but no content", audit.length === 2 && audit.every((a) => JSON.stringify(a.changes) === "{}") && !JSON.stringify(audit).includes("IBAN"), JSON.stringify(audit));

await as(chief, `select public.set_company_vault_password('yeni-sifre')`);
e = await asErr(chief, `select public.list_company_vault_notes($1)`, [r.token]);
check("password change closes sessions", !!e, e);
const hashAudit = (await sys(`select count(*)::int n from public.audit_logs where changes::text like '%$2%'`)).rows[0].n;
check("hash never in audit log", Number(hashAudit) === 0);

for (let i = 0; i < 5; i++) await as(manager, `select public.unlock_company_vault('bad')`);
r = (await one(manager, `select public.unlock_company_vault('yeni-sifre') r`)).r;
check("rate limited after 5 failures", !r.ok && /Çok fazla/.test(r.error), r.error);
await sys(`update public.company_vault_attempts set attempted_at = now() - interval '20 minutes'`);
r = (await one(manager, `select public.unlock_company_vault('yeni-sifre') r`)).r;
check("unlocks after cooldown", r.ok);

const pn = (await one(manager, `insert into public.private_notes (user_id, title, content) values ($1, 'Eski not', 'gizli içerik') returning id`, [manager])).id;
await as(manager, `select public.move_private_note_to_vault($1, $2)`, [r.token, pn]);
check("private note moved to vault",
  Number((await sys(`select count(*)::int n from public.private_notes`)).rows[0].n) === 0 &&
  (await one(manager, `select public.list_company_vault_notes($1) r`, [r.token])).r.some((n) => n.title === "Eski not"));
await as(manager, `select public.delete_company_vault_note($1, $2)`, [r.token, noteId]);
check("note deleted", (await one(manager, `select public.list_company_vault_notes($1) r`, [r.token])).r.length === 1);
await as(manager, `select public.lock_company_vault($1)`, [r.token]);
e = await asErr(manager, `select public.list_company_vault_notes($1)`, [r.token]);
check("lock closes session", !!e, e);

const anon = await pg.transaction(async (tx) => {
  await tx.exec(`set local role anon`);
  return tx.query(`select public.unlock_company_vault('x')`).then(() => null, (err) => err.message);
});
check("anon blocked", !!anon, anon);

const remaining = (await sys(`select count(*)::int n from pg_proc where pronamespace = 'public'::regnamespace and prosrc ~* 'ana yönetici'`)).rows[0].n;
check("no 'ana yönetici' messages left", Number(remaining) === 0);
e = await asErr(manager, `select public.set_company_vault_password('gizli123')`);
check("renamed message", !!e && e.includes("firma yöneticisi"), e);
e = await asErr(chief, `select public.refresh_project_rollup(gen_random_uuid())`);
check("internal helper not callable", !!e && /permission denied/.test(e), e);
console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
