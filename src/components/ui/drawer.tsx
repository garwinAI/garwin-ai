"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "./icon-button";
import { cn } from "./cn";

/**
 * Modal side panel built on the native <dialog> element, which gives us focus trapping,
 * Escape-to-close, an inert background and focus return for free.
 */
export function Drawer({
  open,
  onClose,
  label,
  side = "left",
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  side?: "left" | "right";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      onClick={(e) => {
        // Clicking the backdrop (the dialog element itself, outside the panel) closes it.
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "m-0 h-dvh max-h-dvh w-[min(18rem,85vw)] max-w-none bg-white p-0 shadow-2xl backdrop:bg-neutral-900/40",
        side === "left" ? "mr-auto" : "ml-auto",
      )}
    >
      <div className="flex h-full flex-col">
        <div className="absolute right-2 top-2.5 z-10">
          <IconButton icon={X} label="Close menu" onClick={onClose} />
        </div>
        {children}
      </div>
    </dialog>
  );
}
