import Link from "next/link";
import { APP_NAME } from "@/lib/constants/brand";
import { LEGAL_ENTITY, LEGAL_UPDATED_AT } from "@/lib/constants/legal";
import { ContactBlock, LegalDocument, ProcessorsTable } from "@/components/marketing/legal-document";

export const metadata = {
  title: "Veri İşleme Sözleşmesi",
  description: `${APP_NAME} müşteri firması (veri sorumlusu) ile ${LEGAL_ENTITY.name} (veri işleyen) arasındaki KVKK veri işleme sözleşmesi.`,
  alternates: { canonical: "/kvkk/veri-isleme-sozlesmesi" },
};

export default function DataProcessingAgreementPage() {
  return (
    <LegalDocument title="Veri İşleme Sözleşmesi" updatedAt={LEGAL_UPDATED_AT}>
      <p>
        Bu sözleşme, {APP_NAME} hizmetini kullanan şirket ile {LEGAL_ENTITY.name} arasında, 6698 sayılı Kişisel
        Verilerin Korunması Kanunu (&quot;KVKK&quot;) md. 12/2 uyarınca, şirketin {APP_NAME}&apos;a girdiği kişisel
        verilerin işlenmesine ilişkin hak ve yükümlülükleri düzenler. Sözleşme,{" "}
        <Link href="/kullanim-sartlari">Kullanım Şartları</Link>&apos;nın eki ve ayrılmaz parçasıdır; şirket kaydının
        oluşturulmasıyla yürürlüğe girer ve hizmet ilişkisi süresince geçerlidir.
      </p>

      <h2>1. Taraflar</h2>
      <ul>
        <li>
          <strong>Veri sorumlusu (&quot;Müşteri&quot;):</strong> {APP_NAME}&apos;da şirket hesabı oluşturan ve
          hizmeti kullanan tüzel veya gerçek kişi.
        </li>
        <li>
          <strong>Veri işleyen (&quot;Hizmet Sağlayıcı&quot;):</strong>
        </li>
      </ul>
      <ContactBlock />

      <h2>2. Konu ve kapsam</h2>
      <p>
        Hizmet Sağlayıcı, Müşteri&apos;nin {APP_NAME} paneline girdiği kişisel verileri yalnızca hizmeti sunmak
        (kaydetmek, saklamak, görüntülemek, raporlamak, yedeklemek ve Müşteri&apos;nin talimatıyla silmek) amacıyla
        işler.
      </p>
      <h3>İlgili kişi grupları</h3>
      <ul>
        <li>Müşteri&apos;nin çalışanları ve saha personeli</li>
        <li>Müşteri&apos;nin panel kullanıcıları (yönetici, muhasebe vb.)</li>
        <li>Kayıtlarda adı geçen diğer kişiler (ör. irsaliyede teslim alan / eden)</li>
      </ul>
      <h3>Veri kategorileri</h3>
      <ul>
        <li>Kimlik: ad soyad, T.C. kimlik numarası</li>
        <li>İletişim: telefon, e-posta</li>
        <li>Özlük: görev, işe giriş/çıkış tarihi, çıkış nedeni, aylık ücret</li>
        <li>Puantaj ve izin: çalışma durumu, izinli/raporlu olduğu günler (rapor içeriği işlenmez), avanslar</li>
        <li>Operasyon: iş planı ve imalat kayıtları, araç ve zimmet kayıtları, malzeme hareketleri</li>
        <li>İşlem güvenliği: kullanıcı oturum bilgileri, işlem geçmişi kayıtları</li>
      </ul>
      <p>
        {APP_NAME} özel nitelikli kişisel veri işlemek üzere tasarlanmamıştır. Müşteri, serbest metin alanlarına
        (not, açıklama vb.) özel nitelikli kişisel veri girmemekle yükümlüdür.
      </p>

      <h2>3. Hizmet Sağlayıcı&apos;nın yükümlülükleri</h2>
      <ol>
        <li>Kişisel verileri yalnızca Müşteri&apos;nin talimatları ve bu sözleşme doğrultusunda, hizmeti sunmak amacıyla işler; kendi amaçları için kullanmaz, satmaz ve üçüncü kişilerle paylaşmaz.</li>
        <li>KVKK md. 12/1 uyarınca verilerin hukuka aykırı işlenmesini ve erişilmesini önlemek, muhafazasını sağlamak için uygun teknik ve idari tedbirleri alır (Madde 5).</li>
        <li>Verilere erişebilen çalışanlarının ve yardımcılarının gizlilik yükümlülüğü altında olmasını sağlar; bu yükümlülük sözleşme sona erdikten sonra da devam eder.</li>
        <li>Verilerin kanuni olmayan yollarla başkaları tarafından elde edildiğini öğrenirse Müşteri&apos;ye gecikmeksizin ve en geç 48 saat içinde bildirir; olayın kapsamı, etkilenen veri kategorileri ve alınan önlemler hakkında bilgi verir. Kurul&apos;a ve ilgili kişilere bildirim yükümlülüğü veri sorumlusu olarak Müşteri&apos;ye aittir; Hizmet Sağlayıcı bu bildirimlerin hazırlanmasında makul ölçüde destek olur.</li>
        <li>İlgili kişilerden doğrudan gelen başvuruları yanıtlamadan Müşteri&apos;ye yönlendirir ve Müşteri&apos;nin bu başvuruları yanıtlayabilmesi için gerekli verileri (dışa aktarma, düzeltme, silme) sağlar.</li>
        <li>Yetkili kamu kurumlarından gelen yasal talepleri, mevzuat izin verdiği ölçüde Müşteri&apos;ye bildirir.</li>
      </ol>

      <h2>4. Alt veri işleyenler ve yurt dışına aktarım</h2>
      <p>
        Müşteri, hizmetin sunulması için aşağıdaki altyapı sağlayıcılarının alt veri işleyen olarak kullanılmasına
        izin verir. Hizmet Sağlayıcı, bu sağlayıcıların da en az bu sözleşmedeki kadar koruma sağlamasını gözetir.
      </p>
      <ProcessorsTable />
      <p>
        Bu sağlayıcılara yapılan yurt dışı aktarım, KVKK md. 9 uyarınca Kişisel Verileri Koruma Kurulu&apos;nca ilan
        edilen standart sözleşmelerin imzalanması ve Kurul&apos;a bildirilmesi yoluyla gerçekleştirilir. Alt veri
        işleyen listesindeki değişiklikler bu sayfada yayımlanır; Müşteri değişikliğe makul gerekçeyle itiraz
        edebilir ve itirazın giderilememesi halinde hizmet ilişkisini sona erdirebilir.
      </p>

      <h2>5. Teknik ve idari tedbirler</h2>
      <ul>
        <li>Tüm bağlantılar TLS (HTTPS) ile şifrelenir; veriler sağlayıcı tarafında şifreli disklerde ve yedeklerde tutulur.</li>
        <li>Her şirketin verisi veritabanı seviyesinde satır bazlı güvenlik kurallarıyla ayrılır; bu ayrım otomatik testlerle her değişiklikte doğrulanır.</li>
        <li>Kullanıcılar ancak şirket yöneticisinin onayıyla erişir; yetkiler rol ve modül bazında verilir (asgari yetki ilkesi).</li>
        <li>Fiyat ve hakediş gibi hassas iş verileri ayrıca yetkiyle korunur; T.C. kimlik numarası işlem geçmişinde maskelenir.</li>
        <li>Önemli kayıtlardaki değişiklikler kim, ne zaman, ne değişti bilgisiyle değiştirilemez biçimde kaydedilir.</li>
        <li>Şifreler geri döndürülemez biçimde (özet olarak) saklanır; firma gizli alanı ayrıca şifreyle ve deneme sınırıyla korunur.</li>
        <li>Hizmet Sağlayıcı çalışanlarının müşteri verisine erişimi, yalnızca destek ve arıza giderme amacıyla ve gerekli olduğu ölçüde yapılır.</li>
      </ul>

      <h2>6. Müşteri&apos;nin yükümlülükleri</h2>
      <ul>
        <li>Panele girdiği kişisel verilerin hukuka uygun olarak elde edildiğinden ve işlenmesi için KVKK md. 5–6&apos;da sayılan hukuki sebeplerden birinin bulunduğundan sorumludur.</li>
        <li>Çalışanlarını ve diğer ilgili kişileri KVKK md. 10 uyarınca aydınlatır. Bunun için panelde Ayarlar → KVKK bölümünden şirket bilgileriyle doldurulmuş bir aydınlatma metni şablonu oluşturabilir.</li>
        <li>Kullanıcı hesaplarını yalnızca yetkili kişilere açar, yetkileri gerektiği kadar verir, ayrılan çalışanların erişimini kaldırır.</li>
        <li>Gerekiyorsa Veri Sorumluları Sicili (VERBİS) kaydını yapar.</li>
      </ul>

      <h2>7. Sözleşmenin sona ermesi, verilerin iadesi ve silinmesi</h2>
      <p>
        Hizmet ilişkisi sona erdiğinde Müşteri verilerini panelden (Excel, PDF, Word çıktıları) dışa aktarabilir veya
        Hizmet Sağlayıcı&apos;dan toplu dışa aktarma talep edebilir. Müşteri&apos;nin yazılı silme talebi üzerine şirket
        kaydı ve bağlı tüm operasyon verileri kalıcı olarak silinir. Silinen veriler sağlayıcı yedeklerinden yedekleme
        döngüsü içinde (en geç 30 gün) kendiliğinden kalkar. Mevzuatın saklamayı zorunlu kıldığı kayıtlar (ör. fatura
        ve ödeme kayıtları) ilgili süre boyunca saklanır. Ayrıntılar:{" "}
        <Link href="/kvkk/saklama-ve-imha-politikasi">Kişisel Veri Saklama ve İmha Politikası</Link>.
      </p>

      <h2>8. Denetim ve bilgi verme</h2>
      <p>
        Hizmet Sağlayıcı, bu sözleşmeye uyumu göstermek için Müşteri&apos;nin makul taleplerine yazılı bilgi vererek
        yanıt verir. Yerinde denetim talepleri, en az 30 gün önceden bildirilmek, gizlilik taahhüdü verilmek ve
        diğer müşterilerin verilerinin gizliliği korunmak kaydıyla taraflarca birlikte planlanır.
      </p>

      <h2>9. Sorumluluk ve diğer hükümler</h2>
      <p>
        Tarafların sorumluluğu <Link href="/kullanim-sartlari">Kullanım Şartları</Link>&apos;nda düzenlendiği şekildedir;
        ancak tarafların kendi kusurlarından kaynaklanan KVKK ihlallerinden doğan sorumlulukları saklıdır. Bu sözleşme
        ile Kullanım Şartları arasında kişisel verilerin işlenmesine ilişkin çelişki halinde bu sözleşme uygulanır.
        Sözleşmede yapılan değişiklikler bu sayfada yayımlanır.
      </p>
    </LegalDocument>
  );
}
