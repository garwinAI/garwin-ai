"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MonthView() {
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);

  const isToday = (d: number) =>
    d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
        <h2 className="font-semibold" suppressHydrationWarning>
          {cursor.toLocaleString(undefined, { month: "long", year: "numeric" })}
        </h2>
        <div className="flex items-center gap-1">
          <button className="btn-secondary px-2.5 py-1.5" onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button className="btn-secondary px-3 py-1.5" onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}>
            Today
          </button>
          <button className="btn-secondary px-2.5 py-1.5" onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-neutral-200 bg-neutral-50 text-xs font-medium text-neutral-500">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-3 py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7" suppressHydrationWarning>
        {cells.map((d, i) => (
          <div key={i} className={`h-24 border-b border-r border-neutral-100 p-2 text-sm ${d ? "" : "bg-neutral-50/60"}`}>
            {d && (
              <span
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${
                  isToday(d) ? "bg-accent-500 font-semibold text-white" : "text-neutral-700"
                }`}
              >
                {d}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
