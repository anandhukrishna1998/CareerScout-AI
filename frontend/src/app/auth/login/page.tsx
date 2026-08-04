"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { fetchApi } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const { setAccessToken } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetchApi("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      setAccessToken(data.access_token);
      router.push("/cvs");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto mt-12 max-w-md rounded-2xl border border-white/10 bg-panel p-6">
      <h1 className="text-2xl font-semibold">Welcome back</h1>
      <p className="mt-2 text-sm text-zinc-400">Sign in to access your job intelligence dashboard.</p>
      {error && <div className="mt-4 text-sm text-red-500">{error}</div>}
      <form className="mt-6 space-y-3" onSubmit={handleSubmit}>
        <input 
          className="w-full rounded-md border border-white/10 bg-black/20 p-2" 
          placeholder="Email" 
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input 
          className="w-full rounded-md border border-white/10 bg-black/20 p-2" 
          placeholder="Password" 
          type="password" 
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button 
          className="w-full rounded-md bg-brand px-4 py-2 font-medium disabled:opacity-50"
          disabled={loading}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
      <p className="mt-4 text-sm text-zinc-400">
        New here?{" "}
        <Link className="text-violet-300" href="/auth/register">
          Create account
        </Link>
      </p>
    </section>
  );
}
