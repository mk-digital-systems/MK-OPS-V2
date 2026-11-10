"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TURNSTILE_SCRIPT_URL,
  canSubmitWithCaptcha,
  captchaEnabled,
  captchaOptions,
} from "@/lib/captcha";

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
    script.onerror = () => {
      scriptPromise = null; // sonraki denemede yeniden yüklenebilsin
      reject(new Error("turnstile script blocked"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export type CaptchaController = ReturnType<typeof useTurnstile>;

/**
 * Formlar için tek hook. Site key (NEXT_PUBLIC_TURNSTILE_SITE_KEY) yoksa `enabled=false`, `options={}`,
 * `ready=true`: giriş/kayıt/şifre sıfırlama eskisi gibi çalışır.
 */
export function useTurnstile() {
  // Next.js yalnızca bu düz biçimdeki erişimi derleme sırasında istemciye gömer.
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const enabled = captchaEnabled(siteKey);
  const [token, setToken] = useState<string | null>(null);
  const [widgetFailed, setWidgetFailed] = useState(false);
  const resetRef = useRef<(() => void) | null>(null);

  /** Token tek kullanımlıktır: her Auth çağrısından sonra (başarılı ya da değil) yeni doğrulama istenir. */
  const reset = useCallback(() => {
    setToken(null);
    resetRef.current?.();
  }, []);

  return useMemo(
    () => ({
      enabled,
      siteKey: siteKey ?? "",
      token,
      setToken,
      widgetFailed,
      setWidgetFailed,
      resetRef,
      reset,
      ready: canSubmitWithCaptcha(enabled, token, widgetFailed),
      /** Supabase Auth çağrısının `options` alanına yayılır. */
      options: captchaOptions(enabled ? token : null),
    }),
    [enabled, siteKey, token, widgetFailed, reset]
  );
}

export function TurnstileWidget({ captcha }: { captcha: CaptchaController }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { enabled, siteKey, setToken, setWidgetFailed, resetRef } = captcha;

  useEffect(() => {
    if (!enabled || !containerRef.current) return;
    let widgetId: string | null = null;
    let cancelled = false;
    const container = containerRef.current;

    loadTurnstile()
      .then((api) => {
        if (cancelled) return;
        widgetId = api.render(container, {
          sitekey: siteKey,
          language: "tr",
          theme: "auto",
          callback: (value: string) => {
            setWidgetFailed(false);
            setToken(value);
          },
          // Süre dolunca token geçersiz olur; Turnstile kendiliğinden yenisini üretir.
          "expired-callback": () => setToken(null),
          "timeout-callback": () => setToken(null),
          "error-callback": () => {
            setToken(null);
            setWidgetFailed(true);
          },
        });
        resetRef.current = () => {
          if (widgetId !== null) api.reset(widgetId);
        };
      })
      .catch(() => {
        if (!cancelled) setWidgetFailed(true);
      });

    return () => {
      cancelled = true;
      resetRef.current = null;
      if (widgetId !== null) window.turnstile?.remove(widgetId);
    };
  }, [enabled, siteKey, setToken, setWidgetFailed, resetRef]);

  if (!enabled) return null;

  return (
    <div className="space-y-1">
      <div ref={containerRef} className="flex min-h-[65px] justify-center" aria-label="Güvenlik doğrulaması" />
      {captcha.widgetFailed && (
        <p className="text-center text-xs text-amber-700 dark:text-amber-300" role="status">
          Güvenlik doğrulaması yüklenemedi. Sayfayı yenileyin; sorun sürerse reklam engelleyicinizi bu site için kapatın.
        </p>
      )}
    </div>
  );
}
