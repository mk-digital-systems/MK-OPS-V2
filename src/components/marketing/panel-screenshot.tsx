import Image from "next/image";

export function PanelScreenshot({
  src,
  alt,
  caption,
  priority = false,
}: {
  src: string;
  alt: string;
  caption?: string;
  priority?: boolean;
}) {
  return (
    <figure>
      <div className="overflow-hidden rounded-2xl border bg-white shadow-[0_24px_70px_-35px_rgba(15,23,42,.45)]">
        <div className="flex items-center gap-1.5 border-b bg-slate-50 px-4 py-3" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="ml-3 text-[11px] font-medium text-slate-400">MK OPS paneli</span>
        </div>
        <Image
          src={src}
          alt={alt}
          width={1600}
          height={1000}
          priority={priority}
          sizes="(max-width: 768px) 100vw, 720px"
          className="h-auto w-full"
        />
      </div>
      {caption ? <figcaption className="mt-3 text-center text-sm text-muted-foreground">{caption}</figcaption> : null}
    </figure>
  );
}
