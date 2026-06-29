"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { MailIcon, ArrowLeftIcon, SpinnerIcon, CheckIcon } from "@/components/icons";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validation";

export default function ForgotPasswordPage() {
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotPasswordInput) {
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Request failed");
      toast.success("Reset link sent — check your email");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to send reset link");
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-surface px-6">
      <div className="absolute top-0 right-0 p-6">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-[420px]">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-primary-50 border border-primary-100 mb-5 dark:bg-primary-500/10 dark:border-primary-500/20">
            <MailIcon size={26} className="text-primary" />
          </div>
          <h1 className="font-display text-[28px] font-extrabold tracking-tight text-text-primary">Reset your password</h1>
          <p className="text-[15px] text-text-secondary mt-2 font-light">
            Enter your email and we&apos;ll send you a link to create a new password.
          </p>
        </div>

        {form.formState.isSubmitSuccessful ? (
          <div className="rounded-2xl border border-green-100 bg-green-50 p-6 text-center dark:bg-green-500/10 dark:border-green-500/20">
            <CheckIcon size={32} className="mx-auto text-green-600 mb-3" />
            <p className="text-[15px] text-green-800 font-medium dark:text-green-300">Check your inbox</p>
            <p className="text-[14px] text-green-700/80 mt-1 font-light dark:text-green-400/80">
              If an account exists for {form.getValues("email")}, you&apos;ll receive a reset link.
            </p>
            <Link href="/login" className="inline-flex items-center gap-2 mt-5 text-primary font-semibold hover:text-primary-600">
              <ArrowLeftIcon size={18} /> Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="email" className="block text-[13px] font-semibold text-text-secondary uppercase tracking-wider">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                {...form.register("email")}
                placeholder="you@company.com"
                className="input py-3 text-[15px]"
              />
              {form.formState.errors.email && (
                <p className="text-[13px] text-red-600">{form.formState.errors.email.message}</p>
              )}
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full py-3"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? (
                <span className="flex items-center justify-center gap-2.5">
                  <SpinnerIcon size={19} className="animate-spin" /> Sending...
                </span>
              ) : (
                "Send reset link"
              )}
            </Button>

            <div className="text-center">
              <Link href="/login" className="inline-flex items-center gap-2 text-[14px] text-text-tertiary hover:text-primary font-medium">
                <ArrowLeftIcon size={18} /> Back to sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
