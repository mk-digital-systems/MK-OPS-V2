import Link from "next/link";
import { APP_NAME } from "@/lib/constants/brand";
import { KVKK_DOCUMENTS, LEGAL_UPDATED_AT } from "@/lib/constants/legal";
import { LegalDocument } from "@/components/marketing/legal-document";

export const metadata = {
  title: "KVKK",
  description: `${APP_NAME} kişisel verilerin korunması belgeleri: aydınlatma metni, veri işleme sözleşmesi, saklama ve imha politikası, çerez politikası, başvuru formu.`,
  alternates: { canonical: "/kvkk" },
};

export default function KvkkPage() {
  return (
    <LegalDocument title="Kişisel Verilerin Korunması (KVKK)" updatedAt={LEGAL_UPDATED_AT}>
      <p>
        {APP_NAME}&apos;un 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamındaki belgeleri aşağıdadır. Müşteri
        şirketler, çalışanlarına verecekleri aydınlatma metnini panelde <strong>Ayarlar → KVKK</strong> bölümünden şirket
        bilgileriyle doldurulmuş olarak indirebilir.
      </p>
      <ul className="!list-none !pl-0">
        {KVKK_DOCUMENTS.map((doc) => (
          <li key={doc.href} className="!mt-4 rounded-xl border p-4">
            <Link href={doc.href} className="font-semibold !no-underline">{doc.title}</Link>
            <p className="!mt-1 text-sm">{doc.summary}</p>
          </li>
        ))}
      </ul>
    </LegalDocument>
  );
}
