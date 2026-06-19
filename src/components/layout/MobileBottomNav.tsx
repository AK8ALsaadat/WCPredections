"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/LocaleProvider";

function isActive(pathname: string, href: string) {
  if (href === "/leaderboard/overall") {
    return pathname.startsWith("/leaderboard");
  }
  return pathname.startsWith(href);
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const { messages: t } = useI18n();

  const navItems = useMemo(
    () => [
      { href: "/dashboard", label: t.nav.dashboard, icon: "🏠" },
      { href: "/matches", label: t.nav.matches, icon: "⚽" },
      { href: "/fan-clash", label: "Clash", icon: "FC" },
      { href: "/leaderboard/overall", label: t.nav.leaderboard, icon: "🏆" },
      { href: "/profile", label: t.nav.profile, icon: "👤" },
    ],
    [t]
  );

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-card-border bg-background md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="grid grid-cols-5">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={cn(
                "flex flex-col items-center gap-0.5 px-1 py-2.5 text-[10px] font-medium transition-colors",
                active ? "text-primary" : "text-muted"
              )}
            >
              <span className="text-lg leading-none" aria-hidden>
                {item.icon}
              </span>
              <span className="leading-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
