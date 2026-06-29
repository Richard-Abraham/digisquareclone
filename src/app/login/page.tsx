"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import {
  EyeIcon, EyeOffIcon, SpinnerIcon, MailIcon, LockIcon, ArrowRightIcon,
  SparklesIcon, KanbanIcon, CheckIcon, UserIcon,
} from "@/components/icons";
import projectImage from "@/assets/project_maanagement.jpg";
import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from "@/lib/validation";
import { logger } from "@/lib/logger";

const REMEMBER_KEY = "digisystem-remember-email";

type Mode = "login" | "register";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const loginForm = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", remember: true },
  });

  const registerForm = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", display_name: "" },
  });

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(REMEMBER_KEY) : null;
    if (saved) loginForm.setValue("email", saved);
  }, [loginForm]);

  function switchMode(next: Mode) {
    setMode(next);
    loginForm.clearErrors();
    registerForm.clearErrors();
  }

  async function onLoginSubmit(values: LoginInput) {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: values.email, password: values.password }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Request failed");

      if (values.remember) localStorage.setItem(REMEMBER_KEY, values.email);
      else localStorage.removeItem(REMEMBER_KEY);
      toast.success("Signed in successfully");
      router.push("/dashboard");
    } catch (e) {
      logger.warn("login submit failed", undefined, e);
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  async function onRegisterSubmit(values: RegisterInput) {
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(values),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Request failed");
      toast.success("Account created — please sign in");
      setMode("login");
      loginForm.setValue("email", values.email);
    } catch (e) {
      logger.warn("register submit failed", undefined, e);
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  const features = [
    { icon: KanbanIcon, title: "Drag-and-drop Kanban", desc: "Visual boards with real-time updates across your team" },
    { icon: SparklesIcon, title: "Guided daily standups", desc: "Plan, report, and track progress in minutes" },
    { icon: CheckIcon, title: "Analytics & insights", desc: "Burndown charts, velocity, and cycle time tracking" },
  ];

  const stats = [
    { value: "12k+", label: "Teams onboarded" },
    { value: "99.9%", label: "Uptime SLA" },
    { value: "4.9/5", label: "User rating" },
  ];

  return (
    <div className="min-h-dvh flex bg-surface font-sans">
      {/* Left: Brand showcase */}
      <div className="hidden lg:flex lg:w-[54%] xl:w-[58%] relative overflow-hidden">
        <Image
          src={projectImage}
          alt="Project management dashboard showing a kanban board and analytics"
          fill
          priority
          sizes="58vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-primary-900/92 via-primary-800/85 to-indigo-950/90" />
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="pointer-events-none absolute -top-40 -left-24 size-[28rem] rounded-full bg-white/8 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -right-24 size-[36rem] rounded-full bg-indigo-400/12 blur-3xl" />

        <div className="relative z-10 flex flex-col justify-between px-14 py-14 xl:px-20 xl:py-16 text-white w-full">
          <div className="flex items-center gap-3.5">
            <div className="size-12 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-xl">
              <span className="text-2xl font-extrabold font-display">D</span>
            </div>
            <span className="text-[22px] font-bold tracking-tight font-display">Digisystem</span>
          </div>

          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-md border border-white/15 px-3.5 py-1.5 mb-7">
              <SparklesIcon size={14} className="text-white/80" />
              <span className="text-[13px] font-medium text-white/80 tracking-wide">Built for modern teams</span>
            </div>

            <h2 className="font-display text-[44px] xl:text-[56px] font-extrabold leading-[1.05] tracking-tight">
              Ship faster.
              <br />
              <span className="text-white/60">Stay aligned.</span>
            </h2>
            <p className="mt-6 text-[19px] xl:text-[21px] text-white/65 leading-relaxed font-light max-w-lg">
              The project management workspace built for teams who value clarity, momentum, and getting things done.
            </p>

            <div className="mt-12 space-y-5">
              {features.map((f) => (
                <div key={f.title} className="flex items-start gap-4 group">
                  <div className="size-12 rounded-2xl bg-white/8 backdrop-blur-md border border-white/12 flex items-center justify-center flex-shrink-0 transition-colors duration-200 group-hover:bg-white/15">
                    <f.icon size={22} className="text-white" />
                  </div>
                  <div className="pt-0.5">
                    <p className="font-display font-semibold text-[16px] tracking-tight">{f.title}</p>
                    <p className="text-[14px] text-white/55 mt-1 font-light leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-12 flex items-center gap-8 pt-8 border-t border-white/10">
              {stats.map((s) => (
                <div key={s.label}>
                  <p className="font-display text-[26px] font-extrabold tracking-tight">{s.value}</p>
                  <p className="text-[12px] text-white/45 font-light mt-0.5 uppercase tracking-wider">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4 text-[13px] text-white/35 font-light">
            <span>&copy; {new Date().getFullYear()} Digisystem</span>
            <span className="size-1 rounded-full bg-white/20" />
            <span>All rights reserved</span>
          </div>
        </div>
      </div>

      {/* Right: Form panel */}
      <div className="flex-1 flex flex-col relative bg-surface">
        <div className="pointer-events-none absolute top-0 right-0 size-96 rounded-full bg-primary-100/40 blur-3xl dark:bg-primary-500/5" />

        <div className="relative flex items-center justify-between px-8 sm:px-12 py-7">
          <div className="flex items-center gap-3 lg:hidden">
            <div className="size-10 rounded-xl bg-gradient-to-br from-primary to-primary-600 flex items-center justify-center shadow-lg">
              <span className="text-base font-extrabold text-white font-display">D</span>
            </div>
            <span className="text-lg font-bold text-text-primary font-display">Digisystem</span>
          </div>
          <div className="lg:hidden" />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>

        <div className="relative flex-1 flex items-center justify-center px-8 sm:px-12 pb-14">
          <div className="w-full max-w-[440px] animate-slide-up">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary-50 border border-primary-100 px-3 py-1.5 mb-6 dark:bg-primary-500/10 dark:border-primary-500/20">
              <span className="size-1.5 rounded-full bg-primary animate-pulse-soft" />
              <span className="text-[12px] font-semibold text-primary-700 tracking-wide uppercase dark:text-primary-300">
                {mode === "login" ? "Sign in" : "Get started"}
              </span>
            </div>

            <div className="mb-10">
              <h1 className="font-display text-[36px] font-extrabold tracking-tight text-text-primary leading-[1.1]">
                {mode === "login" ? "Welcome back" : "Create your account"}
              </h1>
              <p className="text-[16px] text-text-secondary mt-2.5 font-light leading-relaxed">
                {mode === "login"
                  ? "Sign in to your workspace to continue where you left off."
                  : "Start managing your projects, standups, and team in minutes."}
              </p>
            </div>

            {mode === "login" ? (
              <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="email" className="block text-[13px] font-semibold text-text-secondary uppercase tracking-wider">
                    Email address
                  </label>
                  <div className="relative">
                    <MailIcon size={19} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      {...loginForm.register("email")}
                      placeholder="you@company.com"
                      autoFocus
                      className="input pl-12 py-3 text-[15px]"
                    />
                  </div>
                  {loginForm.formState.errors.email && (
                    <p className="text-[13px] text-red-600">{loginForm.formState.errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="password" className="block text-[13px] font-semibold text-text-secondary uppercase tracking-wider">
                    Password
                  </label>
                  <div className="relative">
                    <LockIcon size={19} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      {...loginForm.register("password")}
                      placeholder="Enter your password"
                      className="input pl-12 pr-12 py-3 text-[15px]"
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
                  {loginForm.formState.errors.password && (
                    <p className="text-[13px] text-red-600">{loginForm.formState.errors.password.message}</p>
                  )}
                </div>

                <div className="flex items-center justify-between text-[13px] pt-1">
                  <label className="flex items-center gap-2.5 text-text-secondary cursor-pointer select-none font-light">
                    <input
                      type="checkbox"
                      {...loginForm.register("remember")}
                      className="size-4 rounded border-border text-primary focus:ring-2 focus:ring-primary-200"
                    />
                    Remember me
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-text-tertiary hover:text-primary transition-colors font-medium"
                  >
                    Forgot password?
                  </Link>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="w-full py-3 text-[15px] mt-2"
                  disabled={loginForm.formState.isSubmitting}
                >
                  {loginForm.formState.isSubmitting ? (
                    <span className="flex items-center gap-2.5">
                      <SpinnerIcon size={19} className="animate-spin" /> Signing in...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2.5">
                      Sign in to workspace <ArrowRightIcon size={19} />
                    </span>
                  )}
                </Button>
              </form>
            ) : (
              <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="display_name" className="block text-[13px] font-semibold text-text-secondary uppercase tracking-wider">
                    Display name
                  </label>
                  <div className="relative">
                    <UserIcon size={19} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
                    <input
                      id="display_name"
                      autoComplete="name"
                      {...registerForm.register("display_name")}
                      placeholder="Jane Doe"
                      className="input pl-12 py-3 text-[15px]"
                    />
                  </div>
                  {registerForm.formState.errors.display_name && (
                    <p className="text-[13px] text-red-600">{registerForm.formState.errors.display_name.message}</p>
                  )}
                  <p className="text-[12px] text-text-tertiary font-light">This is how teammates will see you.</p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="email" className="block text-[13px] font-semibold text-text-secondary uppercase tracking-wider">
                    Email address
                  </label>
                  <div className="relative">
                    <MailIcon size={19} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      {...registerForm.register("email")}
                      placeholder="you@company.com"
                      className="input pl-12 py-3 text-[15px]"
                    />
                  </div>
                  {registerForm.formState.errors.email && (
                    <p className="text-[13px] text-red-600">{registerForm.formState.errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="password" className="block text-[13px] font-semibold text-text-secondary uppercase tracking-wider">
                    Password
                  </label>
                  <div className="relative">
                    <LockIcon size={19} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      {...registerForm.register("password")}
                      placeholder="Create a strong password"
                      className="input pl-12 pr-12 py-3 text-[15px]"
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
                  {registerForm.formState.errors.password && (
                    <p className="text-[13px] text-red-600">{registerForm.formState.errors.password.message}</p>
                  )}
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="w-full py-3 text-[15px] mt-2"
                  disabled={registerForm.formState.isSubmitting}
                >
                  {registerForm.formState.isSubmitting ? (
                    <span className="flex items-center gap-2.5">
                      <SpinnerIcon size={19} className="animate-spin" /> Creating account...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2.5">
                      Create my account <ArrowRightIcon size={19} />
                    </span>
                  )}
                </Button>
              </form>
            )}

            <div className="mt-8 mb-7 flex items-center gap-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[12px] text-text-tertiary font-light uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <div className="text-center">
              <p className="text-[15px] text-text-secondary font-light">
                {mode === "login" ? (
                  <>Don&apos;t have an account yet?{" "}
                    <button onClick={() => switchMode("register")}
                      className="text-primary font-semibold hover:text-primary-600 transition-colors font-display">
                      Create one for free
                    </button>
                  </>
                ) : (
                  <>Already have an account?{" "}
                    <button onClick={() => switchMode("login")}
                      className="text-primary font-semibold hover:text-primary-600 transition-colors font-display">
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
