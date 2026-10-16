// Projeye göre iş kalemleri ve poz kodu
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
const asErr = (uid, sql, params) => as(uid, sql, params).then(() => null, (error) => error.message);

const chief = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
await pg.query(`insert into auth.users (id, email) values ($1, 'a@a'), ($2, 'b@b')`, [chief, other]);
await as(chief, `select public.create_company('Yapı Firma')`);
await as(other, `select public.create_company('Diğer Firma')`);
const one = async (sql, params, uid = chief) => (await as(uid, sql, params)).rows[0];
const stagesOf = async (projectId) =>
  (await as(chief, `select st.name, st.poz_code, st.project_id is not null as own
     from public.project_stage_progress sp join public.project_type_stages st on st.id = sp.stage_id
     where sp.project_id = $1 order by st.sort_order`, [projectId])).rows;
const saveStages = (projectId, mode, items, uid = chief) =>
  asErr(uid, `select public.save_project_stages($1, $2, $3::jsonb)`, [projectId, mode, JSON.stringify(items)]);

// 1. Şablonda poz ---------------------------------------------------------------------------------
let error = await asErr(chief, `select public.save_project_type(null, 'Bina', null, false, null, null, $1::jsonb)`,
  [JSON.stringify([{ name: "Temel", poz_code: "AB" }])]);
check("poz shorter than 3 rejected", /Poz 3–5/.test(error ?? ""), error);
error = await asErr(chief, `select public.save_project_type(null, 'Bina', null, false, null, null, $1::jsonb)`,
  [JSON.stringify([{ name: "Temel", poz_code: "15.A1" }, { name: "Kaba", poz_code: "15.a1" }])]);
check("duplicate template poz rejected", /aynı pozla/.test(error ?? ""), error);
const bina = (await one(`select public.save_project_type(null, 'Bina', null, false, null, null, $1::jsonb) id`, [JSON.stringify([
  { name: "Temel", unit: "m³", poz_code: "T-01" },
  { name: "Kaba inşaat", unit: "m²", poz_code: "KB1" },
  { name: "Sıva", unit: "m²", poz_code: "SV1" },
  { name: "Boya", unit: "m²" },
])])).id;
const template = (await as(chief, `select id, name from public.project_type_stages where project_type_id = $1 order by sort_order`, [bina])).rows;
const tid = (name) => template.find((s) => s.name === name).id;
check("template poz saved", (await one(`select poz_code from public.project_type_stages where id = $1`, [tid("Kaba inşaat")])).poz_code === "KB1");

// 2. Şablon modu (bugünkü davranış) ----------------------------------------------------------------
const p1 = (await one(`insert into public.projects (project_code, name, location, project_type_id) values ('B-1', 'A Blok', 'Merkez', $1) returning id, stage_mode`, [bina]));
check("new project in template mode", p1.stage_mode === "template");
check("template project gets all items", (await stagesOf(p1.id)).length === 4);
error = await asErr(chief, `update public.projects set stage_mode = 'custom' where id = $1`, [p1.id]);
check("stage_mode cannot be set directly", /yalnızca kalem düzenleme/.test(error ?? ""), error);

// 3. Projeye göre düzenle -------------------------------------------------------------------------
const p2 = (await one(`insert into public.projects (project_code, name, location, project_type_id) values ('B-2', 'B Blok', 'Merkez', $1) returning id`, [bina])).id;
error = await saveStages(p2, "custom", [{ stage_id: tid("Temel") }, { name: "Çatı", unit: "m²", poz_code: "t-01" }]);
check("own item cannot reuse template poz in project", /Aynı poz/.test(error ?? ""), error);
check("failed save leaves project untouched", (await stagesOf(p2)).length === 4);
error = await saveStages(p2, "custom", [{ stage_id: tid("Temel") }, { name: "temel", unit: "m³" }]);
check("own item cannot reuse template name", /Aynı adla/.test(error ?? ""), error);
error = await saveStages(p2, "custom", [{ stage_id: tid("Temel") }, { name: "Çatı", poz_code: "ÇT-001" }]);
check("poz longer than 5 rejected", /Poz 3–5/.test(error ?? ""), error);
error = await saveStages(p1.id, "custom", [{ stage_id: tid("Temel") }, { name: "Çatı", poz_code: "Ç 1/" }, { name: "Asma tavan", poz_code: "---" }]);
check("free-format poz accepted (space, slash, no letters/digits)", !error, error);
await saveStages(p1.id, "template", []);
error = await saveStages(p2, "custom", [
  { name: "Çatı", unit: "m²", poz_code: "ÇT1" },
  { stage_id: tid("Temel") },
  { stage_id: tid("Sıva") },
  { name: "Asansör", unit: "adet" },
]);
check("custom list saved", !error, error);
let rows = await stagesOf(p2);
check("custom project has selected + own items", rows.length === 4 && rows.filter((r) => r.own).map((r) => r.name).sort().join() === "Asansör,Çatı", JSON.stringify(rows));
const list = (await as(chief, `select st.name from public.project_stages ps join public.project_type_stages st on st.id = ps.stage_id where ps.project_id = $1 order by ps.sort_order`, [p2])).rows;
check("list order kept", list.map((r) => r.name).join() === "Çatı,Temel,Sıva,Asansör", list.map((r) => r.name).join());
check("own items not in other projects", (await stagesOf(p1.id)).length === 4);
check("own item same poz allowed in another project", !(await saveStages(p1.id, "custom", [{ stage_id: tid("Temel") }, { name: "Çatı", poz_code: "ÇT1" }])));
await saveStages(p1.id, "template", []);
check("back to template removes own items", (await stagesOf(p1.id)).length === 4 && (await one(`select count(*)::int n from public.project_type_stages where project_id = $1`, [p1.id])).n === 0);

