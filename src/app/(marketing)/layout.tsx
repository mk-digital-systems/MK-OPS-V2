import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { getAuthUser } from "@/lib/supabase/request-cache";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader signedIn={!!user} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
