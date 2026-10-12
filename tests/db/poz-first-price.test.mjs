// İlk poz fiyatı başlangıçtan geçerli; sonraki tarihsiz fiyat bugünden (zam)
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
const one = async (uid, sql, params) => (await as(uid, sql, params)).rows[0];
const sys = (sql, params) => pg.query(sql, params);

const [owner, admin] = ["1", "9"].map((n) => `00000000-0000-0000-0000-00000000000${n}`);
await sys(`insert into auth.users (id, email) values ($1,'a@a'),($2,'admin@x')`, [owner, admin]);
await sys(`insert into public.platform_admins (user_id) values ($1)`, [admin]);
await as(owner, `select public.create_company('Fiyat Firma')`);
const company = (await one(owner, `select public.get_my_company() r`)).r.company;
const catalog = (await one(admin, `select public.admin_save_catalog(null, 'Altyapı', null) id`)).id;
await as(admin, `select public.admin_save_catalog_type(null, $1, 'Hat', 'standard', null, null)`, [catalog]);
await as(admin, `select public.admin_set_company_catalogs($1, array[$2]::uuid[])`, [company.id, catalog]);
await as(owner, `select public.import_poz_items(null, $1, $2::jsonb, null)`, [catalog, JSON.stringify([
  { group_name: "Kazı", poz_code: "1/1", name: "Kazı", unit: "m" },
  { group_name: "Boru", poz_code: "2/1", name: "Boru", unit: "m", unit_price: "20" },
])]);
const poz = async (name) => (await one(owner, `select id from public.project_type_stages where project_type_id is null and name = $1`, [name])).id;
const kazi = await poz("Kazı");
const boru = await poz("Boru");
const prices = async (stage) => (await sys(`select valid_from::text d, unit_price::float p from public.poz_prices where stage_id = $1 order by valid_from`, [stage])).rows;
check("import without date: first price from start", JSON.stringify(await prices(boru)) === JSON.stringify([{ d: "2000-01-01", p: 20 }]), JSON.stringify(await prices(boru)));

const type = (await one(owner, `select id from public.project_types where name = 'Hat'`)).id;
const project = (await one(owner, `insert into public.projects (project_code, name, location, project_type_id) values ('H-1', 'Hat', 'Merkez', $1) returning id`, [type])).id;
const leader = (await one(owner, `insert into public.personnel (full_name, employment_start_date) values ('Usta', '2026-01-01') returning id`)).id;
await as(owner, `select public.save_production_entry(null, '2026-10-05', $1, 'Usta', null, $2::jsonb)`, [leader, JSON.stringify([{ project_id: project, sort_order: 0, items: [
  { kind: "stage", stage_id: kazi, quantity: 10, sort_order: 0 },
  { kind: "stage", stage_id: boru, quantity: 5, sort_order: 1 },
] }])]);
const amounts = async () => (await sys(`select st.name n, v.amount::float a from public.project_stage_logs l join public.project_stage_progress sp on sp.id = l.progress_id join public.project_type_stages st on st.id = sp.stage_id left join public.hakedis_log_values v on v.log_id = l.id order by st.name`)).rows;
let rows = await amounts();
check("boru priced, kazı unpriced", rows.find((r) => r.n === "Boru").a === 100 && rows.find((r) => r.n === "Kazı").a === null, JSON.stringify(rows));

// Kazı'ya ilk fiyat tarihsiz → başlangıçtan; 5 Ekim'deki imalat fiyatlanır
await as(owner, `select public.set_poz_price(null, $1, 12, null)`, [kazi]);
check("first price without date -> from start", (await prices(kazi))[0].d === "2000-01-01");
rows = await amounts();
check("earlier imalat priced by first price", rows.find((r) => r.n === "Kazı").a === 120, JSON.stringify(rows));

// İkinci fiyat tarihsiz → bugünden (zam); geçmiş tutar değişmez
await as(owner, `select public.set_poz_price(null, $1, 15, null)`, [kazi]);
const kaziPrices = await prices(kazi);
const today = (await sys(`select timezone('Europe/Istanbul', now())::date::text d`)).rows[0].d;
check("second price without date -> today", kaziPrices.length === 2 && kaziPrices[1].d === today && kaziPrices[1].p === 15, JSON.stringify(kaziPrices));
check("fixed amount unchanged", (await amounts()).find((r) => r.n === "Kazı").a === 120);

// Excel'den tekrar aktarma: fiyatı olana bugünden, olmayana başlangıçtan
await as(owner, `select public.import_poz_items(null, $1, $2::jsonb, null)`, [catalog, JSON.stringify([
  { group_name: "Boru", poz_code: "2/1", name: "Boru", unit: "m", unit_price: "22" },
  { group_name: "Ek", poz_code: "3/1", name: "Ek", unit: "adet", unit_price: "1.250" },
])]);
const boruPrices = await prices(boru);
check("re-import: existing poz gets today's price", boruPrices.length === 2 && boruPrices[1].d === today && boruPrices[1].p === 22, JSON.stringify(boruPrices));
const ek = await poz("Ek");
check("re-import: new poz from start", JSON.stringify(await prices(ek)) === JSON.stringify([{ d: "2000-01-01", p: 1.25 }]) || (await prices(ek))[0].d === "2000-01-01", JSON.stringify(await prices(ek)));

// Tarihli fiyat ve silme hâlâ çalışır
await as(owner, `select public.set_poz_price(null, $1, 16, '2026-12-01')`, [kazi]);
await as(owner, `select public.set_poz_price(null, $1, null, '2026-12-01')`, [kazi]);
check("dated price set and removed", (await prices(kazi)).length === 2);

process.exit(0);
