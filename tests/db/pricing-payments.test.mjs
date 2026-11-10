// Fiyat listesi (anon okur, yalnızca süper admin yazar), plan atama + ödeme kaydı, yeni kayıt / karşılama, gelen kutusu
import { openDb, applyDir } from "./harness.mjs";

const pg = await openDb();
await applyDir(pg);
let failures = 0;
const check = (name, ok, more = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${more ? ` — ${more}` : ""}`); if (!ok) failures++; };
async function as(uid, sql, params = [], role = "authenticated") {
  return pg.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', $2, true)`, [uid ?? "", role]);
    await tx.exec(`set local role ${role}`);
    return tx.query(sql, params);
  });
}
const asErr = (uid, sql, params) => as(uid, sql, params).then(() => null, (e) => e.message);
const one = async (uid, sql, params) => (await as(uid, sql, params)).rows[0];
const sys = (sql, params) => pg.query(sql, params);

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const [ownerA, ownerB, loner, admin] = [1, 2, 3, 9].map(id);
for (const [i, u] of [ownerA, ownerB, loner, admin].entries()) await sys(`insert into auth.users (id, email) values ($1, $2)`, [u, `u${i}@x`]);
await sys(`insert into public.platform_admins (user_id) values ($1)`, [admin]);
await as(ownerA, `select public.create_company('Alfa Yapı')`);
await as(ownerB, `select public.create_company('Beta Yapı')`);
const companyA = (await one(ownerA, `select public.get_my_company() r`)).r.company;
const companyB = (await one(ownerB, `select public.get_my_company() r`)).r.company;
const iso = async (sql) => (await sys(sql)).rows[0].d;

// --- Herkese açık liste ----------------------------------------------------------------------------
const pub = (await as(null, `select public.public_plan_prices() r`, [], "anon")).rows[0].r;
check("anon fiyat listesini okuyabilir: 4 paket, sıralı", pub.length === 4 && pub.map((p) => p.name).join() === "Başlangıç,Profesyonel,Kurumsal,Özel Kurumsal", pub.map((p) => p.name).join());
const pro = pub.find((p) => p.name === "Profesyonel");
check("Profesyonel: 10 kullanıcı, 1/3/6 ay fiyatı 1499/4047/7645", pro.user_limit === 10 && pro.price_1m === 1499 && pro.price_3m === 4047 && pro.price_6m === 7645, JSON.stringify(pro));
const ozel = pub.find((p) => p.name === "Özel Kurumsal");
check("Özel Kurumsal: fiyat yok, özel teklif", ozel.is_custom === true && ozel.price_1m === null && ozel.price_3m === null && ozel.price_6m === null);
check("herkese açık listede iç alanlar (id, rol limitleri, updated_at) yok", !("id" in pro) && !("site_chief_limit" in pro) && !("updated_at" in pro), Object.keys(pro).join());
let e = await asErr(null, `select * from public.plan_prices`, [], "anon");
check("anon plan_prices tablosunu okuyamaz", !!e, e);
e = await asErr(ownerA, `select * from public.plan_prices`);
check("firma kullanıcısı plan_prices tablosunu okuyamaz (RPC-only)", !!e, e);
e = await asErr(ownerA, `select * from public.company_payments`);
check("firma kullanıcısı ödemeleri okuyamaz", !!e, e);
e = await asErr(null, `select public.admin_list_plan_prices()`, [], "anon");
check("anon admin fonksiyonu çalıştıramaz", !!e, e);
for (const [name, sql] of [
  ["fiyat listesi", `select public.admin_list_plan_prices()`],
  ["ödeme listesi", `select public.admin_list_payments()`],
  ["gelen kutusu", `select public.admin_inbox()`],
  ["yeni kullanıcı listesi", `select public.admin_list_new_users('all', 0, 10)`],
  ["e-posta şablonları", `select public.admin_get_email_templates()`],
]) {
  e = await asErr(ownerA, sql);
  check(`firma kullanıcısı ${name} fonksiyonunu çalıştıramaz`, /süper admin/i.test(e ?? ""), e);
}

