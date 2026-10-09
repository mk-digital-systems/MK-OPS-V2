// Cross-tenant tests
import { openDb, applyDir } from "./harness.mjs";

const pg = await openDb();
await applyDir(pg);

let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
};

// Run SQL as an authenticated PostgREST user (or anon when uid is null).
async function as(uid, sql, params = []) {
  return pg.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', $2, true)`,
      [uid ?? "", uid ? "authenticated" : "anon"]);
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    return tx.query(sql, params);
  });
}
async function asErr(uid, sql, params = []) {
  try { await as(uid, sql, params); return null; } catch (e) { return e.message; }
}
const sys = (sql, params = []) => pg.query(sql, params);
const one = async (uid, sql, params) => (await as(uid, sql, params)).rows[0];

// --- setup (system context) --------------------------------------------------
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const [chiefA, chiefB, acc1, acc2, acc3, accB1, loner, superAdmin] = [1, 2, 3, 4, 5, 6, 7, 8].map(id);
for (const [u, e] of [[chiefA, "a@a"], [chiefB, "b@b"], [acc1, "1@a"], [acc2, "2@a"], [acc3, "3@a"], [accB1, "1@b"], [loner, "x@x"], [superAdmin, "s@mk"]]) {
  await sys(`insert into auth.users (id, email) values ($1, $2)`, [u, e]);
}
const pending = await sys(`select count(*)::int n from public.profiles where role = 'pending' and not is_approved and company_id is null`);
check("new signups start pending without company", pending.rows[0].n === 8);

const A = (await sys(`insert into public.companies (name, join_code, owner_user_id) values ('Alfa Telekom', '1234', $1) returning id`, [chiefA])).rows[0].id;
const B = (await sys(`insert into public.companies (name, join_code, owner_user_id) values ('Beta İnşaat', '5678', $1) returning id`, [chiefB])).rows[0].id;
for (const [u, c] of [[chiefA, A], [chiefB, B]]) {
  await sys(`update public.profiles set company_id = $2, role = 'site_chief', is_approved = true, approved_at = now(), approved_by = $1 where id = $1`, [u, c]);
}
for (const [u, c] of [[acc1, A], [acc2, A], [acc3, A], [accB1, B]]) {
  await sys(`update public.profiles set company_id = $2 where id = $1`, [u, c]);
}
await sys(`insert into public.platform_admins (user_id) values ($1)`, [superAdmin]);
check("duplicate company name rejected", !!(await sys(`insert into public.companies (name, join_code) values (' alfa telekom', '0000')`).then(() => null, (e) => e.message)));

// --- company A creates data ---------------------------------------------------
const unit = (await sys(`select (enum_range(null::public.inventory_unit))[1]::text u`)).rows[0].u;
const persA = (await one(chiefA, `insert into public.personnel (full_name) values ('Ali Usta') returning id, company_id`));
check("insert fills company_id from user", persA.company_id === A);
const newType = async (uid) => (await one(uid, `select public.save_project_type(null, 'Genel İş', null, false, null, null, '[{"name":"İş","unit":"m"}]'::jsonb) id`)).id;
const typeA = await newType(chiefA);
const typeB = await newType(chiefB);
const projA = (await one(chiefA, `insert into public.projects (project_code, name, project_type_id, location) values ('P-1', 'Proje A', $1, 'Merkez') returning id`, [typeA])).id;
const vehA = (await one(chiefA, `insert into public.vehicles (plate, brand, model) values ('17 AB 123', 'Ford', 'Transit') returning id`)).id;
// Malzeme: katalog + irsaliye ile ana depoya giriş
async function receiveMaterial(uid, name, code, quantity) {
  const catalog = (await one(uid, `select public.create_inventory_catalog_material($1, null, null, null, $2::public.inventory_unit, true) id`, [name, unit])).id;
  await as(uid, `select public.create_inventory_receipt(current_date, 'Depocu', 'IRS-1', null, $1::jsonb)`, [JSON.stringify([{ catalog_id: catalog, material_code: code, quantity }])]);
  return (await one(uid, `select id from public.inventory_materials where catalog_id = $1`, [catalog])).id;
}
const matA = await receiveMaterial(chiefA, "Kablo A", "KOD-1", 40);
await as(chiefA, `select public.create_shared_note('A şirketinin notu', current_date + 1)`);

