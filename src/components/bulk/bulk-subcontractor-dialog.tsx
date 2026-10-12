"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { PersonnelRepository } from "@/modules/work-plans/personnel-repository";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

const COMPANY = "__company__";

/**
 * Seçilen personeli bir taşerona bağlar ya da firma çalışanı yapar. Taşeronun kendisi olan personel
 * (taşeron hesabı ona açılmış) bu işleme girmez; onun kaydı personel kartından düzenlenir.
 */
export function BulkSubcontractorDialog({
  ids,
  subcontractors,
  onClose,
  onDone,
}: {
  ids: string[];
  subcontractors: { id: string; name: string; is_active: boolean; personnel_id: string | null }[];
  onClose: () => void;
  onDone: (subcontractorId: string | null, changedIds: string[]) => void;
}) {
  const router = useRouter();
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const owners = new Set(subcontractors.map((sub) => sub.personnel_id).filter((id): id is string => !!id));
  const eligible = ids.filter((id) => !owners.has(id));
  const skipped = ids.length - eligible.length;

  async function save() {
    if (!target) return toast.error("Kime çalışacağını seçin");
    if (!eligible.length) return toast.error("Seçilenlerin hepsi taşeronun kendisi; kartından düzenleyin");
    const subcontractorId = target === COMPANY ? null : target;
    setSaving(true);
    try {
      await new PersonnelRepository(createClient()).setSubcontractorMany(eligible, subcontractorId);
      toast.success(
        `${eligible.length} personel ${subcontractorId ? `${subcontractors.find((sub) => sub.id === subcontractorId)?.name ?? "taşeron"} taşeronuna bağlandı` : "firma çalışanı yapıldı"}`
      );
      onDone(subcontractorId, eligible);
      router.refresh();
    } catch (error) {
      toast.error("Kaydedilemedi", { description: (error as Error)?.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{ids.length} personel kime çalışıyor?</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Bağlı olacağı yer</Label>
          <NativeSelect value={target} onChange={(event) => setTarget(event.target.value)}>
            <option value="">Seçin</option>
            <option value={COMPANY}>Firma çalışanı (taşeronsuz)</option>
            {subcontractors
              .filter((sub) => sub.is_active)
              .map((sub) => (
                <option key={sub.id} value={sub.id}>
                  Taşeron: {sub.name}
                </option>
              ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">
            Taşeron personeli ana firmanın maaş dökümüne girmez; taşeronun hesabında izlenir.
          </p>
          {skipped > 0 && (
            <p className="text-xs text-amber-700">
              Seçilenlerden {skipped} kişi taşeronun kendisi; bu işleme dahil edilmez (personel kartından düzenlenir).
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Kaydet
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
