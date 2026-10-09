import Link from "next/link";
import { APP_NAME, COMPANY_LEGAL_NAME } from "@/lib/constants/brand";
import { ContactBlock, LegalDocument } from "@/components/marketing/legal-document";

export const metadata = {
  title: "Kullanım Şartları",
  description: `${APP_NAME} hizmetinin kullanım şartları: hesaplar, şirket yapısı, deneme süresi, planlar ve kabul edilebilir kullanım.`,
};

export default function TermsPage() {
  return (
    <LegalDocument title="Kullanım Şartları" updatedAt="6 Ekim 2026">
      <p>
        Bu Kullanım Şartları, {COMPANY_LEGAL_NAME} tarafından sunulan {APP_NAME} web uygulamasına ve hizmetlerine
        (&quot;Hizmet&quot;) erişiminizi ve kullanımınızı düzenler. Hizmete kayıt olarak veya Hizmeti kullanarak bu
        şartları kabul etmiş olursunuz.
      </p>

      <h2>1. Hizmet sağlayıcı</h2>
      <ContactBlock />

      <h2>2. Hizmetin tanımı</h2>
      <p>
        {APP_NAME}, şirketlerin saha ve operasyon süreçlerini dijital ortamda yönetmesini sağlayan bir yazılım
        hizmetidir. Hizmet; iş ve proje takibi, günlük iş planı, personel ve puantaj, avans, malzeme stoku, araç ve
        ekipman takibi, imalat kayıtları, raporlama ve kullanıcı yetkilendirme gibi özellikler içerir. Özellikler
        zaman içinde geliştirilebilir veya değiştirilebilir.
      </p>

      <h2>3. Hesap ve şirket yapısı</h2>
      <ul>
        <li>Kayıt sırasında doğru ve güncel bilgi vermeniz gerekir. Giriş bilgilerinizin gizliliğinden siz sorumlusunuz.</li>
        <li>Yeni şirket kuran kullanıcı, o şirketin kurucu firma yöneticisidir. Firma yöneticileri başka kullanıcıları da firma yöneticisi olarak atayabilir; kurucu hesap silinemez.</li>
        <li>Diğer kullanıcılar şirket adı ve katılım koduyla katılma isteği gönderir; firma yöneticisi veya şantiye şefi onaylayana kadar şirket verisine erişemez.</li>
        <li>Rol ve modül yetkileri firma yöneticisi tarafından belirlenir. Şirket hesabı altında yapılan işlemlerden şirket sorumludur.</li>
        <li>Her şirketin verisi diğer şirketlerden ayrı tutulur.</li>
      </ul>

      <h2>4. Deneme süresi</h2>
      <p>
        Yeni kurulan şirketlere 48 saatlik ücretsiz deneme süresi tanınır. Deneme süresinin sonunda plan atanmamışsa
        panele erişim durdurulur; şirket verileri silinmez ve plan atandığında erişim yeniden açılır. Deneme için
        ödeme bilgisi istenmez ve deneme sonunda otomatik ücretlendirme yapılmaz.
      </p>

      <h2>5. Planlar ve ödeme</h2>
      <ul>
        <li>Plan talepleri panelin Destek bölümünden veya iletişim kanallarımızdan iletilir.</li>
        <li>Plan içeriği, kullanıcı limiti, süresi ve ücreti taraflarca yazılı olarak (e-posta veya destek yanıtı) belirlenir.</li>
        <li>Ödemeler EFT/havale ile alınır. Ödemenin hesaba geçmesinin ardından plan tanımlanır.</li>
        <li>Planlar otomatik olarak yenilenmez. Plan süresi sona erdiğinde yenileme yapılmamışsa erişim durdurulur, veriler korunur.</li>
        <li>
          İptal ve iade koşulları <Link href="/iptal-ve-iade">İptal ve İade Koşulları</Link> sayfasında açıklanmıştır.
        </li>
      </ul>

      <h2>6. Kabul edilebilir kullanım</h2>
      <p>Aşağıdaki eylemler yasaktır:</p>
      <ul>
        <li>Hizmeti hukuka aykırı amaçlarla kullanmak</li>
        <li>Başka şirketlerin veya kullanıcıların verilerine izinsiz erişmeye çalışmak</li>
        <li>Sistemin işleyişini bozmak, aşırı yük oluşturmak veya güvenlik önlemlerini aşmaya çalışmak</li>
        <li>Hizmeti tersine mühendislikle incelemek, kopyalamak veya yeniden satmak</li>
        <li>Katılım kodlarını yetkisiz kişilerle paylaşmak veya tahmin etmeye çalışmak</li>
      </ul>
      <p>Bu kuralların ihlali halinde hesap veya şirket askıya alınabilir ya da kapatılabilir.</p>

      <h2>7. Veriler</h2>
      <p>
        Şirketlerin Hizmete girdiği veriler şirkete aittir. {COMPANY_LEGAL_NAME} bu verileri yalnızca Hizmeti
        sunmak amacıyla işler. Kişisel verilerin işlenmesine ilişkin ayrıntılar{" "}
        <Link href="/gizlilik-politikasi">Gizlilik Politikası ve KVKK Aydınlatma Metni</Link>&apos;nde yer alır.
        Şirketler, personel verileri başta olmak üzere Hizmete girdikleri kişisel veriler için gerekli
        bilgilendirmeleri yapmak ve hukuki dayanakları sağlamakla yükümlüdür. Şirketlerin girdiği kişisel veriler
        bakımından taraflar arasındaki ilişki, bu şartların eki ve ayrılmaz parçası olan{" "}
        <Link href="/kvkk/veri-isleme-sozlesmesi">Veri İşleme Sözleşmesi</Link> ile düzenlenir.
      </p>

      <h2>8. Hizmet sürekliliği ve sorumluluk</h2>
      <p>
        Hizmetin kesintisiz ve hatasız çalışması için makul özen gösterilir; ancak bakım, altyapı sağlayıcılarından
        kaynaklı arızalar veya mücbir sebepler nedeniyle kesintiler yaşanabilir. Mevzuatın izin verdiği ölçüde{" "}
        {COMPANY_LEGAL_NAME}&apos;in sorumluluğu, ilgili dönem için ödenen plan bedeliyle sınırlıdır. Şirketlerin
        önemli verilerini dışa aktarım özellikleriyle düzenli olarak yedeklemesi önerilir.
      </p>

      <h2>9. Fikri mülkiyet</h2>
      <p>
        {APP_NAME} yazılımı, tasarımı, markası ve içerikleri {COMPANY_LEGAL_NAME}&apos;e aittir. Yazılı izin
        olmaksızın kopyalanamaz, çoğaltılamaz veya ticari amaçla kullanılamaz.
      </p>

      <h2>10. Değişiklikler ve uygulanacak hukuk</h2>
      <p>
        Bu şartlar güncellenebilir; önemli değişiklikler uygulama içinde veya e-posta ile duyurulur. Şartlar Türkiye
        Cumhuriyeti hukukuna tabidir.
      </p>
    </LegalDocument>
  );
}
