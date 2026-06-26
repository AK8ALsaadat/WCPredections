"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { LocaleBar } from "@/components/layout/LocaleBar";
import { useI18n } from "@/lib/i18n/LocaleProvider";

async function completeKnockoutTutorial(): Promise<boolean> {
  try {
    const res = await fetch("/api/user/knockout-tutorial", {
      method: "POST",
      credentials: "same-origin",
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch {
    return false;
  }
}

export default function KnockoutTutorialPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const [loading, setLoading] = useState(false);
  const isArabic = locale === "ar";

  async function finish() {
    setLoading(true);
    try {
      const ok = await completeKnockoutTutorial();
      if (ok) {
        router.push("/matches");
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <LocaleBar />
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <p className="text-sm text-muted">
            {isArabic ? "بدأت الأدوار الإقصائية" : "Knockout rounds unlocked"}
          </p>
          <CardTitle>
            {isArabic ? "طريقة توقع الإقصائيات" : "Knockout prediction rules"}
          </CardTitle>
        </CardHeader>
        <div className="space-y-4">
          <div className="rounded-xl border border-card-border bg-background/40 p-4">
            <p className="font-semibold">
              {isArabic ? "وش تختار؟" : "What do you pick?"}
            </p>
            <p className="mt-2 text-sm text-muted">
              {isArabic
                ? "توقع النتيجة، ثم اختر متى تنتهي المباراة: خلال 90 دقيقة، في الأشواط الإضافية، أو بركلات الترجيح."
                : "Predict the score, then choose whether the match ends in 90 minutes, extra time, or penalties."}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-card-border p-3">
              <p className="text-lg font-bold text-primary">+1</p>
              <p className="text-xs text-muted">
                {isArabic ? "90 دقيقة" : "90 minutes"}
              </p>
            </div>
            <div className="rounded-lg border border-card-border p-3">
              <p className="text-lg font-bold text-primary">+2</p>
              <p className="text-xs text-muted">
                {isArabic ? "أشواط إضافية" : "Extra time"}
              </p>
            </div>
            <div className="rounded-lg border border-card-border p-3">
              <p className="text-lg font-bold text-primary">+4</p>
              <p className="text-xs text-muted">
                {isArabic ? "ركلات ترجيح" : "Penalties"}
              </p>
            </div>
          </div>

          <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
            {isArabic
              ? "إذا اخترت ركلات الترجيح، لازم تختار الفريق اللي يفوز بالترجيح."
              : "If you pick penalties, you also choose the team that wins the shootout."}
          </p>

          <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-3 text-sm text-primary">
            <p className="font-bold">
              {isArabic
                ? "توقع البطولة قبل أول مباراة إقصائية"
                : "Tournament pick before the first knockout match"}
            </p>
            <p className="mt-1">
              {isArabic
                ? "اختر طرفي النهائي والبطل من صفحة المباريات. كل طرف نهائي صحيح +3 نقاط، وإذا توقعت البطل صح تاخذ +10 نقاط."
                : "On the matches page, pick the two finalists and the champion. Each correct finalist is +3 points, and the correct champion is +10 points."}
            </p>
          </div>

          <Button className="w-full" onClick={finish} loading={loading}>
            {isArabic ? "فهمت، خلني أتوقع" : "Got it, show matches"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