// İş kaydı olan kalem çıkarılamaz; şablona eklenen kalem düzenlenmiş projeye gelmez.
const asansor = (await one(`select sp.id from public.project_stage_progress sp join public.project_type_stages st on st.id = sp.stage_id where sp.project_id = $1 and st.name = 'Asansör'`, [p2])).id;
await as(chief, `insert into public.project_stage_logs (progress_id, quantity, team_leader_name) values ($1, 1, 'Ahmet')`, [asansor]);
const ownIds = (await as(chief, `select id, name from public.project_type_stages where project_id = $1`, [p2])).rows;
const ownId = (name) => ownIds.find((s) => s.name === name).id;
error = await saveStages(p2, "custom", [{ stage_id: tid("Temel") }, { stage_id: ownId("Çatı"), name: "Çatı", unit: "m²", poz_code: "ÇT1" }]);
check("item with logs cannot be removed", /İş kaydı girilmiş kalem/.test(error ?? ""), error);
error = await saveStages(p2, "template", []);
check("cannot go back to template with logged own item", /şablona dönülemez/.test(error ?? ""), error);
error = await saveStages(p2, "custom", [
  { stage_id: ownId("Asansör"), name: "Asansör montajı", unit: "adet", poz_code: "ASN" },
  { stage_id: tid("Temel") },
  { stage_id: ownId("Çatı"), name: "Çatı", unit: "m²", poz_code: "ÇT1" },
]);
const renamed = (await stagesOf(p2)).map((r) => r.name).sort().join();
check("rename own item and drop Sıva", !error && renamed === "Asansör montajı,Temel,Çatı", error ?? renamed);
check("log kept after rename", (await one(`select count(*)::int n from public.project_stage_logs where progress_id = $1`, [asansor])).n === 1);

await as(chief, `select public.save_project_type($1, 'Bina', null, false, null, null, $2::jsonb)`, [bina, JSON.stringify([
  ...template.map((s) => ({ id: s.id, name: s.name, unit: "m²", poz_code: { Temel: "T-01", "Kaba inşaat": "KB1", "Sıva": "SV1" }[s.name] ?? null })),
  { name: "Peyzaj", unit: "m²", poz_code: "PYZ" },
])]);
check("new template item goes to template project", (await stagesOf(p1.id)).some((r) => r.name === "Peyzaj"));
check("new template item does not go to custom project", !(await stagesOf(p2)).some((r) => r.name === "Peyzaj"));
check("type editor keeps own items", (await one(`select count(*)::int n from public.project_type_stages where project_id = $1`, [p2])).n === 2);
const typeStages = (await as(chief, `select name from public.project_type_stages where project_type_id = $1 and project_id is null`, [bina])).rows;
check("type editor list has only template items", typeStages.length === 5, typeStages.map((r) => r.name).join());
error = await asErr(chief, `select public.save_project_type($1, 'Bina', null, false, null, null, $2::jsonb)`, [bina, JSON.stringify([
  ...template.map((s) => ({ id: s.id, name: s.name, unit: "m²", poz_code: s.name === "Temel" ? "ÇT1" : null })),
])]);
check("template poz clashing with own item in a project rejected", /Aynı poz/.test(error ?? ""), error);

// Proje ilerlemesi ve bölümler -----------------------------------------------------------------------
await as(chief, `update public.project_stage_progress set status = 'done' where project_id = $1`, [p2]);
check("custom project asks to complete from its own list", await one(`select status = 'in_progress' and completion_ready as ok from public.projects where id = $1`, [p2]).then((r) => r.ok));
const site = (await one(`select public.save_project_type(null, 'Site', null, true, 'Blok', null, '[{"name":"Temel"},{"name":"Çatı"}]'::jsonb) id`)).id;
const p3 = (await one(`insert into public.projects (project_code, name, location, project_type_id) values ('S-1', 'Site', 'Merkez', $1) returning id`, [site])).id;
const siteTemel = (await one(`select id from public.project_type_stages where project_type_id = $1 and name = 'Temel'`, [site])).id;
await saveStages(p3, "custom", [{ stage_id: siteTemel }, { name: "Havuz" }]);
await as(chief, `insert into public.project_sections (project_id, name) values ($1, 'A'), ($1, 'B')`, [p3]);
check("sections get the custom list", (await one(`select count(*)::int n from public.project_stage_progress where project_id = $1`, [p3])).n === 4);
error = await asErr(chief, `update public.projects set project_type_id = $1 where id = $2`, [bina, p3]);
check("custom project type cannot change", /türü değiştirilemez/.test(error ?? ""), error);

// Yetki ve firma ayrımı ------------------------------------------------------------------------------
error = await saveStages(p2, "custom", [{ stage_id: tid("Temel") }], other);
check("other company cannot edit list", /bulunamadı/.test(error ?? ""), error);
check("other company cannot read lists", (await as(other, `select count(*)::int n from public.project_stages`)).rows[0].n === 0);
error = await asErr(chief, `insert into public.project_stages (project_id, stage_id) values ($1, $2)`, [p1.id, tid("Temel")]);
check("project_stages not writable directly", !!error, error);

await as(chief, `delete from public.projects where id = $1`, [p2]);
check("deleting project removes own items", (await one(`select count(*)::int n from public.project_type_stages where project_id = $1`, [p2])).n === 0);

process.exit(0);
