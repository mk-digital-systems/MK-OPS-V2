import Link from "next/link";
import { APP_NAME } from "@/lib/constants/brand";
import { LEGAL_ENTITY, LEGAL_UPDATED_AT } from "@/lib/constants/legal";
import { ContactBlock, LegalDocument } from "@/components/marketing/legal-document";
import { PrintButton } from "@/components/marketing/print-button";

export const metadata = {
  title: "İlgili Kişi Başvuru Formu",
  description: `${APP_NAME} KVKK md. 11 kapsamındaki haklarınızı kullanmak için başvuru formu ve başvuru yolları.`,
  alternates: { canonical: "/kvkk/basvuru-formu" },
};

const FIELDS = [
  "Ad soyad",
  "T.C. kimlik numarası (yabancılar için uyruk, pasaport veya kimlik numarası)",
  "Tebligata esas yerleşim yeri veya iş yeri adresi",
  "Bildirime esas e-posta adresi ve telefon numarası",
  "İlişkiniz (ör. MK OPS kullanıcısı, müşteri şirket çalışanı, eski çalışan, ziyaretçi)",
  "Varsa çalıştığınız / ilişkili olduğunuz müşteri şirketin adı",
];

const REQUESTS = [
  "Kişisel verilerimin işlenip işlenmediğini öğrenmek istiyorum.",
  "İşlenmişse buna ilişkin bilgi talep ediyorum.",
  "İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenmek istiyorum.",
  "Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilmek istiyorum.",
  "Eksik veya yanlış işlenmişse düzeltilmesini istiyorum.",
  "KVKK md. 7 kapsamında silinmesini veya yok edilmesini istiyorum.",
  "Düzeltme / silme işlemlerinin aktarılan üçüncü kişilere bildirilmesini istiyorum.",
  "Otomatik sistemlerle analiz sonucu aleyhime çıkan sonuca itiraz ediyorum.",
  "Kanuna aykırı işleme nedeniyle uğradığım zararın giderilmesini talep ediyorum.",
];

export default function ApplicationFormPage() {
  return (
    <LegalDocument title="İlgili Kişi Başvuru Formu" updatedAt={LEGAL_UPDATED_AT}>
      <p>
        6698 sayılı KVKK md. 11 kapsamındaki haklarınızı kullanmak için bu formu doldurup aşağıdaki yollardan biriyle
        veri sorumlusuna iletebilirsiniz. Başvurular, Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ
        uyarınca en geç <strong>30 gün</strong> içinde ve kural olarak <strong>ücretsiz</strong> sonuçlandırılır.
      </p>

      <h2>Önce doğru adrese başvurun</h2>
      <ul>
        <li>
          <strong>{APP_NAME} kullanıcı hesabınız</strong> (ad, e-posta, giriş bilgileri) için veri sorumlusu{" "}
          {LEGAL_ENTITY.name}&apos;dir; başvurunuzu aşağıdaki adrese yapın.
        </li>
        <li>
          <strong>Çalıştığınız şirketin {APP_NAME}&apos;a girdiği bilgileriniz</strong> (personel kaydı, puantaj, avans
          vb.) için veri sorumlusu o şirkettir; başvurunuzu öncelikle şirketinize yapın. {LEGAL_ENTITY.name}&apos;e
          gelen bu tür başvurular ilgili şirkete yönlendirilir.
        </li>
      </ul>

      <h2>Başvuru yolları</h2>
      <ul>
        <li>
          Islak imzalı olarak elden veya noter aracılığıyla{LEGAL_ENTITY.address ? ` (${LEGAL_ENTITY.address})` : ""},
        </li>
        {LEGAL_ENTITY.kep && <li>Kayıtlı elektronik posta (KEP) ile: {LEGAL_ENTITY.kep},</li>}
        <li>Güvenli elektronik imza veya mobil imza ile imzalanmış olarak e-postayla,</li>
        <li>
          {APP_NAME}&apos;a kayıtlı e-posta adresinizden{" "}
          <a href={`mailto:${LEGAL_ENTITY.email}?subject=KVKK%20Ba%C5%9Fvurusu`}>{LEGAL_ENTITY.email}</a> adresine
          e-postayla (konu: &quot;KVKK Başvurusu&quot;).
        </li>
      </ul>
      <ContactBlock />

      <div className="mt-10 rounded-2xl border p-6 print:border-0 print:p-0">
        <div className="flex items-center justify-between gap-3">
          <h2 className="!mt-0">Başvuru formu</h2>
          <PrintButton />
        </div>
        <h3>1. Başvuru sahibinin bilgileri</h3>
        <table className="mt-3 w-full text-sm">
          <tbody>
            {FIELDS.map((field) => (
              <tr key={field} className="border-b">
                <td className="w-1/2 py-3 pr-4 align-top font-medium text-foreground">{field}</td>
                <td className="py-3">&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>2. Talebiniz (ilgili olanları işaretleyin)</h3>
        <ul className="!list-none !pl-0">
          {REQUESTS.map((request) => (
            <li key={request} className="flex gap-2">
              <span aria-hidden className="mt-1.5 inline-block h-3.5 w-3.5 shrink-0 border border-foreground/60" />
              {request}
            </li>
          ))}
        </ul>
        <h3>3. Talebinizin açıklaması</h3>
        <div className="mt-3 h-32 rounded-lg border" />
        <h3>4. Yanıtın iletilmesi</h3>
        <ul className="!list-none !pl-0">
          {["Adresime gönderilsin", "E-posta adresime gönderilsin", "Elden teslim almak istiyorum"].map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden className="mt-1.5 inline-block h-3.5 w-3.5 shrink-0 border border-foreground/60" />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-6">
          Bu formda verdiğim bilgilerin doğru olduğunu, başvurumun kimliğimin doğrulanması amacıyla işleneceğini
          biliyorum.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
          <div className="border-t pt-2">Tarih</div>
          <div className="border-t pt-2">İmza</div>
        </div>
      </div>

      <p className="mt-8">
        Kimliğinizi doğrulayamadığımız veya başvurunuz eksik olduğu durumlarda ek bilgi isteyebiliriz. İşlenen
        verilere ilişkin ayrıntılar için{" "}
        <Link href="/gizlilik-politikasi">Gizlilik Politikası ve Aydınlatma Metni</Link>&apos;ne bakabilirsiniz.
      </p>
    </LegalDocument>
  );
}
