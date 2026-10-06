import Link from "next/link";
import { APP_NAME } from "@/lib/constants/brand";
import { LEGAL_ENTITY, LEGAL_UPDATED_AT } from "@/lib/constants/legal";
import { ContactBlock, LegalDocument } from "@/components/marketing/legal-document";

export const metadata = {
  title: "Kişisel Veri Saklama ve İmha Politikası",
  description: `${APP_NAME} kişisel verilerin saklama süreleri ve imha yöntemleri.`,
  alternates: { canonical: "/kvkk/saklama-ve-imha-politikasi" },
};

const PERIODS: [string, string, string][] = [
  ["Kullanıcı hesap bilgileri (ad, e-posta, rol)", "Hesap açık kaldığı sürece", "Hesabın veya şirketin silinmesinden itibaren 30 gün içinde silinir"],
  ["Şirket bilgileri, plan ve abonelik kayıtları", "Hizmet ilişkisi süresince", "Ödeme ve fatura kayıtları Türk Ticaret Kanunu ve Vergi Usul Kanunu gereği 10 yıl saklanır"],
  ["Müşteri şirketin operasyon verileri (personel, puantaj, avans, proje, imalat, stok, araç, zimmet)", "Müşteri şirketin hizmet ilişkisi süresince", "Müşterinin silme talebi veya hizmetin sona ermesinden sonra en geç 90 gün içinde silinir; müşteri bu süre içinde verilerini dışa aktarabilir"],
  ["İşlem geçmişi (denetim kaydı)", "Şirket kaydı süresince", "Şirket kaydıyla birlikte silinir"],
  ["Destek talepleri ve yazışmalar", "Talebin kapanmasından itibaren 2 yıl", "Süre sonunda silinir"],
  ["Oturum ve işlem güvenliği kayıtları (IP, cihaz, giriş zamanları)", "En fazla 2 yıl", "Altyapı sağlayıcısının kayıt döngüsüyle silinir"],
  ["Yedekler", "Yedekleme döngüsü süresince", "Silinen veriler yedeklerden en geç 30 gün içinde kalkar"],
];

export default function RetentionPolicyPage() {
  return (
    <LegalDocument title="Kişisel Veri Saklama ve İmha Politikası" updatedAt={LEGAL_UPDATED_AT}>
      <p>
        Bu politika, {APP_NAME} hizmeti kapsamında işlenen kişisel verilerin ne kadar süre saklandığını ve süre
        sonunda nasıl imha edildiğini, 6698 sayılı KVKK ve Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale
        Getirilmesi Hakkında Yönetmelik çerçevesinde açıklar.
      </p>
      <ContactBlock />

      <h2>1. Kayıt ortamları</h2>
      <ul>
        <li>Veritabanı ve dosya deposu (Supabase, Frankfurt veri merkezi)</li>
        <li>Altyapı sağlayıcısının otomatik yedekleri</li>
        <li>E-posta kutuları (destek yazışmaları)</li>
        <li>Kullanıcıların indirdiği PDF, Excel ve Word çıktıları (kullanıcının veya müşteri şirketin sorumluluğundadır)</li>
      </ul>

      <h2>2. Saklama süreleri</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-foreground">
            <tr className="border-b">
              <th className="py-2 pr-4 font-semibold">Veri</th>
              <th className="py-2 pr-4 font-semibold">Saklama süresi</th>
              <th className="py-2 font-semibold">Süre sonunda</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {PERIODS.map(([data, period, after]) => (
              <tr key={data}>
                <td className="py-2 pr-4 align-top font-medium text-foreground">{data}</td>
                <td className="py-2 pr-4 align-top">{period}</td>
                <td className="py-2 align-top">{after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Müşteri şirketin operasyon verileri bakımından {LEGAL_ENTITY.name} veri işleyendir; bu verilerin saklama
        süresini belirleme sorumluluğu veri sorumlusu olan müşteri şirkete aittir. Müşteri şirket, panelden kayıtları
        tek tek silebilir veya şirket kaydının tamamen silinmesini talep edebilir.
      </p>

      <h2>3. İmha yöntemleri</h2>
      <ul>
        <li>
          <strong>Silme:</strong> veritabanındaki kayıtlar, ilgili kullanıcıların erişemeyeceği ve geri getirilemeyeceği
          şekilde kalıcı olarak silinir. Şirket kaydının silinmesi, şirkete bağlı bütün kayıtları zincirleme olarak siler.
        </li>
        <li>
          <strong>Anonim hale getirme:</strong> istatistik amacıyla tutulması gereken veriler, kişiyle
          ilişkilendirilemeyecek şekilde anonimleştirilir.
        </li>
        <li>
          <strong>Yedekler:</strong> silinen veriler, altyapı sağlayıcısının yedekleme döngüsü içinde yedeklerden de
          kendiliğinden kalkar.
        </li>
      </ul>

      <h2>4. Periyodik imha</h2>
      <p>
        Saklama süresi dolan veriler 6 ayda bir gözden geçirilerek imha edilir. İmha işlemleri kayıt altına alınır ve
        bu kayıtlar en az 3 yıl saklanır. Silme talebi üzerine yapılan imha, talebin alınmasından itibaren en geç 30 gün
        içinde tamamlanır.
      </p>

      <h2>5. Başvuru</h2>
      <p>
        Verilerinizin silinmesini talep etmek için <Link href="/kvkk/basvuru-formu">İlgili Kişi Başvuru Formu</Link>
        &apos;nu kullanabilirsiniz. Müşteri şirketlerin personeli, operasyon verilerine ilişkin taleplerini öncelikle
        çalıştıkları şirkete iletmelidir.
      </p>
    </LegalDocument>
  );
}
