/**
 * Kullanıcıya gösterilecek hata metni (U-05).
 *
 * - Veritabanına kendimizin yazdığı Türkçe iş kuralı mesajları ("Bu tarihte zaten bir iş planı var") AYNEN geçer.
 * - Teknik / İngilizce Supabase, Postgres ve ağ hataları ne olduğunu, ne yapılacağını söyleyen Türkçeye çevrilir.
 * - Çevrilemeyen teknik hatalarda genel mesaj + destek için kısa teknik kod gösterilir; ham metin gösterilmez.
 * Bu dosya bilerek hiçbir içe aktarma içermez (birim test edilebilir).
 */

type ErrorLike = { message?: unknown; code?: unknown; details?: unknown; hint?: unknown; name?: unknown };

const TURKISH_CHARS = /[çğıöşüÇĞİÖŞÜ]/;
const ENGLISH_MARKERS =
  /\b(violates|constraint|relation|column|function|policy|permission|denied|failed|error|invalid|syntax|null value|duplicate|timeout|timed out|fetch|network|jwt|token|schema|cache|row-level|not found|unauthorized|forbidden|exception|cannot|could not|unexpected)\b/i;

export const GENERIC_ERROR_MESSAGE =
  "Beklenmeyen bir sorun oluştu. Birkaç saniye sonra tekrar deneyin; sürerse destek ile iletişime geçin.";

function read(error: unknown): { message: string; code: string } {
  if (typeof error === "string") return { message: error, code: "" };
  if (error && typeof error === "object") {
    const e = error as ErrorLike;
    return {
      message: typeof e.message === "string" ? e.message : "",
      code: typeof e.code === "string" || typeof e.code === "number" ? String(e.code) : "",
    };
  }
  return { message: "", code: "" };
}

export function userErrorMessage(error: unknown, fallback: string = GENERIC_ERROR_MESSAGE): string {
  const { message, code } = read(error);
  const text = message.trim();
  const tag = code ? ` (Teknik kod: ${code})` : "";

  if (/captcha/i.test(text) || /captcha/i.test(code)) {
    return "Güvenlik doğrulaması tamamlanamadı veya süresi doldu. Kutucuğu yeniden doğrulayıp tekrar deneyin. Sayfa yüklenmediyse yenileyin ya da reklam engelleyicinizi bu site için kapatın.";
  }
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|offline/i.test(text)) {
    return "İnternet bağlantısı kurulamadı. Bağlantınızı kontrol edip tekrar deneyin. İşlem tamamlanmamış olabilir; sayfayı yenileyip kaydın durumunu kontrol edin.";
  }
  if (/jwt expired|invalid jwt|jwt|refresh token|not authenticated|invalid login|auth session missing/i.test(text) || code === "PGRST301") {
    return "Oturumunuzun süresi dolmuş olabilir. Sayfayı yenileyip yeniden giriş yapın. Yaptığınız değişiklik kaydedilmemiş olabilir.";
  }
  if (code === "57014" || /statement timeout|canceling statement|timed out|timeout/i.test(text)) {
    return "İşlem çok uzun sürdü ve durduruldu. Tekrar deneyin; veri çoksa filtreleri daraltın. Kayıt tamamlanmamış olabilir.";
  }
  if (code === "PGRST202" || code === "PGRST204" || /could not find the function|schema cache|could not find the .* column/i.test(text)) {
    return "Sistem güncellemesi henüz tamamlanmamış olabilir. Birkaç dakika sonra tekrar deneyin; sürerse destek ile iletişime geçin." + tag;
  }
  if (code === "23505" || /duplicate key|already exists|unique constraint/i.test(text)) {
    return "Bu kayıt zaten var; aynı bilgilerle ikinci kez eklenemez. Mevcut kaydı kontrol edin.";
  }
  if (code === "23503" || /foreign key/i.test(text)) {
    return "Bu kayıt başka kayıtlarla ilişkili olduğu için işlem yapılamadı. Önce bağlı kayıtları kontrol edin.";
  }
  if (code === "23502" || /null value in column|not-null constraint/i.test(text)) {
    return "Zorunlu bir alan boş bırakılmış. Alanları kontrol edip tekrar deneyin. Kayıt yapılmadı.";
  }
  if (code === "23514" || /check constraint/i.test(text)) {
    return "Girilen bilgi kurallara uymuyor (çok kısa/uzun ya da geçersiz bir değer). Alanları kontrol edin. Kayıt yapılmadı.";
  }
  if (code === "22P02" || code === "22007" || code === "22008" || /invalid input syntax|invalid input value|out of range/i.test(text)) {
    return "Girilen değer geçersiz biçimde (tarih, sayı veya seçim). Alanları kontrol edip tekrar deneyin. Kayıt yapılmadı.";
  }
  if (/row-level security|permission denied|violates row-level|not allowed|forbidden|unauthorized/i.test(text)) {
    return "Bu işlem için yetkiniz yok veya bu kayıt size ait değil. Gerekirse firma yöneticinizle görüşün. Kayıt yapılmadı.";
  }
  if (code === "42501" && !TURKISH_CHARS.test(text) && ENGLISH_MARKERS.test(text)) {
    return "Bu işlem için yetkiniz yok. Gerekirse firma yöneticinizle görüşün. Kayıt yapılmadı.";
  }

  if (!text) return fallback;
  // Bizim yazdığımız Türkçe iş kuralı mesajı: aynen göster.
  if (TURKISH_CHARS.test(text)) return text;
  // Türkçe karakter yok ama teknik/İngilizce görünüyor: ham metin gösterme.
  if (ENGLISH_MARKERS.test(text) || /^[\x20-\x7E]+$/.test(text) && /[A-Za-z]{3,}\s+[a-z]{2,}\s+[a-z]{2,}/.test(text) && /\b(the|of|for|to|is|was|in|on|with)\b/i.test(text)) {
    return fallback + tag;
  }
  // Kısa, Türkçe karakter içermeyen ama büyük olasılıkla bizim mesajımız ("Plan bulunamadı" gibi ASCII yazılmış olabilir).
  return text;
}
