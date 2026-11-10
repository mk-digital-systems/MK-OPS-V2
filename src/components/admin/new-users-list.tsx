"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import type { EmailTemplate, NewUser, NewUserStatusFilter } from "@/types/admin";
import { USER_ROLE_LABELS } from "@/types/auth";
import { cn, formatDateTime } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { AdminRepository } from "@/modules/admin/admin-repository";
import { greetingName, mailtoHref, renderTemplate } from "@/lib/email-template";
import { userErrorMessage } from "@/lib/user-error";
import { StatusBadge } from "@/components/admin/companies-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const FILTERS: { value: NewUserStatusFilter; label: string }[] = [
  { value: "pending", label: "Bekleyenler" },
  { value: "sent", label: "E-posta gönderilenler" },
  { value: "all", label: "Tümü (mevcut kullanıcılar)" },
];

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error("Kopyalanamadı", { description: "Tarayıcı panoya erişime izin vermedi." });
        }
      }}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? "Kopyalandı" : label}
    </Button>
  );
}

export function NewUsersList({
  users,
  total,
  status,
  page,
  pageSize,
  template,
}: {
  users: NewUser[];
  total: number;
  status: NewUserStatusFilter;
  page: number;
  pageSize: number;
  template: EmailTemplate | null;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (nextStatus: NewUserStatusFilter, nextPage = 1) =>
    `/admin/yeni-kayitlar?durum=${nextStatus}${nextPage > 1 ? `&sayfa=${nextPage}` : ""}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Yeni Kayıtlar</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Kayıt olan her kullanıcı, şirket açmamış olsa bile burada görünür. Karşılama e-postasını sistem göndermez:
            metni kopyalayıp kendi e-posta hesabınızdan gönderir, ardından &quot;Gönderildi&quot; olarak işaretlersiniz.
            İşaretlenen kullanıcı bekleyenlerden çıkar ve &quot;E-posta gönderilenler&quot; ile &quot;Tümü&quot; listesinde kalır.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/e-posta-sablonlari">
            <Mail className="h-4 w-4" />
            E-posta şablonu
          </Link>
        </Button>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Durum">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={href(filter.value)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent",
              status === filter.value && "border-primary bg-primary text-primary-foreground hover:bg-primary"
            )}
          >
            {filter.label}
          </Link>
        ))}
        <span className="self-center text-xs text-muted-foreground">{total} kayıt</span>
      </nav>

      {users.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {status === "pending"
              ? "Karşılama e-postası bekleyen yeni kayıt yok."
              : status === "sent"
                ? "Henüz e-posta gönderildi olarak işaretlenen kullanıcı yok."
                : "Kayıt bulunamadı."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {users.map((user) => (
            <UserCard key={user.id} user={user} template={template} />
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link className="font-medium text-primary underline" href={href(status, page - 1)}>
              ← Önceki
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Sayfa {page} / {pages}
          </span>
          {page < pages ? (
            <Link className="font-medium text-primary underline" href={href(status, page + 1)}>
              Sonraki →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}

function UserCard({ user, template }: { user: NewUser; template: EmailTemplate | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"sent" | "skipped" | "undo" | null>(null);

  const vars = {
    ad: greetingName(user.full_name, user.email),
    firma: user.company_name ?? "firmanız",
    deneme_bitis: user.trial_ends_at ? formatDateTime(user.trial_ends_at) : "yakında",
  };
  const subject = renderTemplate(template?.subject ?? "", vars);
  const body = renderTemplate(template?.body ?? "", vars);
  const mailto = mailtoHref(user.email, subject, body);

  async function mark(next: "sent" | "skipped" | null) {
    setBusy(next ?? "undo");
    try {
      await new AdminRepository(createClient()).setUserOnboarding(user.id, next);
      toast.success(next === "sent" ? "Gönderildi olarak işaretlendi" : next === "skipped" ? "Gerek yok olarak işaretlendi" : "İşaret kaldırıldı");
      router.refresh();
    } catch (error) {
      toast.error("İşaretlenemedi", { description: userErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold">{user.full_name || "İsimsiz kullanıcı"}</p>
            <p className="truncate text-sm text-muted-foreground">{user.email ?? "E-posta yok"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {user.onboarding_status === "sent" && (
              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                E-posta gönderildi{user.handled_at ? ` · ${formatDateTime(user.handled_at)}` : ""}
              </Badge>
            )}
            {user.onboarding_status === "skipped" && (
              <Badge className="bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200">Önceden kayıtlı / gerek yok</Badge>
            )}
            {user.onboarding_status === null && (
              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">E-posta bekliyor</Badge>
            )}
            <Badge className={user.email_confirmed_at ? "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200" : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}>
              {user.email_confirmed_at ? "E-posta doğrulandı" : "E-posta doğrulanmadı"}
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Kayıt: {formatDateTime(user.created_at)}</span>
          <span>Son giriş: {user.last_sign_in_at ? formatDateTime(user.last_sign_in_at) : "Hiç"}</span>
          {user.company_name ? (
            <span className="flex items-center gap-1.5">
              {user.company_name}
              {user.company_status && <StatusBadge status={user.company_status} />}
              <span>· {user.is_owner ? "Ana yönetici" : user.is_approved ? USER_ROLE_LABELS[user.role] : "Katılım onayı bekliyor"}</span>
            </span>
          ) : (
            <span className="font-medium text-amber-700 dark:text-amber-300">Henüz şirket açmadı</span>
          )}
          {user.handled_by_email && user.onboarding_status && <span>İşaretleyen: {user.handled_by_email}</span>}
        </div>

        <details className="rounded-lg border bg-muted/30 p-3">
          <summary className="cursor-pointer text-sm font-medium">Karşılama e-postası hazırla</summary>
          {!template || (!template.subject && !template.body) ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Şablon boş. <Link href="/admin/e-posta-sablonlari" className="font-medium text-primary underline">Şablonu yazın</Link>.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              <p className="text-sm">
                <span className="font-medium">Konu:</span> {subject || "—"}
              </p>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-3 font-sans text-sm">{body || "—"}</pre>
              <div className="flex flex-wrap gap-2">
                <CopyButton text={user.email ?? ""} label="Adresi kopyala" />
                <CopyButton text={subject} label="Konuyu kopyala" />
                <CopyButton text={body} label="Metni kopyala" />
                {mailto && (
                  <Button asChild size="sm" variant="outline">
                    <a href={mailto}>E-posta uygulamasında aç</a>
                  </Button>
                )}
              </div>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
            {user.onboarding_status === null ? (
              <>
                <Button size="sm" onClick={() => mark("sent")} disabled={busy !== null}>
                  {busy === "sent" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Gönderildi olarak işaretle
                </Button>
                <Button size="sm" variant="ghost" onClick={() => mark("skipped")} disabled={busy !== null}>
                  {busy === "skipped" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Gerek yok
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => mark(null)} disabled={busy !== null}>
                {busy === "undo" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                İşareti geri al (yeniden beklesin)
              </Button>
            )}
          </div>
        </details>

        {user.company_id && (
          <Link href="/admin" className="inline-block text-xs font-medium text-primary underline">
            Şirketler sayfasında bul
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
