import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAccountHome } from "@/lib/account-routing";
import { getCurrentUser, getMyAccount } from "@/lib/supabase/request-cache";

// Giriş, kayıt ve şifre sayfaları arama sonuçlarında çıkmasın; bağlantıları izlensin.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-app-pathname") || "";
  if (pathname !== "/update-password") {
    const profile = await getCurrentUser();
    if (profile) {
      const account = await getMyAccount();
      redirect(resolveAccountHome(profile, account));
    }
  }

  return children;
}
