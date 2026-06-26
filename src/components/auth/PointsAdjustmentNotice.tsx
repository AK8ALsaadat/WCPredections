"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";

type Notice = {
  id: string;
  title: string;
  message: string;
  matchId: string;
  points: number;
  source: string;
};

const STORAGE_PREFIX = "wc-predictions-points-adjustment:";

export function PointsAdjustmentNotice() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadNotices() {
      try {
        const res = await fetch("/api/points-adjustment-notices", {
          cache: "no-store",
          credentials: "include",
        });
        if (!res.ok) return;

        const payload = await res.json();
        if (!payload?.success || !Array.isArray(payload.data)) return;

        const unseen = payload.data.filter((notice: Notice) => {
          return (
            notice?.id &&
            window.localStorage.getItem(STORAGE_PREFIX + notice.id) !== "seen"
          );
        });

        if (!cancelled) setNotices(unseen);
      } catch {
        // Silent by design: this notice should never interrupt normal app usage.
      }
    }

    loadNotices();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeNotice = useMemo(
    () => notices[activeIndex] ?? null,
    [activeIndex, notices]
  );

  if (!activeNotice) return null;

  function close() {
    window.localStorage.setItem(STORAGE_PREFIX + activeNotice.id, "seen");
    setNotices((current) =>
      current.filter((notice) => notice.id !== activeNotice.id)
    );
    setActiveIndex(0);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="points-adjustment-notice-title"
      dir="rtl"
    >
      <div className="w-full max-w-md rounded-2xl border border-emerald-300/40 bg-card p-5 text-center shadow-2xl shadow-black/50">
        <h2
          id="points-adjustment-notice-title"
          className="text-lg font-black text-emerald-200"
        >
          {activeNotice.title}
        </h2>
        <p className="mt-3 text-sm leading-7 text-muted">
          {activeNotice.message}
        </p>
        <a
          href={`/matches/${activeNotice.matchId}`}
          className="mt-4 inline-flex text-sm font-bold text-primary hover:underline"
        >
          عرض كارد المباراة
        </a>
        <Button className="mt-5 w-full" onClick={close}>
          تم
        </Button>
      </div>
    </div>
  );
}
