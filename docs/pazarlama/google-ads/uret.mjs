// MK OPS Google Ads verisi: karakter sınırlarını doğrular, CSV ve Markdown üretir.
// Kullanım (depo kökünden): node docs/pazarlama/google-ads/uret.mjs docs/pazarlama/google-ads
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2];
const SITE = "https://www.mk-ops.tr";
const len = (s) => Array.from(s).length;

const COMMON_H = ["48 Saat Ücretsiz Deneyin", "Kredi Kartı Gerekmez", "Kurulum Yok, Tarayıcıdan"];

const CAMPAIGNS = [
  {
    name: "MK OPS | Marka",
    groups: [
      {
        name: "Marka",
        url: "/",
        path: ["mk-ops", ""],
        keywords: ['"mk ops"', "[mk ops]", "[mkops]", "[mk-ops]", '"mk ops giriş"'],
        headlines: [
          "MK OPS Resmi Sitesi",
          "MK OPS Saha Yönetimi",
          ...COMMON_H,
          "Hakediş, Puantaj, Stok, Araç",
          "Ekipler, İşler Tek Panelde",
          "Firma Logolu Çıktılar",
          "İş Planı WhatsApp'a Tek Tuşla",
          "Panele Giriş Yapın",
        ],
        descriptions: [
          "Proje, iş planı, imalat, hakediş, puantaj, depo ve araçlar tek panelde. Hemen deneyin.",
          "48 saat ücretsiz, bütün modüller açık. Kurulum ve kredi kartı gerekmez.",
          "Bilgisayar, tablet ve telefondan çalışır. Çıktılarda sizin firma adınız ve logonuz.",
        ],
      },
    ],
  },
  {
    name: "MK OPS | Arama | Ana",
    groups: [
      {
        name: "Şantiye ve Saha Yönetimi",
        url: "/",
        path: ["şantiye", "yönetim"],
        keywords: [
          '"şantiye yönetim programı"', "[şantiye yönetim programı]",
          '"şantiye takip programı"', "[şantiye takip programı]",
          '"şantiye yönetim yazılımı"', '"şantiye yazılımı"',
          '"saha yönetim programı"', '"saha operasyon yönetimi"',
          '"saha ekibi yönetim programı"', '"taşeron yönetim programı"',
          '"müteahhit programı"', '"inşaat takip programı"',
        ],
        headlines: [
          "Şantiye Yönetim Programı",
          "Saha ve Operasyon Yönetimi",
          "Ekipler, İşler Tek Panelde",
          ...COMMON_H,
          "İş Planı WhatsApp'a Tek Tuşla",
          "Hakediş, Puantaj, Stok, Araç",
          "Excel ve Mesaj Grubuna Son",
          "Kim Neyi Değiştirdi, Kayıtlı",
          "Taşeron ve Müteahhitlere",
          "Çıktılarda Sizin Logonuz",
          "Telefon Açmadan İş Durumu",
          "Verileriniz Firmanıza Özel",
          "MK OPS ile Sahayı Yönetin",
        ],
        descriptions: [
          "Proje, günlük iş planı, imalat, hakediş, puantaj, depo ve araçlar tek panelde.",
          "Sabah plan WhatsApp'a, akşam imalat projeye ve hakedişe kendiliğinden işlensin.",
          "Bilgisayar, tablet ve telefondan çalışır. 48 saat ücretsiz, kredi kartı yok.",
          "Rol ve modül bazında yetki, işlem geçmişi, firma logolu PDF, Excel ve Word çıktılar.",
        ],
      },
      {
        name: "Hakediş",
        url: "/cozumler/hakedis-takibi",
        path: ["hakediş", "program"],
        keywords: [
          '"hakediş programı"', "[hakediş programı]",
          '"hakediş takip programı"', "[hakediş takip programı]",
          '"hakediş takibi"', '"hakediş yazılımı"',
          '"taşeron hakediş programı"', "[taşeron hakediş programı]",
          '"taşeron hakediş takibi"', '"metraj ve hakediş programı"',
        ],
        headlines: [
          "Hakediş Takip Programı",
          "Metraj Girin, Hakediş Hazır",
          ...COMMON_H,
          "Logolu PDF ve Excel Rapor",
          "Fiyat Sabitlenir, Bozulmaz",
          "Ek İşler de Hakedişe Girer",
          "Taşeronlar İçin Hakediş",
          "Proje ve İş Kalemi Bazında",
          "Dönem Raporu Tek Tıkla",
          "Fiyatları Sadece Yetkili Görür",
          "Excel ile Uğraşmayın",
          "Saha Ekibi Olan Firmalara",
          "MK OPS Hakediş",
        ],
        descriptions: [
          "Sahadan gelen metraj birim fiyatla çarpılır, hakedişiniz her gün güncel kalır.",
          "Fiyat değişse de geçmiş dönem bozulmaz. Proje ve iş kalemi bazında PDF ve Excel.",
          "Plan dışı ek işler unutulmaz; açıklama, miktar ve fiyatla hakedişe eklenir.",
          "48 saat ücretsiz, kurulum ve kredi kartı yok. İş planı, puantaj ve stok da burada.",
        ],
      },
      {
        name: "Günlük İş Planı ve İmalat",
        url: "/cozumler/gunluk-is-takibi",
        path: ["iş-planı", "günlük"],
        keywords: [
          '"günlük iş planı programı"', '"saha iş takip programı"',
          '"ekip iş takip programı"', '"günlük imalat raporu"',
          '"saha ekip yönetimi"', '"günlük faaliyet raporu programı"',
          '"ekip planlama programı"', '"saha ekibi takip programı"',
        ],
        headlines: [
          "Günlük İş Planı Programı",
          "Plan WhatsApp'a Tek Tuşla",
          "Aynı Kişi İki Ekibe Yazılmaz",
          "Logolu Plan Görseli",
          "İş Planından İmalat Doldur",
          "İmalat Projeye Kendisi İşlenir",
          "Günlük Rapor Logolu PDF",
          "Ekip, Proje ve Araç Eşleştir",
          ...COMMON_H,
          "Saha Ekipleri İçin İş Takibi",
          "Geçmiş Planlarda Arama",
          "Ekip Uygulama Kurmaz",
          "MK OPS İş Planı",
        ],
        descriptions: [
          "Sabah ekipleri proje, şef ve personelle kurun; planı logolu görselle WhatsApp'a atın.",
          "Akşam İş Planından Doldur ile miktarları girin; ilerleme ve hakediş güncellensin.",
          "Aynı personel veya araç aynı gün iki ekibe yazılamaz. İzinli ve raporlular ayrı.",
          "48 saat ücretsiz, kurulum ve kredi kartı yok. Puantaj, stok ve araçlar da burada.",
        ],
      },
      {
        name: "Proje ve Metraj",
        url: "/cozumler/proje-metraj-takibi",
        path: ["proje", "metraj"],
        keywords: [
          '"inşaat proje takip programı"', '"proje takip programı inşaat"',
          '"metraj takip programı"', '"altyapı proje takip programı"',
          '"doğalgaz proje takip"', '"inşaat ilerleme takibi"',
          '"şantiye ilerleme raporu"', '"iş kalemi takibi"',
        ],
        headlines: [
          "İnşaat Proje Takip Programı",
          "Metraj ve İlerleme Takibi",
          "Blok, Kat, Hat Kesimi Bazında",
          "İlerleme Yüzdesi Otomatik",
          "Kendi İş Kalemleriniz",
          "Geciken Proje Bildirimi",
          "Altyapı ve Bina Şablonları",
          ...COMMON_H,
          "Doğalgaz, Elektrik, Fiber",
          "Kim Neyi Değiştirdi, Kayıtlı",
          "Hakediş Aynı Panelde",
          "Saha Ekibi Olan Firmalara",
          "MK OPS Proje Takibi",
        ],
        descriptions: [
          "İş türlerinizi ve kalemlerinizi kendiniz tanımlayın; projeleri metrajla izleyin.",
          "Hedef ve yapılan miktardan ilerleme yüzdesi otomatik. Gecikmelerde bildirim alın.",
          "Bina, altyapı hattı, doğalgaz, elektrik, fiber ve servis şablonlarıyla başlayın.",
          "48 saat ücretsiz, kurulum ve kredi kartı yok. İş planı, hakediş ve puantaj burada.",
        ],
      },
    ],
  },
  {
    name: "MK OPS | Arama | Modüller",
    groups: [
      {
        name: "Puantaj",
        url: "/cozumler/puantaj-personel-takibi",
        path: ["puantaj", "personel"],
        keywords: [
          '"puantaj programı"', "[puantaj programı]",
          '"personel puantaj programı"', "[personel puantaj programı]",
          '"puantaj takip programı"', '"şantiye puantaj programı"',
          '"online puantaj programı"', '"puantaj yazılımı"',
          '"işçi puantaj programı"', '"personel devam takip programı"',
        ],
        headlines: [
          "Personel Puantaj Programı",
          "Ay Sonu Puantajı Tek Tıkla",
          "Excel ve Word Puantaj Çıktısı",
          "İzin, Rapor, Hafta Tatili",
          "Pazar Günleri Otomatik Tatil",
          "Avans Takibi Aynı Yerde",
          ...COMMON_H,
          "Muhasebe Sadece Puantajı Görür",
          "Kim Değiştirdi, Kayıtlı",
          "Şantiye Personeli İçin",
          "Hak Edilen Gün Otomatik",
          "Saha Ekibi Olan Firmalara",
          "MK OPS Puantaj",
        ],
        descriptions: [
          "Her personelin her gününü tek tabloda işaretleyin; hak edilen gün kendisi hesaplanır.",
          "Aylık ve kişi bazında puantajı firma logolu Excel ve Word olarak muhasebeye verin.",
          "Puantaj değişikliklerinin geçmişi tutulur. Avans kaydı ve dökümü personel kartında.",
          "48 saat ücretsiz, kurulum ve kredi kartı yok. İş planı, hakediş ve stok da burada.",
        ],
      },
      {
        name: "Malzeme ve Depo",
        url: "/cozumler/irsaliye-malzeme-takibi",
        path: ["depo", "malzeme"],
        keywords: [
          '"şantiye malzeme takibi"', '"şantiye depo programı"',
          '"şantiye stok takibi"', '"malzeme takip programı"',
          '"irsaliye takip programı"', '"malzeme stok programı"',
          '"çoklu depo stok programı"', '"depo stok takip programı"',
        ],
        headlines: [
          "Şantiye Malzeme Takibi",
          "Hangi Malzeme Hangi Depoda",
          "Sınırsız Depo ve Şube",
          "İrsaliye ile Stok Girişi",
          "Depolar Arası Sevkiyat",
          "Seri Numaralı Malzeme Takibi",
          "Malzeme Talep ve Onay Akışı",
          "Stok Listesi Excel ve PDF",
          "Malzeme Hangi Projeye Gitti",
          ...COMMON_H,
          "Kendi Kategorileriniz",
          "Saha Ekibi Olan Firmalara",
          "MK OPS Malzeme ve Depo",
        ],
        descriptions: [
          "Malzemeyi irsaliyeyle depoya girin, depolar arasında sevk edin, projeye düşün.",
          "Her hareket kim ve ne zaman bilgisiyle kayıtlı. Hatalı sevkiyat geri alınabilir.",
          "Kategori seçerek, her depo ayrı sütunda olacak şekilde Excel ve PDF stok listesi.",
          "48 saat ücretsiz, kurulum ve kredi kartı yok. Hakediş, puantaj ve araçlar burada.",
        ],
      },
      {
        name: "Araç ve Ekipman",
        url: "/cozumler/arac-ekipman-takibi",
        path: ["araç", "zimmet"],
        keywords: [
          '"ekipman zimmet takibi"', '"zimmet takip programı"',
          '"demirbaş zimmet programı"', '"demirbaş takip programı"',
          '"araç muayene takip programı"', '"araç yakıt takip programı"',
          '"alet zimmet takibi"', '"şantiye ekipman takibi"',
        ],
        headlines: [
          "Ekipman Zimmet Takibi",
          "Hangi Alet Kimde, Bilin",
          "Muayene Tarihini Kaçırmayın",
          "Sigorta Bitişi 15 Gün Önce",
          "Yakıt ve Kilometre Kaydı",
          "Araca, Personele Zimmet",
          "Aylık Yakıt Dökümü",
          "Demirbaş Takip Programı",
          ...COMMON_H,
          "Araç Ekipman Listesi Word",
          "Tüm Aktarım Geçmişi",
          "Saha Ekibi Olan Firmalara",
          "MK OPS Araç ve Ekipman",
        ],
        descriptions: [
          "Matkap, jeneratör gibi demirbaşları araca, personele veya ekibe zimmetleyin.",
          "Muayene ve sigorta tarihine 15 gün kala bildirim alın. Yakıt ve km kaydı tutun.",
          "Ekipman depoda mı, kimde mi, tüm aktarım geçmişiyle görün. İade de kayıtlı.",
          "48 saat ücretsiz, kurulum ve kredi kartı yok. İş planı, puantaj, hakediş burada.",
        ],
      },
    ],
  },
];

