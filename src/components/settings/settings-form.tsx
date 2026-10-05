"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SettingsRepository } from "@/modules/settings/settings-repository";
import {
  customTypesSchema,
  type CustomTypesFormValues,
} from "@/lib/validations/project";
import { FIXED_PROJECT_TYPES } from "@/lib/constants/project";
import type { CustomProjectTypes } from "@/types/project";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  initialTypes: CustomProjectTypes;
  readOnly?: boolean;
};

export function SettingsForm({ initialTypes, readOnly = false }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const form = useForm<CustomTypesFormValues>({
    resolver: zodResolver(customTypesSchema),
    defaultValues: initialTypes,
  });

  async function onSubmit(values: CustomTypesFormValues) {
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast.error("Oturum bulunamadı");
      setLoading(false);
      return;
    }

    try {
      await new SettingsRepository(supabase).updateCustomProjectTypes(
        values,
        user.id
      );
      toast.success("Manuel kategoriler güncellendi");
      router.refresh();
    } catch {
      toast.error("Ayarlar kaydedilemedi");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Ayarlar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Proje türü kategorilerini yönetin
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sabit Kategoriler</CardTitle>
            <CardDescription>
              Bu kategoriler sistem tarafından sabittir ve değiştirilemez.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {FIXED_PROJECT_TYPES.map((type) => (
              <div
                key={type.key}
                className="rounded-xl border bg-muted/30 px-4 py-3 text-sm font-medium"
              >
                {type.label}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manuel Kategoriler</CardTitle>
            <CardDescription>
              4 adet özel kategori adı buradan değiştirilebilir.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {(["custom_1", "custom_2", "custom_3", "custom_4"] as const).map(
                (key, index) => (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={key}>Özel Kategori {index + 1}</Label>
                    <Input id={key} disabled={readOnly} {...form.register(key)} />
                    {form.formState.errors[key] && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors[key]?.message}
                      </p>
                    )}
                  </div>
                )
              )}
              {!readOnly && (
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="animate-spin" />}
                  Kaydet
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gelecek Modüller</CardTitle>
          <CardDescription>
            Mimari bu modüller için hazırdır; şimdilik geliştirilmeyecektir.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {[
            "Personel",
            "Ekip",
            "Malzeme",
            "Depo",
            "Puantaj",
            "Hakediş",
            "Araç Takibi",
            "Evrak Yönetimi",
            "Fotoğraf",
            "PDF",
            "Excel",
            "Mobil Uygulama",
          ].map((item) => (
            <span
              key={item}
              className="rounded-lg border border-dashed px-3 py-1.5 text-xs text-muted-foreground"
            >
              {item}
            </span>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
