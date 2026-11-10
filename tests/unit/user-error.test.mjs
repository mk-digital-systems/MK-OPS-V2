// U-05: kullanıcıya gösterilen hata metinleri — Türkçe iş kuralı mesajı aynen, teknik hata anlaşılır Türkçe
import { userErrorMessage, GENERIC_ERROR_MESSAGE } from "../../src/lib/user-error.ts";

let failures = 0;
const check = (name, ok, more = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${more ? ` — ${more}` : ""}`); if (!ok) failures++; };
const has = (value, re) => re.test(value);

// Bizim Türkçe iş kuralı mesajları aynen geçer
for (const msg of [
  "Bu tarihte zaten bir iş planı var",
  "Firmada 2 şantiye şefi var; kota bunun altına indirilemez",
  "Onay için şirket adını aynen yazın",
  "Planınızda en fazla 3 ek şube açılabilir; şube sayısını artırmak için destek ile iletişime geçin",
  "Bu plan siz düzenlerken başka biri tarafından değiştirildi. Sayfayı yenileyip tekrar deneyin.",
]) check(`Türkçe mesaj aynen: ${msg.slice(0, 40)}…`, userErrorMessage({ message: msg, code: "P0001" }) === msg);

// Teknik hatalar çevrilir ve ham metni göstermez
const cases = [
  [{ message: "duplicate key value violates unique constraint \"personnel_pkey\"", code: "23505" }, /zaten var/],
  [{ message: "insert or update on table \"x\" violates foreign key constraint \"y\"", code: "23503" }, /başka kayıtlarla ilişkili/],
  [{ message: "null value in column \"name\" violates not-null constraint", code: "23502" }, /Zorunlu bir alan/],
  [{ message: "new row for relation \"daily_work_plan_teams\" violates check constraint \"dwp_teams_chief_phone\"", code: "23514" }, /kurallara uymuyor/],
  [{ message: "invalid input syntax for type uuid: \"abc\"", code: "22P02" }, /geçersiz biçimde/],
  [{ message: "new row violates row-level security policy for table \"projects\"", code: "42501" }, /yetkiniz yok/],
  [{ message: "permission denied for table platform_events", code: "42501" }, /yetkiniz yok/],
  [{ message: "JWT expired", code: "PGRST301" }, /Oturumunuzun süresi/],
  [{ message: "Failed to fetch" }, /İnternet bağlantısı/],
  [new TypeError("Failed to fetch"), /İnternet bağlantısı/],
  [{ message: "canceling statement due to statement timeout", code: "57014" }, /çok uzun sürdü/],
  [{ message: "Could not find the function public.save_work_plan(...) in the schema cache", code: "PGRST202" }, /güncellemesi/],
];
for (const [err, re] of cases) {
  const out = userErrorMessage(err);
  const raw = typeof err.message === "string" ? err.message : "";
  check(`çevrildi: ${raw.slice(0, 48)}`, has(out, re) && (!raw || !out.includes(raw)), out.slice(0, 80));
}

// Çevrilemeyen İngilizce metin ham gösterilmez; genel mesaj + teknik kod
const unknown = userErrorMessage({ message: "Unexpected token < in JSON at position 0", code: "XX000" });
check("bilinmeyen İngilizce hata ham gösterilmez, genel mesaj + teknik kod", unknown.startsWith(GENERIC_ERROR_MESSAGE) && unknown.includes("XX000") && !unknown.includes("Unexpected"), unknown.slice(0, 100));
check("boş hata → verilen yedek mesaj", userErrorMessage(null, "Kaydedilemedi") === "Kaydedilemedi" && userErrorMessage({}, "Kaydedilemedi") === "Kaydedilemedi");
check("metin (string) hata da desteklenir", userErrorMessage("Bu not zaten silinmiş") === "Bu not zaten silinmiş");
check("Error örneği desteklenir", userErrorMessage(new Error("Plan tarihi zorunlu")) === "Plan tarihi zorunlu");
check("çıktı hiçbir zaman boş değil", [null, undefined, {}, "", new Error(""), { message: 5 }].every((e) => userErrorMessage(e).length > 0));

if (failures) { console.log(`\n${failures} başarısız`); process.exit(1); }
