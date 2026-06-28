"use client";

import Link from "next/link";

export function KnockoutBracketPredictionCard() {
  return (
    <section className="rounded-lg border border-primary/30 bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-end">
          <p className="text-xs font-black uppercase tracking-wider text-primary">
            Knockout bracket
          </p>
          <h2 className="mt-1 text-lg font-black text-foreground">
            توقع مسار البطل كامل
          </h2>
          <p className="mt-1 text-sm text-muted">
            اختر المتأهل من كل مباراة من دور الـ32 حتى النهائي، وله ليدربورد مستقل.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Link
            href="/leaderboard/knockout"
            className="inline-flex items-center justify-center rounded-lg border border-card-border px-4 py-2 text-sm font-bold text-foreground transition hover:border-primary/50"
          >
            ليدربورد المسار
          </Link>
          <Link
            href="/knockout-bracket"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white transition hover:bg-primary-hover"
          >
            افتح الـBracket
          </Link>
        </div>
      </div>
    </section>
  );
}
