import Link from "next/link";
import { LogoMark } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center px-6 py-24 text-center">
      <LogoMark className="h-10 w-10" />
      <p className="mt-6 text-sm font-medium text-accent-700">404</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-neutral-500">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
      <Link href="/" className="btn-primary mt-6">Go home</Link>
    </main>
  );
}
