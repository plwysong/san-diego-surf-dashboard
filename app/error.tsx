"use client";

/**
 * Route-level backstop. Individual panels carry their own boundaries, so this
 * only renders if the dashboard shell itself fails.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[dashboard] route render failed:", error);

  return (
    <main className="route-error">
      <h1>The dashboard could not be displayed</h1>
      <p>This is a display failure, not a forecast outage. Reloading usually resolves it.</p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
