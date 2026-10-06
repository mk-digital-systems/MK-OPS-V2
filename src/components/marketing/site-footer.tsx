import Link from "next/link";
import { Mail, MessageCircle } from "lucide-react";
import {
  APP_NAME,
  APP_TAGLINE,
  COMPANY_LEGAL_NAME,
  SUPPORT_EMAIL,
  whatsappUrl,
} from "@/lib/constants/brand";
import { BrandLogo } from "@/components/layout/brand-logo";
import { SOLUTIONS } from "@/lib/constants/solutions";

export const LEGAL_LINKS = [
  { href: "/kilavuz", label: "Kullanım Kılavuzu" },
  { href: "/gizlilik-politikasi", label: "Gizlilik Politikası ve KVKK" },
  { href: "/kullanim-sartlari", label: "Kullanım Şartları" },
  { href: "/iptal-ve-iade", label: "İptal ve İade Koşulları" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-muted/30">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-4">
        <div className="space-y-3">
          <Link href="/" className="flex items-center gap-2">
            <BrandLogo size={32} />
            <span className="font-semibold">{APP_NAME}</span>
          </Link>
          <p className="text-sm text-muted-foreground">{APP_TAGLINE}</p>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold">
            <Link href="/cozumler" className="hover:underline">Çözümler</Link>
          </p>
          <ul className="space-y-1 text-sm">
            {SOLUTIONS.map((item) => (
              <li key={item.slug}>
                <Link href={`/cozumler/${item.slug}`} className="text-muted-foreground hover:text-foreground">
                  {item.shortTitle}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold">Yasal</p>
          <ul className="space-y-1 text-sm">
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-muted-foreground hover:text-foreground">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold">İletişim</p>
          <ul className="space-y-1 text-sm">
            <li>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
                <Mail className="h-4 w-4" />
                {SUPPORT_EMAIL}
              </a>
            </li>
            <li>
              <a
                href={whatsappUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp ile yazın
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border/60 py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {APP_NAME} — {COMPANY_LEGAL_NAME}
      </div>
    </footer>
  );
}
