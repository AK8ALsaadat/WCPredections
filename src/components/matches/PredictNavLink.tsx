"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { prefetchPredictData } from "@/lib/predict-prefetch";

type PredictNavLinkProps = {
  matchId: string;
  children: ReactNode;
  className?: string;
};

export function PredictNavLink({
  matchId,
  children,
  className,
}: PredictNavLinkProps) {
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const link = linkRef.current;
    if (!link || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        void prefetchPredictData(matchId);
        observer.disconnect();
      },
      { rootMargin: "240px 0px" }
    );
    observer.observe(link);
    return () => observer.disconnect();
  }, [matchId]);

  return (
    <Link
      ref={linkRef}
      href={`/predict/${matchId}`}
      prefetch
      className={className}
      onMouseEnter={() => prefetchPredictData(matchId)}
      onFocus={() => prefetchPredictData(matchId)}
      onTouchStart={() => prefetchPredictData(matchId)}
    >
      {children}
    </Link>
  );
}
