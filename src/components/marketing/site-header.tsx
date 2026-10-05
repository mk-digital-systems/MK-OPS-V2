import Link from "next/link";
import { APP_NAME } from "@/lib/constants/brand";
import { BrandLogo } from "@/components/layout/brand-logo";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "/#ozellikler", label: "Özellikler" },
  { href: "/#nasil-calisir", label: "Nasıl Çalışır" },
  { href: "/#fiyatlandirma", label: "Fiyatlandırma" },
  { href: "/#sss", label: "SSS" },
];

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <BrandLogo size={36} priority />
          <span className="text-lg font-semibold tracking-tight">{APP_NAME}</span>
        </Link>
        <nav className="ml-6 hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {signedIn ? (
            <Button asChild>
              <Link href="/panel">Panele Git</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" className="hidden sm:inline-flex">
                <Link href="/login">Giriş Yap</Link>
              </Button>
              <Button asChild>
                <Link href="/register">Ücretsiz Dene</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
