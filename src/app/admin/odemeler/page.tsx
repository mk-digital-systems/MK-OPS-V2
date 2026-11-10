import { createClient } from "@/lib/supabase/server";
import { AdminRepository } from "@/modules/admin/admin-repository";
import { PaymentsManager } from "@/components/admin/payments-manager";

export const metadata = {
  title: "Gelir ve Ödemeler",
};

export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<{ yil?: string }> }) {
  const { yil } = await searchParams;
  const requested = Number(yil);
  const current = new Date().getFullYear();
  const year = Number.isInteger(requested) && requested >= 2026 && requested <= 2100 ? requested : current;
  const payments = await new AdminRepository(await createClient()).listPayments(year);
  return <PaymentsManager year={year} currentYear={current} payments={payments} />;
}
