"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CarFront,
  CheckCheck,
  CreditCard,
  LifeBuoy,
  Receipt,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { NotificationRepository } from "@/modules/notifications/notification-repository";
import type { AppNotification, NotificationType } from "@/types/notification";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const ICONS: Record<NotificationType, LucideIcon> = {
  join_request: UserPlus,
  support_reply: LifeBuoy,
  project_delayed: AlertTriangle,
  project_due: CalendarClock,
  vehicle_deadline: CarFront,
  subscription: CreditCard,
  hakedis_unpriced: Receipt,
};

const REFRESH_MS = 5 * 60 * 1000;
const repository = () => new NotificationRepository(createClient());

/** Okunmamış bildirim sayısını gösteren zil; tıklanınca liste açılır. */
export function NotificationBell({ className }: { className?: string }) {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const unread = items.filter((item) => !item.read).length;

  const load = useCallback(async () => {
    try {
      setItems(await repository().list());
    } catch {
      // Bildirim alınamazsa paneli bozmadan sessizce geç.
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  async function markRead(keys: string[]) {
    if (!keys.length) return;
    setItems((current) => current.map((item) => (keys.includes(item.key) ? { ...item, read: true } : item)));
    try {
      await repository().markRead(keys);
    } catch {
      void load();
    }
  }

  function openItem(item: AppNotification) {
    void markRead([item.key]);
    setOpen(false);
    router.push(item.link);
  }

  return (
    <DropdownMenu open={open} onOpenChange={(value) => { setOpen(value); if (value) void load(); }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("relative", className)} aria-label={`Bildirimler${unread ? ` (${unread} okunmamış)` : ""}`}>
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Bildirimler</p>
          {unread > 0 && (
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => void markRead(items.filter((item) => !item.read).map((item) => item.key))}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Tümünü okundu say
            </button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">Yeni bildirim yok.</p>
          ) : (
            <ul className="divide-y">
              {items.map((item) => {
                const Icon = ICONS[item.type] ?? Bell;
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => openItem(item)}
                      className={cn("flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-accent", !item.read && "bg-primary/5")}
                    >
                      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", item.read ? "text-muted-foreground" : "text-primary")} />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm", !item.read && "font-semibold")}>{item.title}</span>
                        <span className="mt-0.5 block break-words text-xs text-muted-foreground">{item.body}</span>
                      </span>
                      {!item.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
