"use client";

import { useEffect, useState } from "react";
import { SWRConfig } from "swr";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import type { Locale } from "@/lib/i18n/index";

export function ClientProviders({ children, initialLocale }: { children: React.ReactNode; initialLocale: Locale; }) {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => setShowSplash(false), 350);
    return () => clearTimeout(id);
  }, []);

  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        revalidateIfStale: false,
        shouldRetryOnError: false,
        dedupingInterval: 60_000,
        errorRetryCount: 0,
      }}
    >
      <LocaleProvider initialLocale={initialLocale}>
        {children}

        {showSplash && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-t-primary border-card" />
              <div className="text-sm text-muted">جاري تحميل الموقع…</div>
            </div>
          </div>
        )}
      </LocaleProvider>
    </SWRConfig>
  );
}

export default ClientProviders;
