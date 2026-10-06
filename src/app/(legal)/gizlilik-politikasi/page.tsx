import Link from "next/link";
import { APP_NAME, COMPANY_LEGAL_NAME, SUPPORT_EMAIL } from "@/lib/constants/brand";
import { ContactBlock, LegalDocument, ProcessorsTable } from "@/components/marketing/legal-document";
import { LEGAL_UPDATED_AT } from "@/lib/constants/legal";

export const metadata = {
  title: "Gizlilik Politikası ve KVKK Aydınlatma Metni",
  description: `${APP_NAME} kişisel verilerin işlenmesi, saklanması ve korunmasına ilişkin gizlilik politikası ve KVKK aydınlatma metni.`,
};

export default function PrivacyPolicyPage() {
  return (
    <LegalDocument title="Gizlilik Politikası ve KVKK Aydınlatma Metni" updatedAt={LEGAL_UPDATED_AT}>
      <p>
        {APP_NAME}, şirketlerin saha ve operasyon süreçlerini yönetmesi için sunulan bir yazılım hizmetidir (SaaS).
        Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu (&quot;KVKK&quot;) kapsamında, {APP_NAME} kullanılırken
        kişisel verilerin nasıl işlendiğini açıklar.
      </p>

      <h2>1. Taraflar ve roller</h2>
      <p>
        <strong>Hesap ve üyelik verileri</strong> bakımından (ör. kayıt olan kullanıcının adı, e-posta adresi, şirket
        adı) veri sorumlusu {COMPANY_LEGAL_NAME}&apos;tir.
      </p>
      <p>
        <strong>Şirketlerin panele girdiği operasyon verileri</strong> bakımından (ör. personel bilgileri, puantaj,
        avans, proje ve malzeme kayıtları) veri sorumlusu, {APP_NAME}&apos;u kullanan müşteri şirkettir.{" "}
        {COMPANY_LEGAL_NAME} bu verileri yalnızca hizmeti sunmak amacıyla, müşteri şirket adına{" "}
        <strong>veri işleyen</strong> sıfatıyla işler. Personelin KVKK kapsamında bilgilendirilmesi ve gerekli
        hukuki dayanakların sağlanması müşteri şirketin sorumluluğundadır. Bu ilişki{" "}
        <Link href="/kvkk/veri-isleme-sozlesmesi">Veri İşleme Sözleşmesi</Link> ile düzenlenir; müşteri şirketler
        çalışanlarına verecekleri aydınlatma metnini panelde Ayarlar → KVKK bölümünden oluşturabilir.
      </p>
      <p>Hesap ve üyelik verileri bakımından veri sorumlusu:</p>
      <ContactBlock />

      <h2>2. İşlenen veri kategorileri</h2>
      <ul>
        <li>
          <strong>Kimlik ve iletişim:</strong> ad soyad, e-posta adresi, görev unvanı, profil fotoğrafı.
        </li>
        <li>
          <strong>Şirket bilgileri:</strong> şirket adı, plan ve abonelik durumu, destek talepleri.
        </li>
        <li>
          <strong>Operasyon verileri (müşteri şirket adına):</strong> personel adı, T.C. kimlik numarası, telefon,
          işe giriş/çıkış tarihleri, puantaj ve izin kayıtları, avanslar, araç ve zimmet kayıtları, proje, iş planı,
          imalat ve malzeme hareketleri.
        </li>
        <li>
          <strong>İşlem güvenliği:</strong> oturum bilgileri, IP adresi, tarayıcı ve cihaz bilgisi, işlem zamanları.
        </li>
      </ul>

      <h2>3. İşleme amaçları</h2>
      <ul>
        <li>Hesap oluşturma, şirkete katılım ve kullanıcı yetkilendirme süreçlerinin yürütülmesi</li>
        <li>Hizmetin sunulması, panel özelliklerinin çalıştırılması ve raporların oluşturulması</li>
        <li>Deneme süresi, plan ve abonelik süreçlerinin yönetilmesi</li>
        <li>Destek taleplerinin yanıtlanması ve kullanıcılarla iletişim</li>
        <li>Bilgi güvenliğinin sağlanması, kötüye kullanımın önlenmesi</li>
        <li>Yasal yükümlülüklerin yerine getirilmesi</li>
      </ul>
      <p>{APP_NAME} kişisel verileri satmaz, kiralamaz ve reklam amacıyla kullanmaz.</p>

      <h2>4. Hukuki sebepler</h2>
      <p>Kişisel veriler KVKK md. 5/2 kapsamında aşağıdaki hukuki sebeplere dayanılarak işlenir:</p>
      <ul>
        <li>bir sözleşmenin kurulması veya ifasıyla doğrudan ilgili olması (hizmet sözleşmesi),</li>
        <li>veri sorumlusunun hukuki yükümlülüğünü yerine getirebilmesi,</li>
        <li>ilgili kişinin temel hak ve özgürlüklerine zarar vermemek kaydıyla meşru menfaat (ör. bilgi güvenliği).</li>
      </ul>

      <h2>5. Aktarım ve hizmet sağlayıcılar</h2>
      <p>
        Veriler yalnızca hizmetin çalışması için gerekli olduğu ölçüde, gizlilik yükümlülüğü altındaki altyapı
        sağlayıcılarıyla paylaşılır:
      </p>
      <ProcessorsTable />
      <p>
        Bu sağlayıcıların sunucuları yurt dışındadır. Yurt dışına aktarım, KVKK md. 9 uyarınca Kişisel Verileri Koruma
        Kurulu&apos;nca ilan edilen standart sözleşmelerin imzalanması ve Kurul&apos;a bildirilmesi yoluyla
        gerçekleştirilir. Yetkili kamu kurum ve kuruluşlarının yasal talepleri halinde veriler mevzuatın gerektirdiği
        ölçüde paylaşılabilir.
      </p>

      <h2>6. Saklama süresi</h2>
      <p>
        Veriler, hesap ve şirket aboneliği devam ettiği sürece saklanır. Deneme veya plan süresi dolan şirketlerin
        verileri, şirketin talebiyle silinene veya hizmet ilişkisi sona erene kadar korunur. Şirket kaydı silindiğinde
        operasyon verileri kalıcı olarak silinir; mevzuatın saklamayı zorunlu kıldığı kayıtlar ilgili süre boyunca
        tutulur. Ayrıntılı süreler için{" "}
        <Link href="/kvkk/saklama-ve-imha-politikasi">Kişisel Veri Saklama ve İmha Politikası</Link>&apos;na bakınız.
      </p>

      <h2>7. Güvenlik</h2>
      <ul>
        <li>Tüm bağlantılar HTTPS ile şifrelenir.</li>
        <li>Her şirketin verisi veritabanı seviyesinde ayrılır; kullanıcılar yalnızca kendi şirketlerinin verisine erişir.</li>
        <li>Şirkete katılan kullanıcılar şirketin yöneticisi onaylamadan veri göremez; yetkiler rol ve modül bazında verilir.</li>
      </ul>

      <h2>8. Çerezler</h2>
      <p>
        {APP_NAME} yalnızca oturumun sürdürülmesi ve tema gibi tercihlerin hatırlanması için zorunlu çerezler ve
        tarayıcı depolaması kullanır. Reklam veya izleme amaçlı çerez kullanılmaz. Ayrıntılar:{" "}
        <Link href="/kvkk/cerez-politikasi">Çerez Politikası</Link>.
      </p>

      <h2>9. KVKK kapsamındaki haklarınız</h2>
      <p>KVKK md. 11 uyarınca;</p>
      <ul>
        <li>kişisel verilerinizin işlenip işlenmediğini öğrenme ve bilgi talep etme,</li>
        <li>işleme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme,</li>
        <li>yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme,</li>
        <li>eksik veya yanlış işlenmişse düzeltilmesini, şartları oluşmuşsa silinmesini isteme,</li>
        <li>otomatik sistemlerle analiz sonucu aleyhinize bir sonuç çıkmasına itiraz etme,</li>
        <li>kanuna aykırı işleme nedeniyle zarara uğramanız halinde zararın giderilmesini talep etme</li>
      </ul>
      <p>
        haklarına sahipsiniz. Taleplerinizi{" "}
        <Link href="/kvkk/basvuru-formu">İlgili Kişi Başvuru Formu</Link>&apos;nda açıklanan yollarla (ör.{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>) iletebilirsiniz; başvurular en geç 30 gün içinde
        ücretsiz olarak yanıtlanır. Bir müşteri şirketin personeli iseniz, operasyon verilerinize ilişkin talepleri öncelikle
        çalıştığınız şirkete iletmeniz gerekir; {COMPANY_LEGAL_NAME} bu talepleri ilgili şirkete yönlendirir.
      </p>

      <h2>10. Değişiklikler</h2>
      <p>
        Bu metin gerektiğinde güncellenebilir. Güncel sürüm her zaman bu sayfada yayımlanır. Hizmet koşulları için{" "}
        <Link href="/kullanim-sartlari">Kullanım Şartları</Link> sayfasına bakabilirsiniz.
      </p>
    </LegalDocument>
  );
}
