"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { Branch } from "@/types/branch";
import { createClient } from "@/lib/supabase/client";
import { BranchRepository, branchErrorMessage } from "@/modules/branches/branch-repository";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/** Firma yöneticisi: şube açar, adını değiştirir, boş şubeyi siler. Merkez silinemez. */
export function BranchesCard({ initialBranches, branchLimit }: { initialBranches: Branch[]; branchLimit?: number }) {
  const router = useRouter();
  const [branches, setBranches] = useState(initialBranches);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const extraCount = branches.filter((branch) => !branch.is_main).length;
  const limitReached = branchLimit !== undefined && extraCount >= branchLimit;

  async function run(action: (repository: BranchRepository) => Promise<void>, success: string) {
    setBusy(true);
    try {
      await action(new BranchRepository(createClient()));
      toast.success(success);
      router.refresh();
      return true;
    } catch (error) {
      toast.error("İşlem yapılamadı", { description: branchErrorMessage(error) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Şubeler
        </CardTitle>
        <CardDescription>
          Proje, personel, araç ve depo bir şubeye bağlıdır. Şantiye şefi ve muhasebe yalnızca atandıkları şubeleri görür; şube
          ataması Kullanıcılar sayfasından yapılır. Tek şubeli firmada şube seçimi görünmez.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {branches.map((branch) => (
          <div key={branch.id} className="flex items-center gap-2 rounded-xl border px-3 py-2">
            {editing?.id === branch.id ? (
              <>
                <Input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} className="h-9" />
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={busy || editing.name.trim().length < 2}
                  title="Kaydet"
                  onClick={async () => {
                    const target = editing;
                    if (await run((repository) => repository.rename(target.id, target.name), "Şube adı güncellendi")) {
                      setBranches((current) => current.map((item) => (item.id === target.id ? { ...item, name: target.name.trim() } : item)));
                      setEditing(null);
                    }
                  }}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" title="Vazgeç" onClick={() => setEditing(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 font-medium">{branch.name}</span>
                {branch.is_main && <Badge className="border-border bg-transparent text-foreground">Merkez</Badge>}
                <Button size="icon" variant="ghost" title="Adını değiştir" onClick={() => setEditing({ id: branch.id, name: branch.name })}>
                  <Pencil className="h-4 w-4" />
                </Button>
                {!branch.is_main && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive"
                    title="Şubeyi sil"
                    disabled={busy}
                    onClick={async () => {
                      if (!window.confirm(`"${branch.name}" şubesi silinsin mi? Şubede kayıt varsa silinemez.`)) return;
                      if (await run((repository) => repository.remove(branch.id), "Şube silindi")) {
                        setBranches((current) => current.filter((item) => item.id !== branch.id));
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </>
            )}
          </div>
        ))}
        <div className="flex gap-2">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Yeni şube adı (ör. Düzce Şubesi)" disabled={limitReached} />
          <Button
            disabled={busy || name.trim().length < 2 || limitReached}
            onClick={async () => {
              let created: Branch | null = null;
              const ok = await run(async (repository) => {
                created = await repository.create(name, branches.length);
              }, "Şube eklendi");
              if (ok && created) {
                setBranches((current) => [...current, created as Branch]);
                setName("");
              }
            }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Ekle
          </Button>
        </div>
        {branchLimit !== undefined && (
          <p className={limitReached ? "text-xs font-medium text-amber-700 dark:text-amber-300" : "text-xs text-muted-foreground"}>
            Ek şube: {extraCount} / {branchLimit} (Merkez hariç).
            {limitReached && " Şube hakkınız doldu; artırmak için destek ile iletişime geçin."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
