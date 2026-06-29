"use client";
import { Suspense } from "react";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LockIcon, ArrowLeftIcon, SpinnerIcon, CheckIcon, EyeIcon, EyeOffIcon } from "@/components/icons";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validation";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", token: "" },
  });

  useEffect(() => {
    const t = searchParams.get("token") || searchParams.get("code") || "";
    setToken(t);
    form.setValue("token", t);
  }, [searchParams, form]);

  async function onSubmit(values: ResetPasswordInput) {
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Request failed");
      toast.success("Password updated — please sign in");
      router.push("/login");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to reset password");
    }
  }

  return (
    <>
      {!token && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-center dark:bg-red-500/10 dark:border-red-500/20">
          <p className="text-[14px] text-red-700 dark:text-red-300">
            This reset link appears to be invalid or expired.
          </p>
        </div>
      )}

      {form.formState.isSubmitSuccessful ? (
        <div className="rounded-2xl border border-green-100 bg-green-50 p-6 text-center dark:bg-green-500/10 dark:border-green-500/20">
          <CheckIcon size={32} className="mx-auto text-green-600 mb-3" />
          <p className="text-[15px] text-green-800 font-medium dark:text-green-300">Password updated</p>
          <Link href="/login" className="inline-flex items-center gap-2 mt-5 text-primary font-semibold hover:text-primary-600">
            Sign in <ArrowLeftIcon size={18} className="rotate-180" />
          </Link>
        </div>
      ) : (
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <input type="hidden" {...form.register("token")} />
          <div className="space-y-2">
            <label htmlFor="password" className="block text-[13px] font-semibold text-text-secondary uppercase tracking-wider">
              New password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                {...form.register("password")}
                placeholder="Create a strong password"
                className="input pr-12 py-3 text-[15px]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute inset-y-0 right-0 px-4 text-text-tertiary hover:text-text-secondary transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? <EyeOffIcon size={19} /> : <EyeIcon size={19} />}
              </button>
            </div>
            {form.formState.errors.password && (
              <p className="text-[13px] text-red-600">{form.formState.errors.password.message}</p>
            )}
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full py-3"
            disabled={form.formState.isSubmitting || !token}
          >
            {form.formState.isSubmitting ? (
              <span className="flex items-center justify-center gap-2.5">
                <SpinnerIcon size={19} className="animate-spin" /> Updating...
              </span>
            ) : (
              "Update password"
            )}
          </Button>

          <div className="text-center">
            <Link href="/login" className="inline-flex items-center gap-2 text-[14px] text-text-tertiary hover:text-primary font-medium">
              <ArrowLeftIcon size={18} /> Back to sign in
            </Link>
          </div>
        </form>
      )}
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-surface px-6">
      <div className="absolute top-0 right-0 p-6">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-[420px]">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-primary-50 border border-primary-100 mb-5 dark:bg-primary-500/10 dark:border-primary-500/20">
            <LockIcon size={26} className="text-primary" />
          </div>
          <h1 className="font-display text-[28px] font-extrabold tracking-tight text-text-primary">Create new password</h1>
          <p className="text-[15px] text-text-secondary mt-2 font-light">
            Choose a strong password for your account.
          </p>
        </div>

        <Suspense fallback={(
          <div className="space-y-5">
            <div className="h-12 rounded-xl bg-surface-tertiary animate-pulse" />
            <div className="h-12 rounded-xl bg-surface-tertiary animate-pulse" />
          </div>
        )}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
