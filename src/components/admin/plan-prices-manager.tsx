"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { PlanPrice } from "@/types/admin";
import { DEFAULT_DISCOUNT_PERCENT, discountedPrice, formatTl, perMonth, savingPercent } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/client";
import { AdminRepository } from "@/modules/admin/admin-repository";
import { userErrorMessage } from "@/lib/user-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Form = {
  is_published: boolean;
  user_limit: string;
  site_chief_limit: string;
  manager_limit: string;
  accounting_limit: string;
  branch_limit: string;
  price_1m: string;
  price_3m: string;
  price_6m: string;
};

const text = (value: number | null) => (value === null ? "" : String(value));
const toForm = (plan: PlanPrice): Form => ({
  is_published: plan.is_published,
  user_limit: text(plan.user_limit),
  site_chief_limit: text(plan.site_chief_limit),
  manager_limit: text(plan.manager_limit),
  accounting_limit: text(plan.accounting_limit),
  branch_limit: text(plan.branch_limit),
  price_1m: text(plan.price_1m),
  price_3m: text(plan.price_3m),
  price_6m: text(plan.price_6m),
});
const num = (value: string): number | null => (value.trim() === "" ? null : Number(value));

export function PlanPricesManager({ initialPlans }: { initialPlans: PlanPrice[] }) {
  const router = useRouter();
  const [forms, setForms] = useState<Record<string, Form>>(() => Object.fromEntries(initialPlans.map((plan) => [plan.id, toForm(plan)])));
  const [saving, setSaving] = useState(false);

  const patch = (id: string, changes: Partial<Form>) => setForms((current) => ({ ...current, [id]: { ...current[id], ...changes } }));
  const dirty = initialPlans.some((plan) => JSON.stringify(forms[plan.id]) !== JSON.stringify(toForm(plan)));

  function autoCalculate(plan: PlanPrice) {
    const monthly = num(forms[plan.id].price_1m);
    if (!monthly || monthly < 1) {
      toast.error("Önce 1 aylık fiyatı girin");
      return;
    }
    patch(plan.id, {
      price_3m: String(discountedPrice(monthly, 3)),
      price_6m: String(discountedPrice(monthly, 6)),
    });
    toast.success(`3 aylık %${DEFAULT_DISCOUNT_PERCENT[3]}, 6 aylık %${DEFAULT_DISCOUNT_PERCENT[6]} indirimle hesaplandı`);
  }

  async function save() {
    const payload: PlanPrice[] = [];
    for (const plan of initialPlans) {
      const form = forms[plan.id];
      const parsed = {
        user_limit: num(form.user_limit),
        site_chief_limit: num(form.site_chief_limit),
        manager_limit: num(form.manager_limit),
        accounting_limit: num(form.accounting_limit),
        branch_limit: num(form.branch_limit) ?? 0,
        price_1m: num(form.price_1m),
        price_3m: num(form.price_3m),
        price_6m: num(form.price_6m),
      };
      if (!plan.is_custom) {
        if ([parsed.user_limit, parsed.price_1m, parsed.price_3m, parsed.price_6m].some((v) => v === null || !Number.isInteger(v) || v < 1)) {
          toast.error(`${plan.name}: kullanıcı sayısı ve üç fiyat (1, 3, 6 ay) tam sayı ve 0'dan büyük olmalı`);
          return;
        }
        const roles = (parsed.site_chief_limit ?? 0) + (parsed.manager_limit ?? 0) + (parsed.accounting_limit ?? 0);
        if (roles > (parsed.user_limit as number)) {
          toast.error(`${plan.name}: rol sayıları toplamı (${roles}) kullanıcı sayısını (${parsed.user_limit}) aşıyor`);
          return;
        }
      }
      payload.push({ ...plan, is_published: form.is_published, ...parsed });
    }
    setSaving(true);
    try {
      await new AdminRepository(createClient()).savePlanPrices(payload);
      toast.success("Fiyat listesi kaydedildi; sitede hemen görünür");
      router.refresh();
    } catch (error) {
      toast.error("Kaydedilemedi", { description: userErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Fiyat Listesi</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Paket fiyatları <strong>KDV dahil, TL</strong>. Burada yaptığınız değişiklik kaydedilince tanıtım sayfasındaki
            fiyat bölümüne ve plan atama ekranına yansır. Mevcut firmalar kendi kayıtlı limitlerini korur; yeni limitler
            yalnızca sonraki plan atamalarında kullanılır.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/#fiyatlandirma" target="_blank">
            <ExternalLink className="h-4 w-4" />
            Sitede gör
          </Link>
        </Button>
      </div>

      <div className="grid gap-4">
        {initialPlans.map((plan) => {
          const form = forms[plan.id];
          const preview = { price_1m: num(form.price_1m), price_3m: num(form.price_3m), price_6m: num(form.price_6m) };
          return (
            <Card key={plan.id}>
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{plan.name}</h2>
                    {plan.is_custom && <Badge className="bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200">Özel teklif</Badge>}
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={form.is_published}
                      onChange={(event) => patch(plan.id, { is_published: event.target.checked })}
                    />
                    Sitede göster
                  </label>
                </div>

                {plan.is_custom ? (
                  <p className="text-sm text-muted-foreground">
                    Fiyatı yoktur; sitede &quot;Özel teklif&quot; olarak görünür. Plan atarken kullanıcı ve şube sayıları firmaya göre
                    elle girilir.
                  </p>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                      {(
                        [
                          ["user_limit", "Toplam kullanıcı"],
                          ["site_chief_limit", "Firma yöneticisi"],
                          ["manager_limit", "Şantiye şefi"],
                          ["accounting_limit", "Muhasebe"],
                          ["branch_limit", "Ek şube"],
                        ] as const
                      ).map(([field, label]) => (
                        <div key={field} className="space-y-1.5">
                          <Label htmlFor={`${plan.id}-${field}`} className="text-xs">{label}</Label>
                          <Input
                            id={`${plan.id}-${field}`}
                            type="number"
                            min={field === "site_chief_limit" || field === "user_limit" ? 1 : 0}
                            value={form[field]}
                            onChange={(event) => patch(plan.id, { [field]: event.target.value })}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      {(
                        [
                          ["price_1m", "1 aylık (₺, KDV dahil)", 1],
                          ["price_3m", "3 aylık (₺, KDV dahil)", 3],
                          ["price_6m", "6 aylık (₺, KDV dahil)", 6],
                        ] as const
                      ).map(([field, label, months]) => {
                        const total = preview[field];
                        return (
                          <div key={field} className="space-y-1.5">
                            <Label htmlFor={`${plan.id}-${field}`} className="text-xs">{label}</Label>
                            <Input
                              id={`${plan.id}-${field}`}
                              type="number"
                              min={1}
                              value={form[field]}
                              onChange={(event) => patch(plan.id, { [field]: event.target.value })}
                            />
                            {total !== null && total > 0 && (
                              <p className="text-xs text-muted-foreground">
                                Aylık {formatTl(perMonth(total, months))}
                                {months > 1 && savingPercent(preview, months) > 0 && ` · %${savingPercent(preview, months)} indirim`}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => autoCalculate(plan)}>
                      1 aylıktan hesapla (3 ay %{DEFAULT_DISCOUNT_PERCENT[3]}, 6 ay %{DEFAULT_DISCOUNT_PERCENT[6]} indirim)
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="sticky bottom-4 flex items-center gap-3 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur">
        <Button onClick={save} disabled={saving || !dirty}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Fiyat listesini kaydet
        </Button>
        <p className="text-xs text-muted-foreground">
          {dirty ? "Kaydedilmemiş değişiklik var." : "Değişiklik yok."} Her kayıt İşlem Geçmişi&apos;ne eski → yeni olarak yazılır.
        </p>
      </div>
    </div>
  );
}
