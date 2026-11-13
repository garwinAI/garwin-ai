"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

const SUNDAY_FIRST = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MonthView({ weekStartsOn = "sunday" }: { weekStartsOn?: "sunday" | "monday" }) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const offset = weekStartsOn === "monday" ? 1 : 0;
  const weekdays = [...SUNDAY_FIRST.slice(offset), ...SUNDAY_FIRST.slice(0, offset)];

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const leading = (new Date(year, month, 1).getDay() - offset + 7) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(leading).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));

  const isToday = (d: number) => d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
  const monthLabel = cursor.toLocaleString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-3 sm:px-5">
        <h2 className="font-semibold" aria-live="polite" suppressHydrationWarning>{monthLabel}</h2>
        <div className="flex items-center gap-1">
          <IconButton icon={ChevronLeft} label="Previous month" onClick={() => setCursor(new Date(year, month - 1, 1))} />
          <Button variant="secondary" size="sm" onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}>
            Today
          </Button>
          <IconButton icon={ChevronRight} label="Next month" onClick={() => setCursor(new Date(year, month + 1, 1))} />
        </div>
      </div>
      <table className="w-full table-fixed border-collapse" suppressHydrationWarning>
        <caption className="sr-only">{monthLabel}</caption>
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-medium text-neutral-500">
            {weekdays.map((d) => (
              <th key={d} scope="col" className="px-1 py-2 text-left font-medium sm:px-3">
                <span aria-hidden="true" className="sm:hidden">{d[0]}</span>
                <span className="max-sm:sr-only">{d}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, w) => (
            <tr key={w}>
              {week.map((d, i) => (
                <td key={i} className={cn("h-14 border-b border-r border-neutral-100 p-1 align-top text-sm sm:h-24 sm:p-2", !d && "bg-neutral-50/60")}>
                  {d && (
                    <span
                      aria-current={isToday(d) ? "date" : undefined}
                      className={cn(
                        "inline-flex h-7 w-7 items-center justify-center rounded-full",
                        isToday(d) ? "bg-accent-700 font-semibold text-white" : "text-neutral-700",
                      )}
                    >
                      {d}
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