// Tüm arama kampanyalarına eklenecek ortak negatif liste (sıralı ifade eşlemesi).
const NEGATIVES = {
  "İş arayanlar": ["iş ilanı", "iş ilanları", "eleman", "maaşı", "maaşları", "kariyer", "staj", "kadrolu", "cv"],
  "Bilgi / eğitim arayanlar": ["nedir", "ne demek", "nasıl yapılır", "nasıl hesaplanır", "örneği", "örnekleri", "ders", "kurs", "eğitimi", "sertifika", "tez", "ödev", "pdf"],
  "Bedava / korsan": ["bedava", "crack", "full indir", "indir", "şablonu", "excel şablon", "apk"],
  "Kamu hakedişi ve keşif (MK OPS'ta yok)": ["fiyat farkı", "ekap", "yaklaşık maliyet", "keşif özeti", "poz no", "poz numarası", "birim fiyat listesi", "çevre şehircilik birim fiyat", "kesin hesap"],
  "Çizimden metraj / CAD (MK OPS'ta yok)": ["autocad", "revit", "çizim", "dwg", "metraj hesaplama", "metraj cetveli"],
  "GPS araç takip (MK OPS'ta yok)": ["gps", "uydu", "takip cihazı", "anlık konum", "canlı takip", "konum takibi", "araç takip cihazı"],
  "Bordro ve PDKS (MK OPS'ta yok)": ["bordro", "maaş hesaplama", "sgk", "pdks", "parmak izi", "kartlı geçiş", "yüz tanıma", "turnike"],
  "Perakende stok (hedef dışı)": ["e-ticaret", "market", "mağaza", "barkod", "pos", "kasa programı", "restoran"],
};

