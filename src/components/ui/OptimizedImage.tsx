import Image, { ImageProps } from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

type OptimizedImageProps = Omit<ImageProps, "src" | "alt"> & {
  src: string | null | undefined;
  alt: string;
  fallback?: string;
  blur?: boolean;
};

/**
 * مكون صورة محسّن مع lazy loading و blur placeholder
 */
export function OptimizedImage({
  src,
  alt,
  fallback,
  blur = true,
  className,
  ...props
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  
  const finalSrc = src || fallback;
  
  if (!finalSrc) {
    return (
      <div
        className={cn(
          "bg-card-border animate-pulse",
          className
        )}
      />
    );
  }
  
  return (
    <div className="relative overflow-hidden">
      <Image
        src={finalSrc}
        alt={alt}
        loading="lazy"
        quality={75} // تقليل جودة الصورة لتسريع التحميل
        onLoadingComplete={() => setIsLoading(false)}
        onError={() => setHasError(true)}
        className={cn(
          "transition-opacity duration-300",
          isLoading ? "opacity-0" : "opacity-100",
          className
        )}
        {...props}
      />
      {isLoading && (
        <div
          className={cn(
            "absolute inset-0 bg-card-border animate-pulse",
            className
          )}
        />
      )}
    </div>
  );
}
