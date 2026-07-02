"use client";

import { useState, FormEvent } from "react";
import { Button } from "./ui/button";
import type { Organizer } from "@/lib/types";

interface Props {
  onAuth: (organizer: Organizer, token: string) => void;
}

export default function OrganizerAuth({ onAuth }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "register") {
        const regRes = await fetch("/api/organizer/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });
        const regData = await regRes.json();
        if (!regRes.ok) {
          setError(regData.error || "Registration failed");
          setLoading(false);
          return;
        }
        // After register, log them in
        const loginRes = await fetch("/api/organizer/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const loginData = await loginRes.json();
        if (!loginRes.ok) {
          setError("Account created but login failed — try signing in");
          setLoading(false);
          return;
        }
        onAuth(loginData.organizer, loginData.token);
      } else {
        const res = await fetch("/api/organizer/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Invalid credentials");
          setLoading(false);
          return;
        }
        onAuth(data.organizer, data.token);
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-16">
      <div className="card p-8">
        <h2 className="text-xl font-semibold text-white text-center mb-1">
          Organizer Panel
        </h2>
        <p className="text-xs text-[var(--muted)] text-center mb-6">
          Sign in to manage your events
        </p>

        {/* Tab toggle */}
        <div className="flex border border-[var(--border)] rounded-xl p-1 mb-6 bg-[var(--surface-2)]">
          <button
            onClick={() => { setMode("login"); setError(""); }}
            className={`flex-1 text-sm font-medium py-2 rounded-lg transition-colors ${
              mode === "login"
                ? "bg-[var(--surface)] text-white shadow-sm"
                : "text-[var(--muted)] hover:text-white"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setMode("register"); setError(""); }}
            className={`flex-1 text-sm font-medium py-2 rounded-lg transition-colors ${
              mode === "register"
                ? "bg-[var(--surface)] text-white shadow-sm"
                : "text-[var(--muted)] hover:text-white"
            }`}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label className="block text-[11px] font-mono text-[var(--muted)] mb-1 uppercase tracking-wider">
                Name
              </label>
              <input
                type="text"
                className="input"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-mono text-[var(--muted)] mb-1 uppercase tracking-wider">
              Email
            </label>
            <input
              type="email"
              className="input"
              placeholder="you@school.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono text-[var(--muted)] mb-1 uppercase tracking-wider">
              Password
            </label>
            <input
              type="password"
              className="input"
              placeholder={mode === "register" ? "At least 6 characters" : "Your password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          {error && (
            <div className="text-xs text-[var(--error)] bg-[var(--error)]/5 border border-[var(--error)]/20 p-2.5 rounded-lg">
              {error}
            </div>
          )}

          <Button type="submit" disabled={loading} fullWidth>
            {loading ? "Please wait..." : mode === "register" ? "Create Account" : "Sign In"}
          </Button>
        </form>
      </div>
    </div>
  );
}