// --- Fiyat düzenleme ----------------------------------------------------------------------------------
const plans = (await one(admin, `select public.admin_list_plan_prices() r`)).r;
const byName = Object.fromEntries(plans.map((p) => [p.name, p]));
const payload = (changes = {}) => JSON.stringify(plans.map((p) => ({ ...p, ...(changes[p.name] ?? {}) })));
e = await asErr(ownerA, `select public.admin_save_plan_prices($1::jsonb)`, [payload()]);
check("firma kullanıcısı fiyat kaydedemez", /süper admin/i.test(e ?? ""), e);
e = await asErr(admin, `select public.admin_save_plan_prices($1::jsonb)`, [payload({ Profesyonel: { price_3m: null } })]);
check("üç fiyatın hepsi girilmeden kaydedilmez", /üçü de/.test(e ?? ""), e);
e = await asErr(admin, `select public.admin_save_plan_prices($1::jsonb)`, [payload({ Profesyonel: { price_1m: 0 } })]);
check("0 TL fiyat reddedilir", /üçü de|0'dan/.test(e ?? ""), e);
e = await asErr(admin, `select public.admin_save_plan_prices($1::jsonb)`, [payload({ Profesyonel: { manager_limit: 9 } })]);
check("rol toplamı kullanıcı sayısını aşarsa reddedilir", /aşıyor/.test(e ?? ""), e);
e = await asErr(admin, `select public.admin_save_plan_prices($1::jsonb)`, [payload({ Kurumsal: { site_chief_limit: 0 } })]);
check("en az 1 firma yöneticisi şartı", /en az 1 firma yöneticisi/.test(e ?? ""), e);
await as(admin, `select public.admin_save_plan_prices($1::jsonb)`, [payload({ Profesyonel: { price_1m: 1599 }, Kurumsal: { is_published: false } })]);
const pub2 = (await as(null, `select public.public_plan_prices() r`, [], "anon")).rows[0].r;
check("fiyat değişikliği anında herkese açık listeye yansır (1599)", pub2.find((p) => p.name === "Profesyonel").price_1m === 1599);
check("yayından kaldırılan paket herkese açık listeden çıkar", !pub2.some((p) => p.name === "Kurumsal") && pub2.length === 3);
await as(admin, `select public.admin_save_plan_prices($1::jsonb)`, [payload({ "Özel Kurumsal": { price_1m: 5000, user_limit: 99 } })]);
const ozelAfter = (await one(admin, `select public.admin_list_plan_prices() r`)).r.find((p) => p.is_custom);
check("Özel Kurumsal için fiyat girilse bile boş kalır", ozelAfter.price_1m === null && ozelAfter.user_limit === null);
let ev = (await one(admin, `select public.admin_platform_events() r`)).r.filter((x) => x.action === "update_prices");
check("fiyat değişikliği işlem geçmişine yazıldı (eski → yeni)", ev.length >= 1 && ev[ev.length - 1].details.Profesyonel?.price_1m?.old === 1499 && ev[ev.length - 1].details.Profesyonel?.price_1m?.new === 1599, JSON.stringify(ev[0]?.details));
// geri al: Kurumsal yayında, Profesyonel eski fiyat
const plans2 = (await one(admin, `select public.admin_list_plan_prices() r`)).r;
await as(admin, `select public.admin_save_plan_prices($1::jsonb)`, [JSON.stringify(plans2.map((p) => p.name === "Kurumsal" ? { ...p, is_published: true } : p.name === "Profesyonel" ? { ...p, price_1m: 1499 } : p))]);
check("geri alınca liste yeniden 4 paket", (await as(null, `select public.public_plan_prices() r`, [], "anon")).rows[0].r.length === 4);

// --- Plan atama + ödeme ------------------------------------------------------------------------------------
const today = await iso(`select to_char(timezone('Europe/Istanbul', now())::date, 'YYYY-MM-DD') d`);
const assign = (uid, company, plan, months, amount, paid = today, method = "eft", note = null) =>
  asErr(uid, `select public.admin_assign_plan($1, $2, $3, $4, $5::date, $6, $7)`, [company, plan, months, amount, paid, method, note]);
e = await assign(ownerA, companyA.id, "Başlangıç", 3, 2157);
check("firma kullanıcısı plan atayamaz", /süper admin/i.test(e ?? ""), e);
e = await assign(admin, companyA.id, "Başlangıç", 12, 100);
check("12 aylık plan atanamaz (yalnızca 1/3/6)", /1, 3 veya 6/.test(e ?? ""), e);
e = await assign(admin, companyA.id, "Başlangıç", 3, -5);
check("negatif tutar reddedilir", /tutarı geçersiz/.test(e ?? ""), e);
e = await assign(admin, companyA.id, "Başlangıç", 3, 2157, "2999-01-01");
check("ileri tarihli ödeme reddedilir", /ileri tarihli/.test(e ?? ""), e);
e = await assign(admin, companyA.id, "Yok Paketi", 3, 2157);
check("fiyat listesinde olmayan plan reddedilir", /fiyat listesinde yok/.test(e ?? ""), e);
e = await assign(admin, companyA.id, "Başlangıç", 3, 2157, today, "kredi");
check("geçersiz ödeme yöntemi reddedilir", /yöntemi geçersiz/.test(e ?? ""), e);
check("hatalı denemeler hiç ödeme kaydı bırakmadı", Number((await sys(`select count(*) n from public.company_payments`)).rows[0].n) === 0);

const r1 = (await one(admin, `select public.admin_assign_plan($1, 'Başlangıç', 3, 2000, $2::date, 'eft', 'İlk ödeme') r`, [companyA.id, today])).r;
const expEnd1 = await iso(`select to_char((timezone('Europe/Istanbul', now())::date + interval '3 months')::date, 'YYYY-MM-DD') d`);
check("plan atandı: bitiş bugünden 3 ay sonra", r1.period_end === expEnd1 && r1.period_start === today, JSON.stringify(r1));
let c = (await one(admin, `select public.admin_list_companies() r`)).r.find((x) => x.id === companyA.id);
check("firma planı ve durumu: Başlangıç, aktif", c.plan === "Başlangıç" && c.access_status === "active", `${c.plan}/${c.access_status}`);
const limA = (await sys(`select user_limit, site_chief_limit, manager_limit, accounting_limit, branch_limit from public.companies where id = $1`, [companyA.id])).rows[0];
check("limitler fiyat listesinden doldu: 3 kullanıcı (1/1/1), 0 ek şube", limA.user_limit === 3 && limA.site_chief_limit === 1 && limA.manager_limit === 1 && limA.accounting_limit === 1 && limA.branch_limit === 0, JSON.stringify(limA));
let pays = (await one(admin, `select public.admin_list_payments() r`)).r;
check("ödeme listeye işlendi: tutar 2000, liste fiyatı 2157, plan ve dönem", pays.length === 1 && Number(pays[0].amount_tl) === 2000 && Number(pays[0].list_price_tl) === 2157 && pays[0].plan === "Başlangıç" && pays[0].months === 3 && pays[0].period_end === expEnd1 && pays[0].note === "İlk ödeme" && pays[0].company_name === "Alfa Yapı", JSON.stringify(pays[0]));

// Aynı plan yenileme: mevcut bitişten uzar
const r2 = (await one(admin, `select public.admin_assign_plan($1, 'Başlangıç', 1, 799, $2::date) r`, [companyA.id, today])).r;
const expEnd2 = await iso(`select to_char(($1::date + interval '1 month')::date, 'YYYY-MM-DD') d`.replace("$1", `'${expEnd1}'`));
check("aynı plan yenilenince süre mevcut bitişe eklenir", r2.period_start === expEnd1 && r2.period_end === expEnd2, JSON.stringify(r2));
// Farklı plan: bugünden başlar, limitler değişir
const r3 = (await one(admin, `select public.admin_assign_plan($1, 'Profesyonel', 6, 7645, $2::date, 'nakit') r`, [companyA.id, today])).r;
check("farklı plana geçince süre bugünden başlar", r3.period_start === today, JSON.stringify(r3));
const limA2 = (await sys(`select user_limit, branch_limit from public.companies where id = $1`, [companyA.id])).rows[0];
check("Profesyonel limitleri: 10 kullanıcı, 2 ek şube", limA2.user_limit === 10 && limA2.branch_limit === 2, JSON.stringify(limA2));
// Özel Kurumsal: limitler korunur
const trialB = (await sys(`select trial_ends_at from public.companies where id = $1`, [companyB.id])).rows[0].trial_ends_at.toISOString();
await as(admin, `select public.admin_update_company($1, 'Özel', null, 40, $2::timestamptz, 3, 20, 2, 7)`, [companyB.id, trialB]);
await as(admin, `select public.admin_assign_plan($1, 'Özel Kurumsal', 6, 25000, $2::date)`, [companyB.id, today]);
const limB = (await sys(`select plan, user_limit, branch_limit from public.companies where id = $1`, [companyB.id])).rows[0];
check("Özel Kurumsal: firmanın elle girilen limitleri korunur", limB.plan === "Özel Kurumsal" && limB.user_limit === 40 && limB.branch_limit === 7, JSON.stringify(limB));
// Kota koruması: firmada kullanıcı fazlaysa düşük plan atanamaz
await sys(`update public.companies set site_chief_limit = null, manager_limit = null, accounting_limit = null, user_limit = null where id = $1`, [companyB.id]);
const managerOver = id(21);
await sys(`insert into auth.users (id, email) values ($1, 'm@x')`, [managerOver]);
await sys(`select set_config('mk_ops.allow_company_assignment', 'on', false)`);
await sys(`update public.profiles set company_id = $1, role = 'company_manager', is_approved = true where id = $2`, [companyB.id, managerOver]);
await sys(`select set_config('mk_ops.allow_company_assignment', 'off', false)`);
const managerOver2 = id(22);
await sys(`insert into auth.users (id, email) values ($1, 'm2@x')`, [managerOver2]);
await sys(`select set_config('mk_ops.allow_company_assignment', 'on', false)`);
await sys(`update public.profiles set company_id = $1, role = 'company_manager', is_approved = true where id = $2`, [companyB.id, managerOver2]);
await sys(`select set_config('mk_ops.allow_company_assignment', 'off', false)`);
const before = Number((await sys(`select count(*) n from public.company_payments`)).rows[0].n);
e = await assign(admin, companyB.id, "Başlangıç", 1, 799);
check("firmada fazla kullanıcı varken küçük plan atanamaz (kota koruması) ve ödeme kaydı oluşmaz", !!e && Number((await sys(`select count(*) n from public.company_payments`)).rows[0].n) === before, e);

// Liste, yıl filtresi, iptal
pays = (await one(admin, `select public.admin_list_payments() r`)).r;
check("ödeme listesi 4 kayıt, en yeni önde", pays.length === 4, String(pays.length));
const year = Number(today.slice(0, 4));
check("yıl filtresi bu yılın kayıtlarını getirir, başka yılı boş", (await one(admin, `select public.admin_list_payments($1) r`, [year])).r.length === 4 && (await one(admin, `select public.admin_list_payments($1) r`, [year - 3])).r.length === 0);
const target = pays.find((p) => p.plan === "Başlangıç" && p.months === 1);
e = await asErr(ownerA, `select public.admin_void_payment($1, 'hata')`, [target.id]);
check("firma kullanıcısı ödeme iptal edemez", /süper admin/i.test(e ?? ""), e);
e = await asErr(admin, `select public.admin_void_payment($1, 'x')`, [target.id]);
check("iptal nedeni zorunlu", /İptal nedeni/.test(e ?? ""), e);
await as(admin, `select public.admin_void_payment($1, 'Yanlış tutar girildi')`, [target.id]);
e = await asErr(admin, `select public.admin_void_payment($1, 'tekrar')`, [target.id]);
check("iptal edilmiş ödeme tekrar iptal edilemez", /zaten iptal/.test(e ?? ""), e);
pays = (await one(admin, `select public.admin_list_payments() r`)).r;
const voided = pays.find((p) => p.id === target.id);
check("iptal edilen kayıt listede kalır ve nedeni görünür", !!voided.voided_at && voided.void_reason === "Yanlış tutar girildi");
check("iptal kaydı silinmedi (4 kayıt)", pays.length === 4);

// Firma silinse de gelir kaydı kalır
await as(admin, `select public.admin_delete_company($1, 'Beta Yapı')`, [companyB.id]);
pays = (await one(admin, `select public.admin_list_payments() r`)).r;
check("firma silinse de ödeme kaydı ve firma adı kalır", pays.some((p) => p.company_name === "Beta Yapı" && p.plan === "Özel Kurumsal"), String(pays.length));
const kinds = new Set((await one(admin, `select public.admin_platform_events() r`)).r.map((x) => x.action));
check("işlem geçmişinde assign_plan, void_payment, update_prices var", ["assign_plan", "void_payment", "update_prices"].every((k) => kinds.has(k)), [...kinds].join());

// --- Yeni kayıtlar, karşılama, gelen kutusu ------------------------------------------------------------------------
const joiner = id(23);
await sys(`insert into auth.users (id, email) values ($1, 'j@x')`, [joiner]);
await sys(`select set_config('mk_ops.allow_company_assignment', 'on', false)`);
await sys(`update public.profiles set company_id = $1, role = 'company_manager', is_approved = true where id = $2`, [companyA.id, joiner]);
await sys(`select set_config('mk_ops.allow_company_assignment', 'off', false)`);
// Bu testteki kullanıcılar migration'dan sonra eklendi: "yeni" sayılırlar (migration yalnızca önceden kayıtlıları işaretledi).
let inbox = (await one(admin, `select public.admin_inbox() r`)).r;
const listUsers = async (status = "all", offset = 0, limit = 50) => (await one(admin, `select public.admin_list_new_users($1, $2, $3) r`, [status, offset, limit])).r;
const newList = (await listUsers()).items;
check("yeni kayıt listesinde süper admin yok", !newList.some((u) => u.id === admin));
check("firma kuran kullanıcı listelenir (firma adı ile)", newList.some((u) => u.id === ownerA && u.company_name === "Alfa Yapı" && u.onboarding_status === null));
check("şirketsiz kayıt da listelenir", newList.some((u) => u.id === loner && u.company_id === null));
const joinerRow = newList.find((u) => u.id === joiner);
check("mevcut şirkete katılan kullanıcı da listelenir (firma adı, rol, ana yönetici değil)", !!joinerRow && joinerRow.company_name === "Alfa Yapı" && joinerRow.role === "company_manager" && joinerRow.is_owner === false, JSON.stringify(joinerRow));
check("firma kuran kullanıcı ana yönetici olarak işaretli", newList.find((u) => u.id === ownerA).is_owner === true);
const waitingBefore = newList.filter((u) => u.onboarding_status === null).length;
check("gelen kutusu bekleyen yeni kayıt sayısı listeyle uyumlu", inbox.new_users === waitingBefore && inbox.items.filter((i) => i.type === "new_user").length === Math.min(waitingBefore, 8), `${inbox.new_users}/${waitingBefore}`);

e = await asErr(ownerA, `select public.admin_set_user_onboarding($1, 'sent')`, [ownerA]);
check("firma kullanıcısı karşılama işareti koyamaz", /süper admin/i.test(e ?? ""), e);
e = await asErr(admin, `select public.admin_set_user_onboarding($1, 'belki')`, [ownerA]);
check("geçersiz durum reddedilir", /Geçersiz durum/.test(e ?? ""), e);
await as(admin, `select public.admin_set_user_onboarding($1, 'sent')`, [ownerA]);
await as(admin, `select public.admin_set_user_onboarding($1, 'skipped')`, [loner]);
const newList2 = (await listUsers()).items;
const markedA = newList2.find((u) => u.id === ownerA);
check("e-posta gönderildi işareti: durum sent ve zaman dolu, kullanıcı listede kalır", markedA.onboarding_status === "sent" && !!markedA.handled_at);
inbox = (await one(admin, `select public.admin_inbox() r`)).r;
check("işaretlenenler bekleyen sayısından düşer", inbox.new_users === waitingBefore - 2, `${inbox.new_users}`);
await as(admin, `select public.admin_set_user_onboarding($1, null)`, [ownerA]);
check("işaret geri alınınca yeniden bekliyor", (await one(admin, `select public.admin_inbox() r`)).r.new_users === waitingBefore - 1);

// Süzgeçler ve sayfalama
const pendingNow = await listUsers("pending");
check("süzgeç 'bekleyen': yalnızca işaretsizler, total doğru", pendingNow.items.every((u) => u.onboarding_status === null) && pendingNow.total === pendingNow.items.length && pendingNow.total === waitingBefore - 1, String(pendingNow.total));
const sentNow = await listUsers("sent");
check("süzgeç 'gönderilen': şu an e-posta gönderildi işaretli kimse yok (ownerA işareti geri alındı)", sentNow.total === 0);
await as(admin, `select public.admin_set_user_onboarding($1, 'sent')`, [ownerA]);
const sentAfter = await listUsers("sent");
check("gönderildi işaretlenen kullanıcı 'gönderilen' listesinde, işaretleyen e-posta dolu", sentAfter.total === 1 && sentAfter.items[0].id === ownerA && !!sentAfter.items[0].handled_by_email);
const page1 = await listUsers("all", 0, 1);
const page2 = await listUsers("all", 1, 1);
check("sayfalama: total aynı, sayfalar farklı kayıt döndürür", page1.total === page2.total && page1.items.length === 1 && page2.items.length === 1 && page1.items[0].id !== page2.items[0].id);
e = await asErr(admin, `select public.admin_list_new_users('xyz')`);
check("geçersiz süzgeç reddedilir", /Geçersiz süzgeç/.test(e ?? ""), e);
check("liste kayıt tarihine göre yeniden eskiye", page1.items[0].created_at >= page2.items[0].created_at);
check("firma bilgisi: deneme bitişi ve doğrulama alanı döner", "trial_ends_at" in page1.items[0] && "email_confirmed_at" in page1.items[0]);

// E-posta şablonu
let tpl = (await one(admin, `select public.admin_get_email_templates() r`)).r;
check("karşılama şablonu hazır gelir (konu ve metin dolu, sürüm 1)", tpl.length === 1 && tpl[0].kind === "welcome" && tpl[0].subject.length > 0 && /{{ad}}/.test(tpl[0].body) && tpl[0].version === 1);
e = await asErr(ownerA, `select public.admin_save_email_template('welcome', 'x', 'y')`);
check("firma kullanıcısı şablonu değiştiremez", /süper admin/i.test(e ?? ""), e);
e = await asErr(admin, `select public.admin_save_email_template('welcome', 'Konu', 'Merhaba {{isim}}')`);
check("bilinmeyen yer tutucu reddedilir", /Bilinmeyen yer tutucu/.test(e ?? ""), e);
e = await asErr(admin, `select public.admin_save_email_template('baska', 'Konu', 'Metin')`);
check("bilinmeyen şablon türü reddedilir", /Geçersiz şablon/.test(e ?? ""), e);
const ver = (await one(admin, `select public.admin_save_email_template('welcome', 'Hoş geldiniz', 'Merhaba {{ ad }}, {{firma}} için deneme: {{deneme_bitis}}') v`)).v;
tpl = (await one(admin, `select public.admin_get_email_templates() r`)).r;
check("şablon kaydedilir: sürüm artar, güncelleyen e-posta yazılır", ver === 2 && tpl[0].version === 2 && tpl[0].subject === "Hoş geldiniz" && !!tpl[0].updated_by_email);

// Destek talebi bildirimi
check("açık destek talebi yokken sayı 0", inbox.open_support === 0);
await as(ownerA, `select public.create_support_request('plan', 'Profesyonel', 'Profesyonel plana geçmek istiyoruz')`);
inbox = (await one(admin, `select public.admin_inbox() r`)).r;
const sup = inbox.items.find((i) => i.type === "support");
check("yeni plan talebi gelen kutusunda: sayı 1, başlık ve firma adı", inbox.open_support === 1 && sup?.title === "Yeni plan talebi" && /Alfa Yapı/.test(sup.body), JSON.stringify(sup));
const reqId = (await sys(`select id from public.support_requests limit 1`)).rows[0].id;
await as(admin, `select public.admin_reply_support_request($1, 'Teklif gönderdik', 'answered')`, [reqId]);
check("talep yanıtlanınca bildirimden düşer", (await one(admin, `select public.admin_inbox() r`)).r.open_support === 0);

if (failures) { console.log(`\n${failures} başarısız`); process.exit(1); }
