"use client";

import Link from "next/link";
import {
  type MouseEventHandler,
  type ReactNode,
} from "react";
import { prefetchLeaguePredictions } from "@/lib/league-predictions-prefetch";

type LeaguePredictionsNavLinkProps = {
  matchId: string;
  children: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

export function LeaguePredictionsNavLink({
  matchId,
  children,
  className,
  onClick,
}: LeaguePredictionsNavLinkProps) {
  return (
    <Link
      href={`/matches/${matchId}/predictions`}
      prefetch={false}
      className={className}
      onClick={onClick}
      onMouseEnter={() =>
        void prefetchLeaguePredictions(matchId, { urgent: true })
      }
      onFocus={() =>
        void prefetchLeaguePredictions(matchId, { urgent: true })
      }
    >
      {children}
    </Link>
  );
}
