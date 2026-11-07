import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md flex-1 space-y-3 px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground">
        This page doesn&apos;t exist, or the publication or post was removed.
      </p>
      <Link href="/" className="inline-block text-sm underline">
        Go home
      </Link>
    </main>
  );
}
