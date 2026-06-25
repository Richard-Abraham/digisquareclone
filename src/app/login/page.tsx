"use client";
import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { EyeIcon, EyeOffIcon, SpinnerIcon } from "@/components/icons";

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
    router.push("/dashboard");
  }

  return (
    <div className="relative min-h-dvh flex items-center justify-center bg-surface p-4 sm:p-6 overflow-hidden">
      {/* Decorative brand blobs */}
      <div className="pointer-events-none absolute -top-24 -left-24 size-96 rounded-full bg-primary-300/30 blur-3xl dark:bg-primary-500/15" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 size-[28rem] rounded-full bg-indigo-300/20 blur-3xl dark:bg-indigo-500/10" />

      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-sm animate-slide-up">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="size-14 rounded-2xl bg-gradient-to-br from-primary to-primary-600 shadow-lg shadow-primary-200/50 dark:shadow-primary-900/30 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl font-extrabold text-white">D</span>
          </div>
          <h1 className="text-2xl font-extrabold text-text-primary">Digisystem</h1>
          <p className="text-sm text-text-secondary mt-1">
            {mode === "login" ? "Welcome back — sign in to continue" : "Create your account to get started"}
          </p>
        </div>

        {/* Form */}
        <div className="card p-6 shadow-modal">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@company.com"
              autoFocus
            />

            {mode === "register" && (
              <Input
                label="Display name"
                name="display_name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Jane Doe"
                hint="Shown to your teammates."
              />
            )}

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-text-secondary mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="input pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute inset-y-0 right-0 px-3 text-text-tertiary hover:text-text-secondary transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              </div>
            </div>

            {mode === "login" && (
              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 text-text-secondary cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary-200"
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  onClick={() => { setError(""); setInfo("Password reset isn't configured yet — contact your workspace admin."); }}
                  className="text-text-tertiary hover:text-primary transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-600 animate-fade-in dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400">
                {error}
              </div>
            )}
            {info && (
              <div className="rounded-lg bg-primary-50 border border-primary-100 px-3 py-2 text-sm text-primary-700 animate-fade-in dark:bg-primary-500/10 dark:border-primary-500/20 dark:text-primary-300">
                {info}
              </div>
            )}

            <Button type="submit" variant="primary" size="md" className="w-full" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <SpinnerIcon size={16} className="animate-spin" />
                  {mode === "login" ? "Signing in..." : "Creating account..."}
                </span>
              ) : mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="mt-5 text-center">
            <p className="text-sm text-text-secondary">
              {mode === "login" ? (
                <>Don&apos;t have an account?{" "}
                  <button onClick={() => { setMode("register"); setError(""); setInfo(""); }}
                    className="text-primary font-medium hover:text-primary-600 transition-colors">
                    Sign up
                  </button>
                </>
              ) : (
                <>Already have an account?{" "}
                  <button onClick={() => { setMode("login"); setError(""); setInfo(""); }}
                    className="text-primary font-medium hover:text-primary-600 transition-colors">
                    Sign in
                  </button>
                </>
              )}
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-text-tertiary mt-6">
          Manage your tasks, standups, and team — all in one place.
        </p>
      </div>
    </div>
  );
}
