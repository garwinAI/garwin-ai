"use client";

import "./globals.css";
import { ErrorView } from "@/components/error-view";

// Last-resort boundary for errors in the root layout itself.
export default function GlobalError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <ErrorView {...props} />
      </body>
    </html>
  );
}
