"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
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
  useEffect(() => {
    prefetchPredictData(matchId);
  }, [matchId]);

  return (
    <Link
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
