/**
 * SEO çözüm sayfaları (/cozumler/[slug]). Yalnızca uygulamada gerçekten var olan
 * özellikler anlatılır; içerik sektörden bağımsızdır.
 */
export type Solution = {
  slug: string;
  /** Sayfa başlığı ve <title> */
  title: string;
  /** Arama sonucu açıklaması (~155 karakter) */
  description: string;
  /** Kartlarda ve menüde kısa ad */
  shortTitle: string;
  intro: string;
  problem: { title: string; points: string[] };
  sections: { title: string; text: string; bullets: string[] }[];
  steps: string[];
  audience: string[];
  faq: { q: string; a: string }[];
  related: string[];
};

export const SOLUTIONS: Solution[] = [
  {
    slug: "hakedis-takibi",
    shortTitle: "Hakediş takibi",
    title: "Hakediş Takibi ve Raporlama Programı",
    description:
      "İş kalemi birim fiyatları, sahadan gelen metrajlar ve ek işlerle hakedişinizi otomatik hesaplayın; dönem raporunu PDF ve Excel olarak alın.",
    intro:
      "Sahada yapılan işin parasal değerini Excel'de elle toplamak hem zaman alır hem hataya açıktır. MK OPS, iş kalemlerinizin birim fiyatlarını ve sahadan girilen miktarları birleştirerek hakedişinizi her gün güncel tutar.",
    problem: {
      title: "Hakediş neden zorlaşır?",
      points: [
        "Metrajlar ekiplerden farklı kanallarla (WhatsApp, kâğıt, telefon) gelir; toplanırken kaybolur.",
        "Birim fiyat değişince geçmiş dönemlerin tutarı da yanlışlıkla değişir.",
        "Plan dışı ek işler unutulur ya da fiyatsız kalır.",
        "Dönem sonunda proje ve iş kalemi bazında döküm hazırlamak günler sürer.",
      ],
    },
    sections: [
      {
        title: "İş kalemleri ve birim fiyatlar",
        text: "Her iş türü için iş kalemlerini birimi ve birim fiyatıyla bir kez tanımlarsınız.",
        bullets: [
          "Kazı (m), beton (m³), boru döşeme (m), montaj (adet) gibi kalemler",
          "Belirli bir projede farklı fiyat geçerliyse projeye özel fiyat",
          "Fiyatları yalnızca yetki verdiğiniz kişiler görür",
        ],
      },
      {
        title: "Sahadan gelen metraj otomatik hakedişe dönüşür",
        text: "Günlük imalat girilirken proje ve iş kalemi seçilip miktar yazılır; tutar o günkü fiyatla hesaplanır.",
        bullets: [
          "Fiyat kayıt anında sabitlenir; sonradan değişse de geçmiş hakediş değişmez",
          "Fiyatı henüz girilmemiş kayıtlar fiyat girilince otomatik fiyatlanır",
          "Plan dışı ek işler açıklama, miktar, birim ve fiyatla hakedişe eklenir",
        ],
      },
      {
        title: "Dönem raporu tek tıkla",
        text: "Hakediş döneminizi (ör. her ayın 20'si) bir kez ayarlarsınız; rapor hazır gelir.",
        bullets: [
          "Proje, iş kalemi ve ekip şefi bazında döküm",
          "Firma logolu PDF ve çok sayfalı Excel çıktısı",
          "Panelde bugün, bu hafta ve bu dönemin toplamı; fiyatsız kayıt uyarısı",
        ],
      },
    ],
    steps: [
      "Proje türlerinizi ve iş kalemlerinizi birim fiyatlarıyla tanımlayın.",
      "Ekipler her gün imalatı proje ve iş kalemi seçerek girsin.",
      "Hakediş sayfasında dönemi seçin; raporu PDF veya Excel olarak indirin.",
    ],
    audience: [
      "Altyapı, doğalgaz, elektrik ve telekom taşeronları",
      "Bina ve inşaat müteahhitleri",
      "Metraj üzerinden iş yapan servis ve montaj firmaları",
    ],
    faq: [
      {
        q: "Birim fiyatı değiştirirsem geçmiş hakediş değişir mi?",
        a: "Hayır. Her iş kaydı girildiği günkü fiyatla sabitlenir; fiyat değişikliği yalnızca sonraki kayıtları etkiler.",
      },
      {
        q: "Listede olmayan bir iş yapıldıysa ne olur?",
        a: "İmalat girilirken \"Ek iş\" satırı olarak açıklama, miktar, birim ve fiyatla yazılır ve hakedişe dahil edilir.",
      },
      {
        q: "Fiyatları herkes görebilir mi?",
        a: "Hayır. Birim fiyat ve tutarları yalnızca firma yöneticileri ile \"Hakediş\" yetkisi verilen kullanıcılar görür.",
      },
    ],
    related: ["gunluk-is-takibi", "proje-metraj-takibi", "irsaliye-malzeme-takibi"],
  },
  {
    slug: "gunluk-is-takibi",
    shortTitle: "Günlük iş takibi",
    title: "Günlük İş Planı ve Saha İmalat Takibi",
    description:
      "Günlük iş planını hazırlayın, ekiplere WhatsApp'tan gönderin; akşam imalatı proje ve iş kalemiyle girin, ilerleme ve hakediş kendiliğinden güncellensin.",
    intro:
      "Sabah kimin hangi işe gideceği, akşam kimin ne kadar iş yaptığı… MK OPS günlük iş planını ve saha imalatını aynı yerde tutar; projelerin ilerlemesi bu kayıtlardan kendiliğinden hesaplanır.",
    problem: {
      title: "Sahada günlük iş neden dağılır?",
      points: [
        "İş planı her sabah elle yazılıp gruplara tek tek gönderilir.",
        "Aynı personel ya da araç yanlışlıkla iki ekibe yazılır.",
        "Akşam gelen imalat bilgisi projeye ve hakedişe ayrıca işlenmek zorunda kalır.",
      ],
    },
    sections: [
      {
        title: "Günlük iş planı",
        text: "Tarihi seçin, ekipleri projeler listesinden seçilen proje, ekip türü, ekip şefi ve personelle oluşturun.",
        bullets: [
          "Aynı kişi veya araç aynı gün iki ekibe yazılamaz",
          "İzinli ve raporlu personel ayrıca işaretlenir",
          "Plan WhatsApp'a metin ya da firma logolu tablo görseli olarak paylaşılır",
        ],
      },
      {
        title: "Günlük imalat raporu",
        text: "Akşam her ekip başı için yapılan işler proje ve iş kalemi seçilerek miktarıyla girilir.",
        bullets: [
          "\"İş Planından Doldur\" ile ekipler ve projeler forma hazır gelir",
          "Kaydedilen miktar projeye iş kaydı olarak işlenir; ilerleme yüzdesi güncellenir",
          "Günlük rapor firma logolu PDF olarak paylaşılır",
        ],
      },
      {
        title: "Geçmiş ve takip",
        text: "Geçmiş planlar ve imalatlar tarih, proje, plaka veya personelle aranır.",
        bullets: [
          "Tarih aralığı ve ekip başına göre imalat dökümü",
          "Geciken ve bitişi yaklaşan projeler için bildirim",
          "Kim ne zaman neyi değiştirdi: işlem geçmişi",
        ],
      },
    ],
    steps: [
      "Sabah iş planını hazırlayıp WhatsApp'tan paylaşın.",
      "Akşam \"İş Planından Doldur\" ile imalat formunu açın, miktarları girin.",
      "Proje ilerlemesini ve hakedişi panelden izleyin.",
    ],
    audience: [
      "Birden çok ekiple sahada çalışan taşeron ve müteahhitler",
      "Bakım, servis ve montaj ekipleri yöneten firmalar",
      "Ofisten saha koordinasyonu yapan yöneticiler",
    ],
    faq: [
      {
        q: "Ekiplerin uygulamaya girmesi gerekiyor mu?",
        a: "Hayır. Kayıtları ofisteki yöneticiler girer; ekipler planı WhatsApp'tan alır.",
      },
      {
        q: "Ekibe araç atamak zorunlu mu?",
        a: "Hayır, araç isteğe bağlıdır. Araç atanırsa aynı araç aynı gün iki ekibe yazılamaz.",
      },
      {
        q: "İmalat girince proje ayrıca güncellenmeli mi?",
        a: "Hayır. İş kalemi seçilerek girilen miktar projeye otomatik işlenir; imalat düzenlenirse proje de güncellenir.",
      },
    ],
    related: ["hakedis-takibi", "proje-metraj-takibi", "puantaj-personel-takibi"],
  },
  {
    slug: "irsaliye-malzeme-takibi",
    shortTitle: "Malzeme ve depo takibi",
    title: "Malzeme Stok, Depo ve İrsaliye Takibi",
    description:
      "Malzemeleri kendi kategorilerinizle tanımlayın, irsaliyeyle istediğiniz depoya girin, depolar arası sevk edin ve projelere düşün. Excel ve PDF stok listesi.",
    intro:
      "Hangi malzeme hangi depoda, ne kadar kaldı, hangi projeye gitti? MK OPS malzeme stoğunuzu birden çok depo ve şube için irsaliye bazında tutar.",
    problem: {
      title: "Malzeme takibinde sık yaşanan sorunlar",
      points: [
        "Şantiye ve şube depolarındaki stok merkezle karışır.",
        "İrsaliyeyle gelen malzemenin nereye gittiği izlenemez.",
        "Seri numaralı malzemelerin hangi partiden geldiği bilinmez.",
      ],
    },
    sections: [
      {
        title: "Kategoriler ve çoklu depo",
        text: "Malzemeleri kendi kategorilerinize ayırın; istediğiniz kadar depo ve şube tanımlayın.",
        bullets: [
          "Her deponun stoğu ayrı izlenir; tüm depolar görünümünde dağılım yazar",
          "Seri numarası / ID ile takip edilen malzemeler",
          "Birim: adet, metre, kilogram",
        ],
      },
      {
        title: "İrsaliye, sevkiyat ve kullanım",
        text: "Her hareket kimin ne zaman yaptığıyla kayıt altındadır.",
        bullets: [
          "İrsaliye ile seçilen depoya stok girişi",
          "Depolar arası sevkiyat; hatalı sevkiyat geri alınabilir",
          "Stoktan düşerken proje ve teslim alan personel kaydı",
        ],
      },
      {
        title: "Talep ve rapor",
        text: "Malzeme ihtiyacı talepten stoğa kadar izlenir.",
        bullets: [
          "Talep → onay → irsaliye kontrolü → stok onayı akışı",
          "Kategori seçerek firma logolu Excel ve PDF stok listesi",
          "Her depo çıktıda ayrı sütun",
        ],
      },
    ],
    steps: [
      "Kategorilerinizi ve depolarınızı tanımlayın.",
      "Malzemeleri kataloğa ekleyin, irsaliyeyle depoya girin.",
      "Sevkiyatları ve kullanımları kaydedin; stok listesini istediğiniz an alın.",
    ],
    audience: [
      "Birden çok şantiye veya şube deposu olan firmalar",
      "Kablo, boru, malzeme gibi metrajlı sarf kullanan ekipler",
      "Seri numaralı ekipman takibi yapan servis firmaları",
    ],
    faq: [
      {
        q: "Kategoriler hazır mı geliyor?",
        a: "Hayır; firmanız kendi kategorilerini tanımlar. Kategori silinse de malzemeler silinmez, kategorisiz kalır.",
      },
      {
        q: "Kaç depo tanımlayabilirim?",
        a: "Sınır yok. Ana deponun adını değiştirebilir, şube ve şantiye depoları ekleyebilirsiniz.",
      },
      {
        q: "Yanlış sevkiyatı geri alabilir miyim?",
        a: "Evet; varış deposundaki malzeme kullanılmadıysa sevkiyat geri alınır ve stok çıkış deposuna döner.",
      },
    ],
    related: ["arac-ekipman-takibi", "gunluk-is-takibi", "hakedis-takibi"],
  },
  {
    slug: "proje-metraj-takibi",
    shortTitle: "Proje ve metraj takibi",
    title: "Proje, İş Kalemi ve Metraj Takibi",
    description:
      "Her iş türü için iş kalemlerini tanımlayın; projeleri bölüm bölüm, metrajla ve ilerleme yüzdesiyle izleyin. Geciken projeler için bildirim alın.",
    intro:
      "Bina, altyapı hattı, doğalgaz, elektrik ya da servis işi… Her işin aşamaları farklıdır. MK OPS'ta iş türlerinizi kendiniz tanımlar, projeleri aşama aşama ve metrajla takip edersiniz.",
    problem: {
      title: "Proje takibi neden tabloda kaybolur?",
      points: [
        "Her iş türünün aşamaları farklıdır; tek tip tablo hepsine uymaz.",
        "Büyük projeler blok, kat ya da hat kesimi gibi parçalara ayrılır.",
        "Gecikmeler fark edildiğinde iş işten geçmiş olur.",
      ],
    },
    sections: [
      {
        title: "Kendi iş türleriniz",
        text: "Hazır şablonlardan başlayın ya da sıfırdan oluşturun.",
        bullets: [
          "Bina inşaatı, altyapı hattı, doğalgaz, elektrik, fiber, araç servisi ve genel iş şablonları",
          "İş kalemlerine birim verince metraj takibi açılır",
          "Bir türdeki değişiklik o türdeki projelere de yansır",
        ],
      },
      {
        title: "Bölümler ve ilerleme",
        text: "Projeyi parçalara ayırıp her parçayı ayrı izleyin.",
        bullets: [
          "Bölümlü projeler: blok, kat, pafta, hat kesimi",
          "Hedef miktar ve yapılan miktardan otomatik ilerleme yüzdesi",
          "Durum: Başlamadı, Devam Ediyor, Beklemede, Gecikti, Tamamlandı",
        ],
      },
      {
        title: "Uyarılar ve geçmiş",
        text: "Önemli değişiklikleri kaçırmayın.",
        bullets: [
          "Geciken ve 3 gün içinde bitecek projeler için bildirim",
          "İptal edilen projeler ayrı listede; gerekirse yeniden açılır",
          "Kim ne zaman neyi değiştirdi: işlem geçmişi",
        ],
      },
    ],
    steps: [
      "İş türünüzü şablondan seçip iş kalemlerini düzenleyin.",
      "Projeyi açın; gerekiyorsa bölümlere ayırıp hedef miktarları girin.",
      "Günlük imalat girildikçe ilerlemeyi panelden izleyin.",
    ],
    audience: [
      "Aynı anda çok sayıda proje yürüten müteahhitler",
      "Hat ve şebeke işi yapan altyapı firmaları",
      "Proje bazlı çalışan servis ve montaj firmaları",
    ],
    faq: [
      {
        q: "Kendi aşamalarımı tanımlayabilir miyim?",
        a: "Evet. İş türlerini ve iş kalemlerini tamamen siz belirlersiniz; şablonlar yalnızca başlangıçtır.",
      },
      {
        q: "Metraj zorunlu mu?",
        a: "Hayır. Birimi olmayan iş kalemleri yalnızca durumla (başladı / bitti) izlenir.",
      },
    ],
    related: ["gunluk-is-takibi", "hakedis-takibi", "denetim-gunlugu"],
  },
  {
    slug: "puantaj-personel-takibi",
    shortTitle: "Puantaj ve personel",
    title: "Personel Puantaj ve Avans Takibi",
    description:
      "Aylık puantajı tek tabloda işaretleyin; izinli, raporlu ve hafta tatili günleri ayrı tutulsun. Excel ve Word puantaj çıktısı, avans takibi.",
    intro:
      "Saha personelinin günlük durumunu ay sonunda toplamaya çalışmak yerine MK OPS'ta her günü tek tabloda işaretleyin; hak edilen gün sayısı kendiliğinden hesaplansın.",
    problem: {
      title: "Puantaj neden ay sonunda karışır?",
      points: [
        "Günlük durum farklı kişilerden, farklı zamanlarda gelir.",
        "İzin, rapor ve hafta tatili ayrımı karışır.",
        "Puantajdaki değişikliklerin kim tarafından yapıldığı bilinmez.",
      ],
    },
    sections: [
      {
        title: "Aylık puantaj tablosu",
        text: "Her personel ve gün için durum işaretlenir.",
        bullets: [
          "Çalıştı, Çalışmadı, Mazeretsiz Gelmedi, İzinli, Raporlu, Hafta Tatili",
          "Hak edilen gün sayısı otomatik",
          "Puantaj değişikliklerinin kendi geçmişi tutulur",
        ],
      },
      {
        title: "Çıktılar",
        text: "Muhasebeye hazır dökümler.",
        bullets: [
          "Aylık puantaj Excel ve Word",
          "Kişi bazında puantaj Word ve Excel",
          "Firma adı ve logosuyla",
        ],
      },
      {
        title: "Personel ve avans",
        text: "Personel kartı ve avans dökümü tek yerde.",
        bullets: [
          "İşe giriş, çıkış ve görev bilgisi; çıkan personel pasife alınır",
          "Tarih ve tutarla avans kaydı, avans dökümü",
          "Muhasebe kullanıcısına yalnızca personel ve puantaj erişimi",
        ],
      },
    ],
    steps: [
      "Personelinizi ekleyin.",
      "Her gün ya da toplu olarak puantajı işaretleyin.",
      "Ay sonunda Excel veya Word çıktısını muhasebeye verin.",
    ],
    audience: ["Saha personeli çalıştıran firmalar", "Muhasebesi ayrı olan şirketler", "Puantajı kâğıtta tutan ekipler"],
    faq: [
      {
        q: "Muhasebecim her şeyi görür mü?",
        a: "Hayır. Muhasebe rolü varsayılan olarak yalnızca personel ve puantajı görür; diğer modüller ancak yetki verilirse açılır.",
      },
      {
        q: "Puantajı kim değiştirdi, görebilir miyim?",
        a: "Evet. Puantaj değişikliklerinin kendi geçmişi tutulur.",
      },
    ],
    related: ["gunluk-is-takibi", "arac-ekipman-takibi", "hakedis-takibi"],
  },
  {
    slug: "arac-ekipman-takibi",
    shortTitle: "Araç ve ekipman",
    title: "Araç, Yakıt ve Ekipman Zimmet Takibi",
    description:
      "Araçların muayene ve sigorta tarihlerini kaçırmayın, yakıt ve kilometreyi kaydedin; matkap, jeneratör gibi ekipmanları araca, personele veya ekibe zimmetleyin.",
    intro:
      "Muayenesi geçen araç, kimde olduğu bilinmeyen jeneratör… MK OPS araçlarınızı ve demirbaş ekipmanlarınızı tarih uyarıları ve zimmet hareketleriyle izler.",
    problem: {
      title: "Araç ve ekipmanda sık yaşanan sorunlar",
      points: [
        "Muayene ve sigorta tarihleri son gün fark edilir.",
        "Yakıt ve kilometre kayıtları dağınık tutulur.",
        "Ekipmanın hangi araçta veya kimde olduğu bilinmez.",
      ],
    },
    sections: [
      {
        title: "Araçlar ve tarih uyarıları",
        text: "Plaka, marka, model, kilometre, muayene ve sigorta tarihleri.",
        bullets: [
          "15 gün içinde gelen muayene ve sigorta için bildirim",
          "Aracı bir personele atama",
          "İş planında araç seçimi (isteğe bağlı)",
        ],
      },
      {
        title: "Yakıt ve kilometre",
        text: "Her yakıt alımı tarih, kilometre ve litreyle kaydedilir.",
        bullets: ["Aylık yakıt dökümü", "Kilometre geçmişi", "Kim kaydetti bilgisi"],
      },
      {
        title: "Ekipman zimmeti",
        text: "Demirbaşlar ana depoda tutulur, zimmetlenir ve iade edilir.",
        bullets: [
          "Araca, personele veya ekibe zimmet ve aralarında aktarım",
          "Zimmetli ekipmanı olan personel pasife alınamaz",
          "Araç ekipman listesi Word çıktısı",
        ],
      },
    ],
    steps: [
      "Araçlarınızı muayene ve sigorta tarihleriyle ekleyin.",
      "Ekipmanları depoya girip araçlara veya personele zimmetleyin.",
      "Bildirimlerle tarihleri, zimmet hareketleriyle ekipmanı takip edin.",
    ],
    audience: ["Araç filosu olan saha firmaları", "Servis ve bakım ekipleri", "Demirbaş ekipmanı çok olan müteahhitler"],
    faq: [
      {
        q: "Muayene tarihini nereden hatırlatıyor?",
        a: "Panelin bildirim zilinde ve gösterge sayfasında, tarihe 15 gün kala uyarı çıkar.",
      },
      {
        q: "Ekipman kimde, nasıl görürüm?",
        a: "Araç Ekipmanları sayfasında her ekipmanın depoda ve kimlerde ne kadar olduğu ile tüm aktarım geçmişi görünür.",
      },
    ],
    related: ["irsaliye-malzeme-takibi", "gunluk-is-takibi", "puantaj-personel-takibi"],
  },
  {
    // Eski MK-OPS'taki /cozumler/denetim-gunlugu adresi korunur (Google indeksinde vardı).
    slug: "denetim-gunlugu",
    shortTitle: "Denetim günlüğü",
    title: "Denetim Günlüğü ve İşlem Geçmişi",
    description:
      "Projede, hakediş fiyatında, personelde, stokta ve yetkilerde kim, ne zaman, neyi değiştirdi? Önceki ve sonraki değerleriyle, silinemeyen işlem geçmişi.",
    intro:
      "Ekip büyüdükçe aynı kayda birden çok kişi dokunur. Bir fiyat, miktar ya da yetki değiştiğinde bunu kimin, ne zaman yaptığını bilmek gerekir. MK OPS'ta önemli her değişiklik, önceki ve sonraki değeriyle işlem geçmişine kendiliğinden yazılır.",
    problem: {
      title: "Değişiklik takibi neden zorlaşır?",
      points: [
        "Excel dosyasında bir hücre değiştiğinde eski değer de değiştiren kişi de kaybolur.",
        "Birim fiyat ya da metraj sonradan değişince hakedişteki farkın nedeni bulunamaz.",
        "Hangi kullanıcıya kimin hangi yetkiyi verdiği bilinmez.",
        "Silinen bir kaydın daha önce var olduğu gösterilemez.",
      ],
    },
    sections: [
      {
        title: "Değişiklikler kendiliğinden kaydedilir",
        text: "Kimsenin ayrıca not tutması gerekmez; değişiklik veritabanı düzeyinde yakalanır.",
        bullets: [
          "Ekleme, güncelleme ve silme işlemleri ayrı ayrı kaydedilir",
          "Güncellemelerde her alanın önceki ve sonraki değeri görünür",
          "İşlemi yapan kullanıcı, tarih ve saatiyle",
        ],
      },
      {
        title: "Hangi kayıtlar izlenir?",
        text: "Operasyonun ve paranın döndüğü modüllerin hepsi kapsanır.",
        bullets: [
          "Projeler, proje türleri, bölümler, aşamalar ve iş kayıtları",
          "Hakediş birim fiyatları, iş planları ve imalat kayıtları",
          "Personel, avans, araçlar, malzeme tanımları, depolar ve kategoriler",
          "Kullanıcı rolleri, modül yetkileri ve firma ayarları",
        ],
      },
      {
        title: "Güvenilir ve gizli",
        text: "İşlem geçmişi bir kanıt kaydıdır; bu yüzden korunur.",
        bullets: [
          "Kayıtlar değiştirilemez ve silinemez",
          "Yalnızca firma yöneticileri görür",
          "TC kimlik numarası kayıtta maskelenir",
          "Puantaj değişikliklerinin ayrıca kendi geçmişi tutulur",
        ],
      },
    ],
    steps: [
      "Firmanızı kurun; işlem geçmişi ilk kayıttan itibaren kendiliğinden tutulur.",
      "Ayarlar → İşlem Geçmişi ekranını açın.",
      "Tarih aralığı, modül ve kullanıcı seçerek süzün; her değişikliğin önceki ve sonraki değerini görün.",
    ],
    audience: [
      "Birden çok yöneticinin aynı kayıtlarla çalıştığı firmalar",
      "Hakediş fiyatlarını ve metrajları kontrol altında tutmak isteyen müteahhit ve taşeronlar",
      "Personel, stok ve yetki değişikliklerinde hesap verebilirlik isteyen firma sahipleri",
    ],
    faq: [
      {
        q: "İşlem geçmişini kimler görebilir?",
        a: "Yalnızca firma yöneticileri. Şantiye şefi ve muhasebe kullanıcıları bu ekranı göremez.",
      },
      {
        q: "Bir kayıt silinirse geçmişi de silinir mi?",
        a: "Hayır. Silme işlemi, silinen kaydın son hâliyle birlikte işlem geçmişine yazılır. İşlem geçmişindeki kayıtlar değiştirilemez ve silinemez.",
      },
      {
        q: "Her değişiklik kaydedilir mi?",
        a: "Kullanıcıların doğrudan yaptığı değişiklikler kaydedilir; sistemin kendiliğinden hesapladığı değerler (ör. ilerleme yüzdesi) ayrıca yazılmaz. Stok hareketleri ve zimmet kendi hareket listelerinde kim ve ne zaman bilgisiyle tutulur.",
      },
    ],
    related: ["hakedis-takibi", "proje-metraj-takibi", "puantaj-personel-takibi"],
  },
];

export function getSolution(slug: string) {
  return SOLUTIONS.find((item) => item.slug === slug) ?? null;
}
