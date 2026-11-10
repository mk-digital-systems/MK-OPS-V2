"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type ConfirmOptions = {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Geri alınamaz işlem: onay düğmesi kırmızı olur. Verilmezse metinden tahmin edilir. */
  destructive?: boolean;
};

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmFn | null>(null);

/** Silme / kaldırma / reddetme gibi geri alınamaz işlemleri metinden tanır. */
export function looksDestructive(text: string): boolean {
  return /\b(sil|silin|silinsin|sileceks|kalıcı|kaldır|reddet|iptal|askıya)/i.test(text.toLocaleLowerCase("tr-TR"));
}

type PendingConfirm = ConfirmOptions & { resolve: (value: boolean) => void };

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<PendingConfirm | null>(null);

  const confirm = React.useCallback<ConfirmFn>((input) => {
    const options = typeof input === "string" ? { description: input } : input;
    return new Promise<boolean>((resolve) => setPending({ ...options, resolve }));
  }, []);

  function close(result: boolean) {
    pending?.resolve(result);
    setPending(null);
  }

  const destructive = pending ? (pending.destructive ?? looksDestructive(pending.description)) : false;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={pending !== null} onOpenChange={(open) => !open && close(false)}>
        <DialogContent className="sm:max-w-md" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {destructive && <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />}
              {pending?.title ?? (destructive ? "Bu işlem geri alınamayabilir" : "Onaylıyor musunuz?")}
            </DialogTitle>
            <DialogDescription className="whitespace-pre-line pt-1 text-sm">{pending?.description}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" autoFocus onClick={() => close(false)}>
              {pending?.cancelLabel ?? "Vazgeç"}
            </Button>
            <Button type="button" variant={destructive ? "destructive" : "default"} onClick={() => close(true)}>
              {pending?.confirmLabel ?? (destructive ? "Evet, devam et" : "Onayla")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

/**
 * `if (!(await confirm("Silinsin mi?"))) return;` — window.confirm yerine, tutarlı ve erişilebilir.
 * Varsayılan odak "Vazgeç" düğmesindedir (yanlışlıkla Enter ile silmeyi önler).
 */
export function useConfirm(): ConfirmFn {
  const context = React.useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm, ConfirmProvider içinde kullanılmalıdır");
  return context;
}
