"use client";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { Locale } from "@/lib/i18n/index";

export function LanguageToggle({ className }: { className?: string }) {
  const { locale, messages, setLocale } = useI18n();

  function select(next: Locale) {
    if (next !== locale) setLocale(next);
  }

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-lg border border-card-border bg-card/60 p-0.5 text-xs font-medium",
        className
      )}
      role="group"
      aria-label={messages.locale.label}
    >
      <button
        type="button"
        onClick={() => select("ar")}
        className={cn(
          "rounded-md px-2.5 py-1.5 transition-colors",
          locale === "ar"
            ? "bg-primary/20 text-primary"
            : "text-muted hover:text-foreground"
        )}
      >
        {messages.locale.ar}
      </button>
      <button
        type="button"
        onClick={() => select("en")}
        className={cn(
          "rounded-md px-2.5 py-1.5 transition-colors",
          locale === "en"
            ? "bg-primary/20 text-primary"
            : "text-muted hover:text-foreground"
        )}
      >
        {messages.locale.en}
      </button>
    </div>
  );
}
