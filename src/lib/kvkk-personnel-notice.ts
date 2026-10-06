import { DATA_PROCESSORS, LEGAL_ENTITY } from "@/lib/constants/legal";
import { brandFilePrefix, docxBrandHeader, type ReportBrand } from "@/lib/report-brand";

/** Müşteri firmanın (veri sorumlusu) aydınlatma metninde görünen bilgileri */
export type ControllerInfo = {
  name: string;
  address: string;
  email: string;
  phone: string;
  kep: string;
};

type Block = { heading?: string; paragraphs?: string[]; bullets?: string[] };

/** Çalışan aydınlatma metninin içeriği (Word çıktısı ve ekrandaki önizleme aynı kaynaktan). */
export function personnelNoticeBlocks(info: ControllerInfo): Block[] {
  const contact = [info.address && `Adres: ${info.address}`, info.email && `E-posta: ${info.email}`, info.phone && `Telefon: ${info.phone}`, info.kep && `KEP: ${info.kep}`]
    .filter(Boolean) as string[];
  return [
    {
      paragraphs: [
        `${info.name} ("Şirket") olarak, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") md. 10 uyarınca, çalışanlarımızın ve saha personelimizin kişisel verilerinin işlenmesine ilişkin sizi bilgilendiririz.`,
      ],
    },
    { heading: "1. Veri sorumlusu", paragraphs: [`Veri sorumlusu ${info.name}'dir.`], bullets: contact },
    {
      heading: "2. İşlenen kişisel verileriniz",
      bullets: [
        "Kimlik: ad soyad, T.C. kimlik numarası",
        "İletişim: telefon numarası",
        "Özlük: görev / unvan, işe giriş ve çıkış tarihleri, çıkış nedeni, ücret bilgisi",
        "Puantaj ve izin: çalıştığınız, izinli, raporlu olduğunuz ve hafta tatili günleri (rapor içeriği işlenmez), avanslar",
        "Operasyon: görevlendirildiğiniz iş planları ve ekipler, yaptığınız işlere ilişkin imalat kayıtları, size zimmetlenen araç ve ekipmanlar",
      ],
    },
    {
      heading: "3. İşleme amaçları",
      bullets: [
        "İş sözleşmesinin kurulması ve ifası, çalışma ve izin süreçlerinin yürütülmesi",
        "Puantaj, ücret ve avans hesaplarının yapılması",
        "Günlük iş planlaması, görevlendirme ve saha operasyonlarının yürütülmesi",
        "Araç, ekipman ve malzeme zimmetinin takibi",
        "İş sağlığı ve güvenliği, çalışma mevzuatı ve sosyal güvenlik mevzuatından doğan yükümlülüklerin yerine getirilmesi",
        "Yetkili kurum ve kuruluşlara mevzuat gereği bilgi verilmesi",
      ],
    },
    {
      heading: "4. Hukuki sebepler",
      paragraphs: ["Kişisel verileriniz KVKK md. 5/2 kapsamında aşağıdaki hukuki sebeplere dayanılarak işlenir:"],
      bullets: [
        "Bir sözleşmenin (iş sözleşmesi) kurulması veya ifasıyla doğrudan ilgili olması (md. 5/2-c)",
        "Veri sorumlusunun hukuki yükümlülüğünü yerine getirebilmesi için zorunlu olması (md. 5/2-ç)",
        "Bir hakkın tesisi, kullanılması veya korunması için zorunlu olması (md. 5/2-e)",
        "Temel hak ve özgürlüklerinize zarar vermemek kaydıyla Şirket'in meşru menfaati (md. 5/2-f)",
      ],
    },
    {
      heading: "5. Toplama yöntemi",
      paragraphs: [
        "Kişisel verileriniz; işe giriş sırasında sizden alınan bilgiler ve belgelerle, çalışma süresince yöneticileriniz tarafından oluşturulan kayıtlarla, elektronik ortamda MK OPS saha ve operasyon yönetim yazılımı aracılığıyla toplanır.",
      ],
    },
    {
      heading: "6. Aktarım",
      paragraphs: [
        `Kişisel verileriniz, Şirket'in kullandığı MK OPS yazılımının sağlayıcısı ${LEGAL_ENTITY.name}'e veri işleyen sıfatıyla, yalnızca yazılım hizmetinin sunulması amacıyla aktarılır. Yazılımın altyapı sağlayıcılarının sunucuları yurt dışında bulunduğundan veriler aşağıdaki sağlayıcılara aktarılır; bu aktarım KVKK md. 9 uyarınca Kişisel Verileri Koruma Kurulu'nca ilan edilen standart sözleşmeler yoluyla gerçekleştirilir:`,
      ],
      bullets: [
        ...DATA_PROCESSORS.map((item) => `${item.name}: ${item.purpose} (${item.location})`),
        "Ayrıca mevzuat gereği yetkili kamu kurum ve kuruluşlarına (ör. SGK, vergi daireleri, yargı mercileri) ve muhasebe / hukuk danışmanlarımıza, amaçla sınırlı olarak aktarılabilir.",
      ],
    },
    {
      heading: "7. Haklarınız",
      paragraphs: ["KVKK md. 11 uyarınca Şirket'e başvurarak;"],
      bullets: [
        "kişisel verilerinizin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme,",
        "işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme,",
        "yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme,",
        "eksik veya yanlış işlenmişse düzeltilmesini, şartları oluşmuşsa silinmesini veya yok edilmesini isteme ve bu işlemlerin aktarılan üçüncü kişilere bildirilmesini isteme,",
        "münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonuç çıkmasına itiraz etme,",
        "kanuna aykırı işleme sebebiyle zarara uğramanız halinde zararın giderilmesini talep etme",
      ],
    },
    {
      paragraphs: [
        `haklarına sahipsiniz. Başvurularınızı yazılı olarak ${info.address ? "yukarıdaki adrese" : "Şirket'e"}${info.kep ? ", KEP adresine" : ""}${info.email ? " veya Şirket'te kayıtlı e-posta adresinizden yukarıdaki e-posta adresine" : ""} iletebilirsiniz. Başvurular en geç 30 gün içinde ücretsiz olarak sonuçlandırılır.`,
      ],
    },
  ];
}

