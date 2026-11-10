"use client";

import { useEffect } from "react";

// Kök düzen bile çöktüğünde gösterilir; kendi <html> etiketini içermek zorundadır.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    // Hata izleme açıksa (NEXT_PUBLIC_SENTRY_DSN) bildir; kapalıyken SDK hiç indirilmez.
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
  }, [error]);

  return (
    <html lang="tr">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", margin: 0, textAlign: "center", padding: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Bir sorun oluştu</h1>
          <p style={{ color: "#64748b", fontSize: 14 }}>Sayfa yüklenemedi. Lütfen tekrar deneyin.</p>
          {error.digest && <p style={{ color: "#64748b", fontSize: 12, fontFamily: "monospace" }}>Hata kodu: {error.digest}</p>}
          <button onClick={reset} style={{ marginTop: 16, padding: "8px 16px", borderRadius: 8, border: 0, background: "#1d4ed8", color: "#fff", cursor: "pointer" }}>
            Tekrar dene
          </button>
        </div>
      </body>
    </html>
  );
}
