import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME, SUPPORT_EMAIL, whatsappUrl } from "@/lib/constants/brand";

export const metadata: Metadata = {
  title: "Kullanım Kılavuzu",
  description: `${APP_NAME} kullanım kılavuzu: firma kurma, kullanıcılar ve yetkiler, projeler, iş planı, puantaj, malzeme stoku, araçlar, imalat ve hakediş.`,
  alternates: { canonical: "/kilavuz" },
};

const SECTIONS = [
  { id: "baslangic", title: "1. Firma kurma, katılım kodu ve kullanıcı onayı" },
  { id: "roller", title: "2. Roller ve modül yetkileri" },
  { id: "projeler", title: "3. Proje türleri, aşamalar, bölümler ve metraj" },
  { id: "hakedis", title: "4. Hakediş" },
  { id: "is-plani", title: "5. Günlük iş planı ve WhatsApp paylaşımı" },
  { id: "personel", title: "6. Personel, puantaj ve avans" },
  { id: "stok", title: "7. Malzeme stoku, depolar ve irsaliye" },
  { id: "araclar", title: "8. Araçlar, yakıt ve araç ekipmanları" },
  { id: "imalat", title: "9. Günlük imalat raporu" },
  { id: "ayarlar", title: "10. Firma logosu, raporlar ve işlem geçmişi" },
  { id: "abonelik", title: "11. Deneme süresi, plan talebi ve destek" },
];

