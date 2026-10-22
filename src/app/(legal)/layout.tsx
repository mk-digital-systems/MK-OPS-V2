import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { getAuthUser } from "@/lib/supabase/request-cache";

export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader signedIn={!!user} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12">{children}</main>
      <SiteFooter />
    </div>
  );
}
