"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
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
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const link = linkRef.current;
    if (!link || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        void prefetchLeaguePredictions(matchId);
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
      href={`/matches/${matchId}/predictions`}
      prefetch
      className={className}
      onClick={onClick}
      onMouseEnter={() =>
        void prefetchLeaguePredictions(matchId, { urgent: true })
      }
      onFocus={() =>
        void prefetchLeaguePredictions(matchId, { urgent: true })
      }
      onTouchStart={() =>
        void prefetchLeaguePredictions(matchId, { urgent: true })
      }
    >
      {children}
    </Link>
  );
}
