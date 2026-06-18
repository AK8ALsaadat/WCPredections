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
  return (
    <Link
      href={`/predict/${matchId}`}
      prefetch
      className={className}
      onMouseEnter={() =>
        prefetchPredictData(matchId, { urgent: true, includeLineup: true })
      }
      onFocus={() =>
        prefetchPredictData(matchId, { urgent: true, includeLineup: true })
      }
      onTouchStart={() =>
        prefetchPredictData(matchId, { urgent: true, includeLineup: true })
      }
    >
      {children}
    </Link>
  );
}
