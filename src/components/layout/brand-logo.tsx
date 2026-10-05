import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  size?: number;
  priority?: boolean;
};

export function BrandLogo({
  className,
  size = 40,
  priority = false,
}: BrandLogoProps) {
  return (
    <Image
      src="/images/logo-azg.jpeg"
      alt="AZG İLETİŞİM ŞANTİYE"
      width={size}
      height={size}
      priority={priority}
      className={cn(
        "rounded-2xl object-contain bg-white ring-1 ring-border/60",
        className
      )}
    />
  );
}
