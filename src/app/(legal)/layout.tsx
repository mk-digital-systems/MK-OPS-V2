import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";

export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader signedIn={!!user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">{children}</main>
      <SiteFooter />
    </div>
  );
}
