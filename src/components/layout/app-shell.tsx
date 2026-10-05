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
  ShieldCheck,
  Users,
  CircleUserRound,
  PackageCheck,
  Menu,
  X,
  ChevronDown,
  Hammer,
  Ban,
} from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { BrandLogo } from "@/components/layout/brand-logo";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { PermissionModule, UserProfile, UserRole } from "@/types/auth";
import { USER_ROLE_LABELS } from "@/types/auth";
import type { SharedNote } from "@/types/note";
import { QuickNotesPanel } from "@/components/notes/quick-notes-panel";
import { PrivateNotesPanel } from "@/components/notes/private-notes-panel";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    accounting: false,
    group: "OPERASYON",
  },
  {
    href: "/projects",
    label: "Projeler",
    icon: FolderKanban,
    accounting: false,
    group: "OPERASYON",
  },
  {
    href: "/cancelled-projects",
    label: "İptal Projeler",
    icon: Ban,
    accounting: false,
    group: "OPERASYON",
  },
  {
    href: "/work-plans",
    label: "İş Planı",
    icon: ClipboardList,
    accounting: false,
    group: "OPERASYON",
  },
  {
    href: "/imalatlar",
    label: "İmalatlar",
    icon: Hammer,
    accounting: false,
    group: "OPERASYON",
  },

  {
    href: "/personnel",
    label: "Personel",
    icon: Users,
    accounting: true,
    group: "KAYNAKLAR",
  },
  {
    href: "/vehicles",
    label: "Araçlar",
    icon: CarFront,
    accounting: false,
    group: "KAYNAKLAR",
  },
  {
    href: "/inventory",
    label: "Malzeme Stok",
    icon: Boxes,
    accounting: false,
    group: "KAYNAKLAR",
  },
  {
    href: "/custody",
    label: "Araç Ekipmanları",
    icon: PackageCheck,
    accounting: false,
    group: "KAYNAKLAR",
  },

  {
    href: "/attendance",
    label: "Puantaj",
    icon: CalendarCheck,
    accounting: true,
    group: "PERSONEL YÖNETİMİ",
  },

  {
    href: "/profile",
    label: "Profilim",
    icon: CircleUserRound,
    accounting: true,
    group: "SİSTEM",
  },
  {
    href: "/settings",
    label: "Ayarlar",
    icon: Settings,
    accounting: false,
    group: "SİSTEM",
  },
];

