"use client";

import Link from "next/link";
import type { ReactNode } from "react";
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
  const warmPrediction = () => {
    void prefetchPredictData(matchId, { urgent: true, includeLineup: true });
  };

  return (
    <Link
      href={`/predict/${matchId}`}
      className={className}
      onFocus={warmPrediction}
      onPointerDown={warmPrediction}
      onPointerEnter={warmPrediction}
      onTouchStart={warmPrediction}
    >
      {children}
    </Link>
  );
}