// --- company B tries to reach A ------------------------------------------------
const tables = (await sys(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'company_id' and table_name not in ('profiles')`)).rows.map((r) => r.table_name);
let leaked = [];
for (const t of tables) {
  // Doğrudan okuma yetkisi hiç olmayan tablolar (ör. gizli alan) de sızıntı sayılmaz.
  const r = await one(chiefB, `select count(*)::int n from public.${t} where company_id = $1`, [A])
    .catch((error) => (/permission denied/.test(error.message) ? { n: 0 } : Promise.reject(error)));
  if (r.n > 0) leaked.push(t);
}
check(`B sees no A rows in ${tables.length} tables`, leaked.length === 0, leaked.join(", "));
check("B sees only own company row", (await one(chiefB, `select count(*)::int n, min(name) nm from public.companies`)).n === 1);
check("B sees no A profiles", (await one(chiefB, `select count(*)::int n from public.profiles where company_id = $1`, [A])).n === 0);
check("A sees own data", (await one(chiefA, `select count(*)::int n from public.personnel`)).n === 1);

const upd = await as(chiefB, `update public.personnel set full_name = 'hack' where id = $1`, [persA.id]);
check("B direct update of A row affects 0 rows", upd.affectedRows === 0);
const del = await as(chiefB, `delete from public.projects where id = $1`, [projA]);
check("B direct delete of A row affects 0 rows", del.affectedRows === 0);

let e = await asErr(chiefB, `insert into public.personnel (full_name, company_id) values ('Sızma', $1)`, [A]);
check("B cannot insert into A", !!e, e);
e = await asErr(chiefB, `insert into public.vehicles (plate, brand, model, assigned_personnel_id) values ('34 XX 1', 'Fiat', 'Doblo', $1)`, [persA.id]);
check("B cannot link own row to A personnel", !!e, e);
e = await asErr(chiefB, `select public.record_inventory_movement($1, 'out', 5, null, 'Proje B', 'P-9', null, 'deneme')`, [matA]);
check("B RPC on A material fails without leaking stock", !!e && /bulunamadı/i.test(e) && !/40/.test(e), e);
e = await asErr(chiefB, `select public.cancel_project($1, 'iptal sebebi')`, [projA]);
check("B cannot cancel A project", !!e, e);
e = await asErr(chiefB, `select public.delete_inactive_personnel_without_earned_days($1)`, [persA.id]);
check("B cannot delete A personnel via RPC", !!e || (await one(chiefA, `select count(*)::int n from public.personnel`)).n === 1, e);
check("A personnel still intact", (await one(chiefA, `select full_name from public.personnel where id = $1`, [persA.id])).full_name === "Ali Usta");
const notesB = (await one(chiefB, `select public.get_shared_notes() n`)).n;
check("B shared notes exclude A notes", Array.isArray(notesB) && notesB.length === 0, JSON.stringify(notesB));
const notesA = (await one(chiefA, `select public.get_shared_notes() n`)).n;
check("A shared notes include own note", notesA.length === 1);

// --- same natural keys in two companies ------------------------------------
e = await asErr(chiefB, `insert into public.projects (project_code, name, project_type_id, location) values ('P-1', 'Proje B', $1, 'Merkez')`, [typeB]);
check("same project code allowed in another company", !e, e);
e = await asErr(chiefB, `insert into public.vehicles (plate, brand, model) values ('17 AB 123', 'Ford', 'Transit')`);
check("same plate allowed in another company", !e, e);
e = await asErr(chiefA, `insert into public.projects (project_code, name, project_type_id, location) values ('P-1', 'Tekrar', $1, 'Merkez')`, [typeA]);
check("duplicate project code rejected inside company", !!e, e);
e = await receiveMaterial(chiefB, "Kablo B", "KOD-1", 3).then(() => null, (x) => x.message);
check("same material code and dispatch number allowed in another company", !e, e);

// --- app upserts (PostgREST sends no company_id) -----------------------------------
const noteUpsert = `insert into public.attendance_month_notes (year, month, notes) values (2026, 1, $1)
  on conflict (company_id, year, month) do update set notes = excluded.notes`;
e = (await asErr(chiefA, noteUpsert, ["A not 1"])) ?? (await asErr(chiefA, noteUpsert, ["A not 2"])) ?? (await asErr(chiefB, noteUpsert, ["B not"]));
check("month notes upsert per company", !e && (await sys(`select count(*)::int n from public.attendance_month_notes`)).rows[0].n === 2, e);
check("month notes upsert updates own row", (await one(chiefA, `select notes from public.attendance_month_notes`)).notes === "A not 2");
const settingsUpsert = `insert into public.app_settings (key, value, updated_by) values ('custom_project_types', $1::jsonb, auth.uid())
  on conflict (company_id, key) do update set value = excluded.value`;
e = (await asErr(chiefA, settingsUpsert, ['{"custom_1":"A"}'])) ?? (await asErr(chiefB, settingsUpsert, ['{"custom_1":"B"}']));
check("settings upsert per company", !e && (await one(chiefA, `select value->>'custom_1' v from public.app_settings`)).v === "A", e);

// --- roles per company ---------------------------------------------------------
e = await asErr(chiefA, `select public.assign_user_role($1, 'accounting')`, [acc1]);
check("A chief approves own accounting user", !e, e);
e = await asErr(chiefA, `select public.assign_user_role($1, 'accounting')`, [acc2]);
check("second accounting user in A", !e, e);
e = await asErr(chiefB, `select public.assign_user_role($1, 'accounting')`, [accB1]);
check("B accounting limit counted separately", !e, e);
e = await asErr(chiefA, `select public.assign_user_role($1, 'accounting')`, [acc3]);
check("third accounting user in A allowed (only the plan user limit applies)", !e, e);
e = await asErr(chiefA, `select public.assign_user_role($1, 'company_manager')`, [accB1]);
check("A chief cannot change B user", !!e && /bulunamadı/i.test(e), e);
check("B user untouched", (await sys(`select company_id, role from public.profiles where id = $1`, [accB1])).rows[0].role === "accounting");
e = await asErr(chiefA, `update public.profiles set company_id = $2 where id = $1`, [chiefA, B]);
check("user cannot move self to another company",
  (await sys(`select company_id from public.profiles where id = $1`, [chiefA])).rows[0].company_id === A, e ?? "0 rows updated");
e = await asErr(acc1, `select public.update_own_profile('Yeni Ad', null, null)`);
check("user can still update own profile", !e, e);
e = await asErr(acc1, `select public.assign_user_role($1, 'site_chief')`, [acc2]);
check("accounting cannot appoint a company manager", !!e && /firma yöneticisi/.test(e), e);
e = await asErr(chiefA, `delete from public.profiles where id = $1`, [chiefA]);
check("A site chief cannot be deleted", !!e || (await sys(`select 1 from public.profiles where id = $1`, [chiefA])).rows.length === 1, e);

// --- users without company / super admin / anon --------------------------------------
check("user without company sees nothing", (await one(loner, `select count(*)::int n from public.personnel`)).n === 0);
e = await asErr(loner, `insert into public.personnel (full_name) values ('Yetim')`);
check("user without company cannot insert", !!e, e);
check("user without company sees own profile", (await one(loner, `select count(*)::int n from public.profiles`)).n === 1);
check("super admin flagged", (await one(superAdmin, `select public.is_super_admin() s`)).s === true);
check("chief is not super admin", (await one(chiefA, `select public.is_super_admin() s`)).s === false);
check("platform_admins hidden from users", !!(await asErr(chiefA, `select * from public.platform_admins`)));
check("anon cannot execute RPCs", !!(await asErr(null, `select public.get_shared_notes()`)));
const anonFns = (await sys(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`)).rows[0].n;
check("anon has execute on no public function", anonFns === 0, String(anonFns));

