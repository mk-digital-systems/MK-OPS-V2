"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  CalendarDays,
  History,
  LibraryBig,
  LifeBuoy,
  LogOut,
  Mail,
  ShieldCheck,
  Tags,
  UserPlus,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants/brand";
import { createClient } from "@/lib/supabase/client";
import { AdminRepository } from "@/modules/admin/admin-repository";
import { BrandLogo } from "@/components/layout/brand-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";

type NavLink = { href: string; label: string; icon: LucideIcon; badge?: "new_users" | "open_support" };

const LINKS: NavLink[] = [
  { href: "/admin", label: "Şirketler", icon: Building2 },
  { href: "/admin/yeni-kayitlar", label: "Yeni Kayıtlar", icon: UserPlus, badge: "new_users" },
  { href: "/admin/support", label: "Destek Talepleri", icon: LifeBuoy, badge: "open_support" },
  { href: "/admin/odemeler", label: "Gelir ve Ödemeler", icon: Wallet },
  { href: "/admin/fiyatlar", label: "Fiyat Listesi", icon: Tags },
  { href: "/admin/e-posta-sablonlari", label: "E-posta Şablonu", icon: Mail },
  { href: "/admin/kataloglar", label: "Kataloglar", icon: LibraryBig },
  { href: "/admin/tatiller", label: "Resmi Tatiller", icon: CalendarDays },
  { href: "/admin/gecmis", label: "İşlem Geçmişi", icon: History },
];

const POLL_MS = 60_000;

export type AdminCounts = { new_users: number; open_support: number };

export function AdminShell({
  email,
  initialCounts = { new_users: 0, open_support: 0 },
  children,
}: {
  email: string | null;
  initialCounts?: AdminCounts;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [counts, setCounts] = useState<AdminCounts>(initialCounts);

  // Sayfa değişince sunucudan gelen güncel sayılar geçerli olur.
  useEffect(() => setCounts(initialCounts), [initialCounts.new_users, initialCounts.open_support]); // eslint-disable-line react-hooks/exhaustive-deps

  // Panel açıkken yeni kayıt / destek talebi gelirse sayaç kendiliğinden güncellenir.
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      const inbox = await new AdminRepository(createClient()).inbox();
      if (alive) setCounts({ new_users: inbox.new_users, open_support: inbox.open_support });
    };
    const timer = window.setInterval(refresh, POLL_MS);
    window.addEventListener("focus", refresh);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  // Sekme başlığında bekleyen iş sayısı.
  useEffect(() => {
    const total = counts.new_users + counts.open_support;
    document.title = document.title.replace(/^\(\d+\)\s*/, "");
    if (total > 0) document.title = `(${total}) ${document.title}`;
  }, [counts, pathname]);

  async function logout() {
    const { error } = await createClient().auth.signOut();
    if (error) {
      toast.error("Çıkış yapılamadı");
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  const nav = (orientation: "side" | "top") => (
    <nav className={cn(orientation === "side" ? "flex flex-col gap-1" : "flex gap-1 overflow-x-auto pb-1")}>
      {LINKS.map((link) => {
        const active = link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href);
        const badge = link.badge ? counts[link.badge] : 0;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            )}
          >
            <link.icon className="h-4 w-4" />
            {link.label}
            {badge > 0 && (
              <span
                className={cn(
                  "ml-auto rounded-full px-2 py-0.5 text-xs font-semibold",
                  active ? "bg-primary-foreground text-primary" : "bg-amber-500 text-white"
                )}
                aria-label={`${badge} bekleyen`}
              >
                {badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-muted/30 lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border/70 bg-background lg:flex">
        <div className="flex items-center gap-2 px-4 py-4">
          <BrandLogo size={32} priority />
          <div className="leading-tight">
            <p className="text-sm font-semibold">{APP_NAME}</p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldCheck className="h-3 w-3" />
              Süper Admin
            </p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3">{nav("side")}</div>
        <div className="space-y-2 border-t border-border/70 p-3">
          <p className="truncate text-xs text-muted-foreground">{email}</p>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={logout} className="flex-1 justify-start">
              <LogOut className="h-4 w-4" />
              Çıkış
            </Button>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-2 px-4 py-3">
            <BrandLogo size={28} priority />
            <p className="text-sm font-semibold">Süper Admin</p>
            <div className="ml-auto flex items-center gap-1">
              <ThemeToggle />
              <Button variant="ghost" size="sm" onClick={logout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="px-3">{nav("top")}</div>
        </header>
        <main className="mx-auto max-w-6xl p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
