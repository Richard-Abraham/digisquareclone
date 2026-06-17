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
    <div className="flex min-h-screen items-center justify-center bg-[#f8f9fc]">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm border border-[#eef0f6]">
        <h1 className="text-2xl font-bold text-[#1a1d23] mb-1">Digisystem</h1>
        <p className="text-sm text-[#5e6574] mb-6">{mode === "login" ? "Sign in to your account" : "Create a new account"}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#5e6574] mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full rounded-lg border border-[#e2e6ef] px-3 py-2 text-sm outline-none focus:border-[#3f76ff]" placeholder="you@example.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#5e6574] mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full rounded-lg border border-[#e2e6ef] px-3 py-2 text-sm outline-none focus:border-[#3f76ff]" placeholder="••••••••" />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={loading} className="w-full rounded-lg bg-[#3f76ff] py-2 text-sm font-medium text-white hover:bg-[#2558e8] disabled:opacity-50">{loading ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}</button>
        </form>
        <p className="mt-4 text-center text-sm text-[#5e6574]">
          {mode === "login" ? <>Don&apos;t have an account? <button onClick={() => { setMode("register"); setError(""); }} className="text-[#3f76ff] hover:underline">Sign up</button></> : <>Already have an account? <button onClick={() => { setMode("login"); setError(""); }} className="text-[#3f76ff] hover:underline">Sign in</button></>}
        </p>
      </div>
    </div>
  );
}
