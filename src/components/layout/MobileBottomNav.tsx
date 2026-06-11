"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ar } from "@/lib/i18n/ar";

const navItems = [
  { href: "/dashboard", label: ar.nav.dashboard, icon: "🏠" },
  { href: "/matches", label: ar.nav.matches, icon: "⚽" },
  { href: "/leaderboard/overall", label: ar.nav.leaderboard, icon: "🏆" },
  { href: "/profile", label: ar.nav.profile, icon: "👤" },
];

function isActive(pathname: string, href: string) {
  if (href === "/leaderboard/overall") {
    return pathname.startsWith("/leaderboard");
  }
  return pathname.startsWith(href);
}

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-card-border bg-background/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="grid grid-cols-4">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
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
