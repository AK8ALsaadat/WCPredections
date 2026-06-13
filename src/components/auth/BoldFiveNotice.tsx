"use client";

import { Button } from "@/components/ui/Button";
import { useI18n } from "@/lib/i18n/LocaleProvider";

export function BoldFiveNotice({
  open,
  onContinue,
}: {
  open: boolean;
  onContinue: () => void;
}) {
  const { messages: t } = useI18n();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bold-five-notice-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-amber-400/50 bg-card p-6 text-center shadow-2xl shadow-black/50">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/20 text-2xl text-amber-300 ring-1 ring-amber-400/40">
          +5
        </div>
        <h2
          id="bold-five-notice-title"
          className="text-xl font-black text-foreground"
        >
          {t.auth.boldFiveNoticeTitle}
        </h2>
        <p className="mt-3 text-sm leading-7 text-muted">
          {t.auth.boldFiveNoticeBody}
        </p>
        <p className="mt-2 text-xs text-muted">
          {t.auth.boldFiveNoticeRound}
        </p>
        <Button className="mt-6 w-full" onClick={onContinue}>
          {t.auth.boldFiveNoticeContinue}
        </Button>
      </div>
    </div>
  );
}
