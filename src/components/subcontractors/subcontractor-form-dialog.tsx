"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Subcontractor } from "@/types/subcontractor";
import { createClient } from "@/lib/supabase/client";
import { SubcontractorRepository, subcontractorErrorMessage } from "@/modules/subcontractors/subcontractor-repository";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Taşeron kartı: firma bilgileri ve pay yüzdesi. */
export function SubcontractorFormDialog({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: Subcontractor | null;
  onClose: () => void;
  onSaved: (saved: Subcontractor) => void;
}) {
  const [form, setForm] = useState(() => toForm(initial));
  const [saving, setSaving] = useState(false);
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setForm(toForm(initial));
  }

  const set = (key: keyof ReturnType<typeof toForm>) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  async function save() {
    const percent = Number(form.share_percent.replace(",", "."));
    if (form.name.trim().length < 2) return toast.error("Taşeron adı en az 2 karakter olmalı");
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) return toast.error("Pay yüzdesi 0'dan büyük, en fazla 100 olmalı");
    setSaving(true);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Oturum bulunamadı");
      const saved = await new SubcontractorRepository(supabase).save(
        initial?.id ?? null,
        { ...form, share_percent: percent, is_active: form.is_active },
        data.user.id
      );
      toast.success(initial ? "Taşeron güncellendi" : "Taşeron eklendi");
      onSaved(saved);
    } catch (error) {
      toast.error("Taşeron kaydedilemedi", { description: subcontractorErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Taşeronu Düzenle" : "Yeni Taşeron"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sub-name">Taşeron adı</Label>
            <Input id="sub-name" value={form.name} onChange={set("name")} placeholder="ör. Yıldız Elektrik" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sub-share">Taşeron payı (%)</Label>
            <Input id="sub-share" inputMode="decimal" value={form.share_percent} onChange={set("share_percent")} placeholder="ör. 70" />
            <p className="text-xs text-muted-foreground">
              İmalatın hakediş tutarının bu yüzdesi taşeronun, kalanı firmanındır. Ör. %70: 100 ₺&apos;lik işin 70 ₺&apos;si taşeronun.
              Yüzde değişirse yeni oran yalnızca bundan sonraki imalatlara uygulanır.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sub-contact">Yetkili</Label>
              <Input id="sub-contact" value={form.contact_name} onChange={set("contact_name")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sub-phone">Telefon</Label>
              <Input id="sub-phone" inputMode="tel" value={form.phone} onChange={set("phone")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sub-tax">Vergi no (isteğe bağlı)</Label>
              <Input id="sub-tax" value={form.tax_number} onChange={set("tax_number")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sub-iban">IBAN (isteğe bağlı)</Label>
              <Input id="sub-iban" value={form.iban} onChange={set("iban")} placeholder="TR.." />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sub-notes">Not</Label>
            <Textarea id="sub-notes" rows={2} value={form.notes} onChange={set("notes")} />
          </div>
          {initial && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
              />
              Taşeron aktif (pasif taşeron yeni ekiplere atanamaz)
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Vazgeç
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Kaydet
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function toForm(initial: Subcontractor | null) {
  return {
    name: initial?.name ?? "",
    share_percent: initial ? String(initial.share_percent) : "",
    contact_name: initial?.contact_name ?? "",
    phone: initial?.phone ?? "",
    tax_number: initial?.tax_number ?? "",
    iban: initial?.iban ?? "",
    notes: initial?.notes ?? "",
    is_active: initial?.is_active ?? true,
  };
}
