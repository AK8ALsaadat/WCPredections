"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ar } from "@/lib/i18n/ar";

async function completeTutorial(): Promise<boolean> {
  try {
    const res = await fetch("/api/user/tutorial", {
      method: "POST",
      credentials: "same-origin",
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch {
    return false;
  }
}

export function TutorialContent() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const t = ar.tutorial;
  const steps = t.steps;
  const total = steps.length;
  const current = steps[step];
  const isLast = step === total - 1;

  async function finish() {
    setLoading(true);
    try {
      const ok = await completeTutorial();
      if (ok) {
        router.push("/dashboard");
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  function goNext() {
    if (isLast) {
      void finish();
    } else {
      setStep((s) => s + 1);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-5">
      <div className="text-center">
        <p className="text-xs text-muted">{t.stepOf(step + 1, total)}</p>
        <h1 className="mt-2 text-xl font-bold">{t.title}</h1>
        {step === 0 && (
          <p className="mt-1 text-sm text-muted">{t.subtitle}</p>
        )}
      </div>

      <div className="flex justify-center gap-1.5">
        {steps.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === step
                ? "w-6 bg-primary"
                : i < step
                  ? "w-1.5 bg-primary/50"
                  : "w-1.5 bg-card-border"
            }`}
          />
        ))}
      </div>

      <Card className="border-primary/20 p-5">
        <div className="text-center">
          <span className="text-4xl" aria-hidden>
            {current.icon}
          </span>
          <h2 className="mt-3 text-lg font-bold">{current.title}</h2>
        </div>

        <p className="mt-4 text-right text-sm leading-relaxed">
          {current.body}
        </p>

        <div className="mt-4 rounded-xl border border-card-border bg-background/50 p-3 text-right">
          <p className="text-xs text-muted">مثال</p>
          <p className="mt-1 text-sm">{current.example}</p>
        </div>

        {current.points && (
          <div className="mt-4 flex items-center justify-between rounded-xl bg-primary/10 px-4 py-3">
            <span className="text-xl font-bold tabular-nums text-primary">
              {current.points}
            </span>
            <span className="text-sm font-medium">النقاط</span>
          </div>
        )}

        <p className="mt-4 text-right text-xs leading-relaxed text-muted">
          {current.note}
        </p>
      </Card>

      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          {step > 0 && (
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setStep((s) => s - 1)}
              disabled={loading}
            >
              {t.back}
            </Button>
          )}
          <Button
            className="flex-1"
            onClick={goNext}
            loading={loading}
          >
            {isLast ? t.start : t.next}
          </Button>
        </div>

        <Button variant="ghost" onClick={finish} loading={loading}>
          {t.skip}
        </Button>
      </div>
    </div>
  );
}
