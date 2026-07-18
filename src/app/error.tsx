"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { captureException } from "@/lib/monitoring";
import { AlertCircle } from "lucide-react";

export default function RootErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { captureException(error, { digest: error.digest }); }, [error]);

  return (
    <html>
      <body className="min-h-screen flex flex-col items-center justify-center bg-surface px-6 text-center">
        <div className="size-14 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center text-red-500 mb-4">
          <AlertCircle size={28} strokeWidth={1.5} />
        </div>
        <h2 className="text-lg font-bold text-text-primary mb-1">Something went wrong</h2>
        <p className="text-sm text-text-secondary max-w-sm mb-6">{error.message || "An unexpected error occurred. Please try again."}</p>
        <Button variant="primary" size="sm" onClick={reset}>Try again</Button>
      </body>
    </html>
  );
}
