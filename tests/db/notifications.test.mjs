// Bildirimler: durumdan hesaplanır, rol/yetkiye göre süzülür, okundu bilgisi kullanıcıya özeldir.
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
const one = async (uid, sql, params) => (await as(uid, sql, params)).rows[0];
const sys = (sql, params) => pg.query(sql, params);
const list = async (uid) => (await one(uid, `select public.get_my_notifications() n`)).n;
const types = (items) => items.map((item) => item.type).sort();

const chief = "00000000-0000-0000-0000-000000000001";
const manager = "00000000-0000-0000-0000-000000000002";
const accounting = "00000000-0000-0000-0000-000000000003";
const joiner = "00000000-0000-0000-0000-000000000004";
const other = "00000000-0000-0000-0000-000000000005";
await sys(`insert into auth.users (id, email) values ($1,'a@a'),($2,'b@b'),($3,'c@c'),($4,'d@d'),($5,'e@e')`, [chief, manager, accounting, joiner, other]);
await as(chief, `select public.create_company('Deneme Firma')`);
await as(other, `select public.create_company('Başka Firma')`);
const company = (await one(chief, `select public.get_my_company() r`)).r.company;
for (const user of [manager, accounting]) await as(user, `select public.join_company('Deneme Firma', $1)`, [company.join_code]);
await as(chief, `select public.assign_user_role($1, 'company_manager')`, [manager]);
await as(chief, `select public.assign_user_role($1, 'accounting')`, [accounting]);

check("nothing to report initially", (await list(manager)).length === 0);

// Katılım isteği → yalnızca ana yönetici
await as(joiner, `select public.join_company('Deneme Firma', $1)`, [company.join_code]);
let items = await list(chief);
check("chief sees join request", items.some((item) => item.type === "join_request" && item.link === "/panel/users" && !item.read));
check("manager does not see join request", !(await list(manager)).some((item) => item.type === "join_request"));
check("pending user gets nothing", (await list(joiner)).length === 0);

// Projeler: gecikmiş + 3 gün içinde bitecek
const type = (await one(chief, `select public.save_project_type(null, 'Genel', null, false, null, null, '[{"name":"İş","unit":"m"}]'::jsonb) id`)).id;
await sys(`insert into public.projects (company_id, project_code, name, location, project_type_id, estimated_end_date, start_date)
  values ($1, 'G-1', 'Geciken', 'Merkez', $2, current_date - 2, current_date - 30), ($1, 'Y-1', 'Yaklaşan', 'Merkez', $2, current_date + 2, current_date - 5),
         ($1, 'U-1', 'Uzak', 'Merkez', $2, current_date + 30, current_date - 5)`, [company.id, type]);
items = await list(manager);
check("manager sees delayed project", items.some((item) => item.type === "project_delayed" && item.body.includes("Geciken")));
check("manager sees project due in 3 days", items.some((item) => item.type === "project_due" && item.body.includes("Yaklaşan")));
check("far project not listed", !items.some((item) => item.body.includes("Uzak")));
check("accounting without project permission sees no projects", !(await list(accounting)).some((item) => item.type.startsWith("project")));

// Araç muayene
await sys(`insert into public.vehicles (company_id, plate, brand, model, inspection_date, insurance_date) values ($1, '34 AB 1', 'Ford', 'Transit', current_date + 5, current_date + 200)`, [company.id]);
items = await list(manager);
check("vehicle inspection within 15 days", items.filter((item) => item.type === "vehicle_deadline").length === 1);
check("accounting without vehicles permission sees no vehicles", !(await list(accounting)).some((item) => item.type === "vehicle_deadline"));
await as(chief, `select public.set_company_manager_permission($1, 'vehicles', true)`, [accounting]);
check("accounting with vehicles permission sees vehicle", (await list(accounting)).some((item) => item.type === "vehicle_deadline"));

// Okundu: kullanıcıya özel
const delayedKey = (await list(manager)).find((item) => item.type === "project_delayed").key;
await as(manager, `select public.mark_notifications_read($1::text[])`, [[delayedKey]]);
check("marked read for manager", (await list(manager)).find((item) => item.key === delayedKey).read === true);
check("still unread for chief", (await list(chief)).find((item) => item.key === delayedKey).read === false);

// Durum değişince anahtar değişir → yeniden okunmamış
await sys(`update public.vehicles set inspection_date = current_date + 6`);
const vehicleKey = (await list(manager)).find((item) => item.type === "vehicle_deadline").key;
await as(manager, `select public.mark_notifications_read($1::text[])`, [[vehicleKey]]);
await sys(`update public.vehicles set inspection_date = current_date + 7`);
check("changed date re-notifies", (await list(manager)).find((item) => item.type === "vehicle_deadline").read === false);

// Deneme süresi son 24 saat → ana yönetici
await sys(`update public.companies set trial_ends_at = now() + interval '5 hours' where id = $1`, [company.id]);
check("chief sees trial ending", (await list(chief)).some((item) => item.type === "subscription"));
check("manager does not see trial ending", !(await list(manager)).some((item) => item.type === "subscription"));

// Destek yanıtı
await sys(`insert into public.support_requests (company_id, created_by, topic, message, status, admin_reply, replied_at) values ($1, $2, 'support', 'Merhaba destek', 'answered', 'Yanıtımız', now())`, [company.id, chief]);
check("chief sees support reply", (await list(chief)).some((item) => item.type === "support_reply" && item.body === "Yanıtımız"));

// Fiyatsız hakediş kaydı → yalnızca hakediş yetkisi olanlar
const prog = (await sys(`select sp.id from public.project_stage_progress sp join public.projects p on p.id = sp.project_id where p.project_code = 'Y-1'`)).rows[0].id;
await sys(`insert into public.project_stage_logs (company_id, progress_id, quantity, log_date) values ($1, $2, 10, current_date)`, [company.id, prog]);
check("chief sees unpriced hakediş", (await list(chief)).some((item) => item.type === "hakedis_unpriced"));
check("manager without hakediş permission does not", !(await list(manager)).some((item) => item.type === "hakedis_unpriced"));

// Firma ayrımı
check("other company sees none of these", (await list(other)).every((item) => !item.body.includes("Geciken") && item.type !== "vehicle_deadline"));
const e = await as(manager, `select * from public.notification_reads`).then(() => null, (error) => error.message);
check("reads table not directly readable", !!e, e);

process.exit(failures ? 1 : 0);
