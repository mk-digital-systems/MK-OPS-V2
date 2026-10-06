import { DATA_PROCESSORS, LEGAL_ENTITY } from "@/lib/constants/legal";

export function LegalDocument({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
}) {
  return (
    <article className="text-[15px] leading-7 text-muted-foreground [&_a]:text-primary [&_a]:underline [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:mt-1 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mt-3 [&_strong]:text-foreground [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="!mt-2 text-sm">Son güncelleme: {updatedAt}</p>
      {children}
    </article>
  );
}

/** Veri sorumlusu / hizmet sağlayıcı kimliği; boş alanlar gösterilmez. */
export function ContactBlock() {
  const rows: [string, string][] = [
    ["Adres", LEGAL_ENTITY.address],
    ["Vergi dairesi / no", [LEGAL_ENTITY.taxOffice, LEGAL_ENTITY.taxNumber].filter(Boolean).join(" / ")],
    ["MERSİS no", LEGAL_ENTITY.mersis],
    ["KEP adresi", LEGAL_ENTITY.kep],
  ];
  return (
    <ul>
      <li>
        <strong>{LEGAL_ENTITY.name}</strong>
      </li>
      {rows
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <li key={label}>
            {label}: {value}
          </li>
        ))}
      <li>
        E-posta: <a href={`mailto:${LEGAL_ENTITY.email}`}>{LEGAL_ENTITY.email}</a>
      </li>
    </ul>
  );
}

/** Alt veri işleyenler (altyapı sağlayıcıları) tablosu */
export function ProcessorsTable() {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-foreground">
          <tr className="border-b">
            <th className="py-2 pr-4 font-semibold">Sağlayıcı</th>
            <th className="py-2 pr-4 font-semibold">Hizmet</th>
            <th className="py-2 font-semibold">Konum</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {DATA_PROCESSORS.map((item) => (
            <tr key={item.name}>
              <td className="py-2 pr-4 align-top font-medium text-foreground">{item.name}</td>
              <td className="py-2 pr-4 align-top">{item.purpose}</td>
              <td className="py-2 align-top">{item.location}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
