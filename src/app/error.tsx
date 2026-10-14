"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-24 max-w-lg text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="mt-2 break-words text-sm text-muted">{error.message}</p>
      <button className="btn-ghost mt-6" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
