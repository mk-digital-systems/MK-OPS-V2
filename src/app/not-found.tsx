import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Sayfa bulunamadı</h1>
      <p className="text-sm text-muted-foreground">
        Aradığınız kayıt veya sayfa mevcut değil.
      </p>
      <Button asChild>
        <Link href="/">Dashboard’a dön</Link>
      </Button>
    </div>
  );
}
