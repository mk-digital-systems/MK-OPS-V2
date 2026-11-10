"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { EmailTemplate } from "@/types/admin";
import { formatDateTime } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { AdminRepository } from "@/modules/admin/admin-repository";
import { TEMPLATE_PLACEHOLDERS, renderTemplate, unknownPlaceholders } from "@/lib/email-template";
import { userErrorMessage } from "@/lib/user-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const SAMPLE = { ad: "Ayşe", firma: "Örnek Yapı Ltd.", deneme_bitis: "12.11.2026 14:30" };

export function EmailTemplateEditor({ template }: { template: EmailTemplate | null }) {
  const router = useRouter();
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [saving, setSaving] = useState(false);
  const unknown = unknownPlaceholders(`${subject} ${body}`);
  const dirty = subject !== (template?.subject ?? "") || body !== (template?.body ?? "");

  async function save() {
    if (unknown.length) {
      toast.error(`Bilinmeyen yer tutucu: ${unknown.map((u) => `{{${u}}}`).join(", ")}`);
      return;
    }
    setSaving(true);
    try {
      const version = await new AdminRepository(createClient()).saveEmailTemplate("welcome", subject, body);
      toast.success(`Şablon kaydedildi (sürüm ${version})`);
      router.refresh();
    } catch (error) {
      toast.error("Kaydedilemedi", { description: userErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">E-posta Şablonu</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Yeni kayıt olan kullanıcılara elle göndereceğiniz karşılama ve destek e-postasının metni. Düz metindir (HTML
          yorumlanmaz). Sistem e-posta göndermez; metin{" "}
          <Link href="/admin/yeni-kayitlar" className="font-medium text-primary underline">Yeni Kayıtlar</Link> sayfasında
          kullanıcıya göre doldurulur, kopyalayıp kendi e-posta hesabınızdan gönderirsiniz.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Karşılama e-postası</h2>
              <span className="text-xs text-muted-foreground">
                {template
                  ? `Sürüm ${template.version} · ${formatDateTime(template.updated_at)}${template.updated_by_email ? ` · ${template.updated_by_email}` : ""}`
                  : "Henüz kaydedilmedi"}
              </span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tpl-subject">Konu</Label>
              <Input id="tpl-subject" value={subject} maxLength={200} onChange={(event) => setSubject(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tpl-body">Metin</Label>
              <Textarea id="tpl-body" rows={16} value={body} maxLength={10000} onChange={(event) => setBody(event.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Kullanabileceğiniz yer tutucular:{" "}
              {TEMPLATE_PLACEHOLDERS.map((name) => (
                <code key={name} className="mr-1 rounded bg-muted px-1 py-0.5">{`{{${name}}}`}</code>
              ))}
              — ad (ilk ad), firma adı ve deneme bitiş tarihi.
            </p>
            {unknown.length > 0 && (
              <p className="text-sm font-medium text-destructive">
                Bilinmeyen yer tutucu: {unknown.map((u) => `{{${u}}}`).join(", ")}. Kaydedilemez.
              </p>
            )}
            <Button onClick={save} disabled={saving || !dirty || unknown.length > 0}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Şablonu kaydet
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <h2 className="font-semibold">Önizleme</h2>
            <p className="text-xs text-muted-foreground">Örnek kullanıcıyla doldurulmuş hâli (Ayşe · Örnek Yapı Ltd.).</p>
            <p className="text-sm">
              <span className="font-medium">Konu:</span> {renderTemplate(subject, SAMPLE) || "—"}
            </p>
            <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 font-sans text-sm">
              {renderTemplate(body, SAMPLE) || "—"}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
