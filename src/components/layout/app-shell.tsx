"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarCheck,
  CarFront,
  Boxes,
  ClipboardList,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Settings,
  Receipt,
  LifeBuoy,
  BookOpen,
  ShieldCheck,
  Users,
  CircleUserRound,
  PackageCheck,
  Menu,
  X,
  Hammer,
  Ban,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { BrandLogo } from "@/components/layout/brand-logo";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { CompanySummary, PermissionModule, UserProfile, UserRole } from "@/types/auth";
import { USER_ROLE_LABELS } from "@/types/auth";
import type { SharedNote } from "@/types/note";
import { QuickNotesPanel } from "@/components/notes/quick-notes-panel";
import { PrivateNotesPanel } from "@/components/notes/private-notes-panel";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants/brand";
import { TrialBanner } from "@/components/layout/trial-banner";
import { useReportBrand } from "@/components/layout/company-brand-provider";
import { NotificationBell } from "@/components/layout/notification-bell";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Muhasebe, yetki verilmeden de görür. */
  accounting?: boolean;
  /** Yalnızca bu roller görür. */
  roles?: UserRole[];
};

const NAV_SECTIONS: { title: string | null; items: NavItem[] }[] = [
  {
    title: null,
    items: [{ href: "/panel", label: "Genel Bakış", icon: LayoutDashboard }],
  },
  {
    title: "Operasyon",
    items: [
      { href: "/panel/projects", label: "Projeler", icon: FolderKanban },
      { href: "/panel/work-plans", label: "İş Planı", icon: ClipboardList },
      { href: "/panel/imalatlar", label: "İmalatlar", icon: Hammer },
      { href: "/panel/hakedis", label: "Hakediş", icon: Receipt },
      { href: "/panel/cancelled-projects", label: "İptal Projeler", icon: Ban },
    ],
  },
  {
    title: "Personel",
    items: [
      { href: "/panel/personnel", label: "Personel", icon: Users, accounting: true },
      { href: "/panel/attendance", label: "Puantaj", icon: CalendarCheck, accounting: true },
    ],
  },
  {
    title: "Kaynaklar",
    items: [
      { href: "/panel/vehicles", label: "Araçlar", icon: CarFront, accounting: true },
      { href: "/panel/custody", label: "Araç Ekipmanları", icon: PackageCheck },
      { href: "/panel/inventory", label: "Malzeme Stok", icon: Boxes, accounting: true },
    ],
  },
  {
    title: "Yönetim",
    items: [
      { href: "/panel/users", label: "Kullanıcılar", icon: ShieldCheck, roles: ["site_chief", "company_manager"] },
      { href: "/panel/settings", label: "Ayarlar", icon: Settings, roles: ["site_chief"] },
      { href: "/panel/support", label: "Destek", icon: LifeBuoy, roles: ["site_chief"] },
    ],
  },
];

export function AppShell({
  children,
  profile,
  avatarUrl,
  notes,
  writableModules,
  company,
}: {
  children: React.ReactNode;
  profile: UserProfile;
  avatarUrl: string | null;
  notes: SharedNote[];
  writableModules: PermissionModule[];
  company: CompanySummary | null;
}) {
  const pathname = usePathname();
  const brand = useReportBrand();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Çıkış yapılamadı");
      return;
    }
    toast.success("Oturum kapatıldı");
    router.push("/login");
    router.refresh();
  }

  function canSee(item: NavItem) {
    if (item.roles) return item.roles.includes(profile.role);
    if (item.href === "/panel/hakedis") return writableModules.includes("hakedis");
    if (profile.role === "accounting") {
      const permissionModule = moduleForPath(item.href);
      return !!item.accounting || (permissionModule !== null && writableModules.includes(permissionModule));
    }
    return true;
  }

  const isActive = (href: string) => (href === "/panel" ? pathname === "/panel" : pathname.startsWith(href));

  const nav = (
    <nav className="flex flex-col gap-5 px-3 py-2">
      {NAV_SECTIONS.map((section) => {
        const items = section.items.filter(canSee);
        if (items.length === 0) return null;
        return (
          <div key={section.title ?? "genel"}>
            {section.title && (
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
                {section.title}
              </p>
            )}
            <div className="flex flex-col gap-0.5">
              {items.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary dark:bg-primary/15"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-primary" aria-hidden />}
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );

  const account = (
    <div className="space-y-1 border-t border-border/70 p-3">
      <Link
        href="/panel/profile"
        onClick={() => setMobileOpen(false)}
        className={cn(
          "flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent",
          pathname.startsWith("/panel/profile") && "bg-accent"
        )}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-background">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={`${profile.full_name || "Kullanıcı"} profil fotoğrafı`}
              className="h-full w-full object-cover"
            />
          ) : (
            <CircleUserRound className="h-5 w-5 text-muted-foreground" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{profile.full_name || profile.email}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {USER_ROLE_LABELS[profile.role as UserRole]}
          </span>
        </span>
      </Link>
      <div className="flex items-center gap-1">
        <Button asChild variant="ghost" size="sm" className="flex-1 justify-start gap-2 text-muted-foreground">
          <Link href="/kilavuz" onClick={() => setMobileOpen(false)}>
            <BookOpen className="h-4 w-4" />
            Kılavuz
          </Link>
        </Button>
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground"
          onClick={handleLogout}
          aria-label="Çıkış yap"
          title="Çıkış yap"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-50 via-background to-background dark:from-slate-900 dark:via-background dark:to-background">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border/70 bg-background/80 backdrop-blur-xl md:flex">
          <div className="flex items-center gap-3 px-5 py-5">
            <BrandLogo size={40} priority />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold tracking-tight">
                {APP_NAME}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {company?.name ?? APP_TAGLINE}
              </p>
            </div>
            <NotificationBell className="-mr-2 shrink-0" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
          {account}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border/70 bg-background/80 px-4 py-3 backdrop-blur-xl md:hidden">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen((v) => !v)}
                aria-label="Menü"
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
              {!brand.logoUrl && <BrandLogo size={28} />}
              {!brand.logoUrl && <span className="text-sm font-semibold">{APP_NAME}</span>}
            </div>
            {brand.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brand.logoUrl}
                alt={brand.name}
                className="pointer-events-none absolute left-1/2 top-1/2 h-9 max-w-[45%] -translate-x-1/2 -translate-y-1/2 object-contain"
              />
            )}
            <div className="flex items-center">
              <NotificationBell />
              <ThemeToggle />
            </div>
          </header>

          {/* Firma logosu: masaüstünde üstte ortada; logo yüklenmemişse hiçbir şey gösterilmez. */}
          {brand.logoUrl && (
            <header className="hidden items-center justify-center border-b border-border/70 bg-background/60 px-8 py-3 backdrop-blur-xl md:flex">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={brand.logoUrl} alt={brand.name} className="h-14 max-w-[320px] object-contain" />
            </header>
          )}

          <AnimatePresence>
            {mobileOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-b border-border/70 bg-background md:hidden"
              >
                {nav}
                {account}
              </motion.div>
            )}
          </AnimatePresence>

          <main className="flex-1 p-4 md:p-8">
            {company && <TrialBanner company={company} canRequestPlan={profile.role === "site_chief"} />}
            <RoleBar profile={profile} company={company} writableModules={writableModules} />
            {children}
          </main>
        </div>
      </div>
      <QuickNotesPanel initialNotes={notes} currentUserId={profile.id} />
      <PrivateNotesPanel />
    </div>
  );
}

