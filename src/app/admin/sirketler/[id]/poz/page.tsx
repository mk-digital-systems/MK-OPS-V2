import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AdminRepository } from "@/modules/admin/admin-repository";
import { PozRepository } from "@/modules/poz/poz-repository";
import { PozListManager } from "@/components/poz/poz-list-manager";

export const metadata = {
  title: "Poz Listesi",
};

/** Süper admin: firmanın poz listesi kurulumu (elle, Excel'den, katalogdan; fiyatlarıyla). */
export default async function AdminCompanyPozPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [companies, data] = await Promise.all([
    new AdminRepository(supabase).listCompanies(),
    new PozRepository(supabase, id).getList().catch(() => null),
  ]);
  const company = companies.find((item) => item.id === id);
  if (!company || !data) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Şirketler
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{company.name} · Poz Listesi</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bu firmanın pozları ve fiyatları yalnızca bu firmaya aittir; başka firmaları etkilemez.
        </p>
      </div>
      <PozListManager data={data} currency={data.currency_code ?? "TRY"} companyId={id} />
    </div>
  );
}
