"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Building2, LifeBuoy, LogOut, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants/brand";
import { createClient } from "@/lib/supabase/client";
import { BrandLogo } from "@/components/layout/brand-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "/admin", label: "Şirketler", icon: Building2 },
  { href: "/admin/support", label: "Destek Talepleri", icon: LifeBuoy },
];

export function AdminShell({ email, children }: { email: string | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    const { error } = await createClient().auth.signOut();
    if (error) {
      toast.error("Çıkış yapılamadı");
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <BrandLogo size={32} priority />
            <div className="leading-tight">
              <p className="text-sm font-semibold">{APP_NAME}</p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <ShieldCheck className="h-3 w-3" />
                Süper Admin
              </p>
            </div>
          </div>
          <nav className="order-3 flex w-full gap-1 sm:order-none sm:ml-6 sm:w-auto">
            {LINKS.map((link) => {
              const active = link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                  )}
                >
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground md:inline">{email}</span>
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4" />
              Çıkış
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-4 md:p-8">{children}</main>
    </div>
  );
}
