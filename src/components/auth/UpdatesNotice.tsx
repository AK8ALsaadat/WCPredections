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

        <p className="relative text-sm leading-7 text-muted">
          السلام عليكم جميعًا،
        </p>
        <p className="mt-3 text-sm leading-7 text-muted">
          بما أن أساسنا هو الديمقراطية واحترام رأي الأغلبية، تم طرح موضوع ديدلاين التوقعات وقت المباراة للتصويت، وبعد جمع الآراء وصلنا إلى القرار النهائي بناءً على نتيجة التصويت:
        </p>
        <p className="mt-4 text-sm font-black leading-7 text-amber-100">
          سيكون الديدلاين قبل بداية المباراة بـ 10 دقائق.
        </p>
        <p className="mt-2 text-sm font-black leading-7 text-amber-100">
          #صوتكم_يفرق
        </p>

        <Button className="mt-6 w-full" onClick={close}>
          فهمت
        </Button>
      </div>
    </div>
  );
}
