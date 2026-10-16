// Personel ve araç: toplu ekleme (çok satırlı insert, onay kuralları) ve toplu şube tayini
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
const sys = (sql, params) => pg.query(sql, params);

const [owner, branchChief, other] = ["1", "2", "3"].map((n) => `00000000-0000-0000-0000-00000000000${n}`);
await sys(`insert into auth.users (id, email) values ($1,'a@a'),($2,'b@b'),($3,'c@c')`, [owner, branchChief, other]);
await as(owner, `select public.create_company('Şubeli Firma')`);
await as(other, `select public.create_company('Diğer Firma')`);
const company = (await one(owner, `select public.get_my_company() r`)).r.company;
await as(branchChief, `select public.join_company('Şubeli Firma', $1)`, [company.join_code]);
await as(owner, `select public.assign_user_role($1, 'company_manager')`, [branchChief]);
const merkez = (await sys(`select id from public.branches where company_id = $1 and is_main`, [company.id])).rows[0].id;
const bolu = (await one(owner, `insert into public.branches (name, sort_order) values ('Bolu', 1) returning id`)).id;
const duzce = (await one(owner, `insert into public.branches (name, sort_order) values ('Düzce', 2) returning id`)).id;
await as(owner, `select public.set_user_branches($1, $2::uuid[])`, [branchChief, [bolu]]);

// Toplu ekleme: tek insert, çok satır
await as(owner, `insert into public.personnel (full_name, job_title, phone, tc_identity_number, employment_start_date, monthly_salary, branch_id)
  select * from jsonb_to_recordset($1::jsonb) as x(full_name text, job_title text, phone text, tc_identity_number text, employment_start_date date, monthly_salary numeric, branch_id uuid)`,
  [JSON.stringify([
    { full_name: "Ali Veli", job_title: "Usta", phone: "5551", tc_identity_number: "11111111111", employment_start_date: "2026-10-01", monthly_salary: 30000, branch_id: bolu },
    { full_name: "Ayşe Kaya", job_title: "Kalfa", phone: null, tc_identity_number: null, employment_start_date: "2026-10-02", monthly_salary: 0, branch_id: bolu },
    { full_name: "Mehmet Can", job_title: null, phone: null, tc_identity_number: null, employment_start_date: null, monthly_salary: 0, branch_id: bolu },
  ])]);
check("bulk personnel inserted", (await one(owner, `select count(*)::int n from public.personnel where branch_id = $1`, [bolu])).n === 3);
let e = await asErr(owner, `insert into public.personnel (full_name, tc_identity_number, branch_id) values ('A Kişi', '22222222222', $1), ('B Kişi', '22222222222', $1)`, [bolu]);
check("duplicate TC in batch rejects whole batch", !!e && (await one(owner, `select count(*)::int n from public.personnel where full_name in ('A Kişi', 'B Kişi')`)).n === 0, e);
await as(branchChief, `insert into public.personnel (full_name, branch_id) values ('Şube Bir', $1), ('Şube İki', $1)`, [bolu]);
check("branch chief bulk insert is approved directly", (await one(owner, `select count(*)::int n from public.personnel where full_name like 'Şube %' and approval_status = 'approved'`)).n === 2);
await as(owner, `insert into public.vehicles (plate, brand, model, current_km, branch_id) values ('34 ABC 01', 'Ford', 'Transit', 1000, $1), ('34 ABC 02', 'Fiat', 'Doblo', 0, $1)`, [bolu]);
e = await asErr(owner, `insert into public.vehicles (plate, brand, model, branch_id) values ('34 ABC 01', 'Ford', 'Transit', $1)`, [bolu]);
check("duplicate plate rejected", !!e, e);

// Toplu şube tayini
const people = (await sys(`select id from public.personnel where branch_id = $1 and approval_status = 'approved' order by full_name`, [bolu])).rows.map((r) => r.id);
e = await asErr(branchChief, `select public.change_records_branch('personnel', $1::uuid[], $2, current_date)`, [people, duzce]);
check("branch chief cannot bulk transfer", /yalnızca firma yöneticisi/.test(e ?? ""), e);
e = await asErr(owner, `select public.change_records_branch('personnel', '{}'::uuid[], $1, current_date)`, [duzce]);
check("empty selection rejected", /seçilmedi/.test(e ?? ""), e);
const otherBranch = (await sys(`select id from public.branches where company_id <> $1 limit 1`, [company.id])).rows[0].id;
e = await asErr(owner, `select public.change_records_branch('personnel', $1::uuid[], $2, current_date)`, [people, otherBranch]);
check("other company's branch rejected", /Şube bulunamadı/.test(e ?? ""), e);
const n = (await one(owner, `select public.change_records_branch('personnel', $1::uuid[], $2, current_date) n`, [people, duzce])).n;
check("bulk transfer moved 5 personnel", n === 5 && (await one(owner, `select count(*)::int n from public.personnel where branch_id = $1`, [duzce])).n === 5, n);
check("branch history written for each", (await one(owner, `select count(distinct personnel_id)::int n from public.personnel_branch_history where branch_id = $1`, [duzce])).n === 5);
const vehicles = (await sys(`select id from public.vehicles where branch_id = $1`, [bolu])).rows.map((r) => r.id);
await as(owner, `select public.change_records_branch('vehicle', $1::uuid[], $2, current_date)`, [vehicles, merkez]);
check("bulk transfer vehicles", (await one(owner, `select count(*)::int n from public.vehicles where branch_id = $1`, [merkez])).n === 2);
const foreign = (await one(other, `insert into public.personnel (full_name) values ('Yabancı') returning id`)).id;
e = await asErr(owner, `select public.change_records_branch('personnel', $1::uuid[], $2, current_date)`, [[people[0], foreign], bolu]);
check("foreign record rejects whole batch", /bulunamadı/.test(e ?? "") && (await one(owner, `select branch_id from public.personnel where id = $1`, [people[0]])).branch_id === duzce, e);

// Toplu taşeron ataması / firma çalışanı
const sub = (await one(owner, `insert into public.subcontractors (name, share_percent) values ('Usta Taşeron', 20) returning id`)).id;
const duzcePeople = (await sys(`select id from public.personnel where branch_id = $1`, [duzce])).rows.map((r) => r.id);
await as(owner, `update public.personnel set subcontractor_id = $1 where id = any($2::uuid[])`, [sub, duzcePeople]);
check("bulk assign to subcontractor", (await one(owner, `select count(*)::int n from public.personnel where subcontractor_id = $1`, [sub])).n === 5);
await as(branchChief, `update public.personnel set subcontractor_id = null where id = any($1::uuid[])`, [duzcePeople]);
check("branch chief cannot change other branch's personnel", (await one(owner, `select count(*)::int n from public.personnel where subcontractor_id = $1`, [sub])).n === 5);
await as(owner, `update public.personnel set subcontractor_id = null where id = any($1::uuid[])`, [duzcePeople]);
check("bulk back to company employee", (await one(owner, `select count(*)::int n from public.personnel where subcontractor_id is not null`)).n === 0);

process.exit(0);
