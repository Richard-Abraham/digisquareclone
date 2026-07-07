"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { getBrowserClient } from "@/lib/supabase-browser";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Supabase password-recovery redirect puts the session tokens in the URL hash.
    const hash = window.location.hash;
    if (!hash) {
      setError("Invalid or expired password reset link. Please request a new one.");
      return;
    }
    const params = new URLSearchParams(hash.slice(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const type = params.get("type");
    if (!accessToken || !refreshToken || type !== "recovery") {
      setError("Invalid or expired password reset link. Please request a new one.");
      return;
    }
    getBrowserClient()
      .auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error: sessionError }) => {
        if (sessionError) setError(sessionError.message);
      })
      .catch((e) => setError(e.message || "Failed to initialize reset session"));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    if (password.length < 6) return setError("Password must be at least 6 characters");
    if (password !== confirm) return setError("Passwords do not match");
    setLoading(true);
    try {
      const { error: updateError } = await getBrowserClient().auth.updateUser({ password });
      if (updateError) return setError(updateError.message);
      setInfo("Password updated successfully. Redirecting to login...");
      setTimeout(() => router.push("/login"), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm bg-surface-1 border border-border rounded-2xl p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-text-primary mb-1">Reset password</h1>
        <p className="text-sm text-text-secondary mb-5">Enter a new password for your account.</p>
        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        {info && <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-600">{info}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          <Input
            type="password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Updating..." : "Update password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
