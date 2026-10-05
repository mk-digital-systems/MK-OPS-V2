import type { AccountInfo, UserProfile } from "@/types/auth";

/**
 * Oturumdaki kullanıcının gitmesi gereken sayfa.
 * Uygulama içi sayfalara yalnızca erişimi açık şirketin onaylı kullanıcısı girer.
 */
export function resolveAccountHome(
  profile: UserProfile | null,
  account: AccountInfo
): string {
  if (!profile) return "/login";
  // Süper admin paneli ayrı adımda gelecek; şimdilik bekleme ekranı.
  if (account.is_super_admin) return "/pending-approval";
  if (!account.company) return "/onboarding";
  if (!profile.is_approved || profile.role === "pending") return "/pending-approval";
  if (account.company.access_status === "expired" || account.company.access_status === "suspended") {
    return "/subscription";
  }
  return profile.role === "accounting" ? "/attendance" : "/";
}

export function hasAppAccess(profile: UserProfile | null, account: AccountInfo): boolean {
  const home = resolveAccountHome(profile, account);
  return home === "/" || home === "/attendance";
}
