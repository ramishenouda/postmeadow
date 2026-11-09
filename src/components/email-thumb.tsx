import { cn } from "@/lib/utils";

/**
 * A live, scaled-down email: an iframe of a /previews/… page, sized at 1/scale of the
 * box and shrunk back down, so it always fills the box's width. Decorative and inert:
 * the surrounding card carries the name and the action.
 */
export function EmailThumb({
  src,
  title,
  className,
  scale = 0.5,
}: {
  src: string;
  title: string;
  className?: string;
  scale?: number;
}) {
  const size = `${100 / scale}%`;
  return (
    <div className={cn("relative overflow-hidden bg-stone-100", className)} aria-hidden>
      <iframe
        src={src}
        title={title}
        loading="lazy"
        tabIndex={-1}
        className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
        style={{ width: size, height: size, transform: `scale(${scale})` }}
      />
    </div>
  );
}
