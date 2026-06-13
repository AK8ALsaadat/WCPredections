"use client";

import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type PredictionFeatureTagProps = HTMLAttributes<HTMLSpanElement> & {
  type: "bold" | "double";
  label: string;
  title?: string;
  icon?: string;
};

const styles = {
  bold: "bg-gradient-to-r from-red-600/10 via-red-500/10 to-red-600/5 border border-red-400/30 text-red-100 shadow-lg shadow-red-950/15",
  double: "bg-gradient-to-r from-orange-500/10 via-orange-400/15 to-orange-500/5 border border-orange-400/30 text-orange-100 shadow-lg shadow-orange-950/15",
} as const;

export function PredictionFeatureTag({
  type,
  label,
  title,
  icon,
  className,
  ...props
}: PredictionFeatureTagProps) {
  return (
    <span
      title={title}
      className={cn(
        "relative inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold tracking-tight",
        styles[type],
        className
      )}
      {...props}
    >
      {icon ? (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-current/15 text-current">
          {icon}
        </span>
      ) : null}
      <span className="truncate">{label}</span>
    </span>
  );
}