const MODULE_LABELS: Record<PermissionModule, string> = {
  projects: "Projeler",
  work_plans: "İş Planı",
  personnel: "Personel",
  attendance: "Puantaj",
  vehicles: "Araçlar",
  inventory: "Malzeme Stok",
  custody: "Araç Ekipmanları",
  productions: "İmalatlar",
  hakedis: "Hakediş",
};

/** Her sayfanın üstünde: kim giriş yaptı, rolü ne, hangi alanlarda işlem yapabilir. */
function RoleBar({
  profile,
  company,
  writableModules,
}: {
  profile: UserProfile;
  company: CompanySummary | null;
  writableModules: PermissionModule[];
}) {
  const labels = (modules: PermissionModule[]) => modules.map((module) => MODULE_LABELS[module]).join(", ");
  const operations = writableModules.filter((module) => module !== "hakedis");
  const seesPrices = writableModules.includes("hakedis");

  let detail: string;
  if (profile.role === "site_chief") {
    detail = "Bütün modüllerde tam yetki; kullanıcılar, ayarlar ve destek.";
  } else if (profile.role === "company_manager") {
    detail = [
      operations.length ? `İşlem yetkisi: ${labels(operations)}` : "İşlem yetkisi yok; kayıtları salt okunur görürsünüz",
      seesPrices ? "Fiyat ve hakediş: açık" : "Fiyat ve hakediş: kapalı",
    ].join(" · ");
  } else {
    detail = [
      "Görüntüleme: Personel, Puantaj, Araçlar, Malzeme Stok · İrsaliye girişi",
      operations.length ? `İşlem yetkisi: ${labels(operations)}` : null,
      seesPrices ? "Hakediş: açık" : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  return (
    <div className="mb-4 flex flex-col gap-1 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-900 sm:flex-row sm:items-center sm:gap-3 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
      <p className="shrink-0 font-semibold">
        {profile.full_name || profile.email}
        <span className="font-normal text-blue-800/80 dark:text-blue-200/80">
          {" · "}
          {USER_ROLE_LABELS[profile.role as UserRole]}
          {company?.primary_manager_id === profile.id && " (kurucu)"}
        </span>
      </p>
      <p className="min-w-0 text-xs text-blue-800 sm:border-l sm:border-blue-200 sm:pl-3 dark:text-blue-200 sm:dark:border-blue-900">
        {detail}
      </p>
    </div>
  );
}

function moduleForPath(pathname: string): PermissionModule | null {
  if (pathname.startsWith("/panel/projects")) return "projects";
  if (pathname.startsWith("/panel/work-plans")) return "work_plans";
  if (pathname.startsWith("/panel/personnel")) return "personnel";
  if (pathname.startsWith("/panel/attendance")) return "attendance";
  if (pathname.startsWith("/panel/vehicles")) return "vehicles";
  if (pathname.startsWith("/panel/inventory")) return "inventory";
  if (pathname.startsWith("/panel/custody")) return "custody";
  if (pathname.startsWith("/panel/imalatlar")) return "productions";
  if (pathname.startsWith("/panel/hakedis")) return "hakedis";
  return null;
}
