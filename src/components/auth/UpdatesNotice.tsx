"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/lib/i18n/LocaleProvider";

const NOTICE_KEY = "wc-predictions-updates-2026-06-18-v5-octopus-clean-sheet";

const OCTOPUS_POINTS = [
  { saves: 0, points: 3, bonus: true },
  { saves: 3, points: 1 },
  { saves: 5, points: 3 },
  { saves: 7, points: 5 },
  { saves: 10, points: 8 },
];

const OCTOPUS_CAPS = [
  {
    goals: 1,
    ar: "هدف على منتخب الحارس: تروح فرصة سقف 10 تصديات",
    en: "1 goal conceded: the 10-save tier is gone",
  },
  {
    goals: 2,
    ar: "هدفين على منتخب الحارس: تروح فرصة سقف 7 تصديات",
    en: "2 goals conceded: the 7-save tier is gone",
  },
  {
    goals: 3,
    ar: "3 أهداف فأكثر: تروح فرصة سقف 5 تصديات",
    en: "3+ goals conceded: the 5-save tier is gone",
  },
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
      <div className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-cyan-300/45 bg-card p-6 text-center shadow-2xl shadow-black/50">
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

        <div className="relative mt-4 grid grid-cols-5 gap-2 text-center">
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

        <div className="relative mt-3 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-start">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">
            {isAr ? "وقت إغلاق التوقع" : "Prediction deadline"}
          </p>
          <p className="mt-1 text-sm leading-6 text-foreground">
            {isAr
              ? "كل التوقعات والميزات تقفل قبل بداية المباراة بساعة ونصف، ويظهر نفس الوقت في عدّاد الإغلاق."
              : "Predictions and feature cards close 90 minutes before kickoff, and the countdown shows that same deadline."}
          </p>
        </div>

        <div className="relative mt-3 rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-3 text-start">
          <p className="text-xs font-bold uppercase tracking-wide text-cyan-100">
            New Octopus bonus
          </p>
          <p className="mt-1 text-sm leading-6 text-foreground">
            Clean sheet bonus: goalkeeper gets +3 if his team concedes 0 goals.
          </p>
        </div>

        <div
          className="relative mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3"
          dir={isAr ? "rtl" : "ltr"}
        >
          {OCTOPUS_CAPS.map((item) => (
            <div
              key={item.goals}
              className="rounded-xl border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-start"
            >
              <p className="text-base font-black tabular-nums text-amber-100">
                {item.goals}
                {item.goals === 3 ? "+" : ""}
              </p>
              <p className="text-[11px] leading-5 text-muted">
                {isAr ? item.ar : item.en}
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
              : "Points use official source saves only: 3 saves +1, 5 +3, 7 +5, 10 +8, plus +3 for a clean sheet."}
          </p>
          <p>
            {isAr
              ? "بعدها يطبق سقف أهداف منتخب الحارس: إذا استقبل هدفًا يروح سقف 10 تصديات (+8)، هدفين يروح سقف 7 تصديات (+5)، و3 أهداف فأكثر يروح سقف 5 تصديات (+3). النقاط النهائية تكون الأقل بين نقاط التصديات والسقف."
              : "Then the goalkeeper's team goals-conceded cap applies: 1 conceded removes the 10-save tier (+8), 2 removes the 7-save tier (+5), and 3+ removes the 5-save tier (+3). Final points are the lower of saves points and that cap."}
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
