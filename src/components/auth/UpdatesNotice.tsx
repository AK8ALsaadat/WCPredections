"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/lib/i18n/LocaleProvider";

const NOTICE_KEY = "wc-predictions-updates-2026-06-18-v1";

export function UpdatesNotice() {
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(NOTICE_KEY) !== "seen") {
      setOpen(true);
    }
  }, []);

  if (!open) return null;

  const isAr = locale === "ar";

  function close() {
    window.localStorage.setItem(NOTICE_KEY, "seen");
    setOpen(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="updates-notice-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-primary/40 bg-card p-6 text-center shadow-2xl shadow-black/50">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-xl font-black text-primary ring-1 ring-primary/35">
          90
        </div>
        <h2 id="updates-notice-title" className="text-xl font-black text-foreground">
          {isAr ? "تحديثات" : "Updates"}
        </h2>
        <div className="mt-3 space-y-2 text-sm leading-7 text-muted">
          <p>
            {isAr
              ? "التوقعات تقفل الآن قبل بداية المباراة بساعة ونصف، والعداد يعرض وقت الإغلاق الجديد."
              : "Predictions now close 90 minutes before kickoff, and countdowns use the new deadline."}
          </p>
          <p>
            {isAr
              ? "في الأدوار الإقصائية اختر طريقة نهاية المباراة، وإذا توقعت بلنتيات اختر المنتخب الفائز بالترجيح."
              : "For knockout matches, pick how the match ends. If you choose penalties, also pick the shootout winner."}
          </p>
          <p>
            {isAr
              ? "المضاعفة والرهان يتجددون مع كل دور جديد، ولا يشتغلون مع بعض على نفس المباراة."
              : "Double points and bold bets reset each new round and cannot be used together on the same match."}
          </p>
        </div>
        <Button className="mt-6 w-full" onClick={close}>
          {isAr ? "فهمت" : "Got it"}
        </Button>
      </div>
    </div>
  );
}