const SITELINKS = [
  ["Hakediş Takibi", "/cozumler/hakedis-takibi", "Metraj girin, hakediş hazır", "Logolu PDF ve Excel rapor"],
  ["Günlük İş Planı", "/cozumler/gunluk-is-takibi", "Plan WhatsApp'a logolu görselle", "İmalat projeye kendisi işlenir"],
  ["Puantaj ve Personel", "/cozumler/puantaj-personel-takibi", "Ay sonu Excel ve Word çıktısı", "İzin, rapor ve avans takibi"],
  ["Malzeme ve Depo", "/cozumler/irsaliye-malzeme-takibi", "Çoklu depo, irsaliye, sevkiyat", "Excel ve PDF stok listesi"],
  ["Araç ve Ekipman", "/cozumler/arac-ekipman-takibi", "Muayene ve sigorta uyarısı", "Ekipman zimmeti ve iadesi"],
  ["48 Saat Ücretsiz Dene", "/register", "Bütün modüller açık", "Kredi kartı gerekmez"],
  ["Kullanım Kılavuzu", "/kilavuz", "Adım adım nasıl kullanılır", "Kurulumdan hakediş raporuna"],
];

const CALLOUTS = [
  "48 Saat Ücretsiz Deneme", "Kredi Kartı Gerekmez", "Kurulum Yok", "Telefon ve Bilgisayarda",
  "Firma Logolu Çıktılar", "Excel, Word ve PDF", "Rol ve Modül Yetkisi", "Verileriniz Size Özel",
  "WhatsApp Destek", "Otomatik Yenileme Yok",
];

