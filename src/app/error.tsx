"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Bir sorun oluştu</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        İşleminiz tamamlanamadı. Tekrar deneyin; sorun sürerse destek ile iletişime geçerken aşağıdaki kodu iletin.
      </p>
      {error.digest && <p className="font-mono text-xs text-muted-foreground">Hata kodu: {error.digest}</p>}
      <div className="flex gap-2">
        <Button onClick={reset}>Tekrar dene</Button>
        <Button asChild variant="outline">
          <Link href="/panel">Panele dön</Link>
        </Button>
      </div>
    </div>
  );
}
