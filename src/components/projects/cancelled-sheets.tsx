import Link from "next/link";
import type { CancelledSheet } from "@/types/project";
import { formatDate } from "@/lib/utils";

/** İptal edilen paftalar; projeleri iptal edilmemiş olsa da burada görünür. */
export function CancelledSheets({ sheets }: { sheets: CancelledSheet[] }) {
  if (sheets.length === 0) return null;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">İptal Edilen Paftalar</h2>
        <p className="text-sm text-muted-foreground">{sheets.length} pafta. Projenin pafta listesinden durumu değiştirilerek yeniden açılır.</p>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Pafta</th>
              <th className="px-4 py-3 font-medium">Proje</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Adres</th>
              <th className="px-4 py-3 text-right font-medium">HP</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">İptal tarihi</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sheets.map((sheet) => (
              <tr key={sheet.id}>
                <td className="px-4 py-3 font-medium">{sheet.sheet_no}</td>
                <td className="px-4 py-3">
                  <Link href={`/panel/projects/${sheet.project_id}`} className="hover:underline">
                    {sheet.project_name}
                  </Link>
                  <p className="text-xs text-muted-foreground">{sheet.project_code}</p>
                </td>
                <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{sheet.address || "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{sheet.hp_count.toLocaleString("tr-TR")}</td>
                <td className="hidden px-4 py-3 sm:table-cell">{formatDate(sheet.cancelled_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
