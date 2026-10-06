import Link from "next/link";
import { APP_NAME } from "@/lib/constants/brand";
import { LEGAL_UPDATED_AT } from "@/lib/constants/legal";
import { LegalDocument } from "@/components/marketing/legal-document";

export const metadata = {
  title: "Çerez Politikası",
  description: `${APP_NAME} sitesinde kullanılan zorunlu çerezler ve tarayıcı depolaması.`,
  alternates: { canonical: "/kvkk/cerez-politikasi" },
};

const ITEMS: [string, string, string, string][] = [
  ["Oturum çerezi (sb-…-auth-token)", "Zorunlu", "Giriş yapan kullanıcının oturumunu sürdürmek ve güvenli erişim sağlamak", "Oturum kapatılana veya süresi dolana kadar"],
  ["Tema tercihi (tarayıcı depolaması)", "İşlevsel", "Açık / koyu tema seçiminin hatırlanması", "Kullanıcı silene kadar"],
  ["KVKK belge bilgileri (tarayıcı depolaması)", "İşlevsel", "Panelde Ayarlar → KVKK'ya girilen firma bilgilerinin bir sonraki kullanım için hatırlanması; sunucuya gönderilmez", "Kullanıcı silene kadar"],
];

export default function CookiePolicyPage() {
  return (
    <LegalDocument title="Çerez Politikası" updatedAt={LEGAL_UPDATED_AT}>
      <p>
        Çerezler, bir siteyi ziyaret ettiğinizde tarayıcınıza kaydedilen küçük dosyalardır. {APP_NAME} yalnızca hizmetin
        çalışması için gerekli çerezleri ve tarayıcı depolamasını kullanır.{" "}
        <strong>Reklam, pazarlama, analitik veya üçüncü taraf izleme çerezi kullanılmaz.</strong>
      </p>

      <h2>Kullanılan çerezler ve depolama</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-foreground">
            <tr className="border-b">
              <th className="py-2 pr-4 font-semibold">Ad</th>
              <th className="py-2 pr-4 font-semibold">Tür</th>
              <th className="py-2 pr-4 font-semibold">Amaç</th>
              <th className="py-2 font-semibold">Süre</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {ITEMS.map(([name, type, purpose, duration]) => (
              <tr key={name}>
                <td className="py-2 pr-4 align-top font-medium text-foreground">{name}</td>
                <td className="py-2 pr-4 align-top">{type}</td>
                <td className="py-2 pr-4 align-top">{purpose}</td>
                <td className="py-2 align-top">{duration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Hukuki sebep</h2>
      <p>
        Zorunlu ve işlevsel çerezler, talep ettiğiniz hizmetin sunulabilmesi için gereklidir; KVKK md. 5/2-c
        (sözleşmenin ifası) ve 5/2-f (meşru menfaat) kapsamında açık rıza aranmadan kullanılır. İleride analitik veya
        pazarlama çerezi kullanılması halinde, bu çerezler ancak açık rızanız alınarak etkinleştirilir ve bu sayfa
        güncellenir.
      </p>

      <h2>Çerezleri yönetme</h2>
      <p>
        Tarayıcınızın ayarlarından çerezleri silebilir veya engelleyebilirsiniz. Oturum çerezini engellemeniz
        halinde panele giriş yapamazsınız. Kişisel verilerinizin işlenmesine ilişkin ayrıntılar için{" "}
        <Link href="/gizlilik-politikasi">Gizlilik Politikası ve Aydınlatma Metni</Link>&apos;ne bakabilirsiniz.
      </p>
    </LegalDocument>
  );
}
