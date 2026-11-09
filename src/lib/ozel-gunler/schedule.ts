/**
 * Özel gün ekranlarının ortak zamanlama kuralları. Her özel gün her yıl tekrarlanır.
 * Saatler Türkiye saatidir (UTC+3, yaz/kış saati yok). Yıl kodda sabit değildir.
 */

export type OzelGun = {
  /** Benzersiz kimlik; klasör adıyla aynı (örn. "10-kasim"). "Gördü" kaydı bununla tutulur. */
  id: string;
  /** Önizleme ve erişilebilirlik için ad. */
  ad: string;
  /** Ekranın görüneceği aralık (her yıl, iki uç dahil, aynı takvim yılı içinde). */
  aralik: { baslangicAy: number; baslangicGun: number; bitisAy: number; bitisGun: number };
  /** Aralıkta siteye ilk girişte kaç ms gösterilir (kapatılabilir). */
  ilkGirisMs: number;
  /** İsteğe bağlı: bu saatte, hangi sayfada olursa olsun herkese süre boyunca gösterilir (kapatılamaz). */
  saatliGosterim?: { ay: number; gun: number; saat: number; dakika: number; sureMs: number };
  gorsel: { masaustu: string; mobil: string; alt: string };
};

const TR_OFFSET_MS = 3 * 60 * 60 * 1000;

function turkeyParts(now: number) {
  const d = new Date(now + TR_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

/** Türkiye saatiyle verilen an (ms). */
function turkeyTime(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return Date.UTC(year, month - 1, day, hour, minute) - TR_OFFSET_MS;
}

export function aralikta(gun: OzelGun, now: number): boolean {
  const { month, day } = turkeyParts(now);
  const bugun = month * 100 + day;
  const { baslangicAy, baslangicGun, bitisAy, bitisGun } = gun.aralik;
  return bugun >= baslangicAy * 100 + baslangicGun && bugun <= bitisAy * 100 + bitisGun;
}

/** Saatli gösterim şu an sürüyorsa bitiş anını (ms), yoksa null döndürür. */
export function saatliGosterimBitisi(gun: OzelGun, now: number): number | null {
  const s = gun.saatliGosterim;
  if (!s) return null;
  const { year } = turkeyParts(now);
  const baslangic = turkeyTime(year, s.ay, s.gun, s.saat, s.dakika);
  return now >= baslangic && now < baslangic + s.sureMs ? baslangic + s.sureMs : null;
}

/** "Bu yıl gördü" kaydının anahtarı; her yıl yeniden gösterilir. */
export function gordumAnahtari(gun: OzelGun, now: number): string {
  return `ozel-gun:${gun.id}:${turkeyParts(now).year}`;
}
