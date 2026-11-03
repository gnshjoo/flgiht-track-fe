"use client";

import { useEffect, useState } from "react";
import type { Feed } from "@/lib/types";
import { PLANE_PATH } from "@/lib/plane";

interface Props {
  feed: Extract<Feed, { status: "waking" | "down" }>;
  onRetry: () => void;
}

const SLOW_AFTER_S = 4;

export default function FirstLoadOverlay({ feed, onRetry }: Props) {
  const startedAt = feed.status === "waking" ? feed.startedAt : null;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (startedAt === null) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return (
    <div className="absolute inset-0 z-[950] flex items-center justify-center bg-black/60 px-4">
      <div
        role={feed.status === "down" ? "alert" : "status"}
        className="w-full max-w-sm rounded-2xl border border-black/10 dark:border-white/10 bg-white/95 dark:bg-[#161920]/95 backdrop-blur-xl px-6 py-7 text-center shadow-2xl"
      >
        <div className={`mx-auto h-10 w-10 text-fr24-yellow ${feed.status === "waking" ? "animate-pulse" : ""}`}>
          <svg viewBox="0 0 32 32" fill="currentColor">
            <path d={PLANE_PATH} />
          </svg>
        </div>
        {feed.status === "waking" ? (
          <>
            <p className="mt-4 text-[15px] font-semibold text-slate-900 dark:text-slate-100">
              Connecting to live flight data…
            </p>
            {elapsed >= SLOW_AFTER_S && (
              <>
                <p className="mt-2 text-[13px] text-slate-500 dark:text-slate-400">
                  The server is waking up. The first load can take up to 20 seconds.
                </p>
                <p className="mt-3 text-[12px] font-mono tabular-nums text-slate-400 dark:text-slate-500">
                  {elapsed} s
                </p>
              </>
            )}
          </>
        ) : (
          <>
            <p className="mt-4 text-[15px] font-semibold text-slate-900 dark:text-slate-100">
              Couldn&apos;t reach flight data
            </p>
            <p className="mt-2 text-[13px] text-slate-500 dark:text-slate-400">{feed.message}</p>
            <button
              onClick={onRetry}
              className="mt-5 min-h-[44px] w-full rounded-lg bg-fr24-yellow px-6 text-[14px] font-semibold text-slate-900 transition-opacity hover:opacity-90"
            >
              Retry
            </button>
          </>
        )}
      </div>
    </div>
  );
}
