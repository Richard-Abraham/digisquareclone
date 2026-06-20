"use client";
import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const json = await res.json();
    setLoading(false);
    if (!json.success) return setError(json.error || "Something went wrong");
    localStorage.setItem("token", json.data.token);
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-indigo-50 p-4">
      <div className="w-full max-w-sm animate-slide-up">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="size-14 rounded-2xl bg-gradient-to-br from-primary to-primary-600 shadow-lg shadow-primary-200 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl font-extrabold text-white">D</span>
          </div>
          <h1 className="text-2xl font-extrabold text-text-primary">Digisystem</h1>
          <p className="text-sm text-text-secondary mt-1">
            {mode === "login" ? "Welcome back — sign in to continue" : "Create your account to get started"}
          </p>
        </div>

        {/* Form */}
        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="input" placeholder="you@company.com" autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                className="input" placeholder="••••••••" />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-600 animate-fade-in">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="btn-primary btn-md w-full">
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {mode === "login" ? "Signing in..." : "Creating account..."}
                </span>
              ) : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="mt-5 text-center">
            <p className="text-sm text-text-secondary">
              {mode === "login" ? (
                <>Don&apos;t have an account?{' '}
                  <button onClick={() => { setMode("register"); setError(""); }}
                    className="text-primary font-medium hover:text-primary-600 transition-colors">
                    Sign up
                  </button>
                </>
              ) : (
                <>Already have an account?{' '}
                  <button onClick={() => { setMode("login"); setError(""); }}
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
