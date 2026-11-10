/**
 * Yeni firma için ilk kullanım rehberi (U-03): proje, personel, araç, iş planı, puantaj.
 * Adımlar yalnızca kullanıcının yazma yetkisi olduğu modüller için gösterilir; veri girilince adım tamamlanır,
 * hepsi bitince rehber kendiliğinden kaybolur. Bu dosya bilerek içe aktarma içermez (birim test edilebilir).
 */

export type SetupModule = "projects" | "personnel" | "vehicles" | "work_plans" | "attendance";

export type SetupStep = {
  key: SetupModule;
  title: string;
  description: string;
  href: string;
  action: string;
  done: boolean;
};

const STEPS: { key: SetupModule; title: string; description: string; href: string; action: string }[] = [
  {
    key: "personnel",
    title: "Personelinizi ekleyin",
    description: "Ad, telefon, işe giriş tarihi ve maaş bilgisiyle. Puantaj ve iş planı personel listesinden çalışır; Excel'den toplu da eklenebilir.",
    href: "/panel/personnel",
    action: "Personel ekle",
  },
  {
    key: "vehicles",
    title: "Araçlarınızı ekleyin",
    description: "Plaka, marka ve muayene/sigorta tarihleriyle. Süresi yaklaşan belgeler genel bakışta uyarı olarak çıkar.",
    href: "/panel/vehicles",
    action: "Araç ekle",
  },
  {
    key: "projects",
    title: "İlk projenizi oluşturun",
    description: "Proje türünü seçip konum ve tarihleri girin. İş kalemleri imalat girerken poz listesinden seçilir.",
    href: "/panel/projects/new",
    action: "Proje oluştur",
  },
  {
    key: "work_plans",
    title: "İlk iş planınızı hazırlayın",
    description: "Yarının ekiplerini, personelini ve araçlarını seçin; WhatsApp'tan paylaşabilirsiniz.",
    href: "/panel/work-plans/new",
    action: "İş planı hazırla",
  },
  {
    key: "attendance",
    title: "İlk puantajı girin",
    description: "Geçmiş günler ve bugün (saat 09:00'dan sonra) için Çalıştı / Çalışmadı / İzinli işaretleyin. Pazarlar otomatik hafta tatili olur.",
    href: "/panel/attendance",
    action: "Puantaja git",
  },
];

/** Rehberin ihtiyaç duyduğu sayılar (kayıt yoksa 0). */
export type SetupCounts = Record<SetupModule, number>;

export function buildSetupSteps(counts: SetupCounts, writable: readonly string[]): SetupStep[] {
  return STEPS.filter((step) => writable.includes(step.key)).map((step) => ({
    ...step,
    done: (counts[step.key] ?? 0) > 0,
  }));
}

/** Rehber yalnızca görünür adım varsa ve en az biri tamamlanmamışsa gösterilir. */
export function shouldShowSetupGuide(steps: SetupStep[]): boolean {
  return steps.length > 0 && steps.some((step) => !step.done);
}
