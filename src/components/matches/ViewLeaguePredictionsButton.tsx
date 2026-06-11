"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { useI18n } from "@/lib/i18n/LocaleProvider";

type ViewLeaguePredictionsButtonProps = {
  matchId: string;
  fullWidth?: boolean;
  onClick?: (e: MouseEvent) => void;
};

export function ViewLeaguePredictionsButton({
  matchId,
  fullWidth = false,
  onClick,
}: ViewLeaguePredictionsButtonProps) {
  const { messages: t } = useI18n();

  return (
    <Link
      href={`/matches/${matchId}/predictions`}
      onClick={onClick}
      className={`group relative overflow-hidden rounded-xl border border-primary/35 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent px-4 py-3 transition-all hover:border-primary/60 hover:from-primary/30 hover:shadow-[0_0_24px_rgba(34,197,94,0.15)] ${
        fullWidth ? "flex w-full items-center gap-3" : "inline-flex items-center gap-2.5"
      }`}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-lg ring-1 ring-primary/30 transition-transform group-hover:scale-105"
        aria-hidden
      >
        👥
      </span>
      <span className={fullWidth ? "min-w-0 flex-1 text-start" : ""}>
        <span className="block text-sm font-bold text-foreground">
          {t.matches.viewAllPredictionsTitle}
        </span>
        <span className="mt-0.5 block text-xs text-muted group-hover:text-foreground/80">
          {t.matches.viewAllPredictionsHint}
        </span>
      </span>
      <span
        className={`shrink-0 text-primary transition-transform group-hover:translate-x-0.5 ${
          fullWidth ? "ms-auto" : ""
        }`}
        aria-hidden
      >
        →
      </span>
    </Link>
  );
}
