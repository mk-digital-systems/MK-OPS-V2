import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PozRepository } from "@/modules/poz/poz-repository";
import { PozListManager } from "@/components/poz/poz-list-manager";

export const metadata = {
  title: "Poz Listesi",
};

/** Firmanın poz listesi: Merkez yetkisi olanlar düzenler, hakediş yetkisi olanlar fiyatı görür ve değiştirir. */
export default async function PozListPage() {
  const supabase = await createClient();
  const data = await new PozRepository(supabase).getList().catch(() => null);
  if (!data || (!data.can_edit && !data.can_price)) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Poz Listesi</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          İmalatta kullanılan iş kalemleri; sektörünüze (kataloğa) göre ayrılır. Fiyatlar yürürlük tarihiyle tutulur.
        </p>
      </div>
      <PozListManager data={data} currency={data.currency_code ?? "TRY"} companyId={null} />
    </div>
  );
}
