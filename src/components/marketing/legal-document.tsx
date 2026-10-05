import { COMPANY_LEGAL_NAME, SUPPORT_EMAIL } from "@/lib/constants/brand";

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
    <article className="text-[15px] leading-7 text-muted-foreground [&_a]:text-primary [&_a]:underline [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:mt-1 [&_p]:mt-3 [&_strong]:text-foreground [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="!mt-2 text-sm">Son güncelleme: {updatedAt}</p>
      {children}
    </article>
  );
}

export function ContactBlock() {
  return (
    <ul>
      <li>
        <strong>{COMPANY_LEGAL_NAME}</strong>
      </li>
      <li>
        E-posta: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </li>
    </ul>
  );
}
