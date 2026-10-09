"use client";

import { useMemo, useState } from "react";
import {
  Building2,
  Calculator,
  Clock3,
  Copy,
  HardHat,
  Loader2,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import type {
  CompanyManagerPermissions,
  PermissionModule,
  UserProfile,
  UserRole,
} from "@/types/auth";
import { USER_ROLE_LABELS } from "@/types/auth";
import { formatDateTime } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { UserRepository } from "@/modules/users/user-repository";
import { CompanyRepository } from "@/modules/company/company-repository";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Kullanıcıları yönetebilen roller. */
export type UserManagerRole = Extract<UserRole, "site_chief" | "company_manager">;

const PERMISSION_FIELDS: {
  module: PermissionModule;
  field: keyof Pick<
    CompanyManagerPermissions,
    | "projects_write"
    | "work_plans_write"
    | "personnel_write"
    | "attendance_write"
    | "vehicles_write"
    | "inventory_write"
    | "custody_write"
    | "productions_write"
    | "hakedis_write"
  >;
  label: string;
}[] = [
  { module: "projects", field: "projects_write", label: "Projeler" },
  { module: "work_plans", field: "work_plans_write", label: "İş Planı" },
  { module: "personnel", field: "personnel_write", label: "Personel" },
  { module: "attendance", field: "attendance_write", label: "Puantaj" },
  { module: "vehicles", field: "vehicles_write", label: "Araçlar" },
  { module: "inventory", field: "inventory_write", label: "Malzeme Stok" },
  { module: "custody", field: "custody_write", label: "Araç Ekipmanları" },
  { module: "productions", field: "productions_write", label: "İmalatlar" },
  { module: "hakedis", field: "hakedis_write", label: "Hakediş (fiyat ve rapor)" },
];

/** Görüntüleyen kişinin atayabileceği roller. */
const ROLE_OPTIONS: Record<UserManagerRole, { value: UserRole; label: string }[]> = {
  site_chief: [
    { value: "site_chief", label: "Firma Yöneticisi" },
    { value: "company_manager", label: "Şantiye Şefi" },
    { value: "accounting", label: "Muhasebe" },
    { value: "pending", label: "Erişimi Kaldır / Beklet" },
  ],
  company_manager: [
    { value: "accounting", label: "Muhasebe" },
    { value: "pending", label: "Erişimi Kaldır / Beklet" },
  ],
};

const ROLE_BADGE: Record<UserRole, string> = {
  site_chief: "bg-slate-900 text-white dark:bg-white dark:text-slate-900",
  company_manager: "bg-sky-600 text-white",
  accounting: "bg-violet-600 text-white",
  pending: "bg-amber-500 text-amber-950",
};

export function UserRoleManager({
  initialUsers,
  initialPermissions,
  viewerRole,
  currentUserId,
  primaryManagerId,
  userLimit,
  companyName,
  joinCode,
}: {
  initialUsers: UserProfile[];
  initialPermissions: CompanyManagerPermissions[];
  viewerRole: UserManagerRole;
  currentUserId: string;
  primaryManagerId: string | null;
  userLimit: number | null;
  companyName: string;
  joinCode: string | null;
}) {
  const isManager = viewerRole === "site_chief";
  const [users, setUsers] = useState(initialUsers);
  const [selections, setSelections] = useState<Record<string, UserRole>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState(initialPermissions);
  const [loadingPermission, setLoadingPermission] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [permissionUserId, setPermissionUserId] = useState<string | null>(null);
  const permissionUser = users.find((user) => user.id === permissionUserId) ?? null;
  const permissionUserValues = permissionUser
    ? permissions.find((item) => item.user_id === permissionUser.id) ?? emptyPermissions(permissionUser.id)
    : null;

  const counts = useMemo(() => {
    const approved = users.filter((user) => user.is_approved);
    return {
      pending: users.length - approved.length,
      approved: approved.length,
      site_chief: approved.filter((user) => user.role === "site_chief").length,
      company_manager: approved.filter((user) => user.role === "company_manager").length,
      accounting: approved.filter((user) => user.role === "accounting").length,
    };
  }, [users]);

  async function copyJoinInfo() {
    if (!joinCode) return;
    try {
      await navigator.clipboard.writeText(`Şirket adı: ${companyName}
Katılım kodu: ${joinCode}`);
      toast.success("Şirket adı ve katılım kodu kopyalandı");
    } catch {
      toast.error("Kopyalanamadı");
    }
  }

  /** Görüntüleyen kişi bu kullanıcının rolünü değiştirebilir mi? */
  function canChange(user: UserProfile) {
    if (user.id === currentUserId || user.id === primaryManagerId) return false;
    if (isManager) return true;
    return !user.is_approved || user.role === "accounting";
  }

  async function saveRole(user: UserProfile) {
    const selected = selections[user.id];
    if (!selected) return;

    setLoadingId(user.id);
    try {
      const repository = new UserRepository(createClient());
      const updated = await repository.assignRole(user.id, selected);
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      if (isManager) setPermissions(await repository.listCompanyManagerPermissions());
      setSelections((current) => {
        const next = { ...current };
        delete next[user.id];
        return next;
      });
      toast.success(selected === "pending" ? "Kullanıcının erişimi kaldırıldı" : "Kullanıcı rolü kaydedildi");
    } catch (error) {
      console.error(error);
      toast.error("Rol güncellenemedi", { description: (error as Error)?.message });
    } finally {
      setLoadingId(null);
    }
  }

  async function togglePermission(userId: string, module: PermissionModule, enabled: boolean) {
    const loadingKey = `${userId}-${module}`;
    setLoadingPermission(loadingKey);
    try {
      const updated = await new UserRepository(createClient()).setCompanyManagerPermission(userId, module, enabled);
      setPermissions((current) => [...current.filter((item) => item.user_id !== userId), updated]);
      toast.success(enabled ? "Alan yetkisi açıldı" : "Alan yetkisi kapatıldı");
    } catch (error) {
      console.error(error);
      toast.error("Alan yetkisi güncellenemedi", { description: (error as Error)?.message });
    } finally {
      setLoadingPermission(null);
    }
  }

  async function deleteUser(user: UserProfile) {
    // Onaylanmamış kullanıcı için hesabı silmek yerine şirketten çıkarılır;
    // kişi başka bir şirkete katılabilir.
    if (!user.is_approved) {
      if (!window.confirm(`${user.full_name || user.email} kullanıcısının katılma isteği reddedilsin mi?`)) return;
      setDeletingId(user.id);
      try {
        await new CompanyRepository(createClient()).rejectJoinRequest(user.id);
        setUsers((current) => current.filter((item) => item.id !== user.id));
        toast.success("Katılma isteği reddedildi");
      } catch (error) {
        console.error(error);
        toast.error("İstek reddedilemedi", { description: (error as Error)?.message });
      } finally {
        setDeletingId(null);
      }
      return;
    }

    const confirmed = window.confirm(
      `${user.full_name || user.email} kullanıcısı tamamen silinecek. Tekrar erişebilmesi için yeniden kayıt olup onay beklemesi gerekecek. Devam edilsin mi?`
    );
    if (!confirmed) return;

    setDeletingId(user.id);
    try {
      await new UserRepository(createClient()).deleteUser(user.id);
      setUsers((current) => current.filter((item) => item.id !== user.id));
      setPermissions((current) => current.filter((item) => item.user_id !== user.id));
      toast.success("Kullanıcı tamamen kaldırıldı");
    } catch (error) {
      console.error(error);
      toast.error("Kullanıcı kaldırılamadı", { description: (error as Error)?.message });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Kullanıcılar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isManager
            ? "Katılım isteklerini onaylayın, rolleri ve işlem yetkilerini belirleyin."
            : "Katılım isteklerini muhasebe olarak onaylayabilir veya reddedebilirsiniz. Diğer roller firma yöneticisi tarafından atanır."}
        </p>
      </div>

      {joinCode && (
        <div className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Çalışan davet bilgisi</p>
            <p className="text-xs text-muted-foreground">
              Çalışan kayıt olurken <strong>{companyName}</strong> adını ve katılım kodunu girer; istek bu listeye düşer.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-2xl font-semibold tracking-[0.3em]">{joinCode}</span>
            <Button type="button" variant="outline" size="sm" onClick={copyJoinInfo}>
              <Copy className="h-4 w-4" />
              Kopyala
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Summary label="Onay Bekleyen" value={counts.pending} icon={<Clock3 className="h-5 w-5 text-amber-500" />} />
        <Summary label="Firma Yöneticisi" value={counts.site_chief} icon={<Building2 className="h-5 w-5 text-slate-500" />} />
        <Summary label="Şantiye Şefi" value={counts.company_manager} icon={<HardHat className="h-5 w-5 text-sky-500" />} />
        <Summary label="Muhasebe" value={counts.accounting} icon={<Calculator className="h-5 w-5 text-violet-500" />} />
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        Onaylı kullanıcı: <strong>{counts.approved}</strong>
        {userLimit !== null && <> / paket limiti <strong>{userLimit}</strong></>}. Bütün roller limite dahildir; sahadaki
        personel sayısı limite girmez.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kullanıcı Listesi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[...users]
            .sort((a, b) => Number(a.is_approved) - Number(b.is_approved))
            .map((user) => {
              const editable = canChange(user);
              // Bekleyen kullanıcıda rol bilinçli seçilsin diye varsayılan boş gelir.
              const selected = selections[user.id] ?? (user.is_approved ? user.role : undefined);
              const options = ROLE_OPTIONS[viewerRole];
              const showPermissions = isManager && user.is_approved && (user.role === "company_manager" || user.role === "accounting");
              const userPermissions = permissions.find((item) => item.user_id === user.id) ?? emptyPermissions(user.id);
              const lockedReason =
                user.id === primaryManagerId
                  ? "Firmayı kuran yönetici"
                  : user.id === currentUserId
                    ? "Sizin hesabınız"
                    : "Rolünü firma yöneticisi değiştirir";
              return (
                <div key={user.id} className="rounded-xl border p-4">
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_190px] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {showPermissions ? (
                          <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setPermissionUserId(user.id)}>
                            {user.full_name || "İsimsiz kullanıcı"}
                          </button>
                        ) : (
                          <p className="font-semibold">{user.full_name || "İsimsiz kullanıcı"}</p>
                        )}
                        <Badge className={user.is_approved ? ROLE_BADGE[user.role] : ROLE_BADGE.pending}>
                          {USER_ROLE_LABELS[user.role]}
                        </Badge>
                        {user.id === primaryManagerId && <Badge className="border-border bg-transparent text-foreground">Kurucu</Badge>}
                      </div>
                      <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Kayıt: {formatDateTime(user.created_at)}</p>
                    </div>

                    {editable ? (
                      <Select
                        value={selected && options.some((option) => option.value === selected) ? selected : undefined}
                        onValueChange={(value: UserRole) => setSelections((current) => ({ ...current, [user.id]: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Rol seçin" />
                        </SelectTrigger>
                        <SelectContent>
                          {options.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="text-sm text-muted-foreground">{lockedReason}</div>
                    )}

                    {editable && (
                      <div className="flex gap-2">
                        <Button
                          className="flex-1"
                          onClick={() => saveRole(user)}
                          disabled={
                            loadingId === user.id ||
                            deletingId === user.id ||
                            !selected ||
                            !options.some((option) => option.value === selected) ||
                            (selected === user.role && user.is_approved)
                          }
                        >
                          {loadingId === user.id && <Loader2 className="h-4 w-4 animate-spin" />}
                          {user.is_approved ? "Kaydet" : "Onayla"}
                        </Button>
                        {(!user.is_approved || (isManager && user.role !== "site_chief")) && (
                          <Button
                            variant="destructive"
                            size="icon"
                            onClick={() => deleteUser(user)}
                            disabled={deletingId === user.id}
                            aria-label={user.is_approved ? "Kullanıcıyı tamamen kaldır" : "Katılma isteğini reddet"}
                            title={user.is_approved ? "Kullanıcıyı tamamen kaldır" : "Katılma isteğini reddet"}
                          >
                            {deletingId === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {showPermissions && (
                    <div className="mt-4 border-t pt-4">
                      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">İşlem Yetkileri</p>
                      <PermissionGrid
                        userId={user.id}
                        values={userPermissions}
                        loadingKey={loadingPermission}
                        onToggle={togglePermission}
                      />
                      <p className="mt-2 text-xs text-muted-foreground">
                        {user.role === "accounting"
                          ? "Muhasebe personel, puantaj, araç ve malzeme stokunu her zaman görür ve irsaliye teslim alabilir. Açılan modüllerde işlem yapabilir."
                          : "Şantiye şefi kapalı alanları salt okunur görür. Hakediş açılmadıkça birim fiyat ve tutarları göremez."}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
        </CardContent>
      </Card>

      <Dialog open={permissionUserId !== null} onOpenChange={(open) => !open && setPermissionUserId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{permissionUser?.full_name || permissionUser?.email || "Kullanıcı"} · Yetkiler</DialogTitle>
            <p className="text-sm text-muted-foreground">
              İşlem yetkilerini firma yöneticisi açıp kapatabilir. Kapalı modüller salt okunur kalır.
            </p>
          </DialogHeader>
          {permissionUser && permissionUserValues && (
            <PermissionGrid
              userId={permissionUser.id}
              values={permissionUserValues}
              loadingKey={loadingPermission}
              onToggle={togglePermission}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PermissionGrid({
  userId,
  values,
  loadingKey,
  onToggle,
}: {
  userId: string;
  values: CompanyManagerPermissions;
  loadingKey: string | null;
  onToggle: (userId: string, module: PermissionModule, enabled: boolean) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {PERMISSION_FIELDS.map((permission) => {
        const enabled = values[permission.field];
        const key = `${userId}-${permission.module}`;
        return (
          <Button
            key={permission.module}
            type="button"
            variant={enabled ? "default" : "outline"}
            className="justify-between"
            disabled={loadingKey === key}
            onClick={() => onToggle(userId, permission.module, !enabled)}
          >
            {permission.label}
            {loadingKey === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="text-xs">{enabled ? "Açık" : "Kapalı"}</span>}
          </Button>
        );
      })}
    </div>
  );
}

function Summary({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        {icon}
      </CardContent>
    </Card>
  );
}

function emptyPermissions(userId: string): CompanyManagerPermissions {
  return {
    user_id: userId,
    projects_write: false,
    work_plans_write: false,
    personnel_write: false,
    attendance_write: false,
    vehicles_write: false,
    inventory_write: false,
    custody_write: false,
    productions_write: false,
    hakedis_write: false,
    updated_by: null,
    updated_at: new Date(0).toISOString(),
  };
}
