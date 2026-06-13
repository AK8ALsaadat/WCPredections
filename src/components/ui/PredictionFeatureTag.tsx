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
  bold: "border border-red-400/60 bg-gradient-to-r from-red-950/90 via-red-700/70 to-rose-600/55 text-red-50 shadow-lg shadow-red-950/40 ring-1 ring-inset ring-red-300/15",
  double: "border border-orange-300/65 bg-gradient-to-r from-amber-950/90 via-orange-600/75 to-amber-400/55 text-orange-50 shadow-lg shadow-orange-950/40 ring-1 ring-inset ring-amber-200/20",
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
        "relative inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black tracking-tight",
        styles[type],
        className
      )}
      {...props}
    >
      {icon ? (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/20 text-current ring-1 ring-white/20">
          {icon}
        </span>
      ) : null}
      <span className="truncate">{label}</span>
    </span>
  );
}