// --- system (cron) context -----------------------------------------------------
const persB = (await one(chiefB, `insert into public.personnel (full_name, employment_start_date) values ('Veli Usta', date '2026-01-01') returning id`)).id;
await sys(`update public.personnel set employment_start_date = date '2026-01-01' where id = $1`, [persA.id]);
const n = (await sys(`select public.ensure_sunday_attendance_for_month(2026, 2) n`)).rows[0].n;
const wrong = (await sys(`select count(*)::int n from public.attendance_records a join public.personnel p on p.id = a.personnel_id where a.company_id <> p.company_id`)).rows[0].n;
check("cron Sunday attendance covers both companies", n === 8, `inserted ${n}`);
check("cron rows carry personnel's company", wrong === 0);
const nA = (await one(chiefA, `select public.ensure_sunday_attendance_for_month(2026, 3) n`)).n;
check("user-triggered Sunday attendance only for own company", nA === 5, `inserted ${nA}`);

// --- company deletion cascades --------------------------------------------------------
e = await sys(`delete from public.companies where id = $1`, [B]).then(() => null, (x) => x.message);
check("deleting a company cascades (system)", !e, e);
check("B data gone, A intact", (await sys(`select count(*)::int n from public.personnel`)).rows[0].n === 1);

process.exit(failures ? 1 : 0);
