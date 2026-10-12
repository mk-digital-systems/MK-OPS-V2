import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader signedIn={!!user} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