export const PERSONNEL_NOTICE_TITLE = "Çalışan Kişisel Verilerinin İşlenmesine İlişkin Aydınlatma Metni";

export async function downloadPersonnelNoticeWord(brand: ReportBrand, info: ControllerInfo) {
  const docx = await import("docx");
  const { AlignmentType, Document, Packer, Paragraph, TextRun } = docx;
  const header = await docxBrandHeader(docx, { ...brand, name: info.name || brand.name });
  const children = [
    ...header,
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [new TextRun({ text: PERSONNEL_NOTICE_TITLE.toLocaleUpperCase("tr-TR"), bold: true, size: 24 })] }),
  ];
  for (const block of personnelNoticeBlocks(info)) {
    if (block.heading) children.push(new Paragraph({ spacing: { before: 240, after: 80 }, children: [new TextRun({ text: block.heading, bold: true, size: 22 })] }));
    for (const text of block.paragraphs ?? []) children.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text, size: 20 })] }));
    for (const text of block.bullets ?? []) children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: [new TextRun({ text, size: 20 })] }));
  }
  children.push(
    new Paragraph({ spacing: { before: 480, after: 120 }, children: [new TextRun({ text: "Bu aydınlatma metnini okudum ve bilgilendirildim.", bold: true, size: 20 })] }),
    new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "Çalışanın adı soyadı: ..............................................................", size: 20 })] }),
    new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "Tarih: ....../....../............          İmza: ..............................", size: 20 })] }),
  );
  const document = new Document({ styles: { default: { document: { run: { font: "Arial" } } } }, sections: [{ properties: { page: { margin: { top: 900, right: 1000, bottom: 900, left: 1000 } } }, children }] });
  const blob = await Packer.toBlob(document);
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = `${brandFilePrefix({ ...brand, name: info.name || brand.name })}-Calisan-Aydinlatma-Metni.docx`;
  link.click();
  URL.revokeObjectURL(url);
}