const SNIPPET = {
  header: "Hizmet kataloğu",
  values: ["Hakediş", "Günlük İş Planı", "İmalat Raporu", "Puantaj ve Avans", "Malzeme ve Depo", "Araç ve Ekipman"],
};

// --- Doğrulama ---------------------------------------------------------------
const errors = [];
const check = (label, s, max) => { if (len(s) > max) errors.push(`${label} (${len(s)}/${max}): ${s}`); };
for (const c of CAMPAIGNS) for (const g of c.groups) {
  const tag = `${c.name} > ${g.name}`;
  if (g.headlines.length < 3 || g.headlines.length > 15) errors.push(`${tag}: başlık sayısı ${g.headlines.length}`);
  if (g.descriptions.length < 2 || g.descriptions.length > 4) errors.push(`${tag}: açıklama sayısı ${g.descriptions.length}`);
  if (new Set(g.headlines).size !== g.headlines.length) errors.push(`${tag}: tekrarlanan başlık`);
  g.headlines.forEach((h) => check(`${tag} başlık`, h, 30));
  g.descriptions.forEach((d) => check(`${tag} açıklama`, d, 90));
  g.path.forEach((p) => check(`${tag} yol`, p, 15));
}
SITELINKS.forEach(([t, , d1, d2]) => { check("site bağlantısı", t, 25); check("sb açıklama", d1, 35); check("sb açıklama", d2, 35); });
CALLOUTS.forEach((c) => check("açıklama metni", c, 25));
SNIPPET.values.forEach((v) => check("snippet", v, 25));
Object.values(NEGATIVES).flat().forEach((n) => check("negatif", n, 80));
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }

