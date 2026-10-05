import Image from "next/image";
import { cn } from "@/lib/utils";
import { APP_LOGO_SRC, APP_NAME } from "@/lib/constants/brand";

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
      src={APP_LOGO_SRC}
      alt={APP_NAME}
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
