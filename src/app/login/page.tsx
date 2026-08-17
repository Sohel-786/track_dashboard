"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Activity, Eye, EyeOff, Lock, User } from "lucide-react";
import toast from "react-hot-toast";
import { api, ApiError } from "@/lib/client-api";
import type { AuthUser } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      await api<AuthUser>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      toast.success("Welcome back");
      const next = searchParams.get("next") || "/";
      router.replace(next.startsWith("/") ? next : "/");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-teal-50 via-emerald-50 to-cyan-100 dark:from-slate-950 dark:via-teal-950/40 dark:to-slate-900" />
      <div className="pointer-events-none absolute -left-24 top-0 h-[28rem] w-[28rem] rounded-full bg-teal-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-[24rem] w-[24rem] rounded-full bg-emerald-400/20 blur-3xl" />

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative z-10 w-full max-w-[420px]"
      >
        <div className="rounded-2xl border border-white/60 bg-white/95 p-8 shadow-xl shadow-black/10 backdrop-blur-md dark:border-border dark:bg-card/95 sm:p-10">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-700 to-emerald-600 shadow-lg shadow-teal-700/30">
              <Activity className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">TrackDash</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in with your username and password
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="h-11 rounded-xl bg-background pl-10"
                  placeholder="Enter username"
                  required
                  minLength={3}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 rounded-xl bg-background pl-10 pr-11"
                  placeholder="Enter password"
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <Button
              type="submit"
              loading={loading}
              /* -700 rather than -600: white on teal/emerald-600 is ~3.2:1. */
              className="mt-2 h-11 w-full rounded-xl bg-gradient-to-r from-teal-700 to-emerald-700 text-white shadow-lg shadow-teal-700/25 hover:brightness-110 hover:bg-transparent"
            >
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </div>
      </motion.section>
    </div>
  );
}
