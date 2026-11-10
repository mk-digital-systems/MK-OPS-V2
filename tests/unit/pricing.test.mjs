// Fiyat hesapları, TL biçimi ve karşılama e-postası şablonu
import {
  PLAN_MONTHS, DEFAULT_DISCOUNT_PERCENT, discountedPrice, priceForMonths, perMonth, savingPercent,
  formatTl, userLimitText, branchLimitText,
} from "../../src/lib/pricing.ts";
import { renderTemplate, unknownPlaceholders, mailtoHref, greetingName } from "../../src/lib/email-template.ts";

let failures = 0;
const check = (name, ok, more = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${more ? ` — ${more}` : ""}`); if (!ok) failures++; };

// --- Fiyat hesabı: dahili fiyat tablosundaki değerlerle birebir -------------------------------------------
check("süreler yalnızca 1/3/6 ay (12 aylık yok)", PLAN_MONTHS.join() === "1,3,6");
check("varsayılan indirim: 1 ay %0, 3 ay %10, 6 ay %15", DEFAULT_DISCOUNT_PERCENT[1] === 0 && DEFAULT_DISCOUNT_PERCENT[3] === 10 && DEFAULT_DISCOUNT_PERCENT[6] === 15);
const table = [[799, 2157, 4075], [1499, 4047, 7645], [2999, 8097, 15295]];
check("799/1499/2999 için 3 ve 6 aylık fiyatlar tabloyla aynı", table.every(([m, q, h]) => discountedPrice(m, 3) === q && discountedPrice(m, 6) === h && discountedPrice(m, 1) === m),
  table.map(([m]) => `${discountedPrice(m, 3)}/${discountedPrice(m, 6)}`).join(" "));
check("indirim yüzdesi elle verilebilir (%20)", discountedPrice(1000, 3, 20) === 2400);
const pro = { price_1m: 1499, price_3m: 4047, price_6m: 7645 };
check("priceForMonths doğru sütunu seçer", priceForMonths(pro, 1) === 1499 && priceForMonths(pro, 3) === 4047 && priceForMonths(pro, 6) === 7645);
check("özel pakette (fiyat yok) null döner", priceForMonths({ price_1m: null, price_3m: null, price_6m: null }, 3) === null);
check("aylık eşdeğer yuvarlanır (4047/3 = 1349)", perMonth(4047, 3) === 1349 && perMonth(7645, 6) === 1274);
check("kazanç yüzdesi: 3 ay %10, 6 ay %15, 1 ay 0", savingPercent(pro, 3) === 10 && savingPercent(pro, 6) === 15 && savingPercent(pro, 1) === 0);
check("1 aylık fiyattan pahalı toplam kazanç eksiye düşmez (0)", savingPercent({ price_1m: 100, price_3m: 400, price_6m: 900 }, 3) === 0);
check("fiyat yoksa kazanç 0", savingPercent({ price_1m: null, price_3m: null, price_6m: null }, 6) === 0);

// --- TL biçimi ---------------------------------------------------------------------------------------------------------
check("formatTl: binlik ayracı noktalı", formatTl(2157) === "2.157 ₺" && formatTl(15295) === "15.295 ₺" && formatTl(799) === "799 ₺");
check("formatTl: kuruşlu tutar iki hane", formatTl(2157.5) === "2.157,50 ₺" && formatTl("1499.00") === "1.499 ₺");
check("formatTl: boş / geçersiz değer tire", formatTl(null) === "—" && formatTl(undefined) === "—" && formatTl("") === "—" && formatTl("abc") === "—");

// --- Limit metinleri ------------------------------------------------------------------------------------------------------
check("kullanıcı metni: hazır paket", userLimitText({ is_custom: false, user_limit: 10 }) === "10 aktif kullanıcı");
check("kullanıcı metni: özel paket 25 kullanıcıdan fazlası", userLimitText({ is_custom: true, user_limit: null }) === "25 kullanıcıdan fazlası");
check("şube metni", branchLimitText(0) === "Tek merkez" && branchLimitText(2) === "Merkez + 2 ek şube");

// --- E-posta şablonu ------------------------------------------------------------------------------------------------------------
const vars = { ad: "Ayşe", firma: "Alfa Yapı", deneme_bitis: "12.11.2026 14:30" };
check("yer tutucular doldurulur (boşluklu yazım dahil)", renderTemplate("Merhaba {{ad}}, {{ firma }} için {{deneme_bitis}}", vars) === "Merhaba Ayşe, Alfa Yapı için 12.11.2026 14:30");
check("bilinmeyen yer tutucu olduğu gibi kalır", renderTemplate("{{ad}} {{isim}}", vars) === "Ayşe {{isim}}");
check("aynı yer tutucu birden çok kez", renderTemplate("{{ad}}-{{ad}}", vars) === "Ayşe-Ayşe");
check("HTML yorumlanmaz, olduğu gibi geçer (düz metin)", renderTemplate("<b>{{ad}}</b>", { ...vars, ad: "<script>x</script>" }) === "<b><script>x</script></b>");
check("bilinmeyen yer tutucular listelenir", JSON.stringify(unknownPlaceholders("{{ad}} {{x}} {{ y }} {{x}}")) === JSON.stringify(["x", "y"]));
check("tümü geçerliyse liste boş", unknownPlaceholders("{{ad}} {{firma}} {{deneme_bitis}}").length === 0);
const mail = mailtoHref("a@b.com", "Konu ş", "Satır 1\nSatır 2");
check("mailto: adres, konu ve metin kodlanır", mail === "mailto:a%40b.com?subject=Konu%20%C5%9F&body=Sat%C4%B1r%201%0ASat%C4%B1r%202", mail ?? "");
check("adres yoksa mailto yok", mailtoHref(null, "k", "m") === null);
check("selamlama adı: ilk ad; ad yoksa e-posta başı", greetingName("Mustafa Öner", "x@y.com") === "Mustafa" && greetingName("  ", "ayse@y.com") === "ayse" && greetingName(null, null) === "");

if (failures) { console.log(`\n${failures} başarısız`); process.exit(1); }
