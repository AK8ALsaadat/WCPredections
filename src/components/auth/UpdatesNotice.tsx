"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

const NOTICE_KEY = "wc-predictions-updates-2026-06-21-deadline-10min";

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

        <h2 id="updates-notice-title" className="relative text-xl font-black">
          تحديث
        </h2>

        <p className="relative mt-2 text-sm leading-7 text-muted">
          نتيجة التصويت صارت نهائية: الديدلاين يبقى قبل بداية المباراة بـ 10 دقائق.
          يعني إذا المباراة تبدأ الساعة 9:00، يغلق التوقع الساعة 8:50.
        </p>

        <div className="relative mt-4 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-start">
          <p className="text-sm font-bold text-primary">
            صوتكم يفرق
          </p>
          <p className="mt-1 text-sm leading-7 text-foreground">
            من الآن، التوقع يظل مفتوح حتى 10 دقائق قبل انطلاق المباراة.
            دخّل وعلّم أصحابك بالقرار الجديد.
          </p>
        </div>

        <div className="relative mt-4 rounded-xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-start text-sm leading-7 text-muted">
          <p>
            الديدلاين صار أقرب للمباراة، فخلك مستعد قبل 10 دقائق من الوقت.
            إذا حاب تغير توقعك، سويها قبل أن يغلق.
          </p>
        </div>

        <Button className="mt-6 w-full" onClick={close}>
          فهمت
        </Button>
      </div>
    </div>
  );
}
