"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { parsePastedRows } from "@/lib/bulk-import";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type BulkRow<T> = { cells: string[]; value?: T; error?: string };

/**
 * Excel'den yapıştırarak toplu ekleme: sütunlar sırasıyla yapıştırılır, satırlar önizlenir, hatalı satır
 * varsa ekleme yapılmaz. Bütün satırlar tek seferde eklenir (biri hatalıysa hiçbiri eklenmez).
 */
export function BulkImportDialog<T>({
  title,
  columns,
  example,
  note,
  children,
  toRows,
  onImport,
  onClose,
}: {
  title: string;
  /** Sütun başlıkları sırasıyla; zorunlular "*" ile */
  columns: string[];
  example: string;
  note?: React.ReactNode;
  /** Bütün satırlara uygulanan ek alanlar (ör. şube) */
  children?: React.ReactNode;
  toRows: (rows: string[][]) => BulkRow<T>[];
  onImport: (values: T[]) => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const rows = toRows(parsePastedRows(text));
  const errors = rows.filter((row) => row.error).length;

  async function save() {
    if (!rows.length) return toast.error("Yapıştırılan satır yok");
    if (errors) return toast.error(`${errors} satırda hata var; düzeltip yeniden yapıştırın`);
    setSaving(true);
    try {
      await onImport(rows.map((row) => row.value as T));
      onClose();
    } catch (error) {
      toast.error("Eklenemedi", { description: (error as Error)?.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Excel&apos;de sütunları şu sırayla seçip kopyalayın ve aşağıya yapıştırın:{" "}
          <strong>{columns.join(" · ")}</strong>. Başlık satırı varsa atlanır; boş hücre bırakılabilir (yıldızlılar hariç).
        </p>
        {note}
        {children}
        <div className="space-y-2">
          <Label>Yapıştır</Label>
          <Textarea rows={7} value={text} onChange={(event) => setText(event.target.value)} placeholder={example} autoFocus />
        </div>
        {rows.length > 0 && (
          <div className="max-h-72 overflow-auto rounded-lg border text-xs">
            <table className="w-full">
              <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 font-medium">#</th>
                  {columns.map((column) => (
                    <th key={column} className="px-2 py-1.5 font-medium">{column}</th>
                  ))}
                  <th className="px-2 py-1.5 font-medium">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row, index) => (
                  <tr key={index} className={cn(row.error && "bg-rose-50 dark:bg-rose-950/30")}>
                    <td className="px-2 py-1 text-muted-foreground">{index + 1}</td>
                    {columns.map((column, cellIndex) => (
                      <td key={column} className="px-2 py-1">{row.cells[cellIndex] ?? ""}</td>
                    ))}
                    <td className={cn("px-2 py-1", row.error ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300")}>
                      {row.error ?? "Hazır"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {rows.length} satır{errors ? ` · ${errors} hatalı` : ""}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button onClick={save} disabled={saving || !rows.length || errors > 0}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {rows.length ? `${rows.length} kaydı ekle` : "Ekle"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
