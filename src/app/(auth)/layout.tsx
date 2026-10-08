import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UserRepository } from "@/modules/users/user-repository";
import { CompanyRepository } from "@/modules/company/company-repository";
import { resolveAccountHome } from "@/lib/account-routing";

// Giriş, kayıt ve şifre sayfaları arama sonuçlarında çıkmasın; bağlantıları izlensin.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-app-pathname") || "";
  if (pathname !== "/update-password") {
    const supabase = await createClient();
    const profile = await new UserRepository(supabase).getCurrent();
    if (profile) {
      const account = await new CompanyRepository(supabase).getMyAccount();
      redirect(resolveAccountHome(profile, account));
    }
  }

  return children;
}
