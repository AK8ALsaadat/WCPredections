import Link from "next/link";
import type { ReactNode } from "react";

type LeaderboardSplitSectionProps = {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  href?: string;
  linkLabel?: string;
  children: ReactNode;
};

export function LeaderboardSplitSection({
  title,
  description,
  meta,
  href,
  linkLabel,
  children,
}: LeaderboardSplitSectionProps) {
  return (
    <section className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
      {/* الجوال: الترتيب أولاً */}
      <div className="order-1 lg:order-2">{children}</div>

      {/* الجوال: النص تحت — الشاشات الكبيرة: يمين */}
      <div className="order-2 flex flex-col justify-center text-right lg:order-1">
        <div>{title}</div>
        {description && (
          <p className="mt-2 text-sm text-muted">{description}</p>
        )}
        {meta && <div className="mt-2 text-sm text-muted">{meta}</div>}
        {href && linkLabel && (
          <Link
            href={href}
            className="mt-3 inline-block text-sm text-primary hover:underline"
          >
            {linkLabel} ←
          </Link>
        )}
      </div>
    </section>
  );
}
