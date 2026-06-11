"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { ar } from "@/lib/i18n/ar";
import type { UserSession } from "@/types";

const navLinks = [
  { href: "/dashboard", label: ar.nav.dashboard },
  { href: "/matches", label: ar.nav.matches },
  { href: "/leaderboard/overall", label: ar.nav.leaderboard, match: "/leaderboard" },
  { href: "/profile", label: ar.nav.profile },
] as const;

function isNavActive(pathname: string, href: string, match?: string) {
  const base = match ?? href;
  return pathname === href || pathname.startsWith(`${base}/`);
}

export function Navbar({ user }: { user: UserSession }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      // انقطاع شبكة أو إضافة متصفح — نكمل الخروج محلياً
    } finally {
      router.push("/login");
      router.refresh();
      setLoggingOut(false);
    }
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-card-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-xl">⚽</span>
          <span className="font-bold text-primary">{ar.appName}</span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isNavActive(pathname, link.href, "match" in link ? link.match : undefined)
                  ? "bg-primary/20 text-primary"
                  : "text-muted hover:text-foreground"
              )}
            >
              {link.label}
            </Link>
          ))}
          {user.isAdmin && (
            <Link
              href="/admin"
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                pathname.startsWith("/admin")
                  ? "bg-warning/20 text-warning"
                  : "text-muted hover:text-foreground"
              )}
            >
              {ar.nav.admin}
            </Link>
          )}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <span className="text-sm text-muted">@{user.username}</span>
          <Button variant="ghost" size="sm" onClick={handleLogout} loading={loggingOut}>
            {ar.nav.logout}
          </Button>
        </div>

        <button
          className="rounded-lg p-2 text-muted hover:text-foreground md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="القائمة"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {mobileOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-card-border px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium",
                  isNavActive(pathname, link.href, "match" in link ? link.match : undefined)
                    ? "bg-primary/20 text-primary"
                    : "text-muted"
                )}
              >
                {link.label}
              </Link>
            ))}
            {user.isAdmin && (
              <Link href="/admin" onClick={() => setMobileOpen(false)} className="rounded-lg px-3 py-2 text-sm text-warning">
                {ar.nav.admin}
              </Link>
            )}
            <Button variant="ghost" size="sm" onClick={handleLogout} className="mt-2 justify-start">
              {ar.nav.logout}
            </Button>
          </div>
        </div>
      )}
    </nav>
  );
}
