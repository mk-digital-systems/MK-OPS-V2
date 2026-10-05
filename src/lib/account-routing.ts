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
  if (account.is_super_admin) return "/admin";
  if (!account.company) return "/onboarding";
  if (!profile.is_approved || profile.role === "pending") return "/pending-approval";
  if (account.company.access_status === "expired" || account.company.access_status === "suspended") {
    return "/subscription";
  }
  return profile.role === "accounting" ? "/panel/attendance" : "/panel";
}

export function hasAppAccess(profile: UserProfile | null, account: AccountInfo): boolean {
  const home = resolveAccountHome(profile, account);
  return home === "/panel" || home === "/panel/attendance";
}
