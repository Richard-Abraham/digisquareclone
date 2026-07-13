"use client";
import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Logo } from "@/components/ui/Logo";
import {
  EyeIcon, EyeOffIcon, SpinnerIcon, MailIcon, LockIcon, ArrowRightIcon,
  SparklesIcon, KanbanIcon, CheckIcon, UserIcon,
} from "@/components/icons";
import projectImage from "@/assets/project_maanagement.jpg";

const REMEMBER_KEY = "digisystem-remember-email";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (saved) { setEmail(saved); setRemember(true); }
  }, []);

  function switchMode(next: "login" | "register") {
    setMode(next);
    setError("");
    setInfo("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");
    const payload: Record<string, string> = { email, password };
    if (mode === "register" && displayName.trim()) payload.display_name = displayName.trim();
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const json = await res.json();
    setLoading(false);
    if (!json.success) return setError(json.error || "Something went wrong");
    if (remember) localStorage.setItem(REMEMBER_KEY, email);
    else localStorage.removeItem(REMEMBER_KEY);
    localStorage.setItem("token", json.data.token);
    if (json.data.refresh_token) localStorage.setItem("refresh_token", json.data.refresh_token);
    window.location.href = "/dashboard";
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
      {/* ────────────── Left: Brand showcase with image ────────────── */}
      <div className="hidden lg:flex lg:w-[54%] xl:w-[58%] relative overflow-hidden">
        {/* Background image */}
        <Image
          src={projectImage}
          alt="Project management dashboard"
          fill
          priority
          sizes="58vw"
          className="object-cover"
        />
        {/* Rich gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary-900/92 via-primary-800/85 to-indigo-950/90" />
        {/* Subtle dot grid texture */}
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
        {/* Glow orbs */}
        <div className="pointer-events-none absolute -top-40 -left-24 size-[28rem] rounded-full bg-white/8 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -right-24 size-[36rem] rounded-full bg-indigo-400/12 blur-3xl" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between px-14 py-14 xl:px-20 xl:py-16 text-white w-full">
          {/* Logo */}
          <div className="flex items-center gap-3.5">
            <div className="size-12 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-xl p-2">
              <Logo size={40} showWordmark={false} className="[&>div]:rounded-[10px] [&>div]:ring-0 [&>div]:bg-transparent" />
            </div>
            <span className="text-[22px] font-bold tracking-tight font-display">Digisystem</span>
          </div>

          {/* Headline + features */}
          <div className="max-w-xl">
            {/* Eyebrow badge */}
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

            {/* Feature list */}
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

            {/* Stats row */}
            <div className="mt-12 flex items-center gap-8 pt-8 border-t border-white/10">
              {stats.map((s) => (
                <div key={s.label}>
                  <p className="font-display text-[26px] font-extrabold tracking-tight">{s.value}</p>
                  <p className="text-[12px] text-white/45 font-light mt-0.5 uppercase tracking-wider">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 text-[13px] text-white/35 font-light">
            <span>&copy; {new Date().getFullYear()} Digisystem</span>
            <span className="size-1 rounded-full bg-white/20" />
            <span>All rights reserved</span>
            <span className="size-1 rounded-full bg-white/20" />
            <span>Privacy</span>
            <span className="size-1 rounded-full bg-white/20" />
            <span>Terms</span>
          </div>
        </div>
      </div>

      {/* ────────────── Right: Form panel ────────────── */}
      <div className="flex-1 flex flex-col relative bg-surface">
        {/* Subtle gradient backdrop for depth */}
        <div className="pointer-events-none absolute top-0 right-0 size-96 rounded-full bg-primary-100/40 blur-3xl dark:bg-primary-500/5" />

        {/* Top bar */}
        <div className="relative flex items-center justify-between px-8 sm:px-12 py-7">
          <div className="flex items-center gap-3 lg:hidden">
            <Logo size={32} showWordmark={false} />
            <span className="text-lg font-bold text-text-primary font-display">Digisystem</span>
          </div>
          <div className="lg:hidden" />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>

        {/* Form area */}
        <div className="relative flex-1 flex items-center justify-center px-8 sm:px-12 pb-14">
          <div className="w-full max-w-[440px] animate-slide-up">
            {/* Eyebrow badge */}
            <div className="inline-flex items-center gap-2 rounded-full bg-primary-50 border border-primary-100 px-3 py-1.5 mb-6 dark:bg-primary-500/10 dark:border-primary-500/20">
              <span className="size-1.5 rounded-full bg-primary animate-pulse-soft" />
              <span className="text-[12px] font-semibold text-primary-700 tracking-wide uppercase dark:text-primary-300">
                {mode === "login" ? "Sign in" : "Get started"}
              </span>
            </div>

            {/* Heading */}
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

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div className="space-y-2">
                <label htmlFor="email" className="block text-[13px] font-semibold text-text-secondary uppercase tracking-wider">
                  Email address
                </label>
                <div className="relative">
                  <MailIcon size={19} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
                  <input
                    id="email"
                    type="email"
                    name="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@company.com"
                    autoFocus
                    className="input pl-12 py-3 text-[15px]"
                  />
                </div>
              </div>

              {/* Display name (register only) */}
              {mode === "register" && (
                <div className="space-y-2 animate-slide-up">
                  <label htmlFor="display_name" className="block text-[13px] font-semibold text-text-secondary uppercase tracking-wider">
                    Display name
                  </label>
                  <div className="relative">
                    <UserIcon size={19} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
                    <input
                      id="display_name"
                      name="display_name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Jane Doe"
                      className="input pl-12 py-3 text-[15px]"
                    />
                  </div>
                  <p className="text-[12px] text-text-tertiary font-light">This is how teammates will see you.</p>
                </div>
              )}

              {/* Password */}
              <div className="space-y-2">
                <label htmlFor="password" className="block text-[13px] font-semibold text-text-secondary uppercase tracking-wider">
                  Password
                </label>
                <div className="relative">
                  <LockIcon size={19} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
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
              </div>

              {/* Remember + forgot (login only) */}
              {mode === "login" && (
                <div className="flex items-center justify-between text-[13px] pt-1">
                  <label className="flex items-center gap-2.5 text-text-secondary cursor-pointer select-none font-light">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="size-4 rounded border-border text-primary focus:ring-2 focus:ring-primary-200"
                    />
                    Remember me
                  </label>
                  <button
                    type="button"
                    onClick={() => { setError(""); setInfo("Password reset isn't configured yet — contact your workspace admin."); }}
                    className="text-text-tertiary hover:text-primary transition-colors font-medium"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {/* Error / info */}
              {error && (
                <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3.5 text-[14px] text-red-600 animate-fade-in dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400">
                  {error}
                </div>
              )}
              {info && (
                <div className="rounded-xl bg-primary-50 border border-primary-100 px-4 py-3.5 text-[14px] text-primary-700 animate-fade-in dark:bg-primary-500/10 dark:border-primary-500/20 dark:text-primary-300">
                  {info}
                </div>
              )}

              {/* Submit */}
              <Button type="submit" variant="primary" size="lg" className="w-full py-3 text-[15px] mt-2" disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2.5">
                    <SpinnerIcon size={19} className="animate-spin" />
                    {mode === "login" ? "Signing in..." : "Creating account..."}
                  </span>
                ) : (
                  <span className="flex items-center gap-2.5">
                    {mode === "login" ? "Sign in to workspace" : "Create my account"}
                    <ArrowRightIcon size={19} />
                  </span>
                )}
              </Button>
            </form>

            {/* Divider */}
            <div className="mt-8 mb-7 flex items-center gap-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[12px] text-text-tertiary font-light uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Mode toggle */}
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
