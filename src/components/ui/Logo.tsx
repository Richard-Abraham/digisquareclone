import Image from "next/image";
import gigiLogo from "@/assets/gigiLogo.png";
import clsx from "clsx";

interface LogoProps {
  /** Pixel size of the square logo mark. */
  size?: number;
  /** Whether to render the "Digisystem" wordmark next to the mark. */
  showWordmark?: boolean;
  className?: string;
  wordmarkClassName?: string;
}

/**
 * Brand logo mark using the uploaded gigiLogo.png. Rendered inside a rounded,
 * subtly ringed container so it reads well on any background.
 */
export function Logo({ size = 36, showWordmark = true, className, wordmarkClassName }: LogoProps) {
  return (
    <div className={clsx("flex items-center gap-3", className)}>
      <div
        className="relative flex-shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-black/5 shadow-sm dark:ring-white/10"
        style={{ width: size, height: size }}
      >
        <Image src={gigiLogo} alt="Digisystem logo" fill sizes={`${size}px`} className="object-contain p-1" priority />
      </div>
      {showWordmark && (
        <span className={clsx("font-display font-bold tracking-tight text-text-primary", wordmarkClassName)}>
          Digisystem
        </span>
      )}
    </div>
  );
}
