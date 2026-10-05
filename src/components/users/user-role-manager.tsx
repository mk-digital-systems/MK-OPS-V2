"use client";

import { useMemo, useState } from "react";
import {
  Calculator,
  CheckCircle2,
  Clock3,
  Loader2,
  ShieldCheck,
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

type AssignableRole = Exclude<UserRole, "site_chief">;

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
];

export function UserRoleManager({
  initialUsers,
  initialPermissions,
}: {
  initialUsers: UserProfile[];
  initialPermissions: CompanyManagerPermissions[];
}) {
  const [users, setUsers] = useState(initialUsers);
  const [selections, setSelections] = useState<Record<string, AssignableRole>>(
    {}
  );
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState(initialPermissions);
  const [loadingPermission, setLoadingPermission] = useState<string | null>(
    null
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [permissionUserId, setPermissionUserId] = useState<string | null>(null);
  const permissionUser = users.find((user) => user.id === permissionUserId) ?? null;
  const permissionUserValues = permissionUser
    ? permissions.find((item) => item.user_id === permissionUser.id) ?? emptyPermissions(permissionUser.id)
    : null;

  const managerCount = useMemo(
    () =>
      users.filter(
        (user) => user.is_approved && user.role === "company_manager"
      ).length,
    [users]
  );
  const accountingCount = useMemo(
    () =>
      users.filter(
        (user) => user.is_approved && user.role === "accounting"
      ).length,
    [users]
  );

  async function saveRole(user: UserProfile) {
    const selected = selections[user.id] ?? user.role;

    setLoadingId(user.id);
    try {
      const updated = await new UserRepository(
        createClient()
      ).assignRole(user.id, selected);
      setUsers((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      if (selected === "company_manager" || selected === "accounting") {
        setPermissions((current) =>
          current.some((item) => item.user_id === user.id)
            ? current
            : [...current, emptyPermissions(user.id)]
        );
      } else {
        setPermissions((current) =>
          current.filter((item) => item.user_id !== user.id)
        );
      }
      toast.success(
        selected === "pending"
          ? "Kullanıcının erişimi kaldırıldı"
          : "Kullanıcı rolü onaylandı"
      );
    } catch (error) {
      console.error(error);
      toast.error("Rol güncellenemedi", {
        description: (error as Error)?.message,
      });
    } finally {
      setLoadingId(null);
    }
  }

  async function togglePermission(
    userId: string,
    module: PermissionModule,
    enabled: boolean
  ) {
    const loadingKey = `${userId}-${module}`;
    setLoadingPermission(loadingKey);
    try {
      const updated = await new UserRepository(
        createClient()
      ).setCompanyManagerPermission(userId, module, enabled);
      setPermissions((current) => [
        ...current.filter((item) => item.user_id !== userId),
        updated,
      ]);
      toast.success(enabled ? "Alan yetkisi açıldı" : "Alan yetkisi kapatıldı");
    } catch (error) {
      console.error(error);
      toast.error("Alan yetkisi güncellenemedi", {
        description: (error as Error)?.message,
      });
    } finally {
      setLoadingPermission(null);
    }
  }

  async function deleteUser(user: UserProfile) {
    const confirmed = window.confirm(
      `${user.full_name || user.email} kullanıcısı tamamen silinecek. Tekrar erişebilmesi için yeniden kayıt olup şantiye şefi onayı beklemesi gerekecek. Devam edilsin mi?`
    );
    if (!confirmed) return;

    setDeletingId(user.id);
    try {
      await new UserRepository(createClient()).deleteUser(user.id);
      setUsers((current) => current.filter((item) => item.id !== user.id));
      setPermissions((current) =>
        current.filter((item) => item.user_id !== user.id)
      );
      toast.success("Kullanıcı tamamen kaldırıldı");
    } catch (error) {
      console.error(error);
      toast.error("Kullanıcı kaldırılamadı", {
        description: (error as Error)?.message,
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Kullanıcı Yetkileri
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Yeni kullanıcıları onaylayın ve görevlerini belirleyin
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Summary
          label="Onay Bekleyen"
          value={users.filter((user) => !user.is_approved).length}
          icon={<Clock3 className="h-5 w-5 text-amber-500" />}
        />
        <Summary
          label="Şirket Yöneticisi"
          value={`${managerCount}/3`}
          icon={<ShieldCheck className="h-5 w-5 text-blue-500" />}
        />
        <Summary
          label="Muhasebe"
          value={`${accountingCount}/2`}
          icon={<Calculator className="h-5 w-5 text-violet-500" />}
        />
        <Summary
          label="Onaylı Kullanıcı"
          value={users.filter((user) => user.is_approved).length}
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kullanıcılar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[...users]
            .sort((a, b) => Number(a.is_approved) - Number(b.is_approved))
            .map((user) => {
              const isChief = user.role === "site_chief";
              const selected =
                selections[user.id] ??
                (isChief ? "pending" : user.role);
              const userPermissions =
                permissions.find((item) => item.user_id === user.id) ??
                emptyPermissions(user.id);
              return (
                <div
                  key={user.id}
                  className="rounded-xl border p-4"
                >
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_190px] lg:items-center">
                    <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {user.is_approved && (user.role === "company_manager" || user.role === "accounting") ? (
                        <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setPermissionUserId(user.id)}>
                          {user.full_name || "İsimsiz kullanıcı"}
                        </button>
                      ) : (
                        <p className="font-semibold">{user.full_name || "İsimsiz kullanıcı"}</p>
                      )}
                      <Badge
                        className={
                          user.is_approved
                            ? "bg-emerald-600"
                            : "bg-amber-500 text-amber-950"
                        }
                      >
                        {USER_ROLE_LABELS[user.role]}
                      </Badge>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {user.email}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Kayıt: {formatDateTime(user.created_at)}
                    </p>
                    </div>

                  {isChief ? (
                    <div className="text-sm text-muted-foreground">
                      Ana şantiye şefi hesabı
                    </div>
                  ) : (
                    <Select
                      value={selected}
                      onValueChange={(value: AssignableRole) =>
                        setSelections((current) => ({
                          ...current,
                          [user.id]: value,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="company_manager">
                          Şirket Yöneticisi
                        </SelectItem>
                        <SelectItem value="accounting">Muhasebe</SelectItem>
                        <SelectItem value="pending">
                          Erişimi Kaldır / Beklet
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}

                    {!isChief && (
                      <div className="flex gap-2">
                        <Button
                          className="flex-1"
                          onClick={() => saveRole(user)}
                          disabled={
                            loadingId === user.id ||
                            deletingId === user.id ||
                            (selected === "company_manager" &&
                              managerCount >= 3 &&
                              user.role !== "company_manager") ||
                            (selected === "accounting" &&
                              accountingCount >= 2 &&
                              user.role !== "accounting")
                          }
                        >
                          {loadingId === user.id && (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          )}
                          Onayla
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon"
                          onClick={() => deleteUser(user)}
                          disabled={deletingId === user.id}
                          aria-label="Kullanıcıyı tamamen kaldır"
                        >
                          {deletingId === user.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <UserX className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    )}
                  </div>

                  {user.is_approved && (user.role === "company_manager" || user.role === "accounting") && (
                    <div className="mt-4 border-t pt-4">
                      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        İşlem Yetkileri
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {PERMISSION_FIELDS.map((permission) => {
                          const enabled = userPermissions[permission.field];
                          const loadingKey = `${user.id}-${permission.module}`;
                          return (
                            <Button
                              key={permission.module}
                              type="button"
                              variant={enabled ? "default" : "outline"}
                              className="justify-between"
                              disabled={loadingPermission === loadingKey}
                              onClick={() =>
                                togglePermission(
                                  user.id,
                                  permission.module,
                                  !enabled
                                )
                              }
                            >
                              {permission.label}
                              {loadingPermission === loadingKey ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <span className="text-xs">
                                  {enabled ? "Açık" : "Kapalı"}
                                </span>
                              )}
                            </Button>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {user.role === "accounting"
                          ? "Personel ve Puantaj varsayılan olarak salt okunur. Açılan diğer modüller menüde görünür ve işlem yapılabilir."
                          : "Kapalı alanlar salt okunur kalır. Ayarlar ve kullanıcı yetkileri hiçbir zaman açılamaz."}
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
              İşlem yetkilerini şantiye şefi açıp kapatabilir. Kapalı modüller salt okunur kalır.
            </p>
          </DialogHeader>
          {permissionUser && permissionUserValues && (
            <div className="grid gap-2 sm:grid-cols-2">
              {PERMISSION_FIELDS.map((permission) => {
                const enabled = permissionUserValues[permission.field];
                const loadingKey = `${permissionUser.id}-${permission.module}`;
                return (
                  <Button key={permission.module} type="button" variant={enabled ? "default" : "outline"} className="justify-between" disabled={loadingPermission === loadingKey} onClick={() => togglePermission(permissionUser.id, permission.module, !enabled)}>
                    {permission.label}
                    {loadingPermission === loadingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="text-xs">{enabled ? "Açık" : "Kapalı"}</span>}
                  </Button>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Summary({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
}) {
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
    updated_by: null,
    updated_at: new Date(0).toISOString(),
  };
}