export function AppShell({
  children,
  profile,
  avatarUrl,
  notes,
  writableModules,
}: {
  children: React.ReactNode;
  profile: UserProfile;
  avatarUrl: string | null;
  notes: SharedNote[];
  writableModules: PermissionModule[];
}) {
  const pathname = usePathname();
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

  const navGroups = [
    { name: "OPERASYON", icon: LayoutDashboard },
    { name: "KAYNAKLAR", icon: Boxes },
    { name: "PERSONEL YÖNETİMİ", icon: Users },
    { name: "SİSTEM", icon: Settings },
  ];

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.href === "/settings") {
      return profile.role === "site_chief";
    }

    if (profile.role === "accounting") {
      const permissionModule = moduleForPath(item.href);
      return item.accounting || (permissionModule !== null && writableModules.includes(permissionModule));
    }

    return true;
  });

  // İçinde bulunduğumuz sayfanın grubunu başlangıçta açık getir
  const activeGroup =
    NAV_ITEMS.find((item) =>
      item.href === "/"
        ? pathname === "/"
        : pathname.startsWith(item.href)
    )?.group ?? null;

  const [openGroup, setOpenGroup] = useState<string | null>(
    pathname.startsWith("/users") ? "YÖNETİM" : activeGroup
  );

  const toggleGroup = (groupName: string) => {
    setOpenGroup((current) =>
      current === groupName ? null : groupName
    );
  };

  const nav = (
    <nav className="flex flex-col gap-2 p-3">
      {navGroups.map((group) => {
        const groupItems = visibleNavItems.filter(
          (item) => item.group === group.name
        );

        // Kullanıcının bu grupta yetkili olduğu menü yoksa
        // grup başlığını da gösterme
        if (groupItems.length === 0) return null;

        const GroupIcon = group.icon;
        const isOpen = openGroup === group.name;

        return (
          <div key={group.name}>
            {/* Açılır Grup Başlığı */}
            <button
              type="button"
              onClick={() => toggleGroup(group.name)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                isOpen
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <GroupIcon className="h-4 w-4" />

              <span className="flex-1 text-left text-xs font-semibold tracking-wide">
                {group.name}
              </span>

              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform duration-200",
                  isOpen && "rotate-180"
                )}
              />
            </button>

            {/* Açılan Menü Öğeleri */}
            {isOpen && (
              <div className="mt-1 flex flex-col gap-1 pl-3">
                {groupItems.map((item) => {
                  const active =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname.startsWith(item.href);

                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                        active
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />

                      <span>{item.label}</span>

                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Yönetim - sadece Şantiye Şefi */}
      {profile.role === "site_chief" && (
        <div>
          <button
            type="button"
            onClick={() => toggleGroup("YÖNETİM")}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
              openGroup === "YÖNETİM"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <ShieldCheck className="h-4 w-4" />

            <span className="flex-1 text-left text-xs font-semibold tracking-wide">
              YÖNETİM
            </span>

            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform duration-200",
                openGroup === "YÖNETİM" && "rotate-180"
              )}
            />
          </button>

          {openGroup === "YÖNETİM" && (
            <div className="mt-1 pl-3">
              <Link
                href="/users"
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  pathname.startsWith("/users")
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <ShieldCheck className="h-4 w-4" />
                <span>Kullanıcı Yetkileri</span>
              </Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );


  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-50 via-background to-background dark:from-slate-900 dark:via-background dark:to-background">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border/70 bg-background/80 backdrop-blur-xl md:flex">
          <div className="flex items-center gap-3 px-5 py-6">
            <BrandLogo size={40} priority />
            <div>
              <p className="text-sm font-semibold tracking-tight">
                AZG İLETİŞİM
              </p>
              <p className="text-xs text-muted-foreground">Şantiye Proje Takip</p>
            </div>
          </div>
          {nav}
          <div className="mt-auto space-y-2 border-t border-border/70 p-3">
            <Link
              href="/profile"
              className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2 transition-colors hover:bg-accent"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-background">
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
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium">
                  {profile.full_name || profile.email}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {profile.job_title ||
                    USER_ROLE_LABELS[profile.role as UserRole]}
                </span>
              </span>
            </Link>
            <div className="flex items-center justify-between px-2">
              <span className="text-xs text-muted-foreground">Tema</span>
              <ThemeToggle />
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-muted-foreground"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              Çıkış Yap
            </Button>
          </div>
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
              <BrandLogo size={28} />
              <span className="text-sm font-semibold">AZG İLETİŞİM ŞANTİYE</span>
            </div>
            <ThemeToggle />
          </header>

          <AnimatePresence>
            {mobileOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-b border-border/70 bg-background md:hidden"
              >
                {nav}
                <div className="p-3">
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-3"
                    onClick={handleLogout}
                  >
                    <LogOut className="h-4 w-4" />
                    Çıkış Yap
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <main className="flex-1 p-4 md:p-8">
            {profile.role === "company_manager" && (
              <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                Şirket yöneticisi hesabı: işlem yetkileri şantiye şefi
                tarafından alan bazında belirlenir.
              </div>
            )}
            {profile.role === "accounting" && (
              <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                Muhasebe hesabı: Personel ve Puantaj listeleri ile dökümler açıktır.
                İşlem yetkileri şantiye şefi tarafından ayrıca verilir.
              </div>
            )}
            {children}
          </main>
        </div>
      </div>
      <QuickNotesPanel initialNotes={notes} currentUserId={profile.id} />
      <PrivateNotesPanel />
    </div>
  );
}

function moduleForPath(pathname: string): PermissionModule | null {
  if (pathname.startsWith("/projects")) return "projects";
  if (pathname.startsWith("/work-plans")) return "work_plans";
  if (pathname.startsWith("/personnel")) return "personnel";
  if (pathname.startsWith("/attendance")) return "attendance";
  if (pathname.startsWith("/vehicles")) return "vehicles";
  if (pathname.startsWith("/inventory")) return "inventory";
  if (pathname.startsWith("/custody")) return "custody";
  if (pathname.startsWith("/imalatlar")) return "productions";
  return null;
}
