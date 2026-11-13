"use client";

import { ErrorView } from "@/components/error-view";

// Keeps the sidebar visible when a page inside the workspace fails.
export default function AppError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView {...props} />;
}
