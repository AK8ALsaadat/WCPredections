import Image, { ImageProps } from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

type OptimizedImageProps = Omit<ImageProps, "src" | "alt"> & {
  src: string | null | undefined;
  alt: string;
  fallback?: string;
  onErrorFallback?: () => void;
};

/**
 * مكون صورة محسّن مع lazy loading و blur placeholder
 */
export function OptimizedImage({
  src,
  alt,
  fallback,
  className,
  onErrorFallback,
  ...props
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const effectiveSrc = hasError ? fallback ?? null : src || fallback;

  if (!effectiveSrc) {
    return (
      <div
        className={cn(
          "bg-card-border animate-pulse",
          className
        )}
      />
    );
  }
  const isSvg =
    typeof effectiveSrc === "string" &&
    (effectiveSrc.includes("/api/player-avatar") || /\.svg($|\?)/i.test(effectiveSrc));

  function stripProps(p: Omit<ImageProps, "src" | "alt"> | null | undefined) {
    const rest = { ...(p ?? {}) } as Record<string, unknown>;
    delete rest.unoptimized;
    delete rest.placeholder;
    delete rest.priority;
    delete rest.sizes;
    return rest as React.ComponentPropsWithoutRef<"img">;
  }

  if (isSvg) {
    return (
      <div className="relative overflow-hidden">
        <img
          src={effectiveSrc ?? undefined}
          alt={alt}
          loading="lazy"
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setHasError(true);
            if (onErrorFallback) onErrorFallback();
          }}
          className={cn(
            "transition-opacity duration-300",
            isLoading ? "opacity-0" : "opacity-100",
            className
          )}
          {...stripProps(props)}
        />
        {isLoading && (
          <div className={cn("absolute inset-0 bg-card-border animate-pulse", className)} />
        )}
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden">
      <Image
        src={effectiveSrc!}
        alt={alt}
        loading="lazy"
        quality={75}
        onLoadingComplete={() => setIsLoading(false)}
        onError={() => {
          if (!hasError && fallback) {
            setHasError(true);
            setIsLoading(true);
            if (onErrorFallback) onErrorFallback();
            return;
          }
          setHasError(true);
          if (onErrorFallback) onErrorFallback();
        }}
        className={cn(
          "transition-opacity duration-300",
          isLoading ? "opacity-0" : "opacity-100",
          className
        )}
        {...props}
      />
      {isLoading && (
        <div className={cn("absolute inset-0 bg-card-border animate-pulse", className)} />
      )}
    </div>
  );
}