export default function GuidePage() {
  return (
    <article className="text-[15px] leading-7 text-muted-foreground [&_a]:text-primary [&_a]:underline [&_h2]:mt-12 [&_h2]:scroll-mt-24 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:mt-1 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mt-3 [&_strong]:text-foreground [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Kullanım Kılavuzu</h1>
      <p className="!mt-2">
        {APP_NAME} ile firmanızı kurmaktan hakediş raporu almaya kadar her şeyi adım adım anlatır. Menü adları panelde
        gördüğünüzle aynıdır.
      </p>

      <nav aria-label="İçindekiler" className="mt-8 rounded-2xl border bg-muted/30 p-5">
        <p className="font-semibold text-foreground">İçindekiler</p>
        <ol className="!mt-2 grid gap-x-6 sm:grid-cols-2">
          {SECTIONS.map((section) => (
            <li key={section.id} className="!list-none">
              <a href={`#${section.id}`} className="!no-underline hover:!underline">
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <h2 id="baslangic">{SECTIONS[0].title}</h2>
      <h3>Firmanızı kurun</h3>
      <ol>
        <li>
          <Link href="/register">Ücretsiz Dene</Link> sayfasından e-posta ve şifrenizle kayıt olun, e-postanızı doğrulayın.
        </li>
        <li>
          Girişte <strong>Yeni şirket kur</strong> seçeneğiyle firma adınızı yazın. Firmayı kuran kişi firmanın{" "}
          <strong>Ana Yöneticisi</strong> olur.
        </li>
        <li>Firmanız kurulduğu anda 48 saatlik ücretsiz deneme başlar; bütün modüller açıktır.</li>
      </ol>
      <h3>Çalışanlarınızı ekleyin</h3>
      <ol>
        <li>
          <strong>Ayarlar → Şirket Bilgileri</strong> bölümünde firmanızın 4 haneli <strong>katılım kodu</strong> yazar.
          &quot;Kopyala&quot; ile firma adı ve kodu birlikte çalışanlarınıza gönderin.
        </li>
        <li>Çalışan kayıt olur, <strong>Şirkete katıl</strong> seçeneğinde firma adını ve kodu girer.</li>
        <li>
          Talep <strong>Kullanıcılar</strong> sayfasına düşer. Ana yönetici rolünü (Yönetici veya Muhasebe) seçerek onaylar ya da
          reddeder. Onaylanmadan çalışan hiçbir veriyi göremez.
        </li>
      </ol>

      <h2 id="roller">{SECTIONS[1].title}</h2>
      <ul>
        <li>
          <strong>Ana Yönetici:</strong> her şeyi görür ve düzenler. Kullanıcıları onaylar, yetki verir; Ayarlar, Destek ve
          İşlem Geçmişi yalnızca ona açıktır.
        </li>
        <li>
          <strong>Yönetici:</strong> operasyon modüllerinin hepsini görür; yalnızca kendisine yetki verilen modüllerde kayıt
          ekleyip düzenleyebilir.
        </li>
        <li>
          <strong>Muhasebe:</strong> personel ve puantajı görür; diğer modüller ancak yetki verilirse açılır.
        </li>
      </ul>
      <p>
        Yetkiler <strong>Kullanıcılar</strong> sayfasında her kişi için ayrı ayrı açılıp kapatılır: Projeler, İş Planı,
        Personel, Puantaj, Araçlar, Malzeme Stok, Araç Ekipmanları, İmalatlar ve Hakediş. Hakediş yetkisi olmayan kişi birim
        fiyatları ve tutarları hiçbir ekranda göremez.
      </p>

      <h2 id="projeler">{SECTIONS[2].title}</h2>
      <h3>Proje türü tanımlayın</h3>
      <p>
        <strong>Ayarlar → Proje Türleri</strong> bölümünde işinize uyan türleri oluşturun. Hazır şablonlardan (Bina İnşaatı,
        Altyapı Hattı, Doğalgaz Hattı, Elektrik Tesisatı, Fiber/Telekom Hattı, Araç Bakım/Servis, Genel İş) başlayıp
        değiştirebilirsiniz. Her türün <strong>aşamaları</strong> vardır (ör. Kazı, Boru döşeme, Dolgu). Aşamaya birim
        (m, m², adet…) verirseniz o aşamada <strong>metraj</strong> takip edilir.
      </p>
      <ul>
        <li>
          <strong>Bölümlü türler:</strong> bir proje birden çok parçadan oluşuyorsa (blok, kat, pafta, hat kesimi) türde
          &quot;bölümlü&quot; seçeneğini açın; her bölümün aşamaları ayrı izlenir.
        </li>
        <li>Bir türdeki değişiklik o türdeki mevcut projelere de yansır.</li>
      </ul>
      <h3>Proje açın ve ilerlemeyi işleyin</h3>
      <ol>
        <li>
          <strong>Projeler → Yeni Proje</strong> ile kod, ad, konum, tür ve tarihleri girin.
        </li>
        <li>
          Proje detayında her aşamaya hedef miktar girip <strong>iş kaydı</strong> ekleyin: tarih, miktar, ekip şefi, not.
          İlerleme yüzdesi kayıtlardan otomatik hesaplanır.
        </li>
        <li>
          Projenin durumunu (Başlamadı, Devam Ediyor, Beklemede, Gecikti, Tamamlandı) güncelleyin. Vazgeçilen işler{" "}
          <strong>İptal Projeler</strong> sayfasına taşınır ve gerekirse yeniden etkinleştirilir.
        </li>
      </ol>

      <h2 id="hakedis">{SECTIONS[3].title}</h2>
      <p>Hakediş, yapılan işin parasal değeridir: <strong>miktar × birim fiyat</strong>.</p>
      <ol>
        <li>
          <strong>Ayarlar → Proje Türleri</strong> bölümünde birimi olan her aşamaya varsayılan birim fiyat girin. Belirli bir
          projede farklı fiyat geçerliyse proje detayında o aşamaya projeye özel fiyat yazın.
        </li>
        <li>
          <strong>Ayarlar → Hakediş Ayarları</strong> bölümünde dönem başlangıç gününü ve para birimini seçin. Örneğin başlangıç
          günü 20 ise dönem 20 Şubat – 19 Mart olur.
        </li>
        <li>
          İş kaydı girildiği anda tutar o günkü fiyatla hesaplanır ve <strong>sabitlenir</strong>; fiyat sonradan değişse de
          geçmiş hakediş değişmez. Fiyatı henüz girilmemiş kayıtlar, fiyat girildiğinde otomatik fiyatlanır.
        </li>
        <li>
          <strong>Hakediş</strong> sayfasında dönem seçip proje, aşama ve ekip şefi bazında dökümü görün; PDF veya Excel
          olarak indirin. Dashboard&apos;daki kart bugünün, bu haftanın ve bu dönemin toplamını gösterir.
        </li>
      </ol>

      <h2 id="is-plani">{SECTIONS[4].title}</h2>
      <ol>
        <li>
          <strong>İş Planı → Yeni İş Planı</strong> ile tarihi seçin ve ekipleri ekleyin: proje, ekip türü, ekip şefi ve personel.
          Araç atamak isteğe bağlıdır.
        </li>
        <li>O gün izinli veya raporlu olan personeli ayrıca işaretleyin.</li>
        <li>
          Aynı kişi ya da aynı araç aynı gün iki ekibe yazılamaz; sistem uyarır. Planı bitirmeden <strong>taslak</strong>{" "}
          olarak kaydedip sonra devam edebilirsiniz.
        </li>
        <li>
          Kaydedilen planı <strong>WhatsApp</strong> ile paylaşın: düz metin ya da firma logolu tablo görseli olarak.
        </li>
        <li>Geçmiş planlarda tarih, proje, plaka veya personel adıyla arama yapabilirsiniz.</li>
      </ol>

      <h2 id="personel">{SECTIONS[5].title}</h2>
      <ul>
        <li>
          <strong>Personel:</strong> ad soyad, görev, telefon, işe giriş ve çıkış tarihleri. İşten çıkan personel pasife
          alınır; kayıtları silinmez. Üzerinde zimmetli malzeme olan personel pasife alınamaz.
        </li>
        <li>
          <strong>Puantaj:</strong> ay tablosunda her gün için Çalıştı, Çalışmadı, Mazeretsiz Gelmedi, İzinli, Raporlu veya
          Hafta Tatili işaretlenir. Aylık tabloyu Excel ya da Word olarak, kişi bazında puantajı Word olarak alabilirsiniz.
          Puantaj değişikliklerinin kendi geçmişi tutulur.
        </li>
        <li>
          <strong>Avans:</strong> personel detayında &quot;Avans Ekle&quot; ile tarih ve tutar girilir; avans dökümü ve toplamı
          aynı sayfada görünür.
        </li>
      </ul>

      <h2 id="stok">{SECTIONS[6].title}</h2>
      <h3>Önce kategorileri ve depoları tanımlayın</h3>
      <ul>
        <li>
          <strong>Kategoriler:</strong> malzemelerinizi kendi gruplarınıza ayırın (ör. Elektrik, Sıhhi Tesisat, Yedek Parça).
        </li>
        <li>
          <strong>Depolar:</strong> her firmada bir ana depo vardır (adını değiştirebilirsiniz). Şube, şantiye ya da saha
          deposu için istediğiniz kadar depo ekleyin.
        </li>
      </ul>
      <h3>Günlük akış</h3>
      <ol>
        <li>
          <strong>Yeni Malzeme</strong> ile kataloğa malzeme ekleyin: ad, kategori, tür, ebat, birim. Seri numarasıyla takip
          edilen malzemelerde &quot;her girişte ID&quot; seçeneğini açın.
        </li>
        <li>
          <strong>İrsaliye ile Stok Girişi:</strong> tarih, irsaliye no ve teslim alanı yazın, girişin yapılacağı depoyu seçin,
          malzemeleri listeleyin.
        </li>
        <li>
          <strong>Stoktan düş:</strong> malzemenin yanındaki düğmeyle, hangi depodan ne kadar çıktığını ve hangi projede
          kullanıldığını kaydedin.
        </li>
        <li>
          <strong>Depolar Arası Sevkiyat:</strong> malzemeyi bir depodan diğerine gönderin. Hatalı sevkiyat, varış deposundaki
          malzeme kullanılmadıysa geri alınabilir.
        </li>
        <li>
          <strong>Malzeme Talep Listesi:</strong> ihtiyaç talebi oluşturun → onaylayın → irsaliye gelince kontrol edin → stok
          onayıyla ana depoya alın.
        </li>
      </ol>
      <p>Stok listesini kategori seçerek Excel veya PDF olarak alabilirsiniz; her depo ayrı sütunda görünür.</p>

      <h2 id="araclar">{SECTIONS[7].title}</h2>
      <ul>
        <li>
          <strong>Araçlar:</strong> plaka, marka, model, kilometre, muayene ve sigorta tarihleri. Tarihi yaklaşan muayene ve
          sigortalar Dashboard&apos;da uyarı olarak çıkar. Aracı bir personele atayabilirsiniz.
        </li>
        <li>
          <strong>Yakıt:</strong> her alımda tarih, kilometre ve litre girilir; aylık yakıt dökümü araç sayfasında görünür.
        </li>
        <li>
          <strong>Araç Ekipmanları:</strong> matkap, jeneratör gibi demirbaşlar ana depoda tutulur; araca, personele veya ekibe
          zimmetlenir, aralarında aktarılır ya da depoya iade edilir. Bir aracın ekipman listesini Word olarak alabilirsiniz.
        </li>
      </ul>

      <h2 id="imalat">{SECTIONS[8].title}</h2>
      <ol>
        <li>
          <strong>İmalatlar</strong> sayfasında tarihi seçin, her ekip başı için o gün yapılan işleri ve iş kalemlerini
          (miktar ve birimiyle) yazın.
        </li>
        <li>
          &quot;Kaydet ve Paylaş&quot; ile günlük imalat raporu firma logolu PDF olarak hazırlanır ve WhatsApp&apos;tan
          paylaşılabilir.
        </li>
        <li>Bitmemiş günü &quot;Taslak Kaydet&quot; ile saklayabilirsiniz. Geçmiş imalatları tarih aralığı ve ekip başına göre süzüp PDF olarak indirebilirsiniz.</li>
      </ol>

      <h2 id="ayarlar">{SECTIONS[9].title}</h2>
      <ul>
        <li>
          <strong>Ayarlar → Firma Logosu:</strong> PNG, JPG veya WEBP (en fazla 2 MB) logo yükleyin. Bütün PDF, Word ve Excel
          çıktılarında ve iş planı görselinde {APP_NAME} yerine firmanızın adı ve logosu görünür.
        </li>
        <li>
          <strong>Ayarlar → İşlem Geçmişi:</strong> kim, ne zaman, hangi kayıtta neyi değiştirdi; önceki ve sonraki
          değerleriyle. Tarih, modül ve kullanıcıya göre süzülür. Kayıtlar değiştirilemez ve silinemez.
        </li>
      </ul>

      <h2 id="abonelik">{SECTIONS[10].title}</h2>
      <ul>
        <li>Deneme süresi firma kurulduktan sonra 48 saattir; panelin üstünde kalan süre gösterilir.</li>
        <li>
          Plan almak için ana yönetici <strong>Destek</strong> sayfasından plan talebi gönderir; kullanıcı sayınızı ve ödeme
          dönemini yazın. Ödeme EFT ile alınır; ödeme bilgileri talebinize yanıt olarak iletilir ve ödeme onaylanınca planınız
          tanımlanır.
        </li>
        <li>Deneme ya da plan süresi bittiğinde verileriniz silinmez; plan tanımlanınca kaldığınız yerden devam edersiniz.</li>
        <li>
          Sorularınız için Destek sayfasını kullanabilir, <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> adresine
          yazabilir ya da{" "}
          <a href={whatsappUrl("MK OPS kullanımıyla ilgili sorum var.")} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>{" "}
          üzerinden ulaşabilirsiniz.
        </li>
      </ul>
    </article>
  );
}
