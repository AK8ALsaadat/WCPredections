"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { WorldCupFlagGarland } from "@/components/auth/WorldCupFlagGarland";
import { GoldenSponsorBanner } from "@/components/layout/GoldenSponsorBanner";
import { ar } from "@/lib/i18n/ar";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError(ar.errors.passwordMismatch);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!data.success) {
        setError(data.error);
        return;
      }

      router.push("/tutorial");
      router.refresh();
    } catch {
      setError(ar.errors.generic);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <WorldCupFlagGarland />

        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-primary">{ar.appName}</h1>
          <p className="mt-1 text-sm text-muted">{ar.auth.registerSubtitle}</p>
        </div>

        <GoldenSponsorBanner />

        <Card>
          <CardHeader>
            <CardTitle>{ar.auth.register}</CardTitle>
          </CardHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <ErrorMessage message={error} />}
            <Input
              label={ar.auth.username}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={20}
              pattern="[a-zA-Z0-9_]+"
              autoComplete="username"
            />
            <Input
              label={ar.auth.password}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
            <Input
              label={ar.auth.confirmPassword}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <Button type="submit" className="w-full" loading={loading}>
              {ar.auth.createAccount}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted">
            {ar.auth.hasAccount}{" "}
            <Link href="/login" className="text-primary hover:underline">
              {ar.auth.login}
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
