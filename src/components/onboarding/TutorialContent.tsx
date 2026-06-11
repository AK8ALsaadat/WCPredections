"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LocaleBar } from "@/components/layout/LocaleBar";
import { useI18n } from "@/lib/i18n/LocaleProvider";

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
  const { messages } = useI18n();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const t = messages.tutorial;
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

  return (
    <>
      <LocaleBar />
      <Card className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <p className="text-sm text-muted">{t.stepOf(step + 1, total)}</p>
          <h1 className="mt-2 text-2xl font-bold">{t.title}</h1>
          <p className="mt-1 text-sm text-muted">{t.subtitle}</p>
        </div>

        <div className="rounded-xl border border-card-border bg-background/40 p-5 text-center">
          <span className="text-4xl" aria-hidden>
            {current.icon}
          </span>
          <h2 className="mt-3 text-lg font-semibold">{current.title}</h2>
          <p className="mt-2 text-sm text-muted">{current.body}</p>
          <p className="mt-3 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
            {current.example}
          </p>
          {current.points && (
            <p className="mt-2 text-sm font-bold text-warning">{current.points}</p>
          )}
          {current.note && (
            <p className="mt-3 text-xs text-muted">{current.note}</p>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            {t.back}
          </Button>

          <div className="flex gap-1">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-2 w-2 rounded-full ${
                  i === step ? "bg-primary" : "bg-card-border"
                }`}
              />
            ))}
          </div>

          {isLast ? (
            <Button size="sm" onClick={finish} loading={loading}>
              {t.start}
            </Button>
          ) : (
            <Button size="sm" onClick={() => setStep((s) => s + 1)}>
              {t.next}
            </Button>
          )}
        </div>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={finish}
            disabled={loading}
            className="text-xs text-muted hover:text-foreground"
          >
            {t.skip}
          </button>
        </div>
      </Card>
    </>
  );
}
