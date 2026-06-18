"use client";

import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type PredictionFeatureTagProps = HTMLAttributes<HTMLSpanElement> & {
  type: "bold" | "double" | "octopus";
  label: string;
  title?: string;
  icon?: string;
};

const styles = {
  bold: "border border-red-400/55 bg-red-950/45 text-red-100",
  double: "border border-orange-300/55 bg-orange-950/45 text-orange-100",
  octopus: "border border-cyan-300/55 bg-cyan-950/45 text-cyan-100",
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
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black tracking-tight",
        styles[type],
        className
      )}
      {...props}
    >
      {icon ? (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/20 text-current">
          {icon}
        </span>
      ) : null}
      <span className="truncate">{label}</span>
    </span>
  );
}
