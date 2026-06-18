"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/lib/i18n/LocaleProvider";

const NOTICE_KEY = "wc-predictions-updates-2026-06-18-v2-octopus";

const OCTOPUS_POINTS = [
  { saves: 3, points: 1 },
  { saves: 5, points: 3 },
  { saves: 7, points: 5 },
  { saves: 10, points: 8 },
];

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="updates-notice-title"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-cyan-300/45 bg-card p-6 text-center shadow-2xl shadow-black/50">
        <div className="pointer-events-none absolute inset-x-8 -top-24 h-32 rounded-full bg-cyan-400/20 blur-3xl" />

        <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-200/45 bg-cyan-400/15 text-lg font-black text-cyan-100 shadow-[0_0_28px_rgba(34,211,238,0.22)] ring-1 ring-cyan-100/25">
          GK
        </div>

        <h2
          id="updates-notice-title"
          className="relative text-xl font-black text-foreground"
        >
          {isAr ? "تحديثات: بطاقة الأخطبوط" : "Updates: Octopus card"}
        </h2>

        <div className="relative mt-4 grid grid-cols-4 gap-2 text-center">
          {OCTOPUS_POINTS.map((item) => (
            <div
              key={item.saves}
              className="rounded-xl border border-cyan-300/25 bg-cyan-400/10 px-2 py-2"
            >
              <p className="text-lg font-black tabular-nums text-cyan-100">
                {item.saves}
              </p>
              <p className="text-[10px] text-muted">
                {isAr ? "تصديات" : "saves"}
              </p>
              <p className="mt-1 text-xs font-bold text-primary">
                +{item.points}
              </p>
            </div>
          ))}
        </div>

        <div className="relative mt-4 space-y-2 text-sm leading-7 text-muted">
          <p>
            {isAr
              ? "الأخطبوط ميزة جديدة للحراس: تستخدمها مرة واحدة في كل جولة وتختار حارساً واحداً من حراس المنتخبين."
              : "Octopus is a new goalkeeper feature: use it once per round and pick one goalkeeper from either team."}
          </p>
          <p>
            {isAr
              ? "النقاط من تصديات المصدر الرسمي فقط: 3 تصديات +1، 5 +3، 7 +5، 10 +8."
              : "Points use official source saves only: 3 saves +1, 5 +3, 7 +5, 10 +8."}
          </p>
          <p>
            {isAr
              ? "البلنتي العادي أثناء المباراة إذا تصدى له الحارس يحسب ضمن التصديات، لكن ركلات الترجيح بعد نهاية المباراة ما تدخل في حساب الأخطبوط."
              : "A normal in-match penalty save counts if the keeper saves it, but shootout saves after the match do not count for Octopus."}
          </p>
          <p>
            {isAr
              ? "التوقعات تقفل قبل المباراة بساعة ونصف. المضاعفة والرهان والأخطبوط تتجدد مع كل جولة، ولا تجتمع على نفس المباراة."
              : "Predictions close 90 minutes before kickoff. Double, bold bet, and Octopus reset each round and cannot stack on the same match."}
          </p>
        </div>

        <Button className="mt-6 w-full" onClick={close}>
          {isAr ? "فهمت" : "Got it"}
        </Button>
      </div>
    </div>
  );
}
