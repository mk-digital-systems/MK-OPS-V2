import { COMPANY_LEGAL_NAME, SUPPORT_EMAIL } from "@/lib/constants/brand";

/**
 * KVKK belgelerinde görünen veri sorumlusu / hizmet sağlayıcı bilgileri.
 * Boş bırakılan alanlar sayfalarda gösterilmez; doldurulunca bütün belgelere yansır.
 */
export const LEGAL_ENTITY = {
  /** Ticaret unvanı (şahıs şirketiyse ad soyad + unvan) */
  name: COMPANY_LEGAL_NAME,
  address: "Merkez / Bolu",
  taxOffice: "",
  taxNumber: "",
  mersis: "",
  /** Kayıtlı elektronik posta adresi (varsa) */
  kep: "",
  email: SUPPORT_EMAIL,
};

/** Belgelerin son güncelleme tarihi */
export const LEGAL_UPDATED_AT = "6 Ekim 2026";

/**
 * Hizmeti sunmak için kullanılan alt veri işleyenler (altyapı sağlayıcıları).
 * E-posta sağlayıcısı seçilince adı ve ülkesi buraya yazılmalı (bkz. docs/EPOSTA-AYARLARI.md).
 */
export const DATA_PROCESSORS = [
  {
    name: "Supabase Inc.",
    purpose: "Veritabanı, kimlik doğrulama, dosya depolama ve yedekleme",
    location: "Veriler Almanya'da (Frankfurt, AB) barındırılır; şirket merkezi ABD",
  },
  {
    name: "Vercel Inc.",
    purpose: "Web uygulamasının barındırılması ve sayfaların sunulması",
    location: "ABD ve küresel sunucu ağı",
  },
  {
    name: "E-posta servis sağlayıcısı",
    purpose: "Hesap doğrulama, şifre sıfırlama ve hizmet bildirim e-postaları",
    location: "Sağlayıcının sunucuları (yurt dışı)",
  },
];

/** KVKK belgeleri (site alt bilgisi, /kvkk sayfası ve panel bağlantıları) */
export const KVKK_DOCUMENTS = [
  { href: "/gizlilik-politikasi", title: "Gizlilik Politikası ve Aydınlatma Metni", summary: "MK OPS kullanılırken hangi verilerin, hangi amaçla ve nasıl işlendiği." },
  { href: "/kvkk/veri-isleme-sozlesmesi", title: "Veri İşleme Sözleşmesi", summary: "Müşteri firma (veri sorumlusu) ile MK OPS (veri işleyen) arasındaki yükümlülükler." },
  { href: "/kvkk/saklama-ve-imha-politikasi", title: "Kişisel Veri Saklama ve İmha Politikası", summary: "Verilerin ne kadar süre saklandığı ve nasıl silindiği." },
  { href: "/kvkk/cerez-politikasi", title: "Çerez Politikası", summary: "Sitede kullanılan zorunlu çerezler ve tarayıcı depolaması." },
  { href: "/kvkk/basvuru-formu", title: "İlgili Kişi Başvuru Formu", summary: "KVKK md. 11 kapsamındaki haklarınızı kullanmak için başvuru." },
];
