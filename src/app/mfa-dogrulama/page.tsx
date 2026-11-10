import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MfaVerifyForm } from "@/components/auth/mfa-verify-form";

export const metadata: Metadata = {
  title: "İki adımlı doğrulama",
  robots: { index: false, follow: false },
};

export default async function MfaVerifyPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const { next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <MfaVerifyForm next={next ?? null} email={data.user.email ?? null} />
    </main>
  );
}