// --- Çıktılar ----------------------------------------------------------------
mkdirSync(OUT, { recursive: true });
const csv = (rows) => "﻿" + rows.map((r) => r.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n") + "\r\n";
const matchOf = (k) => (k.startsWith("[") ? ["Exact", k.slice(1, -1)] : k.startsWith('"') ? ["Phrase", k.slice(1, -1)] : ["Broad", k]);

const kwRows = [["Campaign", "Ad Group", "Keyword", "Criterion Type", "Final URL"]];
const adRows = [[
  "Campaign", "Ad Group", "Ad type",
  ...Array.from({ length: 15 }, (_, i) => `Headline ${i + 1}`),
  ...Array.from({ length: 4 }, (_, i) => `Description ${i + 1}`),
  "Path 1", "Path 2", "Final URL",
]];
for (const c of CAMPAIGNS) for (const g of c.groups) {
  for (const k of g.keywords) { const [type, text] = matchOf(k); kwRows.push([c.name, g.name, text, type, SITE + g.url]); }
  const h = [...g.headlines, ...Array(15 - g.headlines.length).fill("")];
  const d = [...g.descriptions, ...Array(4 - g.descriptions.length).fill("")];
  adRows.push([c.name, g.name, "Responsive search ad", ...h, ...d, g.path[0], g.path[1], SITE + g.url]);
}
writeFileSync(join(OUT, "anahtar-kelimeler.csv"), csv(kwRows));
writeFileSync(join(OUT, "reklamlar.csv"), csv(adRows));
writeFileSync(join(OUT, "negatif-kelimeler.txt"),
  Object.entries(NEGATIVES).map(([t, list]) => `# ${t}\n${list.map((n) => `"${n}"`).join("\n")}`).join("\n\n") + "\n");

// Okunabilir reklam metinleri
let md = "# MK OPS — Google Ads Reklam Metinleri\n\n";
md += "> Bu dosya `reklamlar.csv` ve `anahtar-kelimeler.csv` ile aynı veriden üretildi. Karakter sınırları\n";
md += "> (başlık 30, açıklama 90, yol 15, site bağlantısı 25/35, açıklama metni 25) doğrulandı.\n\n";
for (const c of CAMPAIGNS) {
  md += `## Kampanya: ${c.name}\n\n`;
  for (const g of c.groups) {
    md += `### Reklam grubu: ${g.name}\n\n`;
    md += `- **Hedef sayfa:** ${SITE}${g.url}\n`;
    md += `- **Görünen URL:** www.mk-ops.tr/${g.path.filter(Boolean).join("/")}\n`;
    md += `- **Anahtar kelimeler:** ${g.keywords.map((k) => `\`${k}\``).join(", ")}\n\n`;
    md += "| # | Başlık | Karakter |\n|---|---|---|\n";
    g.headlines.forEach((h, i) => { md += `| ${i + 1} | ${h} | ${len(h)} |\n`; });
    md += "\n| # | Açıklama | Karakter |\n|---|---|---|\n";
    g.descriptions.forEach((d, i) => { md += `| ${i + 1} | ${d} | ${len(d)} |\n`; });
    md += "\n";
  }
}
md += "## Öğeler (tüm arama kampanyaları)\n\n### Site bağlantıları\n\n| Metin | Hedef | Açıklama 1 | Açıklama 2 |\n|---|---|---|---|\n";
SITELINKS.forEach(([t, u, d1, d2]) => { md += `| ${t} | ${u} | ${d1} | ${d2} |\n`; });
md += `\n### Açıklama metinleri (callout)\n\n${CALLOUTS.map((c) => `- ${c}`).join("\n")}\n`;
md += `\n### Yapılandırılmış snippet\n\n- **Başlık:** ${SNIPPET.header}\n- **Değerler:** ${SNIPPET.values.join(", ")}\n`;
md += "\n## Negatif anahtar kelimeler\n\nTamamı `negatif-kelimeler.txt` dosyasında, sıralı ifade eşlemesiyle (tırnaklı).\n\n";
for (const [t, list] of Object.entries(NEGATIVES)) md += `- **${t}:** ${list.join(", ")}\n`;
writeFileSync(join(OUT, "REKLAM-METINLERI.md"), md);

const groups = CAMPAIGNS.flatMap((c) => c.groups);
console.log(`OK: ${CAMPAIGNS.length} kampanya, ${groups.length} reklam grubu, ${kwRows.length - 1} anahtar kelime, ${Object.values(NEGATIVES).flat().length} negatif`);
