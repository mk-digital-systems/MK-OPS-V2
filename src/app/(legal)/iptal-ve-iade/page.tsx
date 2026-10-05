import { APP_NAME, SUPPORT_EMAIL } from "@/lib/constants/brand";
import { ContactBlock, LegalDocument } from "@/components/marketing/legal-document";

export const metadata = {
  title: "İptal ve İade Koşulları",
  description: `${APP_NAME} deneme süresi, plan iptali ve ücret iadesi koşulları.`,
};

export default function RefundPage() {
  return (
    <LegalDocument title="İptal ve İade Koşulları" updatedAt="6 Ekim 2026">
      <p>
        Bu sayfa, {APP_NAME} planlarının iptali ve ücret iadesi taleplerinin nasıl değerlendirildiğini açıklar.
      </p>

      <h2>1. Ücretsiz deneme</h2>
      <p>
        Yeni kurulan şirketler 48 saat boyunca Hizmeti ücretsiz kullanabilir. Deneme için ödeme alınmaz ve deneme
        sonunda otomatik ücretlendirme yapılmaz.
      </p>

      <h2>2. Ödeme ve plan başlangıcı</h2>
      <p>
        Planlar EFT/havale ile ödenir. Ödeme hesaba geçtikten sonra plan şirkete tanımlanır ve plan süresi bu
        tarihten itibaren başlar. Planlar otomatik olarak yenilenmez.
      </p>

      <h2>3. İptal</h2>
      <p>
        Planı yenilememeniz iptal için yeterlidir; süre sonunda erişim durur ve verileriniz korunur. Verilerinizin
        kalıcı olarak silinmesini isterseniz Destek bölümünden veya{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> adresinden talep edebilirsiniz.
      </p>

      <h2>4. İade</h2>
      <ul>
        <li>Ödeme tarihinden itibaren 14 gün içinde iade talep edebilirsiniz.</li>
        <li>14 gün içindeki taleplerde, kullanılmayan süreye karşılık gelen tutar iade edilir.</li>
        <li>Yanlışlıkla yapılan mükerrer ödemeler süre şartı aranmaksızın iade edilir.</li>
        <li>İadeler, ödemenin yapıldığı banka hesabına EFT/havale ile yapılır.</li>
      </ul>
      <p>
        İade talebinizde şirket adınızı, ödeme tarihini ve ödemenin yapıldığı hesap bilgilerini belirtin.
      </p>

      <h2>5. İletişim</h2>
      <ContactBlock />
    </LegalDocument>
  );
}
