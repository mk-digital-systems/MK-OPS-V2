"use client";

import { useEffect } from "react";

/**
 * Kaydedilmemiş değişiklik varken sekme kapatma / yenileme / tarayıcı geri-ileri gibi tam sayfa
 * ayrılmalarında tarayıcının "Sayfadan ayrılmak istiyor musunuz?" uyarısını açar.
 * Not: uygulama içi (istemci) bağlantı geçişlerini tarayıcı bildirmez; bu uyarı onları kapsamaz.
 */
export function useUnsavedChangesWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}
