"use client";

import { LanguageToggle } from "@/components/layout/LanguageToggle";

export function LocaleBar() {
  return (
    <div className="fixed right-4 top-4 z-50">
      <LanguageToggle />
    </div>
  );
}
