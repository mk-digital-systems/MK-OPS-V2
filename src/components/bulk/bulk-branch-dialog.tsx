"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { BranchRepository } from "@/modules/branches/branch-repository";
import { useBranches } from "@/components/layout/branch-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

const isoDate = (date: Date) => date.toLocaleDateString("en-CA");

/** Seçilen personel veya araçları geçiş tarihiyle başka şubeye taşır (şube geçmişi tutulur). */
export function BulkBranchDialog({
  kind,
  ids,
  onClose,
  onDone,
}: {
  kind: "personnel" | "vehicle";
  ids: string[];
  onClose: () => void;
  onDone: (branchId: string) => void;
}) {
  const router = useRouter();
  const { branches } = useBranches();
  const today = new Date();
  const [branchId, setBranchId] = useState("");
  const [startDate, setStartDate] = useState(isoDate(today));
  const [saving, setSaving] = useState(false);
  const noun = kind === "personnel" ? "personel" : "araç";

  async function save() {
    if (!branchId) return toast.error("Şube seçin");
    if (!startDate) return toast.error("Geçiş tarihini girin");
    setSaving(true);
    try {
      const count = await new BranchRepository(createClient()).changeRecordsBranch(kind, ids, branchId, startDate);
      toast.success(`${count} ${noun} ${branches.find((branch) => branch.id === branchId)?.name ?? "şubeye"} şubesine taşındı`);
      onDone(branchId);
      router.refresh();
    } catch (error) {
      toast.error("Taşınamadı", { description: (error as Error)?.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {ids.length} {noun} başka şubeye
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Yeni şube</Label>
            <NativeSelect value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              <option value="">Şube seçin</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label>Geçiş tarihi</Label>
            <Input
              type="date"
              value={startDate}
              max={isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 31))}
              onChange={(event) => setStartDate(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {kind === "personnel"
                ? "Puantajda bu tarihten itibaren yeni şubede sayılır; şube geçmişine yazılır."
                : "Yakıt kayıtlarında bu tarihten itibaren yeni şube geçerli olur; şube geçmişine yazılır."}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Taşı
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
