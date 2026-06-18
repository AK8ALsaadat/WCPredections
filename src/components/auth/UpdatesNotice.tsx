"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

const NOTICE_KEY = "wc-predictions-updates-2026-06-18-v7-octopus-mascot-ar";

const OCTOPUS_SAVE_TIERS = [
  { saves: 3, points: 1 },
  { saves: 5, points: 3 },
  { saves: 7, points: 5 },
  { saves: 10, points: 8 },
];

export function UpdatesNotice() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(NOTICE_KEY) !== "seen") {
      setOpen(true);
    }
  }, []);

  if (!open) return null;

  function close() {
    window.localStorage.setItem(NOTICE_KEY, "seen");
    setOpen(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="updates-notice-title"
      dir="rtl"
    >
      <div className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-cyan-300/45 bg-card p-6 text-center shadow-2xl shadow-black/50">
        <div className="pointer-events-none absolute inset-x-8 -top-24 h-32 rounded-full bg-cyan-400/20 blur-3xl" />

        <div className="relative mx-auto mb-4 h-20 w-20 overflow-hidden rounded-2xl border border-cyan-200/45 bg-cyan-400/15 shadow-[0_0_28px_rgba(34,211,238,0.22)] ring-1 ring-cyan-100/25">
          <Image
            src="/octopus/octopus-mascot.png"
            alt="الأخطبوط"
            fill
            priority
            sizes="80px"
            className="object-cover"
          />
        </div>

        <h2 id="updates-notice-title" className="relative text-xl font-black">
          تحديث الأخطبوط
        </h2>

        <p className="relative mt-2 text-sm leading-7 text-muted">
          اختر أخطبوطك في المباراة. نقاطه تعتمد على التصديات الرسمية، ومع
          الكلين شيت يأخذ بونص إضافي واضح.
        </p>

        <div className="relative mt-4 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-start">
          <p className="text-sm font-bold text-primary">
            الكلين شيت يعطي +3
          </p>
          <p className="mt-1 text-sm leading-7 text-foreground">
            إذا انتهت المباراة ومنتخب أخطبوطك ما استقبل أي هدف، تنضاف له +3
            نقاط فوق نقاط التصديات.
          </p>
        </div>

        <div className="relative mt-4 grid grid-cols-4 gap-2 text-center">
          {OCTOPUS_SAVE_TIERS.map((item) => (
            <div
              key={item.saves}
              className="rounded-xl border border-cyan-300/25 bg-cyan-400/10 px-2 py-2"
            >
              <p className="text-lg font-black tabular-nums text-cyan-100">
                {item.saves}
              </p>
              <p className="text-[10px] text-muted">تصديات</p>
              <p className="mt-1 text-xs font-bold text-primary">
                +{item.points}
              </p>
            </div>
          ))}
        </div>

        <div className="relative mt-4 rounded-xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-start text-sm leading-7 text-muted">
          <p>
            إذا استقبل منتخب أخطبوطك أهداف، يقل سقف نقاط التصديات: هدف واحد
            يلغي مستوى 10 تصديات، هدفين يلغي مستوى 7 تصديات، و3 أهداف أو أكثر
            يلغي مستوى 5 تصديات.
          </p>
        </div>

        <p className="relative mt-4 text-xs leading-6 text-muted">
          التصدي لبلنتي أثناء المباراة يدخل في حساب الأخطبوط. ركلات الترجيح
          بعد نهاية المباراة ما تدخل في الحساب.
        </p>

        <Button className="mt-6 w-full" onClick={close}>
          فهمت
        </Button>
      </div>
    </div>
  );
}
