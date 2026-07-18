"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { captureException } from "@/lib/monitoring";
import { AlertCircle } from "lucide-react";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  useEffect(() => { captureException(error, { digest: error.digest }); }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="size-14 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center text-red-500 mb-4">
        <AlertCircle size={28} strokeWidth={1.5} />
      </div>
      <h2 className="text-lg font-bold text-text-primary mb-1">Something went wrong</h2>
      <p className="text-sm text-text-secondary max-w-sm mb-2">{error.message || "An unexpected error occurred. Please try again."}</p>
      {error.digest && <p className="text-[10px] text-text-tertiary font-mono mb-6">Error ID: {error.digest}</p>}
      <div className="flex items-center gap-3">
        <Button variant="primary" size="sm" onClick={reset}>Try again</Button>
        <Button variant="secondary" size="sm" onClick={() => router.push("/dashboard")}>Go to Board</Button>
      </div>
    </div>
  );
}
