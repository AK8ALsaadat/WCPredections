"use client";

import Image from "next/image";
import { useI18n } from "@/lib/i18n/LocaleProvider";

export function GoldenSponsorBanner() {
  const { messages: t } = useI18n();

  return (
    <div className="mb-8 overflow-hidden rounded-2xl border border-warning/30 bg-gradient-to-br from-warning/15 via-card to-card shadow-lg shadow-warning/10">
      <div className="flex flex-col items-center gap-4 px-6 py-5 text-center">
        <p className="text-sm font-bold text-warning">{t.worldCup}</p>
      </div>

      <div className="flex flex-col items-center gap-5 px-6 pb-6 sm:flex-row sm:justify-center sm:gap-8">
        <div className="relative shrink-0">
          <div className="absolute -inset-2 rounded-2xl bg-warning/30 blur-md" />
          <div className="relative h-72 w-44 overflow-hidden rounded-2xl border-4 border-warning shadow-2xl sm:h-80 sm:w-48">
            <Image
              src="/sponsor/golden-sponsor.png"
              alt={t.sponsor.title}
              fill
              className="object-cover object-[center_46%]"
              priority
            />
          </div>
        </div>

        <div className="text-center">
          <p className="text-xs tracking-widest text-warning/80">
            {t.sponsor.partner}
          </p>
          <h2 className="mt-1 text-2xl font-bold text-warning">
            {t.sponsor.title}
          </h2>
          <p className="mt-2 text-sm text-muted">{t.appName}</p>
        </div>
      </div>
    </div>
  );
}
