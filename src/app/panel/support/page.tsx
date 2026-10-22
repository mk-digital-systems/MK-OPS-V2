import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SupportRepository } from "@/modules/support/support-repository";
import { SupportCenter } from "@/components/support/support-center";
import { getCurrentUser } from "@/lib/supabase/request-cache";

export const metadata = {
  title: "Destek",
};

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ konu?: string }>;
}) {
  const supabase = await createClient();
  const profile = await getCurrentUser();
  if (profile?.role !== "site_chief") notFound();
  const [requests, params] = await Promise.all([new SupportRepository(supabase).listOwn(), searchParams]);

  return <SupportCenter initialRequests={requests} defaultTopic={params.konu === "plan" ? "plan" : "support"} />;
}
