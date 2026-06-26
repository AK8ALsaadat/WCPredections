"use client";

import { SWRConfig } from "swr";
import { PointsAdjustmentNotice } from "@/components/auth/PointsAdjustmentNotice";
import { UpdatesNotice } from "@/components/auth/UpdatesNotice";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import type { Locale } from "@/lib/i18n/index";

export function ClientProviders({ children, initialLocale }: { children: React.ReactNode; initialLocale: Locale; }) {
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
        <UpdatesNotice />
        <PointsAdjustmentNotice />
      </LocaleProvider>
    </SWRConfig>
  );
}

export default ClientProviders;
