import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Garwin AI", template: "%s · Garwin AI" },
  description: "Your AI-powered workspace, with apps, widgets and themes from AppZone.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
